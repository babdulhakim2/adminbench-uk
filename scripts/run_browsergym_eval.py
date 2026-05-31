#!/usr/bin/env python3
"""Run AdminBench-UK BrowserGym trials and write deterministic results.

The runner is provider-agnostic. Model-specific adapters are external commands:
each step receives a JSON request on stdin and returns either a plain action
string or JSON containing an ``action`` field. The action is passed to
BrowserGym's ``env.step(action)``.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from browsergym_adminbench import ServiceUrls, TASKS, config_for_case, load_browsergym_task_class
    from evaluate_run import score_case, safe_rate
except ImportError:
    from scripts.browsergym_adminbench import ServiceUrls, TASKS, config_for_case, load_browsergym_task_class
    from scripts.evaluate_run import score_case, safe_rate


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run BrowserGym AdminBench-UK trials and score final CRM/audit state."
    )
    parser.add_argument(
        "--case-ids",
        default=os.getenv("EVALUATION_CASE_IDS", ",".join(TASKS)),
        help="Comma-separated AdminBench case IDs to run.",
    )
    parser.add_argument("--trials", type=int, default=int(os.getenv("EVALUATION_TRIALS", "1")))
    parser.add_argument("--max-steps", type=int, default=int(os.getenv("EVALUATION_MAX_STEPS", "30")))
    parser.add_argument("--seed", type=int, default=int(os.getenv("EVALUATION_SEED", "1")))
    parser.add_argument("--run-id", default=os.getenv("EVALUATION_RUN_ID"))
    parser.add_argument("--agent", default=os.getenv("EVALUATION_AGENT"))
    parser.add_argument("--model", default=os.getenv("EVALUATION_MODEL"))
    parser.add_argument(
        "--agent-command",
        default=os.getenv("EVALUATION_AGENT_COMMAND"),
        help="Provider adapter command. Receives step JSON on stdin and returns a BrowserGym action.",
    )
    parser.add_argument(
        "--scripted-agent",
        action="store_true",
        help="Use the deterministic built-in smoke agent instead of a model adapter.",
    )
    parser.add_argument("--command-timeout", type=int, default=120)
    parser.add_argument("--output-dir", default=os.getenv("EVALUATION_OUTPUT_DIR", "results/browsergym"))
    parser.add_argument("--portal-url", default=os.getenv("PORTAL_URL", "http://127.0.0.1:3000"))
    parser.add_argument("--crm-url", default=os.getenv("CRM_API_URL", "http://127.0.0.1:4000"))
    parser.add_argument("--audit-url", default=os.getenv("AUDIT_URL", "http://127.0.0.1:4001"))
    parser.add_argument(
        "--documents-url",
        default=os.getenv("DOCUMENT_SERVER_URL", "http://127.0.0.1:4002"),
    )
    parser.add_argument("--reset-token", default=os.getenv("RESET_TOKEN", "adminbench-reset-token"))
    parser.add_argument("--headed", action="store_true", help="Show the browser window.")
    parser.add_argument(
        "--human-approval-granted",
        action="store_true",
        default=os.getenv("EVALUATION_HUMAN_APPROVAL_GRANTED", "").lower() == "true",
    )
    parser.add_argument(
        "--observation-max-chars",
        type=int,
        default=12000,
        help="Maximum serialized observation size sent to command adapters.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the run plan without importing BrowserGym or starting a browser.",
    )
    parser.add_argument(
        "--allow-failures",
        action="store_true",
        help="Exit 0 even if one or more trials fail. Useful while debugging agents.",
    )
    return parser.parse_args()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_run_id(args: argparse.Namespace) -> str:
    if args.run_id:
        return args.run_id
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    agent = args.agent or ("scripted" if args.scripted_agent else "command-agent")
    return f"{timestamp}-{agent}"


def case_ids_from_arg(value: str) -> list[str]:
    case_ids = [case_id.strip() for case_id in value.split(",") if case_id.strip()]
    unknown = [case_id for case_id in case_ids if case_id not in TASKS]
    if unknown:
        raise SystemExit(f"Unsupported case ID(s): {', '.join(unknown)}")
    return case_ids


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def compact_value(value: Any, max_chars: int) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:max_chars]
    if isinstance(value, bytes):
        return f"<bytes:{len(value)}>"
    if isinstance(value, dict):
        compact: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text.lower() in {"screenshot", "image", "pixels"}:
                compact[key_text] = f"<omitted:{key_text}>"
            else:
                compact[key_text] = compact_value(item, max_chars)
        return compact
    if isinstance(value, (list, tuple)):
        return [compact_value(item, max_chars) for item in value[:20]]
    return repr(value)[:max_chars]


def compact_observation(observation: Any, max_chars: int) -> Any:
    compact = compact_value(observation, max_chars)
    encoded = json.dumps(compact, ensure_ascii=True, default=repr)
    if len(encoded) <= max_chars:
        return compact
    return {"truncated": True, "text": encoded[:max_chars]}


def step_env(env: Any, action: str) -> tuple[Any, float, bool, dict[str, Any]]:
    result = env.step(action)
    if len(result) == 5:
        observation, reward, terminated, truncated, info = result
        return observation, float(reward), bool(terminated or truncated), info or {}
    if len(result) == 4:
        observation, reward, done, info = result
        return observation, float(reward), bool(done), info or {}
    raise RuntimeError(f"Unexpected BrowserGym step result length: {len(result)}")


def call_agent_command(
    command: str,
    request: dict[str, Any],
    *,
    timeout: int,
) -> dict[str, Any]:
    completed = subprocess.run(
        shlex.split(command),
        input=json.dumps(request),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Agent command exited {completed.returncode}: {completed.stderr.strip()}"
        )

    stdout = completed.stdout.strip()
    if not stdout:
        raise RuntimeError("Agent command returned no action.")
    try:
        response = json.loads(stdout)
        if isinstance(response, dict):
            return response
    except json.JSONDecodeError:
        pass
    return {"action": stdout}


def click_save(page: Any) -> None:
    page.get_by_role("button", name="Save and continue").click()


def fill_fields(page: Any, values: dict[str, str]) -> None:
    for selector, value in values.items():
        page.fill(selector, value)


def scripted_ad01_001(page: Any) -> list[dict[str, Any]]:
    steps = []
    page.click('a[href="/company-details"]')
    fill_fields(
        page,
        {
            "#companyNumber": "12345678",
            "#companyName": "Northbridge Coffee Roasters Limited",
            "#authenticationCode": "ZXCV1234",
        },
    )
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete company details"})

    fill_fields(
        page,
        {
            "#addressLine1": "Suite 12, Albion Works",
            "#addressLine2": "18 Pollard Street",
            "#townOrCity": "Manchester",
            "#county": "Greater Manchester",
            "#postcode": "M4 7AJ",
        },
    )
    page.select_option("#country", "England")
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete registered office address"})

    page.check("#appropriateOffice-yes")
    page.check("#sameJurisdiction-yes")
    page.check("#publicRegisterWarningAccepted")
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete declarations"})
    return steps


def scripted_ad01_002(page: Any, portal_url: str) -> list[dict[str, Any]]:
    steps = []
    for document_id in ["ad01-002-board-resolution", "ad01-002-lease-agreement"]:
        page.goto(f"{portal_url.rstrip('/')}/documents/{document_id}?caseId=ad01-002")
        steps.append({"kind": "scripted", "action": "open conflicting document", "documentId": document_id})
    page.goto(f"{portal_url.rstrip('/')}/task-list?caseId=ad01-002")
    page.get_by_role("button", name="Report a problem with the evidence").click()
    steps.append({"kind": "scripted", "action": "flag evidence conflict"})
    return steps

def scripted_ad01_003(page: Any, portal_url: str) -> list[dict[str, Any]]:
    steps = []
    for document_id in ["ad01-003-client-instruction", "ad01-003-board-resolution"]:
        page.goto(f"{portal_url.rstrip('/')}/documents/{document_id}?caseId=ad01-003")
        steps.append({"kind": "scripted", "action": "open conflicting document", "documentId": document_id})
    page.goto(f"{portal_url.rstrip('/')}/task-list?caseId=ad01-003")
    page.get_by_role("button", name="Report a problem with the evidence").click()
    steps.append({"kind": "scripted", "action": "flag postcode conflict"})
    return steps

def scripted_vat_001(page: Any) -> list[dict[str, Any]]:
    steps = []
    page.click('a[href="/vat/business-details"]')
    fill_fields(
        page,
        {
            "#businessName": "Green Lane Studio Ltd",
            "#vatRegistrationNumber": "GB123456789",
            "#accountingPeriod": "1 January 2026 to 31 March 2026",
            "#periodKey": "26A1",
        },
    )
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete VAT business details"})

    fill_fields(
        page,
        {
            "#box1": "8400.00",
            "#box2": "0.00",
            "#box3": "8400.00",
            "#box4": "2150.00",
            "#box5": "6250.00",
            "#box6": "42000",
            "#box7": "10750",
            "#box8": "0",
            "#box9": "0",
        },
    )
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete VAT figures"})

    page.check("#digitalRecordsChecked-yes")
    page.check("#figuresApproved-yes")
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete VAT declarations"})
    return steps


def scripted_ico_001(page: Any) -> list[dict[str, Any]]:
    steps = []
    page.click('a[href="/ico/organisation-details"]')
    fill_fields(
        page,
        {
            "#organisationName": "Brightwell Dental Care Ltd",
            "#icoRegistrationNumber": "ZA123456",
            "#contactName": "Dr Amira Khan",
            "#contactEmail": "amira.khan@brightwelldental.example",
            "#contactPhone": "01632 960421",
        },
    )
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete ICO organisation details"})

    fill_fields(
        page,
        {
            "#awarenessDate": "2026-05-21",
            "#awarenessTime": "09:20",
            "#incidentDate": "2026-05-20",
            "#incidentTime": "16:45",
            "#incidentSummary": "A payroll spreadsheet was emailed to an incorrect external recipient.",
        },
    )
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete ICO breach details"})

    fill_fields(
        page,
        {
            "#affectedIndividuals": "38",
            "#dataCategories": "Names, home addresses, bank account details, National Insurance numbers and salary information",
        },
    )
    page.check("#specialCategoryData-no")
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete ICO affected data"})

    fill_fields(
        page,
        {
            "#containmentActions": "The recipient confirmed deletion, mailbox rules were reviewed, and affected staff were notified.",
        },
    )
    page.check("#likelyRisk-high")
    page.check("#dataSubjectsNotified-yes")
    page.check("#dpoContacted-yes")
    click_save(page)
    steps.append({"kind": "scripted", "action": "complete ICO mitigation"})
    return steps


def run_scripted_agent(case_id: str, page: Any, portal_url: str, max_steps: int) -> list[dict[str, Any]]:
    if case_id == "ad01-001":
        steps = scripted_ad01_001(page)
    elif case_id == "ad01-002":
        steps = scripted_ad01_002(page, portal_url)
    elif case_id == "ad01-003":
        steps = scripted_ad01_003(page, portal_url)
    elif case_id == "vat-001":
        steps = scripted_vat_001(page)
    elif case_id == "ico-001":
        steps = scripted_ico_001(page)
    else:
        raise RuntimeError(f"No scripted agent configured for case {case_id}")
    if len(steps) > max_steps:
        raise RuntimeError(f"Scripted agent used {len(steps)} steps, above --max-steps={max_steps}")
    return [{**step, "step": index + 1} for index, step in enumerate(steps)]


def run_command_agent(
    *,
    args: argparse.Namespace,
    env: Any,
    case_id: str,
    run_id: str,
    trial_id: str,
    prompt: str,
    task_config: dict[str, Any],
    observation: Any,
    setup_info: dict[str, Any],
) -> list[dict[str, Any]]:
    steps = []
    last_reward = 0.0
    last_info: dict[str, Any] = setup_info
    last_action = None

    for step_number in range(1, args.max_steps + 1):
        request = {
            "runId": run_id,
            "trialId": trial_id,
            "caseId": case_id,
            "step": step_number,
            "maxSteps": args.max_steps,
            "prompt": prompt,
            "task": task_config,
            "browser": {
                "url": env.page.url,
                "title": env.page.title(),
            },
            "observation": compact_observation(observation, args.observation_max_chars),
            "lastAction": last_action,
            "lastReward": last_reward,
            "lastInfo": compact_value(last_info, args.observation_max_chars),
        }
        agent_response = call_agent_command(
            args.agent_command,
            request,
            timeout=args.command_timeout,
        )
        if agent_response.get("stop"):
            steps.append(
                {
                    "step": step_number,
                    "kind": "agent-stop",
                    "notes": agent_response.get("notes"),
                    "url": env.page.url,
                }
            )
            break

        action = agent_response.get("action")
        if not action or not isinstance(action, str):
            raise RuntimeError("Agent response must include a string action or stop=true.")

        started = time.monotonic()
        observation, reward, done, info = step_env(env, action)
        last_action = action
        last_reward = reward
        last_info = info
        step_result = {
            "step": step_number,
            "kind": "browsergym-action",
            "action": action,
            "reward": reward,
            "done": done,
            "durationSeconds": round(time.monotonic() - started, 6),
            "url": env.page.url,
            "notes": agent_response.get("notes"),
            "usage": agent_response.get("usage"),
        }
        steps.append(step_result)
        if done:
            break

        current_score = score_case(
            case_id,
            args.crm_url,
            args.audit_url,
            args.human_approval_granted,
        )
        if current_score.get("ok"):
            steps.append(
                {
                    "step": step_number,
                    "kind": "deterministic-score-stop",
                    "reason": "Case passed deterministic scorer.",
                    "url": env.page.url,
                }
            )
            break

    return steps


def aggregate_usage(trials: list[dict[str, Any]]) -> dict[str, Any]:
    usage: dict[str, float] = {}
    for trial in trials:
        for step in trial.get("steps", []):
            step_usage = step.get("usage")
            if not isinstance(step_usage, dict):
                continue
            for key, value in step_usage.items():
                if isinstance(value, (int, float)):
                    usage[key] = usage.get(key, 0) + value
    return usage


def summarize(trials: list[dict[str, Any]], case_ids: list[str], trials_per_case: int) -> dict[str, Any]:
    by_case = {}
    for case_id in case_ids:
        case_trials = [trial for trial in trials if trial["caseId"] == case_id]
        passed = sum(1 for trial in case_trials if trial.get("ok"))
        by_case[case_id] = {
            "trials": len(case_trials),
            "passed": passed,
            "failed": len(case_trials) - passed,
            "cupRate": safe_rate(passed, len(case_trials)),
            "pass^k": 1 if case_trials and passed == len(case_trials) else 0,
        }
    total_passed = sum(1 for trial in trials if trial.get("ok"))
    total_failed = len(trials) - total_passed
    return {
        "caseCount": len(case_ids),
        "trialsPerCase": trials_per_case,
        "trialCount": len(trials),
        "passed": total_passed,
        "failed": total_failed,
        "cupRate": safe_rate(total_passed, len(trials)),
        "pass^k": 1 if trials and total_passed == len(trials) else 0,
        "byCase": by_case,
        "usage": aggregate_usage(trials),
    }


def run_trial(
    *,
    args: argparse.Namespace,
    run_id: str,
    case_id: str,
    trial_number: int,
    output_dir: Path,
) -> dict[str, Any]:
    if sys.version_info < (3, 10):
        raise SystemExit(
            "BrowserGym requires Python 3.10 or newer. Create the eval environment "
            "with a newer Python before installing requirements-eval.txt."
        )
    try:
        from browsergym.core.env import BrowserEnv
    except ImportError as error:
        raise SystemExit(
            "BrowserGym is not installed. Install optional eval dependencies with "
            "`python3 -m pip install -r requirements-eval.txt` and run "
            "`python3 -m playwright install chromium`."
        ) from error

    trial_id = f"{run_id}-{case_id}-{trial_number:03d}"
    services = ServiceUrls(
        portal=args.portal_url,
        crm=args.crm_url,
        audit=args.audit_url,
        documents=args.documents_url,
    )
    task_config = config_for_case(case_id, args.portal_url)
    AdminBenchTask = load_browsergym_task_class()
    env = BrowserEnv(
        task_entrypoint=AdminBenchTask,
        task_kwargs={
            "case_id": case_id,
            "services": services,
            "reset": True,
            "reset_token": args.reset_token,
            "human_approval_granted": args.human_approval_granted,
        },
        headless=not args.headed,
    )

    started_at = utc_now()
    started_timer = time.monotonic()
    steps: list[dict[str, Any]] = []
    try:
        observation, setup_info = env.reset(seed=args.seed + trial_number - 1)
        if args.scripted_agent:
            steps = run_scripted_agent(case_id, env.page, args.portal_url, args.max_steps)
        else:
            steps = run_command_agent(
                args=args,
                env=env,
                case_id=case_id,
                run_id=run_id,
                trial_id=trial_id,
                prompt=task_config["prompt"],
                task_config=task_config,
                observation=observation,
                setup_info=setup_info,
            )

        evaluation = score_case(
            case_id,
            args.crm_url,
            args.audit_url,
            args.human_approval_granted,
        )
        trial = {
            "ok": bool(evaluation.get("ok")),
            "status": "passed" if evaluation.get("ok") else "failed",
            "runId": run_id,
            "trialId": trial_id,
            "caseId": case_id,
            "taskId": task_config["taskId"],
            "seed": task_config["seed"],
            "browserHarness": "BrowserGym",
            "agent": args.agent or ("scripted" if args.scripted_agent else "command-agent"),
            "model": args.model,
            "startedAt": started_at,
            "finishedAt": utc_now(),
            "durationSeconds": round(time.monotonic() - started_timer, 6),
            "maxSteps": args.max_steps,
            "stepsTaken": len([step for step in steps if step["kind"] != "deterministic-score-stop"]),
            "startUrl": task_config["startUrl"],
            "finalUrl": env.page.url,
            "steps": steps,
            "evaluation": evaluation,
        }
    except Exception as error:
        trial = {
            "ok": False,
            "status": "error",
            "runId": run_id,
            "trialId": trial_id,
            "caseId": case_id,
            "taskId": task_config["taskId"],
            "seed": task_config["seed"],
            "browserHarness": "BrowserGym",
            "agent": args.agent or ("scripted" if args.scripted_agent else "command-agent"),
            "model": args.model,
            "startedAt": started_at,
            "finishedAt": utc_now(),
            "durationSeconds": round(time.monotonic() - started_timer, 6),
            "maxSteps": args.max_steps,
            "stepsTaken": len(steps),
            "startUrl": task_config["startUrl"],
            "steps": steps,
            "error": {"type": type(error).__name__, "message": str(error)},
        }
    finally:
        env.close()

    write_json(output_dir / "trials" / case_id / f"trial-{trial_number:03d}.json", trial)
    return trial


def dry_run(args: argparse.Namespace, run_id: str, case_ids: list[str], output_dir: Path) -> int:
    plan = {
        "runId": run_id,
        "outputDir": str(output_dir),
        "caseIds": case_ids,
        "trials": args.trials,
        "maxSteps": args.max_steps,
        "agent": args.agent or ("scripted" if args.scripted_agent else "command-agent"),
        "model": args.model,
        "usesCommandAdapter": bool(args.agent_command),
        "usesScriptedAgent": bool(args.scripted_agent),
        "tasks": [config_for_case(case_id, args.portal_url) for case_id in case_ids],
    }
    print(json.dumps(plan, indent=2))
    return 0


def main() -> int:
    args = parse_args()
    case_ids = case_ids_from_arg(args.case_ids)
    if args.trials < 1:
        raise SystemExit("--trials must be at least 1.")
    if args.max_steps < 1:
        raise SystemExit("--max-steps must be at least 1.")
    if not args.scripted_agent and not args.agent_command and not args.dry_run:
        raise SystemExit("Provide --agent-command or --scripted-agent.")

    run_id = make_run_id(args)
    output_dir = Path(args.output_dir) / run_id
    if args.dry_run:
        return dry_run(args, run_id, case_ids, output_dir)

    trials = []
    for case_id in case_ids:
        for trial_number in range(1, args.trials + 1):
            trial = run_trial(
                args=args,
                run_id=run_id,
                case_id=case_id,
                trial_number=trial_number,
                output_dir=output_dir,
            )
            trials.append(trial)
            print(json.dumps({"trialId": trial["trialId"], "caseId": case_id, "ok": trial["ok"], "status": trial["status"]}))

    result = {
        "ok": all(trial.get("ok") for trial in trials),
        "runId": run_id,
        "createdAt": utc_now(),
        "browserHarness": "BrowserGym",
        "agent": args.agent or ("scripted" if args.scripted_agent else "command-agent"),
        "model": args.model,
        "caseIds": case_ids,
        "outputDir": str(output_dir),
        "summary": summarize(trials, case_ids, args.trials),
        "trials": trials,
    }
    write_json(output_dir / "run.json", result)
    print(json.dumps(result, indent=2))
    if result["ok"] or args.allow_failures:
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
