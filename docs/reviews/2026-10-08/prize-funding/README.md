# Prize distribution reliability — October 8, 2026

Source: `D:/kleym/.worktrees/app-sending-pilot`, branch `codex/app-sending-pilot`, base commit `4163d7954bff9c1582c0c405174cddbe6951da33`, with preserved local development changes. No deployment or asset transfer was performed.

## Changes and acceptance

- `src/lib/api/batches.ts`: no preparation for an incomplete declared recipient list or historical incomplete batch plan. Sponsored USDC preparation checks all remaining pending/failed prize amounts, reserves and funding fees. Submitted batches wait for confirmation; confirmed batches are excluded. Variable amounts, selling liabilities and sender authorization are enforced.
- `src/lib/stellar/amount.ts`, `src/lib/api/campaigns.ts`, `src/lib/campaign/csv.ts`: shared positive int64-stroop limits prevent database/XDR overflow from oversized prizes. The boundary and the one-stroop overflow are checked without JavaScript amount numbers. See [Stellar amount and trustline guidance](https://developers.stellar.org/docs/build/guides/basics/verify-trustlines).
- `src/lib/campaign/cost.ts`, campaign wizard/asset step: invalid amounts cannot advance; inline feedback explains the bounds. Large uniform and variable prize totals retain the last stroop with 40-digit Decimal precision.
- `src/lib/api/links.ts`: identical committed public registrations can be retried without consuming link capacity again. Partial retries insert only new keys. Changed amounts, labels, claim codes, reference/category/note or duplicate keys are refused inside the existing serializable transaction; organization ownership and campaign status restrictions remain.

## Verification

The authoritative final outcomes and source hashes are in `verification.json`. Logs retain earlier passes and the initial TypeScript failure from a test call missing the CSV count argument; that fixture was corrected before final qualification.

- Full Vitest suite, TypeScript, focused ESLint and production webpack build: see final logs.
- `prize-funding.test.ts`: incomplete list/plan, insufficient whole remaining USDC/XLM, exact fees, variable prizes, liabilities, authorization, issuer mismatch, exact sufficient capital, failed-batch resume and pending confirmation.
- `amount.test.ts`: int64 boundaries, oversized CSV refusal, large exact totals and invalid review amounts.
- `prize-registration.test.ts`: exact retry, partial retry, changed terms/codes, declared count, duplicate keys and organization/status restrictions.
- Read-only Mainnet identity probe passed at ledger **64835115**, closed **2026-10-08T12:09:17Z**, using the configured official USDC issuer. `public-network.json` records public provider/account/ledger evidence and **zero writes**. This does not prove a Mainnet payout.
- `scripts/verify-sponsored-funding.ts` was extended for real PostgreSQL/Redis with simulated Horizon and disposable signatures. **Not run on this candidate:** Docker Desktop failed at startup because its `sailor-ingest.sock` endpoint could not be accessed. A limited stop/restart preparation and rename attempt did not resolve it; no socket or Docker data was deleted/reset. Docker was stopped after the failed startup. `database-runtime.log` records the unavailable engine. Prior integration results do not qualify these new changes.

## Limits and next release gates

The remaining funding check does not reserve whole-campaign capital atomically across campaigns, guarantee issuer authorization through approval, or allocate the future claim/recipient sponsorship budget. A later interruption/rejection can still leave a partially funded campaign; its confirmed prizes remain real.

Restore the local database/queue runtime and run the extended funding, source-coordination and full app lifecycle scripts on the isolated verification database. Then qualify the exact deployed Testnet candidate with desktop and Android/Lantern wallets, CSV backup/export, expiry refund and renewal. The supplied Lantern 0.6.2 build still needs the Kleym directory/session entry and Android asset statement rebuild described in `docs/lantern-integration.md`.

Before a separately approved Mainnet rollout, agree campaign/per-prize/pilot caps, fund hot sponsor claim/reserve headroom, assign refill/incident ownership, verify backup/restore and review migrations and the deployment candidate. Cold treasury keys stay outside web/worker configuration. Railway remains paused and public environments were not changed.
