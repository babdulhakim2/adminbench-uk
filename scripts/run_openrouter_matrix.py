#!/usr/bin/env python3
"""Run AdminBench BrowserGym trials for a configured OpenRouter model matrix."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "evals" / "openrouter-models.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run OpenRouter-backed AdminBench BrowserGym evals from a model config."
    )
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument(
        "--python",
        help="Python executable for BrowserGym evals. Defaults to .venv/bin/python when present.",
    )
    parser.add_argument(
        "--models",
        help="Comma-separated model names or OpenRouter IDs to run. Defaults to enabled models.",
    )
    parser.add_argument("--case-ids", help="Comma-separated case IDs. Overrides config defaults.")
    parser.add_argument("--trials", type=int, help="Trials per case. Overrides config defaults.")
    parser.add_argument("--max-steps", type=int, help="Maximum browser steps. Overrides config defaults.")
    parser.add_argument("--command-timeout", type=int, help="Adapter timeout in seconds.")
    parser.add_argument("--output-dir", help="Output directory. Overrides config defaults.")
    parser.add_argument("--portal-url", help="Portal URL visible to the browser.")
    parser.add_argument("--crm-url", help="Mock CRM URL visible to the runner.")
    parser.add_argument("--audit-url", help="Audit sink URL visible to the runner.")
    parser.add_argument("--documents-url", help="Document server URL visible to the runner.")
    parser.add_argument("--run-prefix", help="Run ID prefix. Defaults to a UTC timestamp.")
    parser.add_argument("--headed", action="store_true", help="Show browser windows.")
    parser.add_argument(
        "--include-disabled",
        action="store_true",
        help="Allow disabled config entries to run when selected by --models.",
    )
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Stop after the first model command exits non-zero.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero when any trial fails. By default failures are recorded but do not stop the matrix.",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


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


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing OpenRouter model config: {path}")
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit("OpenRouter model config must be a JSON object.")
    if not isinstance(data.get("models"), list):
        raise SystemExit("OpenRouter model config must include a models list.")
    return data


def csv_values(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return slug or "model"


def eval_python(args: argparse.Namespace) -> str:
    if args.python:
        return args.python
    venv_python = ROOT / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def selected_models(config: dict[str, Any], args: argparse.Namespace) -> list[dict[str, Any]]:
    requested = set(csv_values(args.models))
    models = []
    for model in config["models"]:
        if not isinstance(model, dict):
            raise SystemExit("Each model entry must be a JSON object.")
        name = model.get("name")
        model_id = model.get("id")
        if not isinstance(name, str) or not isinstance(model_id, str):
            raise SystemExit("Each model entry must include string name and id fields.")
        enabled = bool(model.get("enabled", True))
        if requested and name not in requested and model_id not in requested:
            continue
        if not requested and not enabled:
            continue
        if requested and not enabled and not args.include_disabled:
            raise SystemExit(f"Model {name} is disabled. Pass --include-disabled to run it.")
        models.append(model)
    if not models:
        selector = args.models or "enabled models"
        raise SystemExit(f"No OpenRouter models selected for {selector}.")
    return models


def config_value(
    args_value: Any,
    model: dict[str, Any],
    defaults: dict[str, Any],
    key: str,
    fallback: Any,
) -> Any:
    if args_value is not None:
        return args_value
    if key in model:
        return model[key]
    return defaults.get(key, fallback)


def build_command(
    *,
    args: argparse.Namespace,
    model: dict[str, Any],
    defaults: dict[str, Any],
    run_prefix: str,
) -> tuple[list[str], dict[str, str], dict[str, Any]]:
    case_ids = csv_values(args.case_ids) or list(model.get("caseIds") or defaults.get("caseIds") or [])
    if not case_ids:
        raise SystemExit("No case IDs configured.")

    trials = int(config_value(args.trials, model, defaults, "trials", 1))
    max_steps = int(config_value(args.max_steps, model, defaults, "maxSteps", 40))
    command_timeout = int(config_value(args.command_timeout, model, defaults, "commandTimeout", 180))
    output_dir = str(config_value(args.output_dir, model, defaults, "outputDir", "results/browsergym"))
    portal_url = str(config_value(args.portal_url, model, defaults, "portalUrl", "http://127.0.0.1:3000"))
    crm_url = str(config_value(args.crm_url, model, defaults, "crmUrl", "http://127.0.0.1:4000"))
    audit_url = str(config_value(args.audit_url, model, defaults, "auditUrl", "http://127.0.0.1:4001"))
    documents_url = str(config_value(args.documents_url, model, defaults, "documentsUrl", "http://127.0.0.1:4002"))
    allow_failures = bool(defaults.get("allowFailures", True) or model.get("allowFailures", False))
    if args.strict:
        allow_failures = False

    model_name = str(model["name"])
    model_id = str(model["id"])
    run_id = f"{run_prefix}-openrouter-{slugify(model_name)}"
    python = eval_python(args)
    runner = ROOT / "scripts" / "run_browsergym_eval.py"
    adapter = ROOT / "scripts" / "openrouter_browsergym_agent.py"
    adapter_command = f"{shlex.quote(python)} {shlex.quote(str(adapter))}"

    command = [
        python,
        str(runner),
        "--case-ids",
        ",".join(case_ids),
        "--trials",
        str(trials),
        "--max-steps",
        str(max_steps),
        "--command-timeout",
        str(command_timeout),
        "--agent-command",
        adapter_command,
        "--agent",
        f"openrouter-{slugify(model_name)}",
        "--model",
        model_id,
        "--run-id",
        run_id,
        "--output-dir",
        output_dir,
        "--portal-url",
        portal_url,
        "--crm-url",
        crm_url,
        "--audit-url",
        audit_url,
        "--documents-url",
        documents_url,
    ]
    if allow_failures:
        command.append("--allow-failures")
    if args.headed:
        command.append("--headed")

    env = dict(os.environ)
    env["OPENROUTER_MODEL"] = model_id
    if "temperature" in model:
        env["OPENROUTER_TEMPERATURE"] = str(model["temperature"])
    if "maxTokens" in model:
        env["OPENROUTER_MAX_TOKENS"] = str(model["maxTokens"])
    if "responseFormat" in model:
        env["OPENROUTER_RESPONSE_FORMAT"] = str(model["responseFormat"])
    if "reasoningEffort" in model:
        env["OPENROUTER_REASONING_EFFORT"] = str(model["reasoningEffort"])
    if isinstance(model.get("env"), dict):
        env.update({str(key): str(value) for key, value in model["env"].items()})

    plan = {
        "name": model_name,
        "id": model_id,
        "caseIds": case_ids,
        "trials": trials,
        "maxSteps": max_steps,
        "runId": run_id,
        "outputDir": output_dir,
        "portalUrl": portal_url,
        "crmUrl": crm_url,
        "auditUrl": audit_url,
        "documentsUrl": documents_url,
        "allowFailures": allow_failures,
        "command": command,
    }
    return command, env, plan


def main() -> int:
    args = parse_args()
    load_dotenv(ROOT / ".env")
    config = load_config(Path(args.config))
    defaults = config.get("defaults") if isinstance(config.get("defaults"), dict) else {}
    models = selected_models(config, args)
    run_prefix = args.run_prefix or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    if not args.dry_run and not os.getenv("OPENROUTER_API_KEY"):
        raise SystemExit("Set OPENROUTER_API_KEY in the environment or local .env before running.")

    plans = []
    commands = []
    for model in models:
        command, env, plan = build_command(
            args=args,
            model=model,
            defaults=defaults,
            run_prefix=run_prefix,
        )
        plans.append({**plan, "command": " ".join(shlex.quote(part) for part in command)})
        commands.append((command, env, plan))

    if args.dry_run:
        print(json.dumps({"models": plans}, indent=2))
        return 0

    results = []
    for command, env, plan in commands:
        print(json.dumps({"status": "starting", "model": plan["name"], "runId": plan["runId"]}))
        completed = subprocess.run(command, cwd=ROOT, env=env, check=False)
        result = {
            "model": plan["name"],
            "id": plan["id"],
            "runId": plan["runId"],
            "returnCode": completed.returncode,
        }
        results.append(result)
        print(json.dumps({"status": "finished", **result}))
        if completed.returncode != 0 and args.fail_fast:
            break

    ok = all(result["returnCode"] == 0 for result in results)
    print(json.dumps({"ok": ok, "results": results}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
