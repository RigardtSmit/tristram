---
name: new-idea
description: Create a new idea: assigns the next work item number, then creates the branch idea/<name>, its worktree under .worktrees/, and the dated idea folder with a blank status.md.
argument-hint: <name>
disable-model-invocation: true
allowed-tools: Bash(node tools/new-idea.mjs *)
---

Run this from the main checkout (branch `main`):

```
node tools/new-idea.mjs $ARGUMENTS
```

Report the work item number, folder, branch and worktree path it prints. If it refuses (name in use, bad name, wrong branch), show the message and stop. Do not retry with a different name unless the user says so.
