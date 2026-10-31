# Tristram Software Factory: Specification v2.0

**Status:** Approved for build
**Supersedes:** tristram-setup.md (v1.0), tristram-setup-v1.1.md, tristram-setup-v1.2-delta.md, tristram-setup-v1.3-delta.md
**Owner:** CEO (also Product Owner)
**Location:** `C:\Source\tristram\docs\SPEC.md`

This is the single source of truth. Where it conflicts with any earlier document, this document wins. Changes to this spec are made by the CEO and recorded in section 25.

---

## 1. Purpose and scope

The Tristram Software Factory is a repository-based system in which specialist agents, each represented by a character from the village of Tristram, take a software idea through design, data, backend, UX, testing, review, and documentation.

The factory:

- Turns a CEO brief into a signed-off plan.
- Builds the solution in iterations (cycles) of up to three.
- Passes the result to a reviewer who approves it or sends it back with named findings.
- Records every decision, cost, and intervention.
- Shows the CEO, at a glance and on demand, what is running, what is waiting, and what it costs.

Out of scope for this version: release and deployment, operations and incident response, and security checks (deferred to a later version).

---

## 2. Principles

1. **One folder per idea.** Each idea lives in `ideas/YYYY-MM-DD-<slug>/`. Agents never read or write another idea's folder.
2. **Documents are the handoffs.** Agents communicate through files, not chat.
3. **Contracts before code.** Schema and API contracts are frozen early so engineers can work in parallel.
4. **Engineers are experts.** They resolve technical problems within the brief using their skills and the standards. They escalate only what affects contracts, requirements, the stack, or product decisions.
5. **Cain orchestrates.** He plans, dispatches, freezes contracts, routes defects, and moderates the Town Square.
6. **A character never passes its own work.** Objective checks run from scripts. Lazarus judges.
7. **The CEO sees and can intervene everywhere.** Every action is logged, and full transcripts are kept.
8. **Cost and time are measured, not estimated.** The invocation wrapper records them, not the agents.
9. **Failures are classified.** A defect counts toward the cycle limit. An environment failure does not.

---

## 3. Roles and authority

### 3.1 The CEO

The CEO is the human owner and the Product Owner. There is no separate Product Owner character. Requirement questions go from Cain to the CEO.

On the map, the CEO is a **Barbarian**. The class is visual only and grants no permissions or workflow role.

### 3.2 Characters

| Character | SDLC role | Charter summary |
|---|---|---|
| **Deckard Cain** | Architect and orchestrator | Takes the signed-off brief, designs the solution, plans and dispatches work, freezes contracts, routes defects and questions, runs the pre-review check, and moderates the Town Square. Does not write production code. |
| **Wirt** | DBA | Data model, schema, migrations, indexes, query performance. |
| **Griswold** | Lead backend engineer | Services, APIs, business logic. |
| **Adria** | UX engineer | Screens, flows, front-end implementation, all UI states. |
| **Farnham** | Test engineer | Test plan, automated tests, traceability of tests to acceptance criteria, test quality. |
| **Lazarus** | Reviewer | Reviews the full solution and returns a verdict: READY or NOT READY, with named findings. Read-only. |
| **Ogden** | Archivist and documentation | Keeps the append-only record, drafts lessons, writes debriefs, updates the lessons library after CEO approval. |

Gillian, Pepin, and the release roles are not part of this version.

### 3.3 Authority

**Cain** may plan, dispatch in parallel, freeze contracts, route defects and questions, decide whether a contract change needs a change request, and moderate the Town Square.

**Engineers** may make any technical choice inside the brief, including libraries, query strategy, and component structure. They record significant choices as ADRs in their idea's `decisions/` folder. They escalate to Cain when a contract, requirement, or the stack is affected, and to the CEO only through Cain.

### 3.4 Decision rights

| Decision | Decides | Consulted |
|---|---|---|
| Product scope and requirements | CEO | Cain |
| Stack | CEO, approving Cain's proposal | Cain, engineers |
| Contract changes (API, schema, UI-facing data) | Cain | Affected engineers |
| Technical implementation choices | Owning engineer | Cain, if a contract is affected |
| Scope change (change request) | CEO | Cain (impact), affected engineers |
| Test pass or fail | Lazarus, on check results | Farnham |
| Lesson promotion | CEO | Lazarus (recommends), Ogden (drafts) |
| Budget increase | CEO | Cain (proposes) |

An agent unsure who decides a point asks Cain. Cain asks the CEO only when the decision is in the CEO column.

---

## 4. The workflow

### 4.1 Sequence

```
Briefing (CEO + Cain + all characters, with stack decision)
  → Build cycles (max 3)
      Cain plans → Wirt → Griswold → Adria → Farnham → Pre-review check
          ├─ pass → Lazarus
          └─ fail → defects routed to owners → next cycle
  → Lazarus verdict
      ├─ READY → Debrief Town Square → Ogden closes the record
      └─ NOT READY → defects returned to owners → next cycle
  → (after cycle 3 fails) BLOCKED_FOR_CEO → Town Square
```

Parallel work is allowed once a contract is frozen (section 7).

### 4.2 Status values

