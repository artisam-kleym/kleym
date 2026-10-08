# Android connection and public hosting preparation

Date: 2026-10-03. Source: `codex/app-sending-pilot`, base `4163d79`, preserved local product changes. No push, public deployment, real wallet approval or chain write in this work.

## Delivered

- Recipient-only WalletConnect v2 connection, loaded on an explicit button. First-party phone pairing instructions/copy code/cancel, with destination review before the existing deliberate claim action.
- `src/lib/wallet/mobile.ts`: sign-only `stellar_signXDR`, one account on the deployment's chain, session expiry/permissions/account validation, cancellation/late-approval cleanup, session invalidation, cryptographic verification of exact transaction body/network/recipient signature and preservation of sponsor signatures.
- Optional server-validated public project ID. No bearer key/phrase/private URL in wallet metadata, requests or storage. SDK telemetry disabled, protocol session data held in memory. Existing extension adapter remains available.
- Narrow CSP relay/isolated origin-attestation-frame allowance on `/claim` when configured; self-hosted app scripts/styles/fonts and no-referrer retained. Opening the page produces zero third-party requests, including when mobile support is enabled.
- Pinned existing SDK `2.23.0` as a direct dependency; lockfile importer only changed. Local dependency resolved to the already installed package through a junction; frozen lockfile validation passed. No clean Linux/Railway image was built in this turn.
- Updated legacy Railway configuration, dashboard setup for new services, explicit host/PORT, migrations, readiness, Node 22/dev-dependency retention, source upload exclusions, read-only public readiness probe and Android acceptance guide. Current Railway docs deprecate legacy config for new services, so JSON files alone cannot establish a new deployment.

## Proof actually run

| Check | Result |
| --- | --- |
| Wallet adapters and claim proof units | 46 passed across 3 files; 18 new mobile checks |
| TypeScript | passed |
| ESLint on changed application/script/unit files | passed |
| Production webpack build | passed; existing middleware deprecation and BullMQ optional-module/dynamic-loader warnings |
| Production Chromium claim suite | 19 passed; phone viewport 393×851, real bundled SDK with local relay/attestation fixtures, desktop bridge fixture and actual missing-proof HTTP refusals |
| Pinned pnpm frozen lockfile | passed with `10.6.4`, lockfile-only/offline/ignore-scripts |
| Public-readiness probe input | loopback HTTPS origin refused without a network request |
| Changed tracked files whitespace | passed |

The first browser run had 18 passes and one API refusal test blocked by 429: Redis was offline and rate limiting failed closed. Restored only existing loopback Kleym Postgres/Redis containers, then repeated the suite: all 19 passed. No guard or test assertion weakened. Existing fixture volumes/data preserved. Temporary production preview at port3222 used a synthetic project ID and was stopped after testing. Prior pilot port3220 was unreachable at the start of this turn; previous PID/runtime notes are historical.

## Remaining qualification

User has Android, no hosting account/domain yet; Freighter version is unknown. Need user-owned Railway account/project and WalletConnect project/origin allowlist, exact release source review, protected deployment secrets and provisioning, migrations/admin bootstrap, worker/backup proof and a real Android Testnet claim. Browser fixture success is not phone compatibility or Mainnet readiness. No current account balances were read or changed. Previous funded local links and October31 expiry remain unchanged; never substitute a public host or repeat funding of those links.

Next user step: create the hosting and WalletConnect accounts; use Railway's generated HTTPS domain first. Follow `docs/railway.md` and `docs/mobile-claims.md`. Separately review operational limits/capital/owners and Mainnet rollout after public Testnet evidence.
