# Issue #110 — settlement timestamp provenance

Implementation commit: `183440be360a579548544f1e198f11c35a5750e5`, draft PR #119
to `develop-ade`. [Hosted CI run 37797295045](https://github.com/webnxt-2030/kleym/actions/runs/37797295045)
passed all four jobs, including real PostgreSQL/Redis and browser verification.
Local typecheck/lint and 755 unit tests passed; the existing moderate audit
gate remains passed with one disclosed low-severity transitive advisory.

## Acceptance evidence

- Direct claims, reclaimed links/batches and durable attempts persist confirmed
  Horizon time separately from `observedAt`. Reconciliation uses operation
  history time. The shared parser rejects missing/impossible timestamps rather
  than substituting a local clock.
- Unit fixtures set clocks years apart and retain the same confirmed UTC
  instant. Hosted app lifecycle fixtures recover delayed claims in all three
  recipient modes at `2026-10-01T12:00:00.000Z`; the reconciliation fixture
  records that same instant independently of its delayed observation.
- Hosted receipt checks attest v3 ledger time, refuse application-time-only
  rows, then persist/fetch a v2 fixture without changing canonical bytes or its
  signature. Both versions verify using the original public key.
- Valuations require the authoritative field; new accounting v2 exports label
  timestamp/fee provenance. Unknown fees are not emitted as confirmed fee
  expenses. Historical valuations are `legacy-unverified` and are not repriced
  on an assumed date. Existing signed export bytes are not changed.
- Additive migration leaves historical timestamps/signatures/fees untouched.
  `docs/settlement-time.md` records inventory, missing-history/backfill and
  issuance-safe rollback. No migration was applied to a retained deployment.
- PR #92 is already merged (2026-09-29); this extends its existing accounting
  implementation instead of creating a competing export path.

## Independent historical ledger readback

On 2026-10-08, a read-only probe verified official Testnet identity and read the
three public transactions supplied by the user. All remain successful:

| Stage | Ledger | Horizon created_at (UTC) | Fee (stroops) |
|---|---:|---|---:|
| Funding `4219edf4…` | 4941970 | 2026-09-30T01:57:17Z | 400 |
| Claim `fd62f8a0…` | 4942119 | 2026-09-30T02:09:42Z | 400 |
| Reclaim `3ffe30a0…` | 4942388 | 2026-09-30T02:32:07Z | 100 |

Full public-only readback is retained in root
`docs/reviews/2026-10-08/github-reconciliation/historical-timestamp-readback.json`.
It verifies real historical timestamp provenance; it is not a new asset transfer
or fresh supported-wallet qualification of this build. Transaction builders,
principal ownership and required wallet signatures were not changed by #110.

Mainnet readiness, fresh official-USDC/physical-wallet matrix, release budgets
and operations gates remain open. Railway stays paused and the PR unmerged.