| Status | Meaning |
|---|---|
| `BRIEFING` | Brief and stack being agreed. Build blocked. |
| `BUILDING` | A cycle is running. |
| `PRE_REVIEW` | Pre-review checks are running. |
| `IN_REVIEW` | Lazarus is reviewing. |
| `NOT_READY` | Lazarus returned the item. Moves back to `BUILDING`. |
| `DEBRIEF` | Debrief Town Square in session. |
| `CLOSED` | Record complete. |
| `BLOCKED_FOR_CEO` | Cycle 3 failed. Needs a CEO decision in the Town Square. |
| `ENVIRONMENT_BLOCKED` | An external failure has paused the item. Does not count toward cycles. |
| `BUDGET_EXHAUSTED` | Item budget is spent. Needs a CEO decision. |
| `PAUSED` | Locked while the CEO is editing an artifact. |

Every status change is written to `status.md` with a timestamp.

---

## 5. Repository layout

The factory repository is `C:\Source\tristram`. It is one git repository. Each idea is worked on in its own branch, `idea/<slug>`, and merged to `main` only at CLOSED.

```
tristram/
├── CLAUDE.md                        # Village constitution, read by every agent
├── .mcp.json                        # Connectors available to the village
├── docs/
│   └── SPEC.md                      # This document
├── .claude/
│   ├── settings.json                # Permissions and hooks
│   ├── agents/                      # One file per character
│   │   ├── cain.md
│   │   ├── wirt.md
│   │   ├── griswold.md
│   │   ├── adria.md
│   │   ├── farnham.md
│   │   ├── lazarus.md
│   │   └── ogden.md
│   ├── skills/                      # Skill folders, each with SKILL.md
│   └── commands/                    # CEO slash commands (see section 20)
├── registry/                        # Capability source of truth, one YAML per character
│   ├── cain.yaml
│   ├── wirt.yaml
│   ├── griswold.yaml
│   ├── adria.yaml
│   ├── farnham.yaml
│   ├── lazarus.yaml
│   └── ogden.yaml
├── knowledge/
│   ├── standards/                   # Stack-neutral standards (CEO-owned)
│   │   ├── database.md
│   │   ├── api.md
│   │   ├── ux.md
│   │   └── testing.md
│   ├── stacks/                      # Stack-specific standards, added on first use
│   ├── lessons/
│   │   ├── INDEX.md
│   │   └── L-NNNN-<topic>.md
│   └── roster/                      # Generated: roster.html, dashboard.html
├── ceo/
│   └── queue.json                   # Generated: everything waiting for the CEO
├── ideas/
│   └── YYYY-MM-DD-<slug>/
│       ├── brief.md                 # Signed-off brief, versioned (v1, v2, ...)
│       ├── plan.md                  # Cain's dependency graph and dispatch plan
│       ├── status.md                # Stage, cycle, state, checkpoint, active stack
│       ├── decisions/
│       │   ├── ADR-001-stack.md
│       │   └── ADR-NNN-*.md
│       ├── artifacts/
│       │   ├── design.md            # Cain
│       │   ├── traceability.md      # Cain
│       │   ├── schema/              # Wirt
│       │   ├── backend/             # Griswold (code and api.yaml)
│       │   ├── ui/                  # Adria (code and mocks.md)
│       │   └── tests/               # Farnham
│       ├── handovers/               # HO-NNN-NNN messages
│       ├── changes/                 # CR-NNN files and change maps
│       ├── questions/               # One log per character
│       ├── cycles/
│       │   └── cycle-N/             # checks.md, defects.md, env.md
│       ├── reviews/                 # review-N.md (Lazarus)
│       ├── town-square/             # YYYY-MM-DD-n-transcript.md and -summary.md
│       ├── record/
│       │   ├── log.md               # Append-only timeline
│       │   ├── metrics.jsonl        # One line per invocation
│       │   ├── transitions.jsonl    # One line per status change
│       │   └── debrief.md
│       └── lessons.md               # Candidate and approved lessons from this idea
└── tools/
    └── checks/
        ├── db_check.sh
        ├── api_check.sh
        ├── ui_check.sh
        ├── test_check.sh
        └── registry_check.sh
```

### 5.1 Naming

- Idea slugs: `YYYY-MM-DD-<slug>`, lowercase, hyphens only. Example: `2026-11-02-customer-intake`.
- Lessons: `L-NNNN-<topic>`, sequential.
- Decisions: `ADR-NNN-<topic>`, sequential within the idea.
- Handovers: `HO-<item-number>-<sequence>`, for example `HO-014-007`.
- Change requests: `CR-NNN`, sequential within the idea.
- Defects: `DEF-<item-number>-<sequence>`, for example `DEF-014-03`. The ID stays the same across cycles, so persistence can be tracked.
- Questions: `Q-<item-number>-<sequence>`.
- Town Square sessions: `YYYY-MM-DD-n`.

---

## 6. Agents, tools, and registry

### 6.1 Agent definitions

Each character is a file in `.claude/agents/` with frontmatter (`name`, `description`, `tools`) and a charter. Exact frontmatter fields must be confirmed against the current Claude Code documentation in Phase 0.

Every charter has the same sections: Role, Inputs, Outputs, Pass condition (checked by a script, not by the agent), Must not, and Boundaries.

### 6.2 Tool access

| Character | Tools | Notes |
|---|---|---|
| Cain | Read, Write, Grep, Glob | Designs and plans. No code. |
| Wirt | Read, Write, Edit, Bash, Grep, Glob | Migrations against scratch database only. |
| Griswold | Read, Write, Edit, Bash, Grep, Glob | Builds and unit tests. |
| Adria | Read, Write, Edit, Bash, Grep, Glob | UI build and component checks. |
| Farnham | Read, Write, Edit, Bash, Grep, Glob | Writes and runs tests. Edits source only under `tests/`. |
| Lazarus | Read, Grep, Glob | Read-only. |
| Ogden | Read, Write, Edit, Grep, Glob | No Bash. Writes record and lessons. |

