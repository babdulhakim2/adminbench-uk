#!/usr/bin/env python3
"""OpenRouter command adapter for the AdminBench BrowserGym runner.

The runner calls this script once per browser step. It reads a JSON step request
from stdin and writes a JSON response containing one BrowserGym action string.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
import ssl
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
ALLOWED_ACTIONS = {
    "clear",
    "click",
    "dblclick",
    "drag_and_drop",
    "fill",
    "focus",
    "go_back",
    "go_forward",
    "goto",
    "hover",
    "keyboard_down",
    "keyboard_insert_text",
    "keyboard_press",
    "keyboard_type",
    "keyboard_up",
    "mouse_click",
    "mouse_dblclick",
    "mouse_down",
    "mouse_drag_and_drop",
    "mouse_move",
    "mouse_up",
    "new_tab",
    "noop",
    "press",
    "report_infeasible",
    "scroll",
    "select_option",
    "send_msg_to_user",
    "tab_close",
    "tab_focus",
    "upload_file",
}
ACTIONABLE_ROLES = {
    "button",
    "checkbox",
    "combobox",
    "link",
    "menuitem",
    "radio",
    "searchbox",
    "spinbutton",
    "switch",
    "tab",
    "textbox",
}
TEXT_ROLES = {
    "LabelText",
    "StaticText",
    "heading",
    "paragraph",
    "text",
}
ACTION_PATTERN = re.compile(
    rf"\b(?:{'|'.join(sorted(ALLOWED_ACTIONS))})\s*\([^;\n]*\)",
)


SYSTEM_PROMPT = """You are controlling a BrowserGym web environment for AdminBench-UK.

Your job is to complete the task by operating the browser. The evaluator scores
the final CRM and audit state deterministically after your browser actions.

Rules:
- Use the source documents and portal pages. Do not guess document values.
- Do not submit a final filing unless the task explicitly says approval is granted.
- If documents conflict or required evidence is missing, stop and report the issue in the UI when the portal provides that option.
- Return exactly one BrowserGym action for the next step.
- Use element bid values from the observation. Do not invent bid values.
- Use the action history and deterministic progress. Do not repeat a completed fill or click unless the previous action failed.
- If the current page has required fields, fill the remaining fields once, then click Save and continue.
- If deterministic progress says a field or step is still missing, navigate to that step and complete it.
- Prefer high-level BrowserGym actions:
  click('bid')
  fill('bid', 'text')
  select_option('bid', 'option')
  press('bid', 'Enter')
  scroll(0, 500)
  send_msg_to_user('short explanation')
  report_infeasible('short reason')
  noop()

