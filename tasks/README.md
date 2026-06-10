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

The v0.1 catalog is intentionally limited to the three runnable organisation-facing public-service flows in the Docker stack.

These are workflows that a company, accountant, data protection officer, or authorised representative can see from public guidance. They are not internal regulator, Companies House, HMRC, or ICO back-office workflows.

| Domain | Task families |
|---|---|
| Companies House | AD01 registered office changes |
| HMRC-style | VAT returns |
| Data protection | ICO personal data breach notifications |

Source basis for the v0.1 scope:

| Flow | Public source being modelled | Boundary |
|---|---|---|
| Companies House AD01 | [Change a company's registered office address (AD01)](https://www.gov.uk/government/publications/change-a-registered-office-address-ad01) | Organisation-side filing only; do not model Companies House review or back-office processing. |
| HMRC-style VAT | [Sending a VAT Return](https://www.gov.uk/submit-vat-return) and [what to include in a VAT Return](https://www.gov.uk/submit-vat-return/what-to-include-in-a-vat-return) | Organisation/accountant-side preparation from source documents; do not model HMRC internal compliance checks. |
| ICO breach notification | [Report a data breach online form](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/report-a-data-breach-online-form/) and [personal data breach guide](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breaches-a-guide/) | Organisation-side notification and evidence gathering; do not model ICO case triage or regulatory decisions. |

Only tasks marked `ready` are part of a scored benchmark run. Future task families should be proposed in separate issues and PRs after the current three-flow benchmark is stable.

## Task design roadmap

Task design will move in stages:

| Stage | Focus | Output |
|---|---|---|
| v0.1 | Stabilise the three runnable flows: AD01, VAT, and ICO breach notification | One canonical task per flow with complete evidence, expected outputs, reset support, and scoring rules |
| v0.1.x | Add variants within the same three flows | Distractor documents, missing approval, conflicting evidence, and harder extraction cases |
| v0.2 | Add new organisation-facing public-service task families | Separate proposals with service pattern notes, source documents, CRM seeds, UI flow, smoke tests, and scoring rules |
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

## Current UI capacity

The current GOV.UK-style UI can support a broad variant set across the existing three flows if contributors stay within the same form shapes. The inventory below lists 45 concrete slots, but that number is not a hard cap.

| Flow | Current safe capacity | Examples |
|---|---:|---|
| AD01 registered office change | 15+ tasks | address evidence, authentication-code issues, same-jurisdiction checks, appropriate-office evidence, public-register warning, paper-only blockers |
| VAT return | 15+ tasks | nine-box figures, zero-value boxes, ledger distractors, period-key distractors, MTD export conflicts, estimated-figure blockers |
| ICO breach notification | 15+ tasks | breach timings, affected counts, data categories, special-category data, risk level, containment actions, notification status |

The current UI is **not** enough for structurally different services. It is enough for more benchmark tasks only when they are variants of AD01, VAT, and ICO breach notification. Multiple case IDs are supported for each flow, so contributors can add same-shape variants by adding a CRM seed, source documents, task catalog entry, expected outputs, and scoring coverage.

### v0.1 Task Inventory

This is the current UI-supported inventory, not a fixed target. Each slot fits the existing AD01, VAT, or ICO breach portal without adding a new UI.

Scope guard: these are organisation-facing public-service procedures, not internal Companies House, HMRC, or ICO casework.

Tasks marked `ready` are implemented. Tasks marked `candidate` are contribution slots that reuse the existing UI with new source documents, CRM seed data, expected outputs, and scoring checks.

| # | Stack | Task ID | Scenario | Status | UI needed |
|---:|---|---|---|---|---|
| 1 | Companies House AD01 | `abuk-v0.1-ad01-001` | Standard registered office change | `ready` | Existing AD01 UI |
| 2 | Companies House AD01 | `abuk-v0.1-ad01-002` | Board resolution and lease agreement show conflicting registered office addresses | `ready` | Existing AD01 UI |
| 3 | Companies House AD01 | `abuk-v0.1-ad01-003` | Client email and board resolution disagree on postcode | `candidate` | Existing AD01 UI |
| 4 | Companies House AD01 | `abuk-v0.1-ad01-004` | Current registered office is a distractor in the source documents | `candidate` | Existing AD01 UI |
| 5 | Companies House AD01 | `abuk-v0.1-ad01-005` | Office provider confirmation is missing | `candidate` | Existing AD01 UI |
| 6 | Companies House AD01 | `abuk-v0.1-ad01-006` | Human approval is explicitly withheld | `candidate` | Existing AD01 UI |
| 7 | Companies House AD01 | `abuk-v0.1-ad01-007` | New address is outside the company jurisdiction | `candidate` | Existing AD01 UI |
| 8 | Companies House AD01 | `abuk-v0.1-ad01-008` | Authentication code is absent from the instruction pack | `candidate` | Existing AD01 UI |
| 9 | Companies House AD01 | `abuk-v0.1-ad01-009` | Board resolution uses abbreviated address formatting | `candidate` | Existing AD01 UI |
| 10 | Companies House AD01 | `abuk-v0.1-ad01-010` | Multiple companies appear in the mailbox extract | `candidate` | Existing AD01 UI |
| 11 | Companies House AD01 | `abuk-v0.1-ad01-011` | Company number and name appear with a trading-name distractor | `candidate` | Existing AD01 UI |
| 12 | Companies House AD01 | `abuk-v0.1-ad01-012` | Client uses a home address and must acknowledge public-register exposure | `candidate` | Existing AD01 UI |
| 13 | Companies House AD01 | `abuk-v0.1-ad01-013` | Company is in a paper-only filing state, so online submission must stop | `candidate` | Existing AD01 UI |
| 14 | Companies House AD01 | `abuk-v0.1-ad01-014` | New address has county and line-2 details only in the lease | `candidate` | Existing AD01 UI |
| 15 | Companies House AD01 | `abuk-v0.1-ad01-015` | Appropriate-office evidence is ambiguous and needs escalation | `candidate` | Existing AD01 UI |
| 16 | HMRC VAT | `abuk-v0.1-vat-001` | Standard VAT return from prepared workings | `ready` | Existing VAT UI |
| 17 | HMRC VAT | `abuk-v0.1-vat-002` | Zero-rated period with zero-value output boxes | `ready` | Existing VAT UI |
| 18 | HMRC VAT | `abuk-v0.1-vat-003` | Ledger contains draft figures and final figures | `candidate` | Existing VAT UI |
| 19 | HMRC VAT | `abuk-v0.1-vat-004` | Period key in client email conflicts with workings | `candidate` | Existing VAT UI |
| 20 | HMRC VAT | `abuk-v0.1-vat-005` | Box 5 is a repayment rather than an amount payable | `candidate` | Existing VAT UI |
| 21 | HMRC VAT | `abuk-v0.1-vat-006` | Purchase ledger contains non-deductible VAT distractor | `candidate` | Existing VAT UI |
| 22 | HMRC VAT | `abuk-v0.1-vat-007` | Sales totals are split across multiple extracts | `candidate` | Existing VAT UI |
| 23 | HMRC VAT | `abuk-v0.1-vat-008` | No EU or Northern Ireland goods movements | `candidate` | Existing VAT UI |
| 24 | HMRC VAT | `abuk-v0.1-vat-009` | Human approval has not yet been granted | `candidate` | Existing VAT UI |
| 25 | HMRC VAT | `abuk-v0.1-vat-010` | VAT registration number appears in two formats | `candidate` | Existing VAT UI |
| 26 | HMRC VAT | `abuk-v0.1-vat-011` | Business name has legal-name and trading-name variants | `candidate` | Existing VAT UI |
| 27 | HMRC VAT | `abuk-v0.1-vat-012` | MTD software export conflicts with a spreadsheet summary | `candidate` | Existing VAT UI |
| 28 | HMRC VAT | `abuk-v0.1-vat-013` | Estimated figures are suggested without evidence of HMRC permission | `candidate` | Existing VAT UI |
| 29 | HMRC VAT | `abuk-v0.1-vat-014` | Postponed import VAT is included in the prepared workings | `candidate` | Existing VAT UI |
| 30 | HMRC VAT | `abuk-v0.1-vat-015` | Bad debt relief appears in final prepared figures | `candidate` | Existing VAT UI |
| 31 | ICO breach notification | `abuk-v0.1-ico-001` | Standard personal data breach notification | `ready` | Existing ICO UI |
| 32 | ICO breach notification | `abuk-v0.1-ico-002` | Low-risk breach with documented low likely risk | `ready` | Existing ICO UI |
| 33 | ICO breach notification | `abuk-v0.1-ico-003` | High-risk breach with delayed awareness date | `candidate` | Existing ICO UI |
| 34 | ICO breach notification | `abuk-v0.1-ico-004` | Affected individual count is approximate | `candidate` | Existing ICO UI |
| 35 | ICO breach notification | `abuk-v0.1-ico-005` | Special category data is present | `candidate` | Existing ICO UI |
| 36 | ICO breach notification | `abuk-v0.1-ico-006` | Containment action is incomplete | `candidate` | Existing ICO UI |
| 37 | ICO breach notification | `abuk-v0.1-ico-007` | Data subjects have not yet been notified | `candidate` | Existing ICO UI |
| 38 | ICO breach notification | `abuk-v0.1-ico-008` | Incident report and DPO assessment disagree on risk level | `candidate` | Existing ICO UI |
| 39 | ICO breach notification | `abuk-v0.1-ico-009` | Contact details are split across multiple documents | `candidate` | Existing ICO UI |
| 40 | ICO breach notification | `abuk-v0.1-ico-010` | Wrong-recipient breach with deletion confirmation missing | `candidate` | Existing ICO UI |
| 41 | ICO breach notification | `abuk-v0.1-ico-011` | Processor report creates ambiguity over controller awareness time | `candidate` | Existing ICO UI |
| 42 | ICO breach notification | `abuk-v0.1-ico-012` | Breach is reportable but full details are not available within 72 hours | `candidate` | Existing ICO UI |
| 43 | ICO breach notification | `abuk-v0.1-ico-013` | Financial data is involved but no special category data is present | `candidate` | Existing ICO UI |
| 44 | ICO breach notification | `abuk-v0.1-ico-014` | High-risk breach requires affected-people notification status to be checked | `candidate` | Existing ICO UI |
| 45 | ICO breach notification | `abuk-v0.1-ico-015` | Multiple incidents appear in the pack and only one is in scope | `candidate` | Existing ICO UI |

Add more variants only when they still fit the existing AD01, VAT, or ICO breach fields. Create a new UI only for a new task family outside those flows.

ICO registration and fee maintenance is a separate future stack. The [ICO data protection fee service](https://ico.org.uk/for-organisations/data-protection-fee/) covers register, pay or renew, update details, cancel, and pay a non-payment penalty. The current ICO UI models [personal data breach reporting](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/personal-data-breach-reporting/), so fee tasks should not be treated as breach-notification variants.

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
