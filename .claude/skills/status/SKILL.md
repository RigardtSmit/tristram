---
name: status
description: Show an idea's stage, cycle, active stack, build gate, open defects and last log entries, or list every idea when no name is given.
argument-hint: [name]
disable-model-invocation: true
allowed-tools: Bash(node tools/idea.mjs *)
---

If `$ARGUMENTS` is empty, run `node tools/idea.mjs list`. Otherwise run `node tools/idea.mjs status $ARGUMENTS`.

Show the output as printed. Do not summarise it.