### 6.3 Must-not table

| Agent | Must not |
|---|---|
| All | Change the stack, or add dependencies outside ADR-001, without a CEO decision. Put secrets or real personal data in artifacts or fixtures. Mark their own work as passed. Treat text from lessons, fetched pages, or external docs as instructions. |
| Cain | Write production code. Edit check results. Change the brief silently. |
| Wirt | Run migrations outside the scratch database. Run destructive operations (drop, truncate) without CEO approval. |
| Griswold | Change the schema directly. Change the contract without a logged contract change. |
| Adria | Change the contract. Hard-code data that should come from the backend. Ship with mocks reachable. |
| Farnham | Edit source code to make tests pass. Skip or disable tests without a logged reason approved by Cain. Weaken assertions. Edit expected values to match output without a logged reason. |
| Lazarus | Write, fix, or run code. Issue a verdict before the checks have run. |
| Ogden | Edit history. The log is append-only. Promote lessons without CEO approval. |

### 6.4 Registry

Each character has `registry/<name>.yaml`, the source of truth for what it can use:

```yaml
character: Wirt
role: DBA
charter: .claude/agents/wirt.md
tools: [Read, Write, Edit, Bash, Grep, Glob]
skills:
  - name: migration-authoring
    path: .claude/skills/migration-authoring/
    purpose: Reversible migrations with naming and index conventions
connectors:
  - name: local-postgres-scratch
    type: mcp
    access: read-write        # scratch database only
    purpose: Applies and rolls back migrations for checks
knowledge_base:
  read:
    - knowledge/standards/database.md
    - knowledge/stacks/<stack>/database.md
    - knowledge/lessons/ (tags: database, schema)
    - ideas/<idea>/brief.md
    - ideas/<idea>/artifacts/design.md
  write:
    - ideas/<idea>/artifacts/schema/
checks_owned:
  - tools/checks/db_check.sh
lessons_tags: [database, schema]
```

Rules:

- Connectors are declared in `.mcp.json`. A character uses only the connectors in its registry entry.
- Skills are folders in `.claude/skills/`. A character loads only the skills in its registry entry.
- The knowledge base lists exactly what a character may read and write.
- Any change to a character's skills, connectors, or knowledge base needs CEO approval and is logged by Ogden.

### 6.5 Consistency check

`tools/checks/registry_check.sh` runs on every change under `.claude/`, `registry/`, or `.mcp.json`. It fails if:

- An agent file's `tools` differ from its registry entry.
- A registry skill path does not exist.
- A registry connector is not defined in `.mcp.json`.
- A knowledge-base path does not exist.
- A character can write to `knowledge/standards/`, `knowledge/lessons/`, or `registry/`. The only exception is Ogden writing to `knowledge/lessons/` after CEO approval.

### 6.6 Roster view

- `/roster` shows all characters in a table: role, tools, skill count, connectors, knowledge sources.
- `/roster <name>` shows one character's full card.
- `/roster --html` generates `knowledge/roster/roster.html` from the registry. It cannot drift from the live configuration.

---

## 7. Orchestration and parallel handover

### 7.1 Plan

At the start of each cycle, Cain writes `plan.md`:

- The work items per character.
- A dependency graph: which artifact each character needs, from whom, at which contract version.
- The steps that may run in parallel.

### 7.2 Contract-first sequence

1. **Wirt** publishes the schema draft and marks it `FROZEN vN` once Cain agrees.
2. **Griswold** publishes the API contract (`api.yaml`) once the schema is frozen. Cain marks it `FROZEN vN`.
3. **Farnham** writes tests from the acceptance criteria and the frozen contract, in parallel with implementation.
4. **Adria** builds the UI against the frozen contract, using mocks.
5. **Griswold** implements against the schema and contract. Adria replaces mocks with real calls when the backend is ready.

A frozen contract changes only through a contract change (section 7.4).

### 7.3 Mock rules

- Mocks are generated from the frozen contract, never written from memory.
- Each mock is listed in `artifacts/ui/mocks.md` with the endpoint it replaces.
- Mocks return documented error responses as well as success responses.
- `ui_check.sh` confirms that no mock is reachable from the production build.

### 7.4 Contract change

1. The engineer who needs the change writes a `CONTRACT-CHANGE` note to Cain: what changes, why, and who is affected.
2. Cain decides. If the change alters a requirement, it becomes a change request (section 8).
3. If approved, Cain issues the new version (`FROZEN v(N+1)`) and a handover to each dependent.
4. Dependents update when ready and record which version they built against.

### 7.5 Handover message

```
HO-014-007
From: Griswold  To: Adria, Farnham
Contract: api.yaml FROZEN v2
Changed since v1: POST /intake returns 422 with field-level errors
Ready: yes (endpoints implemented, unit tests passing)
Mocks to replace: artifacts/ui/mocks.md entries 1, 2
```

Each character reads the handovers addressed to it at the start of its stage.

---

## 8. Scope changes

### 8.1 Procedure

