---
name: budget
description: Show an idea's budget (spend per cycle and character, thresholds crossed), set its size tier, or show the village daily cap.
disable-model-invocation: true
allowed-tools: Bash(node tools/budget.mjs *)
---

1. `/budget <idea>`: run `node tools/budget.mjs show <idea>` and show it as printed. With no idea, run `node tools/budget.mjs village`.
2. If the idea has no size tier, present S, M and L (1M / 4M / 12M tokens, 2 / 6 / 16 h) with AskUserQuestion, recommend the one Cain proposed, and after the CEO chooses run `node tools/budget.mjs set-size <idea> <S|M|L> --by ceo`.
3. Increases are CEO decisions only: use `/queue` (`increase_budget`) or `node tools/budget.mjs increase <idea> --tokens N --hours N --by ceo` with the CEO's numbers. Never raise a budget yourself.
