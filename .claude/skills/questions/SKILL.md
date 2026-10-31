---
name: questions
description: Show an idea's open questions and assumptions, and walk the CEO through the ones escalated to them.
argument-hint: <name>
disable-model-invocation: true
allowed-tools: Bash(node tools/questions.mjs *), Bash(node tools/idea.mjs *)
---

For the idea `$ARGUMENTS`:

1. Run `node tools/questions.mjs list $ARGUMENTS` and show it as printed.
2. If any question is `pending (ceo)`, present each one to the CEO with its question and assumption, offering sensible options with AskUserQuestion. After the CEO decides, record it with `node tools/questions.mjs answer $ARGUMENTS <Q-id> --by ceo --answer "<the CEO's decision>"`, or `node tools/questions.mjs accept-assumption $ARGUMENTS <Q-id> --by ceo` if the CEO accepts the assumption as it stands.
3. Questions that are `pending (cain)` are Cain's to route. Offer to invoke the cain subagent to answer or escalate them; do not answer them yourself.

Never record an answer `--by ceo` that the CEO has not given in this conversation.
