# Task schema and authoring guide

AdminBench-UK tasks are defined in YAML so domain experts can review them and evaluation code can load the same source of truth.

- `tasks/schema.yaml` is the machine-readable schema for task catalogs.
- `tasks/v0.1.yaml` is the current v0.1 catalog.

## Status levels

Use `status` consistently:

| Status | Meaning |
|---|---|
| `candidate` | The task has draft artifacts, but needs review, scoring, or smoke-test coverage. |
| `ready` | The task is runnable, has source documents, expected outputs, scoring rules, reset support, and smoke-test coverage. |
| `blocked` | Work is paused because a policy, data, or implementation question must be resolved. |
| `retired` | The task should not be used in future benchmark runs. |

## v0.1 coverage

The v0.1 catalog is intentionally limited to the three runnable public-service-style flows in the Docker stack:

| Domain | Task families |
|---|---|
| Companies House | AD01 registered office changes |
| HMRC-style | VAT returns |
| Data protection | ICO personal data breach notifications |

Only tasks marked `ready` are part of a scored benchmark run. Future task families should be proposed in separate issues and PRs after the current three-flow benchmark is stable.

## Task design roadmap

Task design will move in stages:

| Stage | Focus | Output |
|---|---|---|
| v0.1 | Stabilise the three runnable flows: AD01, VAT, and ICO breach notification | One canonical task per flow with complete evidence, expected outputs, reset support, and scoring rules |
| v0.1.x | Add variants within the same three flows | Distractor documents, missing approval, conflicting evidence, and harder extraction cases |
| v0.2 | Add new public-service-style task families | Separate proposals with service pattern notes, source documents, CRM seeds, UI flow, smoke tests, and scoring rules |
| v0.3 | Broaden task difficulty and evaluation depth | Multi-case runs, stronger uncertainty tests, richer audit scoring, and pass^k reporting across more seeds |

Do not add a task family to the active catalog until its GOV.UK-style flow, seed data, source documents, reset support, smoke test, and expected outputs are ready to review together.

## Local and PR validation

Run the task catalog validator before opening a PR:

```bash
npm run validate:tasks
```

or, without npm:

```bash
ruby scripts/validate-task-schema.rb
```

GitHub Actions runs the same validator on PRs that touch task definitions, task seed data, portal task flows, or the validator itself.

The validator checks:

- YAML parses cleanly.
- `tasks/v0.1.yaml` matches `tasks/schema.yaml`.
- Task and family IDs are unique.
- Every task points to an existing family.
- Task domain and type match the family.
- Every `ready` task has runnable environment fields, expected outputs, source documents, evidence requirements, scoring rules, and all required artifacts.

## 25-task target

The current GOV.UK-style UI is enough for **25 variants across the existing three flows** if contributors stay within the same form shapes:

| Flow | Variant capacity | Examples |
|---|---:|---|
| AD01 registered office change | 8 tasks | clean address change, missing approval, conflicting address evidence, current-vs-new address distractor, optional address line differences |
| VAT return | 8 tasks | different nine-box figures, zero-value boxes, ledger distractors, period-key distractors, declaration errors |
| ICO breach notification | 9 tasks | different breach timings, affected counts, data categories, risk levels, containment actions, notification status |

The current UI is **not** enough for 25 structurally different services. It is enough for 25 benchmark tasks only if they are variants of AD01, VAT, and ICO. To make those variants runnable, the next infrastructure step is to support multiple case IDs per flow instead of the current single default case per flow.

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
- Use plain, service-specific labels that resemble the relevant Companies House, HMRC, or ICO workflow.
- Do not invent decorative UI that would not appear in a GOV.UK service.

## Contribution checklist

Before opening a task PR:

- Mark incomplete tasks as `candidate` or `blocked`, not `ready`.
- Cite or describe the official procedure or service pattern being modelled.
- Include enough source documents for every expected output to be evidence-grounded.
- Add at least one uncertainty or approval boundary where a production agent should stop instead of guessing.
- Run the smoke test if the task is runnable.
