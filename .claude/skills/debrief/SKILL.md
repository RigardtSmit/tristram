---
name: debrief
description: Run the debrief for an idea after a READY verdict: reports, Lazarus's verdict, lesson candidates, the CEO's decisions, and closing the item.
disable-model-invocation: true
allowed-tools: Bash(node tools/debrief.mjs *), Bash(node tools/lessons.mjs *), Bash(node tools/queue.mjs *)
---

1. `node tools/debrief.mjs start <idea>` shows the verdict and the candidates.
2. Invoke Ogden (name the idea folder) to draft candidates from `lessons.md` and the defect history with `node tools/lessons.mjs candidate ... --by ogden`; each needs a trigger, a rule, tags and evidence.
3. Invoke Lazarus to check each candidate against the evidence in this idea: `node tools/lessons.mjs recommend <idea> LC-NN approve|edit|reject --reason ... --by lazarus`.
4. Present each candidate to the CEO with AskUserQuestion (approve, edit, reject). Carry out the choice with `node tools/queue.mjs decide <CQ-id> approve|reject` (add `--rule`/`--title`/`--tags` for an edit). Never decide for the CEO; a candidate is not a rule until then.
5. `node tools/debrief.mjs close <idea> --by ogden` writes `record/debrief.md` and closes the item.
