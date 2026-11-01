---
name: metrics
description: Show time and token figures at the factory, idea, cycle or agent level as text, or regenerate the dashboard page.
argument-hint: [idea] [--agent name] [--cycle N]
disable-model-invocation: true
allowed-tools: Bash(node tools/metrics.mjs *), Bash(node tools/metrics.mjs), Bash(node tools/dashboard.mjs)
---

Run `node tools/metrics.mjs $ARGUMENTS` and show the output as printed. If the CEO asks for the page, run `node tools/dashboard.mjs` and give the path of `knowledge/roster/dashboard.html`.
