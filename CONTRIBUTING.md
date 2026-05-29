# Contributing to AdminBench-UK

Thanks for your interest. AdminBench-UK is an open research project and contributions are what will make it useful. This document explains how to get involved.

---

## Ways to contribute

There are four roles. You don't need to do all of them — even one task review or one agent evaluation run is genuinely helpful.

### 1. Domain expert — task authorship

We need people who do UK business admin in practice: company secretaries, accountants (ATT/ACA), data protection officers, and compliance managers.

What this involves:
- Suggesting realistic admin scenarios we haven't covered
- Drafting new task input packs (instruction document + source documents)
- Reviewing draft tasks for realism — does this reflect how the process actually works?

You don't need a technical background. Tasks are written in plain text and YAML; we can handle the formatting.

### 2. Regulatory reviewer

We need qualified practitioners to sign off that tasks correctly represent the applicable rules — the right fields, the right deadlines, the right supporting documents.

What this involves:
- Reviewing a small set of completed tasks in your area of expertise
- Flagging any rules, edge cases, or policy changes we've missed
- Confirming the ground truth for each task is defensible

This is a relatively light commitment — a few hours per domain — and your name goes on the technical note as a reviewer.

### 3. Agent evaluator

We need teams with access to LLM-based agents to run v0.1 tasks and return structured results. We provide the full evaluation infrastructure; you run your agent against it in your own environment.

What this involves:
- Pulling the Docker environment and running the evaluation harness
- Running your agent against the task set (pass^k protocol: 5 runs per task)
- Returning results in the standard format (see `evaluation/results_schema.json`)

Results are published on the leaderboard with your agent name and any paper/system card you want linked.

### 4. Evaluation methodology

We welcome contributions on benchmark design, scoring, and evaluation infrastructure.

Open areas:
- Automated scoring for Evidence Grounding (D2) and Audit Trail Quality (D7)
- Deterministic scoring design with human audit protocol
- ICC analysis tooling for pass^k reliability reporting
- BrowserGym integration for compatibility with existing agent frameworks

---

## How to contribute

**For task suggestions and domain review:**
Open a GitHub issue using the `task-suggestion` or `review-request` template. Include your background briefly so we can match you to the right domain.

Task authors should follow the schema and checklist in [`tasks/README.md`](tasks/README.md). New runnable tasks need a YAML catalog entry, source documents, a CRM seed, a GOV.UK Frontend portal flow, reset support, smoke-test coverage, expected outputs, and human approval rules.

**For agent evaluation:**
Open an issue using the `evaluation-run` template or email `[your contact]`. We'll share access to the v0.1 task pack and harness once it's ready.

**For code and infrastructure:**
Fork the repo, make your changes on a branch, and open a pull request. Please keep PRs focused — one change per PR makes review much faster.

---

## Task quality standards

Tasks accepted into the benchmark must meet three criteria:

**Regulatory accuracy.** Every policy rule in a task must be traceable to a specific statute, guidance document, or published procedure. "I think this is how it works" is not sufficient — we need a source.

**Document realism.** Input documents should look and read like real documents of that type. We provide templates; reviewers check that the content is plausible.

**Ground truth completeness.** Every task needs a fully specified ground truth: field-level expected values with source attribution, expected CRM state, and expected audit log structure. Partial ground truths are not accepted.

---

## Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) (v2.1). Be direct, be constructive, assume good faith.

---

## Questions

Open an issue or email `abdulhakim.gafai@gmail.com`. We aim to respond within a few days.
