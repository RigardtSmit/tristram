---
name: handover
description: Show an idea's handovers and the contract version each engineer is currently building against.
argument-hint: <name>
disable-model-invocation: true
allowed-tools: Bash(node tools/handover.mjs *)
---

Run `node tools/handover.mjs summary $ARGUMENTS` and show the output as printed. Do not summarise it.
