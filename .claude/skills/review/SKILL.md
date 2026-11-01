---
name: review
description: Run Lazarus's review of an idea after the pre-review checks pass, and record his verdict.
disable-model-invocation: true
allowed-tools: Bash(node tools/review.mjs *), Bash(node tools/cycle.mjs *)
---

1. Run `node tools/review.mjs start <idea> --by lazarus`. It refuses unless every planned check passed in this cycle.
2. Invoke Lazarus (name the idea folder in the prompt). He reads the whole solution, decides each test-quality flag (`review.mjs flag <idea> <TQ-id> confirm|dismiss --reason ... --by lazarus`) and writes his verdict (`review.mjs verdict <idea> READY|NOT_READY --by lazarus --finding "owner|what is wrong" ...`).
3. READY goes to `/debrief`. NOT READY returns the findings to their owners as defects and starts the next cycle; NOT READY on cycle 3 is BLOCKED_FOR_CEO (`/town-square`).
