---
name: roster
description: Show the village roster from the registry: all characters, or one character's full card. The --html option is built in phase A13.
argument-hint: [name] [--html]
disable-model-invocation: true
allowed-tools: Bash(node tools/roster.mjs *), Bash(node tools/roster.mjs)
---

Run:

```
node tools/roster.mjs $ARGUMENTS
```

Show the output as printed. Do not summarise or reformat it.