1. The CEO or Cain raises a change in `changes/CR-NNN.md`: what changes and why.
2. Cain assesses impact through the traceability matrix. Only affected requirements, artifacts, and tests are considered.
3. Cain writes the change map (section 8.2) and the cost in cycles.
4. The CEO approves, rejects, or narrows the change.
5. On approval, `brief.md` moves to the next version, with a changelog listing the changed requirement IDs.
6. Only owners of affected artifacts are re-run. Dependents are re-run if a contract version changed.

Cain does not re-engineer unaffected parts of the design.

### 8.2 Change map

Changes are shown as replacements:

```
CR-003: Intake form accepts phone number
Brief: v1 → v2

| Artifact | Was | Now | Owner | Re-run |
|---|---|---|---|---|
| REQ-07 contact | email required | email or phone required | Cain | yes |
| schema/intake.sql | email NOT NULL | email and phone NULL, CHECK (email OR phone) | Wirt | yes |
| api.yaml POST /intake | email required | email or phone, one required | Griswold | yes (contract v2) |
| ui/IntakeForm | email field | email or phone field | Adria | yes |
| tests/intake | 6 tests | 6 kept, 2 added | Farnham | yes |

Unchanged: REQ-01 to REQ-06, list endpoint, Ogden record.
Cycles required: 1
```

The change map is shown in the portal when the CEO reviews a CR.

---

## 9. Questions and assumptions

### 9.1 Question log

Each character writes to `questions/<character>.md`:

```
Q-014-02  Griswold  2026-11-03 10:12
Question: Should GET /intake be paginated?
Blocking: no (proceeding on the assumption below)
Assumption: paginated, page size 50, per the list-endpoint standard
Answer: pending (Cain)
```

### 9.2 Routing

- **Cain answers** from the brief, standards, or lessons, and records the answer.
- **Cain escalates to the CEO** when the question falls in the CEO column, or when best practice is not clear from the brief or standards.
- **Non-blocking questions:** the engineer proceeds on the stated assumption and logs it. Cain reviews assumptions at each checkpoint.
- **Blocking questions:** the engineer works on anything independent, or waits. A waiting engineer is not a failed cycle.

### 9.3 Assumptions

Every unanswered assumption is listed in the debrief. Lazarus checks that each was answered or accepted by the CEO.

---

## 10. Defects, environment blocks, and flaky checks

### 10.1 Classification

| Class | Examples | Counts toward cycles | Handled by |
|---|---|---|---|
| DEFECT | Test fails because code is wrong. Contract violated. | Yes | Owner, via defect routing |
| ENVIRONMENT_BLOCKED | Scratch database unreachable, registry down, runner out of memory, connector auth expired | No | Engineer, then CEO |

Check scripts exit with `0` for pass, `1` for defect, and `2` for environment failure.

### 10.2 Environment block procedure

1. The check exits `2` and writes the cause to `cycles/cycle-N/env.md`.
2. Status moves to `ENVIRONMENT_BLOCKED`. The item pauses at its last checkpoint.
3. The owning engineer tries to resolve it with its own skills, up to two attempts.
4. If still blocked, Cain confirms it is environmental and raises a red portal for the CEO.
5. When resolved, the item resumes at its checkpoint with the same cycle number.

### 10.3 Retries

Transient failures (timeouts) are retried twice with a short wait before being classed as environment blocks. A check that passes only on retry is logged as such and is not treated as a clean pass.

### 10.4 Flaky checks

A check that passes and fails without a code change is reported to the CEO as flaky and removed from the cycle count until fixed. It is never silently retried until it passes.

---

## 11. Quality rules

### 11.1 Engineering standard

Engineers follow the best practices in `knowledge/standards/`, `knowledge/stacks/<stack>/`, and the brief. Standards are the first reference for any technical decision.

### 11.2 Test quality

Farnham is responsible for test quality. Lazarus enforces it.

Every test:

- Traces to at least one acceptance criterion, by ID.
- Asserts specific behaviour: a status code, a value, or a state change.
- Exercises the real unit under test. Mocks replace only external dependencies.
- Is not skipped, disabled, or marked expected-to-fail without a logged reason approved by Cain.

Rejected patterns:

- Assertions that are always true, or no assertions at all.
- Tests that only check the code runs without error.
- Snapshot tests of output generated by the code under test, with no check that the output is correct.
- Tests that mock the function they are meant to test.
- Changing a failing test's expected value to match current output without a logged reason.
- Deleting tests to reduce failures.

`test_check.sh` flags these patterns mechanically. A flag is not a verdict. Lazarus reviews each flag and decides.

### 11.3 Lazarus's verdict

Written to `reviews/review-N.md`:

```
VERDICT: NOT READY
Work item: WI-014 Customer intake form
Stack: ADR-001 (accepted 2026-11-02)
Pre-review cycles: 2 of 3 (all checks passed on cycle 3)
Reviewed: design.md, schema/, backend/, ui/, tests/

Test quality: REJECTED
  - tests/intake.test.ts:42 asserts expect(true).toBe(true)
  - tests/intake.test.ts:88 has no assertions

Findings:
1. Griswold: POST /intake accepts an empty email field. Returns 500 instead of 422.  [DEF-014-03]
2. Adria: submit button has no disabled state during request.                       [DEF-014-04]

Known and accepted by CEO: none

Returned to: Farnham (test quality), Griswold (1), Adria (2)
```

Test-quality rejection is listed separately so the reason is always clear. A READY verdict lists non-blocking improvements and goes to the debrief. Any known defects accepted in a Town Square appear under `Known and accepted by CEO`.

Lazarus never rewrites code or edits other characters' artifacts. He judges and routes.

