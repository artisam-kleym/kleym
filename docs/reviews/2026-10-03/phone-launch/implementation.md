# Phone connection and direct Freighter launch

Date: 2026-10-03. Product checkout `codex/app-sending-pilot`, base `4163d79` plus preserved local changes. Scope: recipient connection UI and app hand-off; existing ledger, signatures, sponsored fees and server authorization remain the acceptance boundaries.

## Delivered behavior

- Android/iPhone/iPad and Freighter in-app browsers get only the phone connection entry. Desktop windows retain extension access irrespective of width. Unconfigured phone access is visibly unavailable rather than routed to a desktop adapter. Connected users still review their destination and deliberately select Claim; mobile Change wallet reconnects through the phone transport.
- Explicit phone connection initializes the bundled SDK, creates a pairing, validates the URI and tries the OS app hand-off once. Only a validated WalletConnect v2 pairing with the expected relay/key shape is encoded in the URL. No claim fragment, Stellar link secret, return URL or arbitrary caller-provided destination crosses to the wallet.
- The screen provides an **Open Freighter** link to retry with a fresh user gesture if async browser navigation was blocked. Manual copy/scanner instructions are collapsed under **Freighter did not open?** on a phone. Desktop-to-phone pairing keeps its manual instructions visible. Cancellation/late-approval handling, session/network/account checks and cryptographic signing verification are preserved.
- No dependency, database schema, server route, CSP allowance or telemetry change. No client wallet-directory lookup or additional third-party request on opening a claim.

## Launch route evidence

User reports Android Freighter **v1.25.28 (1788217824)** and app opening from Centient's public website. Official release tag maps to `914089806a9d1591770c0cd54c1cf328592e1359`, dated2026-08-31. Its [Android build](https://github.com/stellar/freighter-mobile/blob/v1.25.28/android/app/build.gradle) registers the production `freighterwallet` scheme, and [useWalletKitEventsManager](https://github.com/stellar/freighter-mobile/blob/v1.25.28/src/hooks/useWalletKitEventsManager.ts) decodes the `uri` query and initiates WalletConnect pairing. It handles running-app events and cold-start URLs after initialization.

The official WalletConnect Explorer API returned200 with Freighter's native route **`freighterwallet://wc-redirect`** and Android package `org.stellar.freighterwallet`. Read using the existing public project ID and public origin; no secret or user key. Centient's public bundles were read without login/connection: their launch implementation resolves that same directory entry, encodes the pairing URI, auto-opens on phones and retains an explicit launch button. Its generic fallback route was not copied. Kleym uses the verified native route directly, avoiding a directory request on a sensitive claim page.

## Verification

- 48 unit checks across phone routing/URI validation, existing mobile session/signature boundaries and desktop signing passed.
- TypeScript and targeted ESLint passed. The first Windows ESLint `.cmd` invocation misparsed parenthesized file paths; invoking the installed ESLint entry with Node passed without application changes.
- Production webpack build passed with existing Next middleware deprecation and BullMQ optional-module/dynamic-loader warnings.
- 20 production Chromium claim checks passed on loopback3222, using the real bundled WalletConnect SDK, local relay/attestation fixtures and Android user agent/393×851 viewport. CDP observed one automatic native navigation attempt and a second identical attempt from the explicit link. The fallback URI field is hidden by default, revealing it works, cancellation removes pairing UI, and connection attempts submit no claim POST. Claim-key privacy, network/account/destination review, separate commitment, keyboard access and narrow-desktop access also passed.
- The final manual-open assertion was added after the full run; its focused Android check then passed. No new Android hardware approval/signature was performed by the agent.

## Actual public accounting

[three-link-preflight.json](./three-link-preflight.json) independently verifies original campaign `cmushrocg00040dodb0ev2end`: one confirmed batch of3×1officialTestUSDC, sender/sponsor signatures, source sponsor paying500stroops; desktop1USDC payment in a later ledger with sponsor400stroops and cleanup merge. Sender12USDC/zeroXLM; desktop recipient3USDC/zeroXLM. Two1USDC balances remain with the same sponsor and expired predicates. Expiry was14:46UTC/22:46Manila. Reclaim2USDC before renewing only the unused two-link budget; new keys/CSV and future expiry are required. No funding of the already paid link should be repeated.

## Released and public proof

Web deployment `72654a8a-f7a0-4f5a-bd19-156d5882311e` is SUCCESS at the existing public Testnet origin. Worker `395027b9-21f2-4d15-ab4a-e3d03bb05b97` remains SUCCESS; backend, worker, dependencies and configuration are byte-identical to v2. The candidate changes only `src/lib/wallet/phone.ts`, claim `claim-flow.tsx` and `screens.tsx`.

Immutable candidate `D:/kleym/.runtime/deploy-source/2026-10-03-phone-launch-v3` has370 files and digest `819afd7baf1930079ec2287c8c0ba277a3e5e0b45fa682677fae0f544924b0aa`; [release-manifest.json](release-manifest.json) preserves file hashes. No runtime secrets were uploaded.

Linux verification reused qualified v2 dependencies in a disposable, network-disabled Node22 container. After copying candidate source into the image,369 Docker-context files matched the manifest; webpack/TypeScript/static generation exited0. The first harness mounted source over `/app/src` and hid the image-generated Prisma client, causing a module-not-found build. Corrected source copy preserved generated Prisma; application/candidate did not change. This is not a new clean dependency install. Existing Next/BullMQ/internal Edge warnings remain.

Two focused public Chromium tests passed: Android-only connection UI, automatic native navigation and explicit app link, collapsed fallback, cancellation/no claim POST; narrow desktop keeps extension connection. These use synthetic pairing/relay fixtures, not a physical Android wallet. Public probe at15:28:10UTC passed health/readiness200, claim nonce CSP/no unsafe directives, no-referrer and enabled WalletConnect relay. Public network reports official Testnet/USDC and `isRealMoney=false`. Deployment logs show32 existing migrations, none pending, Next ready. No worker redeploy was required. See [verification.json](verification.json).

Physical app opening, return-to-tab behavior, any required signing and exact Android settlement remain unqualified until the user completes the renewed Testnet test. Automatic launch is currently at connection; signing-time relaunch is not separately implemented or qualified. Mainnet release remains unqualified.
