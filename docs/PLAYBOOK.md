# The Playbook: from an idea to a release

How the CEO presents an idea and how the village takes it to release. The spec (`docs/SPEC.md`) decides every rule; this is the working guide. Commands are run from the main checkout on branch `main`.

## 0. What "release" means today

The factory's last step is **merge to `main`** of a CLOSED item, and a tag `release/<id>-<name>`. It does not deploy. How the product reaches users depends on the stack the CEO approves in ADR-001, so the release recipe (build artifact, hosting, rollback) is written during the Briefing and checked in the cycle. If you want the factory to deploy for you, that is a separate decision (open question O-1 at the end).

## 1. Presenting an idea (the pitch)

Bring this, in plain language. One page is enough. Cain asks for whatever is missing; you do not need to know the technical parts.

| Part | Say |
|---|---|
| Goal | What it does, for whom, and why now. |
| Users | Who uses it, how many, how often. |
| Must have | The things without which it is not worth releasing (these become requirements, `REQ-NN`). |
| Must not | Things it must never do (privacy, money, safety). |
| Done looks like | Three to five things you could check yourself (these become acceptance criteria, `AC-NN`). |
| Data | What personal or sensitive data it touches. Do not paste real data. |
| Connections | Existing systems, accounts, APIs it must work with. |
| Constraints | Hosting, budget, deadline, skills you have, stacks you already use or refuse. |
| Size | S, M or L. Say nothing and it is M. |
| Not now | What is deliberately out of scope for the first release. |

A good pitch can be wrong about the solution. It must not be vague about the goal.

## 2. The path

| # | Stage | Who drives | You decide | Command / skill | Output |
|---|---|---|---|---|---|
| 1 | Create the item | You | The name | `/new-idea <name>` | Branch `idea/<name>`, worktree, dated folder, `status.md` (BRIEFING) |
| 2 | Briefing | Cain, all characters | Answers to stack questions; the brief; the stack | `/briefing <name>` | `brief.md`, `ADR-001-stack.md`, `record/briefing.md` |
| 3 | Approve | You | Brief final? Stack A or B? Size? | `idea.mjs accept-stack`, `accept-brief`, `budget.mjs set-size` (the moderator runs these only on your yes) | Build gate opens |
| 4 | Build cycle (1 to 3) | Cain plans; Wirt, then Griswold, then Griswold, Adria and Farnham in parallel | Only blocking questions, change requests, budget | `/cycle <name>` | Schema, API, UI, tests, handovers, checkpoints |
| 5 | Pre-review checks | Scripts | Nothing | `cycle.mjs end` | Defects by owner, or PRE_REVIEW clean |
| 6 | Fix cycle | Owners with open defects only | Nothing | `/cycle <name>` again | Same defect ids, closed or still open |
| 7 | Review | Lazarus | Nothing | `/review <name>` | `reviews/review-N.md`: READY or NOT READY |
| 8 | Debrief | Ogden, Lazarus, you | Which lesson candidates become rules | `/debrief <name>` | `record/`, approved lessons |
| 9 | Merge and release | You | The merge | `node tools/merge.mjs <name> --by ceo`, then tag | Idea on `main`, worktree removed, branch kept |
| 10 | Release | You (or a deploy step, O-1) | Go live | Stack-specific release recipe | The product, live |

Between stages, any time: `/status`, `/queue`, `/questions`, `/budget`, `/change`, `/resume`, `/metrics`, the village map.

## 3. What you will be asked, and when

All of it arrives in one queue, with a colour.

- **Blue:** a decision for you. Brief and stack approval, answers to escalated questions, change requests, lesson approvals, the Town Square when work is blocked, exhausted budgets.
- **Gold:** a warning. Budget at 70% or 90%, an assumption waiting for review, an overdue item.
- **Red:** something outside the village broke (the scratch database, a tool, the network). It does not count as a cycle.
- **Grey:** information.

Email (Gmail) sends one alert per new red portal or exhausted budget, and a daily digest of blue and gold items at 08:00. The local map at `tools/map/serve.mjs` takes the same decisions.

## 4. The rules that protect you

- **Three cycles at most.** A cycle repeats only when problems were found. NOT READY or a failed check on cycle 3 is `BLOCKED_FOR_CEO`, and you choose in the Town Square: (A) accept the known defects, (B) one more pass with direction, (C) stop.
- **Nobody marks their own work as passed.** Scripts decide pass or fail; Lazarus judges; you approve.
- **Scope changes cost.** After the brief is approved, a change goes through `/change`. Cain writes the change map, you approve, and only the affected owners re-run. Cain edits the brief text after your approval; the version and changelog are bumped by the tool.
- **Budget is enforced.** S 1M tokens or 2 h, M 4M or 6 h, L 12M or 16 h. At 70% and 90% you get a gold warning; at 100% the item stops until you increase, reduce scope or stop. The village as a whole is capped at 150 invocations and 20M tokens a day.
- **Lessons are rules only after you approve them,** and reach the next idea once the item is merged to `main`.

## 5. Checklists

**Before you present:** the pitch table above is filled, with no real personal data.

**Before you approve the brief:** every requirement has an acceptance criterion; "must not" is written; out of scope is written.

**Before you approve the stack:** you understand what it costs to run and what it cannot do; the release recipe is in the ADR.

**Before you merge:** review says READY (or you accepted the known defects in the Town Square); the debrief is closed; `node tools/idea.mjs status <name>` says CLOSED; `main` has no uncommitted changes.

**After release:** note surprises. They are the raw material for the next debrief and the next lessons.

## 6. First real run (planned)

1. Run it on your own idea after the graphics work.
2. One session for the pitch and Briefing, so you answer Cain's questions in one sitting.
3. Cycle 1 supervised: check that the hooks record every invocation (`/metrics`), that the guard blocks out-of-path writes, and that attribution to the idea works.
4. Adjust the playbook, the charters or the code from what you find.

## Open questions

- **O-1: Release.** Stop at merge and tag, or add a deploy step per stack (needs credentials that only you can provide)?
- **O-2: Maintenance.** After release, do changes to a released product start a new item (`idea/<name>-2`) or reopen the old one? Recommend a new item referencing the old.
