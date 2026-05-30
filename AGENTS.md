# Agent Notes

These notes are for AI coding agents and automation working in this repository.

## Branches

- Do not develop directly on `main`.
- Use a focused feature branch for each change.
- Keep unrelated edits out of the branch.

## Pull Requests

- Use `.github/pull_request_template.md` for every PR.
- Fill in real content under:
  - `What This Adds`
  - `Changes`
  - `Testing`
  - `Notes`
- Do not leave placeholder bullets in the PR body.
- If a branch already has an open PR, update the PR body after changing scope, testing, or readiness status.

## Testing Notes

- List the exact commands run.
- If a command was not run, say why.
- For task changes, include schema validation and any relevant smoke or deterministic evaluation checks.
- For browser-agent runner changes, include `scripts/run_browsergym_eval.py --dry-run` and any live BrowserGym run that was possible in the local environment.
