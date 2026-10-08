# Public Kleym Testnet deployment — October 3, 2026

## Latest desktop routing and phone approval release

Web `197465e3-afaf-4e54-9eb4-28316963f324` SUCCESS supersedes v3 below. Desktop has no phone option; mobile explains connection versus Claim and tries to reopen the existing Freighter session after an exact required signature request is published. Public fixture tests/readiness passed.54 relevant checks,20 local browser checks and Windows/exact-source Linux builds passed. [Latest release evidence and supported-wallet limits](../phone-approval/implementation.md).

The earlier two-link refund already confirmed. New campaign `cmusjy67f00020dp4imc8q054` funded3USDC, paid1USDC to each known recipient, and has only **one** expired unused1USDC balance. Next refund belongs to this campaign, expected sender11to12USDC. Earlier instructions below are historical. [Current accounting](../phone-approval/current-accounting.json). Actual required-signature Android hand-off and Mainnet remain unqualified.

## Latest phone update and funded test

The phone launch release is now live: web `72654a8a-f7a0-4f5a-bd19-156d5882311e` SUCCESS, compatible worker unchanged/SUCCESS. Android connection hides the desktop entry, tries the verified Freighter native route, offers an explicit Open Freighter link and collapses manual pairing fallback. Public readiness/privacy headers and two focused browser fixture checks passed. See [phone implementation and qualification](../phone-launch/implementation.md) for current source digest and proof. The initial v2 deployment and test instructions below are historical.

Campaign `cmushrocg00040dodb0ev2end` really funded3USDC and paid1USDC on desktop, sponsor-paid and zero sender/recipient XLM. Its two unused1USDC balances expired at14:46UTC/22:46Manila. Sender12USDC, desktop recipient3USDC. Next: user reclaims **2USDC**, verify public receipt, then uses **Renew returned funds** for only those two unused links with new future expiry/keys/CSV. Do not repay the desktop link or fund another independent3USDC campaign. Physical Android launch/signing/settlement and Mainnet remain unqualified. [Public ledger preflight](../phone-launch/three-link-preflight.json).

## Result

**https://kleym-web-testnet.up.railway.app** is running in the account owner's Railway `kleym-testnet` project, separate `testnet` environment. The account owner completed CLI authentication and confirmed the exact WalletConnect origin allowlist. Public login, fresh dashboard/wizard, official Testnet USDC selection, claim hydration/CSP/privacy and web-to-worker reconciliation passed. Physical Android wallet signing and public funded claim/refund are the next acceptance steps.

| Target | Identifier / state |
| --- | --- |
| Project | `48614d0d-2e58-4848-af96-2184e3044c47` |
| Testnet environment | `cbca2958-d44a-4ca8-8d4e-746a61584d02` |
| Web service | `4d547645-da9f-4e1e-aec3-2511f6239fc3` |
| Final web deployment | `73d9fe35-47df-4813-84ea-89803d593e26`, SUCCESS |
| Worker service | `2490753a-e4ba-471c-87c9-a6dd7d74d567` |
| Worker deployment | `395027b9-21f2-4d15-ab4a-e3d03bb05b97`, SUCCESS |
| Postgres / Redis | `37702f7c-d942-4b00-96aa-16b5c4a8b58e` / `45121e0c-a4e7-4961-8004-102e6dfa6d03`, SUCCESS; persistent 500MB volumes |
| Public wallet project ID | `ff72324abc5c946ec7072d325a9b45aa` |

The original empty default `production` environment and default service were preserved. No GitHub push/auto-deploy, domain purchase, paid-plan upgrade or Mainnet setup occurred. Provisioned hosting consumes account resources; this report does not establish a monthly cost or future trial availability.

## Release and packaging

Application checkout: `D:/kleym/.worktrees/app-sending-pilot`, `codex/app-sending-pilot`, base `4163d7954bff9c1582c0c405174cddbe6951da33` plus preserved local product work. This is an exact source snapshot, not a claim that Git HEAD contains every deployed change.

Immutable candidate: `D:/kleym/.runtime/deploy-source/2026-10-03-android-testnet-v2`.

- 369 allowlisted files; source digest `7e606ea6d66674bf9ee470331cef4e069868a280b117bc39dbb1f16201a1621a`.
- Full file hashes are in [release-manifest.json](release-manifest.json).
- Export excludes private environment/configuration, CSVs, sessions, local databases, runtime, review outputs, symlinks and literal private-key patterns. Docker has a second allowlist. This is packaging evidence, not a comprehensive security audit.
- Docker uses Node 22 Debian, pnpm 10.6.4 frozen install, Prisma generation, webpack production build and a nonroot runtime. CLI tooling is retained for worker and migrations. No runtime secret is needed to compile.
- Initial v1 clean build failed because retained operator commands import `tests/env-placeholders.ts`. v2 includes only that explicit nonsecret helper. v1 remains preserved.
- v2 clean Linux compilation/TypeScript/static generation passed and produced an image. The initial PowerShell redirection wrapper reported exit 1 despite complete export; a cached build of the same inputs independently exited 0. Native argon2 loaded successfully in the image. Image config digest is `sha256:f8768ffdbd0688bdc49f862b743b1f6c93bf3537456afdac888eff578199d254`.
- Existing warnings: BullMQ optional Valkey adapter/dynamic child dependency, Next middleware deprecation and an internal Edge process.cwd import. No observed runtime browser error in the deployed pages. These warnings were not presented as a clean audit.

## Infrastructure and bootstrap proof

