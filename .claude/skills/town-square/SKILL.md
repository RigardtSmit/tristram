---
name: town-square
description: Moderate a Town Square for a blocked idea: summon the owners, record every statement, take the CEO's questions, and carry out option A, B or C.
disable-model-invocation: true
allowed-tools: Bash(node tools/townsquare.mjs *), Bash(node tools/defects.mjs *), Bash(node tools/queue.mjs *)
---

You are the moderator. Subagents cannot talk to each other, so you carry every statement and record it.

1. `node tools/townsquare.mjs open <idea>` (who is summoned is printed). Record each statement with `say --speaker <name> --text "..."`; the printed S-number is how the summary quotes it.
2. Opening: invoke Cain (name the idea folder) to present the defects per cycle (persisted, reappeared, fixed) and his view of the root cause. Record it.
3. Statements: invoke each summoned owner for what it believes the cause is, what it needs from others, and whether one more cycle would resolve it. Record each one verbatim.
4. Questions: the CEO may question any character. Invoke the character with the question, record both the question (speaker ceo) and the answer.
5. Options: `node tools/townsquare.mjs options <idea>`, then present A, B (per owner) and C with AskUserQuestion. The CEO may end the square at any point with send or stop; follow it.
6. Decide: `node tools/townsquare.mjs decide <idea> A|B|C --by ceo --reason "..." [--to <character> --direction "..."] --rely S1,S3`, relying only on statements the decision actually rests on. Then invoke Ogden to log the decision.
