# Task schema and authoring guide

AdminBench-UK tasks are defined in YAML so domain experts can review them and evaluation code can load the same source of truth.

- `tasks/schema.yaml` is the machine-readable schema for task catalogs.
- `tasks/v0.1.yaml` is the current v0.1 catalog.

## Status levels

Use `status` consistently:

| Status | Meaning |
|---|---|
| `planned` | The task family or task slot is in scope, but the runnable environment and ground truth are not complete. |
| `candidate` | The task has draft artifacts, but needs review, scoring, or smoke-test coverage. |
| `ready` | The task is runnable, has source documents, expected outputs, scoring rules, reset support, and smoke-test coverage. |
| `blocked` | Work is paused because a policy, data, or implementation question must be resolved. |
| `retired` | The task should not be used in future benchmark runs. |

## v0.1 coverage

The v0.1 target covers these task families:

| Domain | Task families |
|---|---|
| Companies House | Registered office changes, director appointments, confirmation statements |
| HMRC-style | VAT returns, PAYE processing, corporation tax |
| Data protection | ICO breach notifications, GDPR DSARs, right-to-work checks |
| Internal admin | Supplier onboarding, contract renewal, policy sign-off |

Only tasks marked `ready` are part of a scored benchmark run. Planned tasks exist to show contributors what should be built next.

## Required artifacts for a ready task

A PR that marks a task `ready` must include:

- A task entry in `tasks/v0.1.yaml`.
- A mock CRM seed with expected state.
- Source documents in the document server.
- A GOV.UK Frontend portal flow using task list, one-question-per-page steps, check answers, error summaries, and confirmation pages.
- Reset support for the task seed.
- Smoke-test coverage for health, reset, documents, form completion, and direct-submit bypass checks.
- Field-level expected outputs with evidence requirements.
- Human approval rules for any irreversible submission.

## Task IDs

Use this format:

```text
abuk-v<catalog-version>-<short-task-type>-<three-digit-index>
```

Examples:

- `abuk-v0.1-ad01-001`
- `abuk-v0.1-vat-001`
- `abuk-v0.1-ico-001`

Use stable lower-case identifiers for `family_id`, `task_type`, environment names, document IDs, and seed names.

## GOV.UK-style requirements

All portal flows should feel like a real UK public-sector service:

- Use GOV.UK Frontend components, spacing, typography, buttons, tables, task lists, radios, checkboxes, error summaries, and check-answer patterns.
- Use one question or tightly related question group per page.
- Make the current task and next action obvious without explanatory marketing text.
- Keep irreversible submission separate from preparation, with a visible human approval gate.
- Use plain, service-specific labels that resemble the relevant Companies House, HMRC, ICO, GOV.UK, or internal admin workflow.
- Do not invent decorative UI that would not appear in a GOV.UK service.

Internal admin tasks are still rendered in GOV.UK style so agents face a consistent interaction model across the benchmark.

## Contribution checklist

Before opening a task PR:

- Mark incomplete tasks as `planned` or `candidate`, not `ready`.
- Cite or describe the official procedure or service pattern being modelled.
- Include enough source documents for every expected output to be evidence-grounded.
- Add at least one uncertainty or approval boundary where a production agent should stop instead of guessing.
- Run the smoke test if the task is runnable.