Both services use only the fresh Testnet hot sponsor `GAG4GEG2X7HCJJFJVUOKIVGQAZBI5WVCJFVO4FPHUH5UHC526HWLKHHK`. Verified official Horizon Testnet identity before Friendbot provisioning. Friendbot hash `becee7ae614f13b97d46435e952d57fbaff0ee794b70aed19da6c166e0978e44`; initial balance 10,000 Testnet XLM. No sender/recipient USDC or historical campaigns moved. No cold treasury key was introduced.

- Postgres and Redis references resolve to `postgres.railway.internal` and `redis.railway.internal` on both services. API checks returned no database TCP proxies. Worker has no public domain. Web port is 3000; one replica per app service and sleeping disabled.
- 32 migrations applied successfully to the fresh cloud database. No historical local database was copied.
- One administrator and personal organisation created. Credentials stayed private. Normal release uses only `pnpm db:deploy`; `ALLOW_PROD_SEED=false` and absence of both `SEED_ADMIN_*` variables verified on both services.
- Plain combined pre-deploy text executed only migrations. Explicit `sh -c 'pnpm db:deploy && pnpm db:seed'` ran the seed on fresh upload. CLI `redeploy` reused its earlier command snapshot, so fresh uploads were used to activate settings. Migration and bootstrap failures were investigated before login testing; no migration/typecheck gate was disabled. Railway documents pre-deploy as running before the application, with private network and runtime variables: [pre-deploy guide](https://docs.railway.com/deployments/pre-deploy-command).
- Private operational backup is Windows CurrentUser DPAPI plus restricted file ACLs, in ignored `.runtime/railway-operator/`. It is tied to this Windows user/computer and is not a portable Mainnet backup plan. Private admin login is separate and never copied to this evidence package.
- Email key is intentionally unusable; only manually shared OPEN links are in this pilot scope. Email/OTP delivery is not qualified.

## Verification

Final [public readiness](public-readiness.json): HTTPS health/readiness 200, `ready=true`, claim nonce CSP, no unsafe-inline/eval and `no-referrer`, wallet relay configuration present. Read-only probe submitted no transaction.

[Public browser verification](public-browser.json): real Chromium login/dashboard and fresh zero-campaign database; Testnet network and official Circle issuer; `/claim` hydrated at 393×851, public project ID present, zero browser errors and zero foreign requests on opening. Screenshots: [sender wizard](public-sender-wizard.png), [Android-width claim without a link](public-android-width-claim.png). The invalid-link screen is expected for plain `/claim`; it is not proof of a funded mobile claim.

Worker log evidence:

```text
2026-10-03T13:15:20Z worker started: batch-confirm, email-deliver,
webhook-deliver, reconcile, expiry-sweep, ephemeral-watch,
delivery-retention, reminders, templates, valuations
2026-10-03T13:20:01Z reconciliation completed: campaignsChecked=0,
linksChecked=0, corrected=0, critical=0, unresolved=0, remaining=0, manual=false
2026-10-03T13:20:52Z reconciliation completed: campaignsChecked=0,
linksChecked=0, corrected=0, critical=0, unresolved=0, remaining=0, manual=true
```

Manual reconciliation was queued through authenticated HTTP (202) and processed by the separate worker. This proves producer/consumer connectivity, not funded settlement/recovery. Public status still reports reconciliation degraded because other maintenance passes have not had their first hourly/daily run. Reconcile runs every 5 minutes; ephemeral watch every 15; reminders at minute 41; retention daily 03:23 UTC. That warm-up state was preserved, not hidden.

Earlier local evidence remains separate: 46 relevant wallet/proof units and 19 production Chromium tests in [mobile-hosting](../mobile-hosting/verification.json). Those used local relay/attestation fixtures, not the actual phone/WalletConnect relay.

## Next user test

October 3 update: user requested **three** links instead of two and reported that Freighter's added wallet list disappeared. Account1 is verified as the original `GAI3…LDHWW` recipient with2USDC/0XLM. The user then added the next wallet from the surviving primary Freighter wallet and returned the exact original sender `GBV6…OQQY5A`, displaying15USDC. Sender identity recreated; no faucet/new activation needed. A real signature is still pending. See [wallet-reset preflight](wallet-reset-preflight.json). Privately back up Freighter's wallet phrase before continuing; it is separate from the campaign phrase. No extension storage or private material was accessed.

1. Open the public `/login` page on desktop and use the private local admin-login file. Select Testnet and Kleym Sender in desktop Freighter.
2. Once sender signing access is established, create a **fresh** manually shared Testnet USDC campaign: **3 links × 1 USDC**, expiry about one hour ahead. Privately save its new campaign phrase/export, separately from the Freighter wallet backup. Review/sign funding once; wait until all three links show funded. Return the public funding hash/campaign ID for ledger review.
3. Claim only the first link on desktop with Account1 `GAI3…LDHWW`. Confirm its exact1USDC credit and public claim hash before moving to the phone.
4. Send only the second claim URL from that new private CSV to a distinct Android wallet. Keep its browser tab open; copy the wallet pairing code into Freighter's scanner, approve and return to the tab. Review the destination before Claim. Recipient trustline creation requires a wallet signature; an existing correct trustline does not. Record Android/Freighter version and return only public receipt hashes.
5. Keep the third link unused; reclaim its 1 USDC after the actual ledger expiry, then verify exact sender refund and reserve release. Do not recreate funding on retry. Expected campaign principal accounting:3funded=1desktop+1phone+1returned. If original15USDC sender recovered and no other activity, balance12after funding/13after refund; desktop2→3USDC; distinct phone+1USDC.

Historical local funded links remain attached to their original deployment/database and immutable predicates. Do not rewrite their hosts or repeat their original budget's funding.

Real Android signing, funded public settlement/refund, backup/restore/durability and operational limits remain required before a separately reviewed Mainnet release. Treasury cold custody, refill automation and multisig remain proposed. This report does not claim real-money readiness.
