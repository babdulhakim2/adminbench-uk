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

AdminBench-UK tests whether AI agents can safely complete real UK business admin tasks — Companies House filings, HMRC-style workflows, ICO notifications, supplier onboarding, and more.

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

## Task domains

- **Companies House** — registered office changes, director appointments, confirmation statements
- **HMRC-style** — VAT returns, PAYE processing, corporation tax
- **Data protection** — ICO breach notifications, GDPR DSARs, right-to-work checks
- **Internal admin** — supplier onboarding, contract renewal, policy sign-off

---

## Environments

Portal environments run as Docker containers. Each implements a realistic GOV.UK-style multi-page form flow using the official GOV.UK Frontend library (MIT licence). Environments reset to a clean state between trials for reproducible evaluation.

```bash
docker compose up   # starts portal, CRM, audit sink, and document server
```

---

## Roadmap

**v0.1 (in progress)**
- [ ] 25 tasks across 3 difficulty tiers
- [ ] Docker environments: Companies House AD01, HMRC VAT, ICO breach notification
- [ ] Scoring rubric and human evaluation guide
- [ ] Human baseline results
- [ ] arXiv technical note

**v0.2**
- [ ] 50+ tasks, distractor variants, automated scoring
- [ ] BrowserGym integration

---

## Contributing

The project needs four types of contributor:

**Domain experts** — people who know UK company secretarial work, accountancy, HR compliance, or data protection and can help design or review tasks for accuracy.

**Regulatory reviewers** — qualified practitioners (solicitors, chartered accountants, compliance officers) who can sign off that tasks correctly represent real regulatory requirements.

**Agent evaluators** — teams who can run existing agents (Claude, GPT-4o, open-source models) against v0.1 tasks and return structured results.

**Evaluation designers** — researchers interested in benchmark methodology, scoring design, or automated evaluation.

If any of these fit, open an issue or email `[your contact]`.

---

## Citation

```bibtex
@misc{adminbench-uk-2025,
  title  = {AdminBench-UK: A Benchmark for Policy-Constrained, Document-Grounded
            AI Agent Evaluation on UK Business Administration Tasks},
  author = {[Your name]},
  year   = {2025},
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