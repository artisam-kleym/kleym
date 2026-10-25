# Kleym migration to the senior developer's Railway project

## Target and public address

- Railway project: https://railway.com/project/57849f8f-8c9f-4565-8b88-6faf9ce085dd (`kleym`, shared workspace `mh's Projects`). This is the management URL, not the application URL.
- Application: **https://kleym-testnet.up.railway.app**.
- Testnet environment: `72ccf46d-3e64-4bcb-bde8-9d4af62157ff`.
- The unused `production` environment has no active deployments. Mainnet is disabled; a clean domain name does not change the Stellar network.
- The initial generated address ending in `dd5d` was renamed before owner funding tests. User confirmed the final origin was added to the existing Reown/WalletConnect allowlist.

## Migration completed

The current qualified source-only export was deployed in the target project. It contains the October 10 claim retry, hydration and navigation fixes, plus the preceding mobile UI/signing/expiry improvements. Runtime export: 392 files, SHA256 `04077ca233b66c77ed4f27f4277a173602dcd4903d35568edca386dd61e19f80`. No private runtime files were uploaded. GitHub remains signed out; no commit, push, issue closure or merge was performed.

The old web and worker stayed stopped during the copy. Original Postgres/Redis were temporarily resumed for fresh SSH backups, then stopped after target readiness and restore verification. All four old services are now stopped. Original volumes, private backups and service configuration remain retained; no source database reset, seed, destructive schema change or volume deletion occurred.

PostgreSQL: all **35 tables** match by row count and content digest; all index and constraint definitions match. Existing campaign IDs, transaction journals, users, organisation ownership and migration ledger were preserved. Redis: a 125,096-byte snapshot was copied and reloaded with its SHA256 verified and **219 keys** present before application work resumed. Normal Redis persistence was restored. Session/audit/encryption/sponsor configuration was compared privately with the source; new database/Redis passwords and private target references were used.

Final services:

| Service | Service ID | Deployment |
| --- | --- | --- |
| Web | d0149eaa-d1c4-4c64-a3e8-4a659362714c | c59e613e-3211-4a5d-9a14-130973c36b25 |
| Worker | 1449f6c7-2843-4dfa-820f-7c49d87a1fba | cc8588a8-c2b7-40bc-b99e-0fbe7b6b4201 |
| Postgres | c56db078-2554-46fe-9d5c-1fec9c99618b | fac75115-3c1e-4188-aa7f-483a286ef805 |
| Redis | ef86046b-954d-43ec-959d-13ab401b3e12 | 755a9b3b-4c10-4969-94f4-942a8cb9abdd |

All four deployments passed startup/readiness. The web/worker runtime APP_URL matches the final hostname. The temporary earlier target worker was retired after the replacement became healthy. Root and canonical-checkout Railway CLI links now target this shared project; historical scripts with explicit old IDs remain historical and must not be run blindly.

## Mobile campaign verification

**57 focused wallet tests passed**, covering phone pairing, session reuse/cancellation, expected network/account, signing and rejection of changed envelopes. Prior comprehensive source-matching QA remains applicable; it is recorded separately rather than rerun or added to this session's counts.

**15 hosted browser checks passed**, using actual authenticated pages and live Testnet balance reads. Manual G-address entry was verified at 320px, 393px and 1440px; an invalid address was refused; three links reached Review with the correct count. Six navigation routes, claim privacy headers, readiness and prior settled-campaign history passed with zero page errors. The sender had **9 test USDC** at verification. These checks generated no link keys, created no campaign and submitted no asset transaction. Screenshots and machine evidence are under `evidences/`.

The phone connects through Freighter Mobile/WalletConnect; desktop connects through the extension. Both routes ultimately require the exact funding account to sign. **Manual address entry checks balances; it cannot authorise spending.** The mobile connection button is labelled “Use connected wallet as funding account”.

**Physical Android creator funding succeeded.** The owner used Android Chrome and Freighter v1.26.29 with sender `GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A`, confirmed the populated address/USDC, saved the CSV on the phone and approved three links × one official Testnet USDC. Campaign `cmv5da4zl00040dlj8q3hjkkp`; funding `c77fec9f34d20866752fe2d20f5c88d4148a17691911c74f8d0257701b073f5a`, ledger5158585. Exact asset/amount/operations and owner/sponsor signatures independently verified. Sender9→6USDC, native0; sponsor paid500stroops. Owner supplied the device/file context; the ledger alone cannot identify a device. Expiry is October12 23:47 Manila (15:47UTC); three links were active/unclaimed at verification. Do not resubmit funding. Fresh recipient claims/refund and broader phone lifecycle states remain separate checks.

## Mobile feedback fixes and retest

The owner saw “A request with this Idempotency-Key is still in progress” despite confirmed funding. Source and a production-browser fixture reproduced the stale inline error. The deployed helper now checks the existing batch through read-only GETs after an in-progress or lost response and requires the exact signed-transaction hash before accepting its state. It does not repeat the payment POST or wallet signing. A synchronous guard prevents overlapping Sign actions during the earlier step-up await.

Nine regression unit cases cover pending/confirmed/submitted outcomes, lost responses, mismatched hashes, real refusals, failures and unavailable status. Full suite **797 tests / 72 files passed**, strict typecheck and focused lint passed, and production builds passed. Both local production-component and deployed-browser tests succeeded after simulated double taps: one step-up request, one campaign creation, one wallet-sign request, one payment POST, three status reads and no stale error. These test writes were intercepted; they created no real campaign and transferred no assets.

Campaign details now show a full Campaign ID and paginated funding transaction hashes with network-correct explorer links and refresh/error states. Admin Campaigns shows the ID and latest funding transaction. Seven live tests passed across320/393/1440px with no root overflow/page errors and authentication still required. Final web export **394 files**, SHA256 `4a64a52b752e1228707ae736cf095a2470e09a2d23f2aaf2f99831ad34daecf8`. The worker retains the qualified initial image; worker code/schema were not changed by the follow-up UI fix. Its manual queue probe completed.

The owner changed the application password during testing. The final recheck initially rejected the saved older password; this was expected authentication behavior, not a migration defect. After updating the private operator login with owner-provided credentials, API/browser authentication and the subsequent checks passed. Password values are excluded from this report.

## Existing links, private files and rollback

Old CSVs still contain the old hostname; no private exports or recovery words were read, rewritten or migrated by the agent. The old public app remains offline. No unexpired old campaign was qualified for sharing at the new origin; create new exports only on the new site, and handle any historical-link requirement explicitly. Stellar balances and expiry are independent of Railway hosting. The previously deferred campaign refund was already settled and must not be resubmitted.

Private backups and an updated private login file are in `.runtime/senior-migration-20261012` under the canonical checkout; files were restricted to the current Windows user. They must not be published. The existing username/password still works, but a fresh login is required on the new origin. No new senior-developer app account or billing-plan change was made.

Rollback is available from the stopped source services and the migration snapshots. After new writes/signatures, do **not** simply restart the old worker: stop target writers first, capture target database/queue state, and reconcile ledger-authoritative changes before choosing the restored state. Retained volumes are not a substitute for tested ongoing backups. Rebuild Lantern and qualify Mainnet separately; both remain disabled.

## Evidence

`evidences/preflight.json`, `target-configuration.json`, `database-preservation.json`, `redis-snapshot.json`, `final-migration.json`, `release-manifest.json`, `mobile-browser-verification.json`, `worker-verification.json`, `public-status.json`, and `screenshots/`.
