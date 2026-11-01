---
name: change
description: Open a change request for an idea, have Cain assess its impact and write the change map, and take it to the CEO.
disable-model-invocation: true
allowed-tools: Bash(node tools/change.mjs *), Bash(node tools/queue.mjs *)
---

1. `/change <idea>`: ask the CEO what should change and why (AskUserQuestion if unclear). Run `node tools/change.mjs open <idea> --title "..." --why "..." --by ceo`.
2. Invoke Cain (name the idea folder in the prompt) to assess impact: `node tools/change.mjs impact <idea> REQ-NN` for each affected requirement, then fill the change map in `changes/CR-NNN.md` (Artifact, Was, Now, Owner, Re-run; mark a contract change in the Now column, for example "contract v2"). Cain changes no unaffected part of the design.
3. When the map is complete, `node tools/change.mjs submit <idea> CR-NNN`. The CEO sees it in `/queue` as a CHANGE_REQUEST.
4. After the CEO decides (`node tools/queue.mjs decide <CQ-id> approve|reject|narrow`), the brief is versioned and only the affected owners re-run in the next `/cycle`. Cain then edits the changed requirement text in `brief.md` to match the map.
