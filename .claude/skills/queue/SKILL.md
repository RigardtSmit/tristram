---
name: queue
description: List everything waiting for the CEO (decisions, warnings, blockers) with its options, and carry out the CEO's choice.
disable-model-invocation: true
allowed-tools: Bash(node tools/queue.mjs *)
---

1. Run `node tools/queue.mjs list` and show it as printed.
2. If items are waiting, offer to decide them. Present each with its options using AskUserQuestion (one item at a time, its options as the choices). After the CEO chooses, run `node tools/queue.mjs decide <CQ-id> <option> --note "<the CEO's words>"` and show the result.
3. Never choose an option for the CEO. Options such as `send_to_lazarus` or `return_to:<character>` are recorded in the item's record; the next `/cycle` or `/town-square` acts on them.
