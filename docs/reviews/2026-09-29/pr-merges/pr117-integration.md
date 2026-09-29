# PR #117 integration after #92 and #93 ? 2026-09-29

Resolved the wizard and campaign-schema conflicts while preserving selected-network USDC defaults, official issuer validation, saved-template terms, frozen recipient lists, accounting valuations, immutable receipts and dual control.

- Accounting USD anchor now defaults to Circle USDC for the selected Stellar network. Explicit deployment overrides remain supported; Testnet tokens have no financial value.
- Raw campaign schema remains usable for template term derivation; create/run validation still rejects wrong networks and lookalike USDC issuers.
- Template terms exclude the separate recipient CSV field.
- 487 unit tests in 40 files passed, including Testnet/public default anchors, explicit overrides and issuer validation for template terms.
- TypeScript passed. ESLint passed with one existing configuration warning.
- Valuation and template database harnesses passed on the existing isolated PostgreSQL 17 database after the additive migrations from the earlier PRs.
- Earlier PR review regressions are retained. Historical Testnet Freighter ledger evidence is preserved unchanged.
- No new live transaction submitted; both operational Testnet sponsor processes preserved.

Fresh hosted CI must pass on this integration head before merge. This does not complete the remaining #97 wallet/network failure matrix or authorize a production funding design.
