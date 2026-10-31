# File formats

Companion to `docs/SPEC.md`. If the two disagree, the spec wins. All timestamps are ISO 8601 UTC (`2026-11-03T10:02:11Z`).

## status.md

Plain text. The header is `key: value` lines (one per line, no nesting). The History table is append-only.

| Key | Meaning |
|---|---|
| `id` | Work item, `WI-NNN`, global |
| `name`, `folder`, `branch`, `worktree` | Undated name, dated folder, branch, worktree path |
| `state` | One of the status values in SPEC 4.2 |
| `stage` | `briefing`, `build`, `pre-review`, `review`, `debrief`, `town-square` |
| `cycle` | 0 to 3 |
| `active_stack` | ADR-001 reference once accepted, else `none` |
| `brief` | Brief version that is signed off, else `none` |
| `checkpoint` | Last completed step and commit hash, else `none` |
| `handovers` | Per handover: id, contract version, ready flag, else `none` |
| `env_block` | Open environment block, else `none` |
| `created` | Creation time |

### Map keys (B1 mock, settled in B2)

The B1 map reads three extra `status.md` lines, used only by mock files for now:

- `active_agents: griswold:0.6, adria:0.3` (agent and progress 0 to 1, or `none`)
- `blocked_agents: farnham:gold:waiting on HO-002-005` (agent, marker colour `red` or `gold`, reason, or `none`)

Queue entries in the mock also carry an optional `location` (a character name or `town-square`) saying which place the portal floats over. B2 decides whether these become real fields or are derived from the type and item.

## record/log.md

Append-only. One line per event: `- <timestamp> <agent> <action> <path>`.

## record/transitions.jsonl

One JSON object per status change. Written by hooks and scripts, never by agents.

```json
{"ts":"2026-11-03T10:02:11Z","idea":"2026-11-02-customer-intake","item":"WI-014","from":"BUILDING","to":"PRE_REVIEW","note":"cycle 1 builders done"}
```

## record/metrics.jsonl (ledger)

One JSON object per invocation. Written by the `SubagentStop` hook, never by agents. `rate_card_cost_usd` stays `null` on the free tier.

```json
{"ts_start":"2026-11-03T10:02:11Z","ts_end":"2026-11-03T10:09:23Z","idea":"2026-11-02-customer-intake","item":"WI-014","stage":"build","cycle":2,"agent":"griswold","invocation":3,"reason":"DEF-014-03 returned","model":"opus","tokens_in":48210,"tokens_out":9120,"tool_calls":23,"checks_run":["api_check"],"outcome":"completed","rate_card_cost_usd":null}
```

## Defect events

Appended to `record/transitions.jsonl` with `"type":"defect"`:

```json
{"ts":"...","type":"defect","id":"DEF-014-03","owner":"griswold","cycle":2,"result":"persisted"}
```

`result` is `raised`, `fixed`, `persisted` or `reintroduced`.

## ceo/queue.json

Generated in the main checkout, git-ignored. A JSON array of entries (SPEC 17.2):

```json
{"id":"CQ-2026-11-03-004","item":"2026-11-02-customer-intake","type":"BLOCKED_FOR_CEO","colour":"blue","raised":"2026-11-03T14:20:00Z","summary":"...","options":["send_to_lazarus","return_to:griswold","stop"],"detail":"town-square/2026-11-03-1-summary.md"}
```

`colour` is `blue`, `gold`, `red` or `grey` (SPEC 17.3). `id` uses the `CQ-` prefix.

## Check script exit codes

`0` pass, `1` defect, `2` environment failure. Check scripts are never registered directly as Claude Code hooks, because hooks treat exit 2 as "block". A hook wrapper translates the code.

## questions/<character>.md

Written only by `node tools/questions.mjs` (never by hand). One entry per question:

```
Q-014-02  griswold  2026-11-03T10:12:00Z
Question: Should GET /intake be paginated?
Blocking: no (proceeding on the assumption below)
Assumption: Paginated, page size 50, per the list-endpoint standard
Answer: pending (Cain)
Reviewed: pending
```

- `Answer` is `pending (Cain)`, `pending (CEO)`, `<text> (answered by cain|ceo, date)`, or `accepted as assumed (by ceo, date)`.
- `Reviewed` is `pending`, `n/a` (blocking), or `keep|revise by cain, date - note`, set at a checkpoint.
- The debrief lists every non-blocking question whose answer is still pending, so Lazarus can check each was answered or accepted by the CEO.

## Commands that run the status machine

`node tools/idea.mjs` (`list`, `status`, `gate`, `accept-brief`, `accept-stack`, `set-state`) is the only thing that writes `status.md`, `transitions.jsonl` and the status lines of `log.md`. The legal moves are in `tools/lib/idea.mjs` (`TRANSITIONS`) and follow SPEC 4. `accept-*` need `--by ceo`.