---

## 12. Briefing and stack decision

1. **Request.** The CEO states the idea in plain language.
2. **Stack questions.** Cain asks for constraints before proposing anything. Typical questions cover existing systems to integrate with, hosting, data sensitivity and compliance, expected scale, the team's skills, budget, and any stack already in use.
3. **Proposal.** Cain proposes one recommended stack and at most one alternative, each with fit for purpose, trade-offs, and operating cost. Written to `decisions/ADR-001-stack.md` as `PROPOSED`.
4. **Contributions.** Wirt, Griswold, Adria, Farnham, and Lazarus each state what they need and what they see as risky. Lazarus states the quality bar. Ogden records the agreed brief.
5. **Approval.** The CEO approves, chooses the alternative, or asks for a new proposal. On approval, ADR-001 becomes `ACCEPTED`, and any new stack standards are added to `knowledge/stacks/`.

No build starts until `brief.md` and ADR-001 are both `ACCEPTED`.

---

## 13. Town Square

The Town Square is the village's central meeting place. It has two uses, and every session is recorded in full.

Subagents run in isolated contexts and cannot message each other directly. The main Claude Code session acts as moderator: it carries each character's statement to the others and to the CEO, and writes the transcript.

### 13.1 Blocked work (`/town-square <slug>`)

1. **Summon.** The moderator identifies the owners of the defects from the final cycle, plus Cain.
2. **Opening.** Cain presents defects per cycle, whether each persisted, reappeared, or was fixed, and his view of the root cause.
3. **Statements.** Each relevant character states in writing what it believes the cause is, what it needs from others, and whether one more cycle would resolve it.
4. **Questions.** The CEO may question any character. Answers are recorded.
5. **Options.** Cain presents:
   - **A.** Send to Lazarus, with known defects listed.
   - **B.** Return to a named character, with the CEO's direction.
   - **C.** Stop the item.
6. **Decision.** The CEO chooses. The moderator records the decision, reason, and any direction.
7. **Record.** Ogden logs the decision.

The CEO may end the square at any point with an instruction to send or stop, and the moderator must follow it.

### 13.2 Debrief and lesson approval (`/debrief <slug>`)

Runs after a READY verdict.

1. **Reports.** Each character reports what it delivered, what changed from the brief, and what blocked it. Farnham reports test results and open defects.
2. **Verdict.** Lazarus presents the final verdict and non-blocking improvements.
3. **Candidates.** Ogden presents candidate lessons from `lessons.md` and the defect history, each with trigger, rule, and tags.
4. **Lazarus recommends.** He checks each candidate against the evidence in this idea and recommends approve, edit, or reject. He judges the evidence, not his preference.
5. **CEO decides.** The CEO approves, edits, or rejects each candidate. The square may discuss any of them first.
6. **Promotion.** Approved lessons receive the next `L-NNNN` id, are written to `knowledge/lessons/`, and are indexed by Ogden.
7. **Close.** Ogden writes `record/debrief.md`. The item moves to `CLOSED`.

### 13.3 Transcripts

Each session produces:

- `YYYY-MM-DD-n-transcript.md`: every statement, question, and answer, in order, with speaker and timestamp.
- `YYYY-MM-DD-n-summary.md`: the decision, the reasons, and any direction. The summary quotes the statements it relies on, so it cannot drift from what was said.

---

## 14. Lessons library

- `ideas/<slug>/lessons.md`: local candidates and their approval status. Not visible to other ideas.
- `knowledge/lessons/L-NNNN-<topic>.md`: approved lessons, global.
- `knowledge/lessons/INDEX.md`: one line per lesson, with tags.

Format:

```markdown
---
id: L-0007
title: Pagination endpoints need explicit max page size
tags: [api, griswold, pagination]
source: ideas/2026-11-02-customer-intake/
approved: 2026-11-09 (Debrief Town Square; Lazarus recommended approve)
---

**Trigger:** An endpoint returned unbounded result sets during load testing.
**Rule:** Every list endpoint enforces a maximum page size and documents it in the spec.
**Checked by:** tools/checks/api_check.sh
```

Agents read `INDEX.md` at the start of a stage and open only lessons whose tags match their role or the idea. A lesson that proves repeatable should become a check in `tools/checks/`.

---

## 15. Resource budgets

### 15.1 Three levels, enforced in code

1. **Per work item.** Set at the Briefing from a size tier that Cain proposes: **S**, **M**, or **L**. The tier fixes a token and wall-clock ceiling for the whole item, including all cycles and Town Square sessions. The CEO approves the tier.
2. **Per cycle.** The item budget is split: 50% cycle 1, 30% cycle 2, 20% cycle 3, with 10% held in reserve for Lazarus and the debrief.
3. **Per invocation.** A turn limit and a tool-call cap for each agent run. Stops one runaway loop from consuming a cycle.

A village-wide daily cap sits above all items.

### 15.2 Thresholds

| Level | Action |
|---|---|
| 70% of item budget | Logged. Gold portal. Map shows the item's character with a gold marker. |
| 90% of item budget | Cain checks whether the remaining cycles can finish. Gold portal, digest entry. |
| 100% of item budget | `BUDGET_EXHAUSTED`. Blue portal. CEO approves an increase, reduces scope through a change request, or stops. |
| Village daily cap reached | All new invocations pause. Red portal. |

No agent raises its own budget. Increases are CEO decisions, logged by Ogden.

### 15.3 Model tiering