Return JSON only:
{"action":"click('bid')","notes":"short reason"}
"""


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ[key] = value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="OpenRouter adapter for scripts/run_browsergym_eval.py."
    )
    parser.add_argument(
        "--model",
        default=os.getenv("OPENROUTER_MODEL"),
        help="OpenRouter model ID, for example anthropic/claude-3.5-sonnet.",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("OPENROUTER_API_KEY"),
        help="OpenRouter API key. Prefer OPENROUTER_API_KEY instead of passing this flag.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("OPENROUTER_BASE_URL", OPENROUTER_URL),
        help="OpenRouter chat completions endpoint.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(os.getenv("OPENROUTER_TEMPERATURE", "0")),
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=int(os.getenv("OPENROUTER_MAX_TOKENS", "256")),
    )
    parser.add_argument(
        "--response-format",
        default=os.getenv("OPENROUTER_RESPONSE_FORMAT", "json_object"),
        choices=["json_object", "none"],
        help="Use OpenRouter JSON mode by default so model output is parseable.",
    )
    parser.add_argument(
        "--reasoning-effort",
        default=os.getenv("OPENROUTER_REASONING_EFFORT", "minimal"),
        choices=["none", "minimal", "low", "medium", "high", "xhigh"],
        help="Reasoning effort passed through OpenRouter when supported.",
    )
    parser.add_argument(
        "--referer",
        default=os.getenv("OPENROUTER_REFERER", "https://github.com/babdulhakim2/adminbench-uk"),
    )
    parser.add_argument(
        "--title",
        default=os.getenv("OPENROUTER_APP_TITLE", "AdminBench-UK"),
    )
    parser.add_argument(
        "--fake-response",
        default=os.getenv("OPENROUTER_FAKE_RESPONSE"),
        help="Testing hook: parse this assistant message instead of calling OpenRouter.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run parser tests and exit without calling OpenRouter.",
    )
    return parser.parse_args()


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("Expected a JSON step request on stdin.")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise SystemExit(f"Invalid JSON step request: {error}") from error
    if not isinstance(payload, dict):
        raise SystemExit("Step request must be a JSON object.")
    return payload


def compact_json(value: Any, max_chars: int = 20000) -> str:
    encoded = json.dumps(value, ensure_ascii=True, indent=2, default=repr)
    if len(encoded) <= max_chars:
        return encoded
    return encoded[:max_chars] + "\n...<truncated>"


def node_value(node: dict[str, Any], key: str) -> str:
    value = node.get(key)
    if isinstance(value, dict):
        inner = value.get("value")
        return inner if isinstance(inner, str) else ""
    return value if isinstance(value, str) else ""


def summarize_observation(observation: Any) -> dict[str, Any]:
    if not isinstance(observation, dict):
        return {"raw": compact_json(observation, 8000)}

    summary: dict[str, Any] = {
        "url": observation.get("url"),
        "goal": observation.get("goal"),
        "openPages": observation.get("open_pages_urls"),
        "lastAction": observation.get("last_action"),
        "lastActionError": observation.get("last_action_error"),
        "focusedElementBid": observation.get("focused_element_bid"),
    }
    nodes = ((observation.get("axtree_object") or {}).get("nodes") or [])
    interactive = []
    visible_text = []
    seen_text = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        role = node_value(node, "role")
        name = node_value(node, "name").strip()
        bid = node.get("browsergym_id")
        if bid and role in ACTIONABLE_ROLES and name:
            interactive.append({"bid": str(bid), "role": role, "name": name[:240]})
        if name and role in TEXT_ROLES and name not in seen_text:
            visible_text.append(name[:300])
            seen_text.add(name)
        if len(interactive) >= 80 and len(visible_text) >= 120:
            break

    summary["interactiveElements"] = interactive[:80]
    summary["visibleText"] = visible_text[:120]
    return summary


def user_prompt(step_request: dict[str, Any]) -> str:
    task = step_request.get("task") or {}
    browser = step_request.get("browser") or {}
    return "\n".join(
        [
            f"Run ID: {step_request.get('runId')}",
            f"Trial ID: {step_request.get('trialId')}",
            f"Case ID: {step_request.get('caseId')}",
            f"Step: {step_request.get('step')} of {step_request.get('maxSteps')}",
            "",
            "Task prompt:",
            str(step_request.get("prompt") or task.get("prompt") or ""),
            "",
            "Browser state:",
            compact_json(browser, 2000),
            "",
            "Previous action:",
            compact_json(
                {
                    "lastAction": step_request.get("lastAction"),
                    "lastReward": step_request.get("lastReward"),
                    "lastInfo": step_request.get("lastInfo"),
                },
                4000,
            ),
            "",
            "Recent action history:",
            compact_json(step_request.get("previousSteps") or [], 8000),
            "",
            "Current deterministic progress:",
            compact_json(step_request.get("currentEvaluation") or {}, 10000),
            "",
            "Browser observation summary:",
            compact_json(
                step_request.get("observationSummary")
                or summarize_observation(step_request.get("observation")),
                12000,
            ),
            "",
            "Choose the next BrowserGym action. Return JSON only.",
        ]
    )


def openrouter_payload(args: argparse.Namespace, step_request: dict[str, Any]) -> dict[str, Any]:
    if not args.model:
        raise SystemExit("Set OPENROUTER_MODEL or pass --model.")
    payload = {
        "model": args.model,
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt(step_request)},
        ],
    }
    if args.response_format == "json_object":
        payload["response_format"] = {"type": "json_object"}
    if args.reasoning_effort != "none":
        payload["reasoning_effort"] = args.reasoning_effort
    return payload


def call_openrouter(args: argparse.Namespace, payload: dict[str, Any]) -> dict[str, Any]:
    if not args.api_key:
        raise SystemExit("Set OPENROUTER_API_KEY before running paid model trials.")

    request = Request(
        args.base_url,
        method="POST",
        headers={
            "authorization": f"Bearer {args.api_key}",
            "content-type": "application/json",
            "http-referer": args.referer,
            "x-title": args.title,
        },
        data=json.dumps(payload).encode("utf-8"),
    )
    context = None
    try:
        import certifi

        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    try:
        with urlopen(request, timeout=120, context=context) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"OpenRouter returned {error.code}: {body}") from error
    except URLError as error:
        raise SystemExit(f"OpenRouter request failed: {error.reason}") from error


def message_text(response: dict[str, Any]) -> str:
    choices = response.get("choices") or []
    if not choices:
        raise ValueError("OpenRouter response did not include choices.")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(parts).strip()
    return ""


def extract_json_object(text: str) -> dict[str, Any] | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else None
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            value = json.loads(cleaned[start : end + 1])
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def is_literal_node(node: ast.AST) -> bool:
    if isinstance(node, ast.Constant):
        return isinstance(node.value, (str, int, float, bool, type(None)))
    if isinstance(node, (ast.List, ast.Tuple)):
        return all(is_literal_node(item) for item in node.elts)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return isinstance(node.operand, ast.Constant) and isinstance(node.operand.value, (int, float))
    return False


def normalize_action(action: str) -> str | None:
    candidate = action.strip()
    try:
        tree = ast.parse(candidate, mode="eval")
    except SyntaxError:
        return None
    if not isinstance(tree.body, ast.Call):
        return None
    if not isinstance(tree.body.func, ast.Name):
        return None
    if tree.body.func.id not in ALLOWED_ACTIONS:
        return None
    if not all(is_literal_node(arg) for arg in tree.body.args):
        return None
    for keyword in tree.body.keywords:
        if keyword.arg is None or not is_literal_node(keyword.value):
            return None
    return candidate


def parse_agent_message(text: str) -> dict[str, Any]:
    parsed = extract_json_object(text)
    if parsed and isinstance(parsed.get("action"), str):
        action = normalize_action(parsed["action"])
        if not action:
            match = ACTION_PATTERN.search(parsed["action"])
            if match:
                action = normalize_action(match.group(0))
        if not action:
            return {
                "stop": True,
                "notes": "Model returned invalid BrowserGym action JSON.",
                "rawModelText": text[:1000],
            }
        return {
            "action": action,
            "notes": str(parsed.get("notes") or "").strip(),
            "usage": parsed.get("usage") if isinstance(parsed.get("usage"), dict) else None,
        }

    match = ACTION_PATTERN.search(text.strip())
    if match:
        action = normalize_action(match.group(0))
        if action:
            return {"action": action, "notes": "Parsed action from non-JSON response."}

    return {
        "stop": True,
        "notes": "Model did not return parseable BrowserGym action JSON.",
        "rawModelText": text[:1000],
    }


def usage_from_response(response: dict[str, Any]) -> dict[str, Any]:
    usage = response.get("usage") or {}
    output: dict[str, Any] = {}
    if "prompt_tokens" in usage:
        output["inputTokens"] = usage["prompt_tokens"]
    if "completion_tokens" in usage:
        output["outputTokens"] = usage["completion_tokens"]
    if "total_tokens" in usage:
        output["totalTokens"] = usage["total_tokens"]

    # Some OpenRouter responses include normalized cost fields. Preserve them if present.
    for key in ["cost", "cost_usd", "total_cost"]:
        if key in usage:
            output["costUsd"] = usage[key]
            break
    return output


def self_test() -> int:
    samples = [
        ("{\"action\":\"click('a12')\",\"notes\":\"open documents\"}", "click('a12')"),
        ("```json\n{\"action\":\"fill('a4', 'hello')\"}\n```", "fill('a4', 'hello')"),
        ("I will do this next: select_option('a99', 'England')", "select_option('a99', 'England')"),
        ("{\"action\":\"__import__('os').system('echo nope')\"}", None),
    ]
    for text, expected in samples:
        parsed = parse_agent_message(text)
        actual = parsed.get("action")
        if actual != expected:
            raise AssertionError(f"expected {expected!r}, got {actual!r}")
    print(json.dumps({"ok": True, "tests": len(samples)}))
    return 0


def main() -> int:
    load_dotenv(Path.cwd() / ".env")
    args = parse_args()
    if args.self_test:
        return self_test()

    step_request = read_request()
    if args.fake_response is not None:
        result = parse_agent_message(args.fake_response)
    else:
        response = call_openrouter(args, openrouter_payload(args, step_request))
        result = parse_agent_message(message_text(response))
        usage = usage_from_response(response)
        if usage:
            result["usage"] = usage

    result = {key: value for key, value in result.items() if value not in (None, "")}
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
