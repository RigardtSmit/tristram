# Plan: {{name}}, cycle {{cycle}}

**Cycle:** {{cycle}}
**Areas:** schema, api, ui, tests

Areas are the parts of this cycle's work: `schema` (Wirt), `api` (Griswold), `ui` (Adria), `tests` (Farnham). List only the areas this idea needs. The cycle's checks run for exactly these areas.

## Work items

| ID | Character | Work | Needs |
|---|---|---|---|
| W-01 | wirt | | brief, design |

## Dependencies

| Artifact | Needed by | From | At contract version |
|---|---|---|---|
| schema | griswold | wirt | FROZEN v1 |
| api.yaml | adria, farnham | griswold | FROZEN v1 |

## Parallel steps

- After the schema is FROZEN: Griswold publishes `api.yaml`.
- After `api.yaml` is FROZEN: Farnham writes tests and Adria builds against mocks, in parallel with Griswold's implementation.
- Adria replaces mocks with real calls when Griswold's handover says the backend is ready.
