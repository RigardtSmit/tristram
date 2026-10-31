# Database standard (stack-neutral)

**Status:** DRAFT, pending CEO approval. CEO-owned. Agents may not edit this file.

1. **Migrations are reversible.** Every migration has an up and a down step, is numbered, and is safe to re-run from its checkpoint.
2. **Migrations run only against the scratch database** during a build. Destructive operations (drop, truncate, delete without a key) need CEO approval.
3. **Naming.** Lowercase `snake_case`. Tables are plural nouns. Primary key is `id`. Foreign keys are `<table_singular>_id`. Timestamps are `created_at` and `updated_at`, stored in UTC.
4. **Keys and constraints.** Every table has a primary key. Enforce integrity in the database: NOT NULL, UNIQUE, CHECK and foreign keys. Do not rely on application code alone.
5. **Indexes.** Index every foreign key and every column used in a frequent filter or join. Record the query each non-key index serves. Remove unused indexes.
6. **Queries.** No unbounded result sets in application queries. No N+1 patterns. Explain plans are reviewed for queries on large tables.
7. **Data sensitivity.** No real personal data in schemas, seeds or fixtures. Mark personal-data columns in the schema documentation.
8. **Contract.** The schema is frozen as `FROZEN vN` before the backend builds on it. Changes go through a contract change.
