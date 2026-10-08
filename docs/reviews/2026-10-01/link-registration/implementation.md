# Optional blank label registration

User funding failed at POST `/api/campaigns/cmupcfdb10000gkkjf2pmgnj9/links`.
The browser's `publicHalves` sends `labels: [null, null]` for this two-link,
unlabelled campaign. The API schema accepted strings only, although the domain
registration function and database already support null labels. Reproduced with
the exact generated browser payload: two contract tests failed before the fix.

The schema now accepts nullable entries, preserving array alignment and strict
field validation, 200-character bounds and secret guards. No browser keys,
wallet logic, amounts, predicates, signatures or submission behavior changed.

Proof: 76 checks across campaign schema and wizard tests passed. Changed-file
lint, production webpack build/TypeScript and whitespace checks passed. Actual
browser-authenticated HTTP probe created a disposable local draft, registered
two blank-label links (201), acknowledged its fixture export and prepared an
unsigned sponsor-funded envelope containing exactly two sender-sourced 1-USDC
claimable balances with official Testnet issuer. It never signed or submitted.
The fixture was removed with exact name and no-submitted-envelope checks.
An initial standalone request-client probe returned401 because Secure cookies
are not sent by that client to HTTP loopback; using actual browser fetch resolved
that harness mismatch without any auth/CSP change.

The user's original draft remained unchanged: zero registered links and no
funding batches. Its expiry was 2026-10-01T09:45:00Z (17:45 Manila), already past
when verification finished. Recreate the test with a fresh expiry and privately
save its new CSV; the old CSV has no funded links. App PID11600 serves port3220,
worker unchanged. Work remains local/uncommitted above4163d79. No chain writes,
push, deployment or issue updates. Full HTTP proof: `after.json`.