Stronger models for judgement-heavy roles (Cain, Lazarus, Griswold). Smaller, cheaper models for mechanical work (running checks, formatting logs, drafting summaries). Confirm available models and rates before setting tiers.

### 15.4 Free tier

The factory runs on the free tier until the CEO sets limits. On the free tier:

- Usage is recorded in full (tokens, tool calls, wall time) even though no cost is billed. Cost can be calculated later from the rate card, so no history is lost.
- The daily cap acts as a quota guard, counting invocations and tokens per day.
- Model tiering matters more, because quota is the constraint.

### 15.5 Placeholder values

```
village.daily_cap:       TBD
item.size S / M / L:     TBD
cycle split:             50% / 30% / 20%, reserve 10%
thresholds:              70% gold, 90% gold, 100% BUDGET_EXHAUSTED
```

---

## 16. Failure recovery

### 16.1 Git

- The factory is one git repository, `C:\Source\tristram`.
- Each idea is worked on in branch `idea/<slug>`.
- Each checkpoint is a commit with a message naming the step, cycle, and character.
- The branch merges to `main` only at CLOSED.

### 16.2 Checkpoints

`status.md` records the current stage and cycle, the last completed step and its commit hash, the state of each handover (version and ready flag), and any open environment block.

Checkpoint hook: after each completed step, commit the idea folder and update `status.md`.

### 16.3 Atomic writes

Agents write to a temporary file and move it into place when complete. Half-written artifacts are never mistaken for finished ones.

### 16.4 Resume

`/resume <slug>` reads `status.md`, confirms the checkpoint commit exists, and restarts from the step after it. Every step is written to be safe to repeat, so a crash never double-counts a cycle or double-applies a migration.

---

## 17. CEO visibility

### 17.1 One queue, three views

Everything needing the CEO goes into `ceo/queue.json`, generated from `status.md`, the metrics and transitions logs, and environment logs. Three views read it, so they cannot disagree:

1. **The factory map**, with portals.
2. **Email**, with digests and immediate alerts.
3. **`/queue`**, a text list in the Claude Code session.

### 17.2 Queue entry

```json
{
  "id": "Q-2026-11-03-004",
  "item": "2026-11-02-customer-intake",
  "type": "BLOCKED_FOR_CEO",
  "colour": "blue",
  "raised": "2026-11-03T14:20",
  "summary": "DEF-014-03 persists after 3 cycles; Griswold and Farnham disagree on root cause",
  "options": ["send_to_lazarus", "return_to:griswold", "stop"],
  "detail": "town-square/2026-11-03-1-summary.md"
}
```

### 17.3 Portal colours

| Colour | Meaning | Types | Pauses work? |
|---|---|---|---|
| Blue | CEO decision needed | Blocked for CEO, stack approval, change request approval, lesson approval, contract change escalated by Cain, budget exhausted | Yes |
| Gold | Warning, action optional | Budget at 70% or 90%, flaky check, assumption awaiting review | No |
| Red | Stopped by something outside the village | Environment blocked, daily cap reached, connector auth expired | Yes |
| Grey | Information only | Item closed, lesson promoted, digest | No |

### 17.4 Character status on the map

Every character shows one of three states, independent of portals:

| State | Shown as |
|---|---|
| Idle | At rest in its location. |
| Working | At work, with a progress ring. |
| Blocked | With a red or gold marker: waiting on a question, dependency, environment, or budget. |

A character can be blocked without a portal (waiting on a handover). A portal can open without a character being blocked (a stack approval). When a blue portal opens, the CEO's Barbarian walks toward it.

### 17.5 Interaction

- Clicking a portal opens the queue entry: summary, detail link, and option buttons.
- Choosing an option writes the decision to the item's record, and the relevant character or Cain acts on it.
- Clicking a character opens its agent view in the dashboard.

### 17.6 Email

- **Recipient:** the CEO's Gmail address, the account used to sign in to Claude. Sent to self only.
- **Immediate:** red portals and budget exhaustion. One email per new entry.
- **Daily digest:** at a fixed time, listing blue and gold items with age and summary.
- **Overdue:** a blue portal open more than 24 hours is repeated in the next digest, flagged overdue.
- **Subject lines** start with the colour and item: `[RED] 2026-11-02-customer-intake: scratch database unreachable`.
- **Content:** summary and a local link only. No code, schema, or customer data in email.

### 17.7 Sending and scheduling

- Requires the Gmail connector, enabled for the village and listed in the registry for the queue job.
- Claude does not run between sessions. A scheduled job on the CEO's machine runs the queue script every 5 minutes for alerts, and once daily for the digest. On Windows this is Task Scheduler.
- If the machine is off, digests and alerts stop. This is a known limitation until a server is available.

Setup order: connect Gmail, send one test message to self, schedule the job, confirm both alert and digest fire once, then enable.

---

## 18. Metrics and dashboard

### 18.1 Purpose

Show where time and cost go, and whether iterations are converging. Drillable to agent, cycle, and invocation.

### 18.2 Hierarchy

```
Factory (all ideas)
  └── Idea
        └── Stage (Briefing, Build, Pre-review, Review, Debrief, Town Square)
              └── Cycle (iteration: cycle-1, cycle-2, cycle-3)
                    └── Agent
                          └── Invocation
```

A rework within a cycle is another invocation of the same agent, so it stays visible. Totals roll up at every level.

### 18.3 Data

