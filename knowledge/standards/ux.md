# UX standard (stack-neutral)

**Status:** DRAFT, pending CEO approval. CEO-owned. Agents may not edit this file.

1. **Every screen has all its states:** loading, empty, error, success, and disabled where an action can be taken.
2. **Forms.** Every field has a visible label. Validation messages say what is wrong and how to fix it. A submit control is disabled or shows progress while a request is in flight.
3. **Errors from the backend** are shown in the field they relate to when the contract provides field-level errors, and otherwise as a clear message with a way to retry.
4. **Accessibility.** Everything is reachable and usable by keyboard. Focus is visible. Colour is never the only signal. Text and controls meet WCAG 2.1 AA contrast.
5. **Responsive.** Layouts work from phone width to desktop without horizontal scrolling.
6. **No hard-coded data** that should come from the backend.
7. **Mocks.** Mocks come from the frozen contract, are listed in `mocks.md`, and are unreachable from the production build.
8. **Copy.** Plain language, consistent terms, no jargon in user-facing text.
