# October 1 app sending delivery

## Priority and scope

The user deferred GitHub Issues until Kleym's actual sending functions work for the October 7 pilot. This delivery implements sponsor-paid USDC campaign funding in the app wizard. GitHub issue closure and the remaining issue matrix were not used as implementation gates.

Checkout: `D:\kleym\.worktrees\app-sending-pilot`, branch `codex/app-sending-pilot`, based on local verified lifecycle commit `452735c`. Existing root planning work and the previous Testnet harness checkouts were preserved.

## Implemented

- New USDC campaigns created through the campaign API persist `fundingMode=SPONSORED` and their bound sponsor. Existing rows default to `SENDER`; legacy envelopes and campaigns retain their original funding mode.
- The sponsor supplies the transaction sequence, fee and claimable-balance reserves. Each balance operation is sourced from the sender, so the sender supplies the USDC and remains the expiry claimant.
- Sponsored batches leave two operation slots for the sponsorship bracket. Two-claimant reserves are calculated from the live base reserve as two units per link. Fee estimates include the bracket operations. Legacy estimates remain compatible.
- The server stores each prepared public envelope. Sponsor signing requires the exact stored body hash, a verified sender signature under the configured network, and the campaign's asset, amounts, claimants, sources and expiry.
- The fully signed envelope and hash are recorded before submission. A missing response keeps the original attempt pending. The worker can resend only the identical recorded envelope and still requires a closed-ledger read before activation.
- Startup and maintenance repair a missed confirmation enqueue. Job IDs include the transaction hash so a new retry attempt is distinct from the previous attempt. Repeated jobs and submission replay preserve idempotency.
- The wizard records the local CSV export after registering public keys; no CSV or link seed is uploaded. Sponsored preparation refuses without that record. Signing failures preserve the campaign and local keys, stop the loop, and display the reason. The wizard waits for confirmation before requesting the next batch.
- Review names Kleym as payer of the XLM fee and reserves. Pilot delivery uses the sender's saved CSV; each recipient receives only their own claim URL after funding is confirmed.
- The federation route's pure helper exports were moved into a library module because Next rejects extra route exports. Existing federation validation tests still pass.

## Verification

| Check | Actual result |
| --- | --- |
| Targeted Stellar, wizard cost and federation unit tests | 92 passed, 4 files |
| Existing batch persistence harness | 36 checks passed against isolated Postgres |
| Sponsored funding / recovery harness | 22 checks passed against real isolated Postgres and Redis with a loopback Horizon fixture and real SDK signatures |
| Authenticated production Chromium wizard checks | 10 passed, including zero-XLM sponsorship pricing, official USDC selection, CSV signing gate and no seed/phrase in requests or storage |
| Production build | Final recovery source passed with webpack, exit 0; TypeScript and route generation passed |
| App liveness / readiness | HTTP 200; `status=ok`, `ready=true` |
| Final app desktop / mobile preview | Real app account lookups, no generated secrets or signatures; 390px content inside 390px viewport |
| TypeScript and changed-source ESLint | Passed; final build checked all TypeScript and the final queue/worker/API/script lint exited 0 |

The sponsored balance-ID fixture is extracted from the independently verified September 30 Testnet funding receipt, hash `a3b7f0d1d07c953597db3c2cf3c08da134103da67059c115e7e60dc977697005`. Unit proof checks both SDK-derived IDs against the ledger result, including the operation-index offset.

The loopback recovery harness does not move chain assets. It verifies the actual API and worker against simulated ledger responses, including lost submission response, exact-envelope resend and claimant-based activation. Browser tests stop before a wallet signs. These results do not constitute a new live Freighter funding or an October 7 deployment acceptance.

## Local operation and remaining work

The app uses `http://127.0.0.1:3220`, a separate `kleym_app_pilot` database, Redis database 1 and the existing privately configured Testnet credentials. Administrator credentials were reused without printing the password. Local `.env` and browser session state are ignored by Git.

Final service records are in `runtime.json`. Ongoing app and worker logs are in the ignored `.next/pilot-runtime/` directory. Preview screenshots and `browser-preview.json` were captured against the final build without stubbing its account/reserve lookups. The preview neither generated a recovery phrase nor submitted a transaction.

Next priority: complete the actual app's recipient claim and sponsor-paid expiry reclaim, then perform one reviewed Freighter funding → claim → reclaim cycle through the app. In particular, the existing reclaim API still uses sender-paid fees and must be adapted for a zero-XLM sender before that full cycle. No new live funding was requested in this delivery. Concurrent campaigns sharing a Classic sponsor sequence also need operational handling before a larger pilot.

Cold/hot treasury custody, refill approvals and independent signer recovery remain documented designs. They were not implemented by this funding integration. Public-network deployment, real-USDC transfers, larger-volume acceptance and final October 7 readiness remain outstanding.

Turbopack rejected the reused dependency junction outside its filesystem root; webpack successfully built this isolated checkout. Existing middleware deprecation, optional BullMQ Valkey dependency and Edge import warnings remain visible. No dependency upgrade was performed.
