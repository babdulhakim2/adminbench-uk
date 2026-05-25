# AdminBench-UK

**A benchmark for AI agents on real-world UK business administration tasks.**

> ⚠️ Early-stage open research project. v0.1 in active development. Collaborators welcome — see [Contributing](#contributing).

---

## The problem

UK business administration is a serious economic burden — and a largely unsolved problem for AI agents.

- Regulatory compliance costs UK businesses an estimated **£22.4 billion per year** in administrative overhead, based on government figures cited in a 2025 Centre for Policy Studies analysis — and that figure excludes tax administration entirely.[^1]
- Tax compliance alone costs businesses a further **£15.4 billion annually**, according to a 2025 National Audit Office report, with HMRC's own administrative costs rising 15% in real terms between 2019 and 2024.[^2]
- **63% of businesses** say the time spent on compliance is a burden, up from 58% in 2022 — with small businesses (10–49 staff) spending an average of 29.5 days per year on regulatory compliance alone.[^3]
- Compliance costs fall disproportionately on smaller firms. A 2026 analysis found the total compliance burden **costs UK SMEs £36 billion a year**, with 41% of small firms reporting that official guidance is difficult to understand, and only 14% saying they receive timely responses from regulators.[^4]
- Time spent on admin is estimated to cost UK SME owners nearly **£19,000 per year** in lost productivity, according to a 2025 NerdWallet survey of 500 business owners.[^5]

AI agents are being actively marketed as the solution. The problem is that almost no one has properly tested whether they can be trusted with these tasks.

---

## What is AdminBench-UK?

AdminBench-UK tests whether AI agents can safely complete real UK business admin tasks. v0.1 focuses on three public-service-style workflows: a Companies House filing, an HMRC-style VAT return, and an ICO breach notification.

Most agent benchmarks test whether an agent can *navigate* a website. AdminBench-UK tests what actually matters in admin work:

- Does the agent read the source documents, or guess?
- Does it follow the policy rules that apply to the task?
- Does it stop and ask for human approval before taking irreversible actions?
- Does it handle missing or contradictory information correctly?
- Does it leave a proper audit trail?

---

## How it works

Each task gives an agent:

- A client instruction (email or brief)
- A set of source documents (lease, board resolution, ID scan, etc.)
- A portal environment built on the [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) component library, running in Docker
- A mock CRM and audit log

Task definitions for the current benchmark set live in [`tasks/v0.1.yaml`](tasks/v0.1.yaml). The task schema and contributor guidance live in [`tasks/README.md`](tasks/README.md).

The agent must complete the task correctly, using the right evidence, following the applicable policy, and stopping for human approval before any final submission.

Tasks are scored across seven dimensions:

| Dimension | What it measures |
|---|---|
| Task Completion | Did the agent produce the correct outputs? |
| Evidence Grounding | Did it extract data from source documents, not from memory? |
| Policy Compliance | Did it follow the applicable rules? |
| HITL Discipline | Did it stop before irreversible actions and request approval? |
| Uncertainty Handling | Did it escalate rather than guess when information was missing? |
| System Hygiene | Did it update downstream records correctly and in the right order? |
| Audit Trail Quality | Did it produce a traceable log of every action and decision? |

Results are reported using **pass^k** (reliability across repeated trials), not just single-run accuracy — because an agent that succeeds 4 times out of 5 is not production-ready for regulatory filings.

---

## v0.1 Task Domains

- **Companies House** — AD01 registered office change
- **HMRC-style** — VAT return preparation
- **Data protection** — ICO personal data breach notification

These are the only runnable v0.1 task families. Future domains and task types should be added in separate proposals after this three-flow benchmark is stable.

---

## Environments

Portal environments run as Docker containers. Each implements a realistic GOV.UK-style multi-page form flow using the official GOV.UK Frontend library (MIT licence). Environments reset to a clean state between trials for reproducible evaluation.

### Run the v0.1 environment stack

v0.1 includes three Dockerised task environments in one GOV.UK-styled portal:

| Environment | Portal URL | Case ID | Seed |
|---|---|---|---|
| Companies House AD01 registered office address | `http://localhost:3000/task-list` | `ad01-001` | `ad01-default` |
| HMRC VAT return | `http://localhost:3000/vat/task-list` | `vat-001` | `vat-default` |
| ICO personal data breach notification | `http://localhost:3000/ico/task-list` | `ico-001` | `ico-default` |

Start the stack:

```bash
docker compose up --build
```

Open the services:

| Service | URL | Purpose |
|---|---|---|
| Portal | `http://localhost:3000` | GOV.UK Prototype Kit portal with AD01, VAT, and ICO flows |
| Mock CRM | `http://localhost:4000/api/cases` | Case state, draft updates, submission state |
| Audit sink | `http://localhost:4001/events` | Captured portal and agent events |
| Document server | `http://localhost:4002/documents` | Source documents for the task |

Reset the environment between evaluation runs:

```bash
npm run reset
```

Run a smoke check:

```bash
npm run smoke
```

Score the current run from CRM and audit state:

```bash
npm run evaluate
```

The evaluator is Python-based because model runs and browser-agent harnesses are usually orchestrated from Python. LLM agents operate the browser; scoring happens afterwards from deterministic CRM and audit checks. The core output includes:

| Metric | Meaning |
|---|---|
| `cr` | Completion rate: required fields and required portal steps are correct. |
| `cup` | Compliance under policy: completion with zero critical policy violations. |
| `riskRatio` | Policy violations divided by active deterministic policy checks. |
| `policyRiskRatios` | Risk ratio split by policy dimension. |
| `fieldAccuracy` | Exact-match field correctness against document-derived expected values. |
| `requiredStepCoverage` | Required portal steps observed in the audit log. |
| `allPassAt1` | Whether all evaluated tasks passed CuP in this run. |

Set run metadata for model comparisons:

```bash
EVALUATION_AGENT=browser-agent \
EVALUATION_MODEL=gpt-5.4 \
EVALUATION_BROWSER_HARNESS=browsergym \
python3 scripts/evaluate_run.py --output results/gpt-5.4/run-001.json
```

Only set `EVALUATION_HUMAN_APPROVAL_GRANTED=true` when the evaluator explicitly allowed the agent to make a final submission. Otherwise, a submitted filing is a policy violation even if the portal accepted it.

The reset endpoint is `POST /__admin/reset` on every service. It accepts:

```json
{
  "trialId": "local-run-001",
  "seed": "v0.1-default"
}
```

Use `RESET_TOKEN` to override the local default reset token. The default `v0.1-default` seed loads all three cases. Individual seeds are also available for focused runs: `ad01-default`, `vat-default`, and `ico-default`.

Each flow has source documents, case-specific form steps, check answers, human approval, and a simulated submission. Final submission is blocked unless the draft is complete and human approval is confirmed.

---

## Roadmap

**v0.1 (in progress)**
- [x] Three runnable public-service-style task flows: AD01, VAT, ICO breach notification
- [x] Docker environments: Companies House AD01, HMRC VAT, ICO breach notification
- [x] Automated scoring for the three ready tasks
- [ ] Scoring rubric and human evaluation guide
- [ ] Human baseline results
- [ ] arXiv technical note

**v0.2**
- [ ] Additional task families and distractor variants
- [ ] BrowserGym integration

Task design roadmap details are in [`tasks/README.md`](tasks/README.md). New task families should land only when their source documents, seed data, GOV.UK-style UI flow, reset support, smoke test, and expected outputs are ready together.

---

## Contributing

The project needs four types of contributor:

**Domain experts** — people who know UK company secretarial work, accountancy, or data protection and can help design or review tasks for accuracy.

**Regulatory reviewers** — qualified practitioners (solicitors, chartered accountants, compliance officers) who can sign off that tasks correctly represent real regulatory requirements.

**Agent evaluators** — teams who can run existing agents (Claude, GPT-4o, open-source models) against v0.1 tasks and return structured results.

**Evaluation designers** — researchers interested in benchmark methodology, scoring design, or automated evaluation.

If any of these fit, open an issue or email `abdulhakim.gafai@gmail.com`.

---

## Citation

```bibtex
@misc{adminbench-uk-2026,
  title  = {AdminBench-UK: A Benchmark for Policy-Constrained, Document-Grounded
            AI Agent Evaluation on UK Business Administration Tasks},
  author = {Abdulhakim Bashir},
  year   = {2026},
  url    = {https://github.com/babdulhakim2/adminbench-uk}
}
```

---

## Licence

Task definitions, rubrics, and evaluation code: Apache 2.0.  
Portal environments use [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) (MIT licence).

---

[^1]: Colvile, R. (2025). *Axing the Admin? Not Quite.* Centre for Policy Studies. The figure of £22.4bn is derived from the government's own claim that cutting 25% of administrative costs would save £5.6bn.
[^2]: National Audit Office (2025). *The Administrative Cost of the Tax System.* Reported in Ross Martin Tax (February 2025).
[^3]: Department for Business and Trade (2024). *Business Perceptions Survey 2024.* GOV.UK. 63% figure and days-per-year estimates for businesses by size band.
[^4]: *Compliance burden costing SMEs £36bn a year, reform could unlock £9bn.* Business Link Magazine, March 2026.
[^5]: NerdWallet UK (2025). *Survey: How UK Business Owners are Prioritising Time and Money in 2025.* Based on 500 UK SME owners surveyed June 2025.
