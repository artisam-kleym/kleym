# PR #93 merge verification ? 2026-09-29

Preserved accounting, receipts, templates, both hourly queues, and the template author/signer dual-control gate while resolving integration conflicts.

- F12: the manual wizard freezes its actual recipient CSV at creation; the fallback reads the scoped template list for existing callers. A zero-link draft retains labels, references and individual amounts even after the template changes.
- F13: calculate policy and totals before campaign creation; audit/notification failures after preparation are logged without reversing the prepared result or creating contradictory FAILED history. Failure recording checks for an existing result and uses accurate neutral wording.
- F14: approval status exposes voided maker approvals; the panel explains that they do not count. Existing granted-count and signing gate stay intact.
- Unit suite: 425 passed, including post-commit audit failure, notification failure and pre-creation policy failure regressions.
- TypeScript passed. ESLint: no errors, one existing config warning.
- Additive campaign-template migration applied to the existing isolated PostgreSQL 17 database.
- Template and approval database harnesses passed, including frozen wizard-list recovery and unchanged dual control.
- No unattended signatures, funding, or live transaction submissions performed.

Hosted checks must pass on the pushed head before merge. Focused verification did not render the new approval annotation in a browser; the established browser suite will run in CI.