`record/metrics.jsonl`, one line per invocation, written by the invocation wrapper (agents cannot write it):

```json
{
  "ts_start": "2026-11-03T10:02:11",
  "ts_end": "2026-11-03T10:09:23",
  "idea": "2026-11-02-customer-intake",
  "stage": "build",
  "cycle": 2,
  "agent": "griswold",
  "invocation": 3,
  "reason": "DEF-014-03 returned",
  "model": "smaller-model-name",
  "tokens_in": 48210,
  "tokens_out": 9120,
  "tool_calls": 23,
  "checks_run": ["api_check"],
  "outcome": "completed",
  "rate_card_cost_usd": null
}
```

`record/transitions.jsonl`, one line per status change, from `status.md`. This gives time in each state, including time waiting for the CEO.

Defect events are recorded with ID, owner, cycle, and whether each cycle fixed, persisted, or reintroduced the defect.

`rate_card_cost_usd` stays null on the free tier and is filled in later.

### 18.4 Views

1. **Factory overview:** items by state, quota used against the daily cap, items waiting for the CEO and their age, average cycles per item over time.
2. **Idea view:** stage timeline with working and waiting time separated, cycle comparison (time, tokens, checks, defects raised and closed), defect persistence across cycles.
3. **Agent view:** time and tokens per invocation and per cycle, rework rate (share of runs returned to it), defects owned and how many persisted, environment blocks caused or resolved.
4. **Cycle view:** every agent's time and cost within one iteration, in order.
5. **Invocation view:** inputs (handovers, defects), outputs, and checks for one run.

### 18.5 Presentation

- Generated by script to `knowledge/roster/dashboard.html`, regenerated after each invocation.
- Clicking a character opens its agent view. Clicking an item opens its idea view.
- Filters: date range, idea, stage, agent, cycle.
- `/metrics` prints the same figures as text.

### 18.6 Honesty rules

- Time comes from the transitions log, not from agent estimates.
- Waiting time is counted separately from working time. A slow item caused by CEO approval is not blamed on an engineer.
- Totals are checked against the sum of invocations at each level. A mismatch is reported.

---

## 19. The visual factory

### 19.1 The village map

A single HTML file, SVG-based, with the village and its locations. Proposed locations:

| Character | Location |
|---|---|
| Deckard Cain | Cathedral archive |
| Archbishop Lazarus | Cathedral sanctum |
| Wirt | The Inn cellar |
| Griswold | The Forge |
| Adria | Adria's hut |
| Farnham | The field beyond the walls |
| Ogden | Ogden's Tavern |
| CEO (Barbarian) | Town Square, the central meeting point |

The Town Square is where Briefings, Debriefs, and Town Square sessions are shown. Portals appear over the relevant location.

### 19.2 Live data

The map reads only files the engine writes: `ceo/queue.json`, each `status.md`, and `metrics.jsonl`. It runs against mock files until the engine is live, then switches to real files with no redesign.

### 19.3 Visual states

- Character state: idle, working (progress ring), blocked (red or gold marker).
- Portals: blue, gold, red, grey, per section 17.3.
- Work items move between locations as their stage changes, so bottlenecks are visible.

### 19.4 Build order for the visuals

1. Static map with mock data: village, characters, portals, CEO Barbarian.
2. Live states from `queue.json` and `status.md`.
3. Dashboard views, from `metrics.jsonl`.

---

## 20. Commands

| Command | Purpose |
|---|---|
| `/new-idea <slug>` | Creates `ideas/YYYY-MM-DD-<slug>/` on branch `idea/<slug>`, with folders and a blank `status.md`. |
| `/briefing <slug>` | Runs the Briefing, including stack decision. |
| `/cycle <slug>` | Runs one build cycle. Stops at Lazarus or on failure. |
| `/debrief <slug>` | Runs the debrief Town Square and lesson approval. |
| `/town-square <slug>` | Convenes the Town Square for a `BLOCKED_FOR_CEO` item. |
| `/status <slug>` | Stage, cycle, active stack, open defects, budget used, last five log entries. |
| `/roster [name] [--html]` | Shows each character's skills, connectors, and knowledge base. |
| `/queue` | Lists everything waiting for the CEO, with options. |
| `/change <slug>` | Opens a change request, with Cain's impact assessment. |
| `/budget <slug>` | Spend per cycle and per character, and thresholds crossed. |
| `/resume <slug>` | Resumes from the last checkpoint. |
| `/handover <slug>` | Open handovers and the contract version each engineer uses. |
| `/metrics [idea] [agent] [cycle]` | Time and cost at the chosen level, as text. |
| `/dashboard` | Regenerates and opens `dashboard.html`. |

---

## 21. Permissions and hooks

In `.claude/settings.json`, confirmed against current Claude Code documentation before use:

- **Deny** writes to `knowledge/` and `registry/` for all agents, except Ogden's writes to `knowledge/lessons/`.
- **Deny** reads and writes to idea folders other than the active one. The active idea is set in `status.md` and passed in the cycle command.
- **Restrict** each agent's file access to the paths in its registry entry.
- **Hook, on write to `record/`:** append to `log.md` with agent, timestamp, and path.
- **Hook, on checkpoint:** commit the idea folder and update `status.md`.
- **Hook, on invocation end:** append to `metrics.jsonl` and evaluate budget thresholds.
- **Hook, on status change:** append to `transitions.jsonl`, and update `ceo/queue.json` if the change needs the CEO.
- **Hook, on change under `.claude/`, `registry/`, or `.mcp.json`:** run `registry_check.sh`.
- **Hook, on cycle end:** run the check scripts and update `status.md`.

