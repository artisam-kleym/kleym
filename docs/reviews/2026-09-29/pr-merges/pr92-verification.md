# PR #92 merge verification ? 2026-09-29

Integrated develop (signed receipts) without dropping accounting valuation fields or migration history.

- F9: link-level reclaims use distinct `reclaim:link:<id>` entry IDs and accurate descriptions; batch IDs and CSV columns stay compatible. Regression verifies two link reclaims plus one batch in CSV and JSON.
- F10: disposal operation `created_at` supplies corrected `claimedAt` and valuation time. Missing/invalid timestamps remain unresolved. Existing signed receipts remain immutable.
- Unit suite: 403 passed before adding the two disposal-reader regressions; both additional tests passed separately (405 total).
- TypeScript passed; ESLint passed with one existing configuration warning.
- Existing isolated PostgreSQL 17 database: additive valuation migration deployed; valuation, reconciliation (including two timestamp assertions), and signed receipt harnesses all passed.
- Reconciliation harness performs read-only Horizon reads; unavailable historical prices remain explicit, never inventing a price. No live transactions were submitted.
- Root planning changes and both memory-held Testnet sponsor processes preserved.

Hosted CI must pass at the pushed head before merge. Browser accounting settings and live DEX price correctness were not newly verified by these focused checks.
