# API standard (stack-neutral)

**Status:** DRAFT, pending CEO approval. CEO-owned. Agents may not edit this file.

1. **Contract first.** The API is described in `api.yaml` (OpenAPI) and frozen as `FROZEN vN` before the UI and tests build on it. The implementation matches the contract exactly.
2. **Errors are documented.** Every endpoint documents its error responses. Validation failures return 422 with field-level errors. Unknown resources return 404. Never return 500 for bad input.
3. **Consistent shapes.** Use one error body shape across the API. Use the same field names as the schema where they mean the same thing.
4. **List endpoints are paginated.** Every list endpoint enforces a maximum page size and documents the default and the maximum.
5. **Idempotency and safety.** GET is read-only. PUT and DELETE are idempotent. Document how repeated POSTs are handled.
6. **Versioning.** Breaking changes need a new contract version and a handover to every dependent.
7. **Input validation** happens at the boundary, against the contract, before business logic runs.
8. **No secrets or personal data** in logs, error messages or examples.
