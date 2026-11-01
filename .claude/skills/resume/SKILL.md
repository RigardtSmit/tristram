---
name: resume
description: Pick an idea up after a crash or a closed session: verify the checkpoint, finish an interrupted cycle end, and say what comes next.
disable-model-invocation: true
allowed-tools: Bash(node tools/resume.mjs *)
---

Run `node tools/resume.mjs <idea>` and show the output. Then follow its "Next:" line. Never edit status.md by hand to get past a problem it reports; if the checkpoint commit is missing, ask the CEO.