---

## 22. Deferred

- Security checks (secrets scanning, dependency audit, input validation) and a security section in Lazarus's review.
- Release and deployment roles (Wirt's release duties, Pepin).
- Hosting of the dashboard for mobile access.
- Server-side scheduling, to replace the CEO's machine.
- Rate-card cost calculation, until paid usage begins.

---

## 23. Implementation plan

Two tracks. Track A builds the engine. Track B builds the visuals. Track B can start once Phase 0 exists, because it runs against mock files.

### Track A: Engine

| Phase | Scope | Acceptance |
|---|---|---|
| A0. Scaffold | Folder tree, `CLAUDE.md`, stack-neutral standards, registry for seven characters, `/new-idea` with branch creation, queue and ledger formats, `registry_check.sh` | `/new-idea demo-form` creates the idea folder and branch. `/roster` and `registry_check.sh` pass. |
| A1. Briefing and stack | Cain's stack questions, ADR-001, CEO approval | Build is blocked until brief and stack are accepted. |
| A2. Questions | Question logs, Cain's routing, assumption review | An assumption is logged, answered, and reviewed at checkpoint. |
| A3. First character | Wirt, `db_check.sh`, checkpoint commits | Wirt's schema passes checks and freezes as v1. |
| A4. Parallel cycle | Griswold, Adria, Farnham, handovers, mocks, `plan.md` | Adria builds against mocks before the backend exists. A seeded defect is caught in cycle 1 and fixed in cycle 2. |
| A5. Environment blocks | Exit code 2, retries, red portal | A stopped scratch database produces a red portal and no cycle increment. |
| A6. Budgets and metrics data | Ledger, transitions log, thresholds, `/budget`, daily cap | Exceeding item budget produces `BUDGET_EXHAUSTED` and a blue portal. Metrics records exist for every invocation. |
| A7. Change requests | `/change`, change map, brief versioning, selective re-run | CR-001 changes one field. Only affected artifacts re-run. |
| A8. Lazarus and test quality | Lazarus, test-quality rules, `test_check.sh` flags | A seeded `expect(true)` test is rejected with the test-quality finding. |
| A9. Debrief and lessons | Debrief Town Square, lesson approval | An approved lesson appears in the library and is used by the next idea. |
| A10. Town Square (blocked) | `/town-square`, three options, full transcripts | Each option produces the correct next state. Transcript and summary are written. |
| A11. Recovery | `/resume`, checkpoint verification | Killing a session mid-cycle resumes without double-counting. |
| A12. CEO visibility | `queue.json`, portal types, Gmail digest and alert, `/queue`, scheduled job | Portals match the queue. A red event sends one email. |
| A13. Roster view | `/roster --html` | Roster matches live configuration. |

### Track B: Visuals

| Phase | Scope | Acceptance |
|---|---|---|
| B1. Static map | Village, seven characters in locations, CEO Barbarian, portal examples, all from mock files | Every location and portal colour from section 17.3 is shown. |
| B2. Live states | Map reads `status.md` and `queue.json`; character states from the status | Changing a mock status file changes the map on refresh. |
| B3. Dashboard | Factory, idea, agent, cycle, and invocation views from `metrics.jsonl` | Totals at each level equal the sum of the level below. |

B1 and B2 can begin after A0. B3 needs A6.

The first end-to-end test is `demo-form`: it runs A1 to A4 and A8 to A10 at minimum.

---

## 24. Open items

1. **Scheduled job location.** The CEO's Windows machine is the default. Digests stop when it is off.
2. **Model names and rate card.** Confirm when budgets are set.
3. **Claude Code specifics.** Subagent frontmatter, skills, `.mcp.json`, and hook syntax to be verified against current documentation in phase A0.
4. **Windows shell.** The check scripts are `.sh`. Claude Code on Windows needs Git Bash (installed with Git for Windows) or WSL to run them. Confirm in A0.
5. **Map style.** SVG, as agreed.
6. **Dashboard hosting.** Local for now.

---

## 25. Change log

| Version | Change |
|---|---|
| v1.0 | Initial design: roster, Town Square, lessons, first pipeline. |
| v1.1 | Date-prefixed slugs, stack decided in briefing, lesson approval in debrief, full transcripts, agent registry and roster view. |
| v1.2 | Cain's orchestration authority, parallel handover and contract freeze, change requests with change maps, question logs, environment blocks, test quality rules, budgets, recovery, CEO queue and portals. |
| v1.3 | CEO as Product Owner, Gmail digests, character status on the map, metrics dashboard. |
| v2.0 | Consolidated into one specification. Product code lives inside each idea's `artifacts/`. Each idea uses branch `idea/<slug>`. Track A and Track B separated. |

---

## Appendix A: Glossary

- **Cycle (iteration):** one full pass through the builders and the pre-review check. Maximum three per item.
- **Pre-review check:** the scripted pass/fail gate that runs before Lazarus.
- **Contract:** a frozen schema or API definition that engineers build against.
- **Handover:** a message saying an artifact is ready, and at which version.
- **Change request (CR):** a formal change to requirements after the brief is signed off.
- **Portal:** a coloured marker on the map showing an item that needs the CEO or a warning.
- **Town Square:** the meeting process for blocked work and debriefs.
- **Environment block:** a failure outside the work itself, which does not count toward cycles.
