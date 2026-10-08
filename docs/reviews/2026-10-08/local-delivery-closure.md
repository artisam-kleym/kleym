# Issue #108 — local-link launch boundary

Implementation: `0f48d4fe47180b9d57547e1466c93b0551a649dd`, PR #119 to `develop-ade`.

[Hosted CI run 37795965439](https://github.com/webnxt-2030/kleym/actions/runs/37795965439)
passed all four jobs: build/typecheck/lint/audit/unit, real PostgreSQL/Redis
verification, browser verification and secret-handling guards. Local checks:
751 unit tests, typecheck/lint and audit at moderate severity passed. Audit
retains one low-severity transitive elliptic advisory; this is not a clean
zero-advisory claim.

## Decision and proof

The launch decision recorded in #108 is local key generation/export and sender
self-distribution. Bearer email is deferred. Production and public-network
deployments refuse it even if the development legacy flag is set.

- The authenticated delivery endpoint refuses before reading the body or
  reserving idempotent work. Service and queue producer repeat the boundary.
- New EMAIL-only campaigns are refused before persistence. OPEN/CODE/PASSKEY
  remain available; existing gated links are not silently opened.
- `tests/lib/api/local-delivery.test.ts` covers repeated endpoint requests,
  stopped-worker ingress, retry holding without reading the URL, production/
  public flag refusal and URL-free receipt/reminder handling.
- `verify:local-delivery` uses actual Redis/BullMQ. Its inert historical fixture
  is held by the real worker, promoted once and held again. Provider calls and
  consumed attempts remain zero; payload is preserved. Only the script-owned
  fixture is removed in cleanup.
- Historical `verify:email` and `verify:privacy` explicitly enable the restricted
  non-production Testnet harness; real policy gates and receipt persistence
  also pass in this run. They do not claim the historical path was local-only.
- Current sender/SDK requests contain public halves/signatures, and private
  CSV output stays local. Browser/seed classification guards passed.

## Historical exposure and remaining release scope

Historical full bearer URLs were persisted in Redis jobs and could reach
backups/providers. Existing jobs are held with identifier-only warnings for
operator review; no blanket deletion or retrospective erasure is claimed.
`AGENT.md`, `SPEC.md` and `docs/data-handling.md` record this explicitly.

This closes the scoped local-delivery issue, not future server-email redesign
or Mainnet readiness. PR #119 remains draft/unmerged. Railway remains paused;
this verification made no chain writes or mail-provider calls.
