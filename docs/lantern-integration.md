# Kleym inside Lantern

## October 13 local preparation completed

Kleym-side changes are verified locally and remain **undeployed/uncommitted**. The senior's Testnet website still serves the October12 deployment. Lantern package changes and public origin enablement were not performed.

- Creator controls now name **Connect Lantern**, **Connect Freighter on phone** or **Connect Freighter**, according to the actual environment. Manual funding-address entry remains available and explains that funding/reclaim require the owner's signature.
- Inside Lantern, recipient connection/status/approval copy names Lantern and takes priority over phone Freighter controls, including overlapping device flags. Connection still does not claim funds.
- The Android launcher is offered only with the Android origin explicitly configured. An extension-only allowlist cannot advertise a working Android handoff.
- Review & create holds an in-memory handoff lock until completion or leaving the review step. The public launcher cannot restart that review in another document. The shared lock carries only a count, never a phrase, key, CSV or address. Independent holds and repeated cleanup cannot release another review.
- Pending Lantern requests interrupted by `pagehide` retire that document's bridge. A restored document must reopen before reconnecting, so an old idless connection reply cannot finish a new approval.
- Embedded sender Review explains that the CSV must actually appear in device files before funding. This is a user-confirmed save gate, not automatic proof that a file was saved. Missing native download capability remains a Lantern-side prerequisite; it was not bypassed.

Verification: **801 unit tests / 73 files**, TypeScript, focused ESLint and production build passed. Seven production-component browser journeys covered desktop1440/393, Android393/320, simulated Lantern with/without sandbox downloads, and an extension-only configuration. Fourteen separate production header/bridge checks passed. These fixtures used no real wallet approval or ledger writes. The component fixture was presented at the public campaign path using its rendered nonce and the real login response's ancestor policy; this is component proof, not an authenticated data-backed campaign test. Initial fixture-path and route-cleanup failures are preserved in the evidence and resolved in v5. Preview services stopped after testing; no private export retained.

Evidence: [verification-summary.json](reviews/2026-10-13/wallet-preparation/evidences/verification-summary.json), [browser-verification-v5.json](reviews/2026-10-13/wallet-preparation/evidences/browser-verification-v5.json) and grouped screenshots/harness under `reviews/2026-10-13/wallet-preparation/evidences/`.

Remaining Kleym product work includes general ordinary-address recipient claims and private recipient-link transport into Lantern. A complete alternative-wallet selector inside Lantern was not added: its existing bridge remains selected there, and Freighter's supported route is the standalone browser. The maintainer's rebuilt packages are needed for native CSV, login and transaction acceptance.

## October 12 source review: Centient requirements and Kleym differences

Current Kleym Testnet origin: **https://kleym-testnet.up.railway.app**, in the senior-owned Railway project. This supersedes the historical host in the earlier implementation notes below. No Lantern settings, deployed headers, wallet packages or source checkout were changed during this review.

The owner's Centient screenshots describe Android framing and pinned-extension framing fixes. Kleym already accepts the exact Android origin and full 32-letter extension origins in `src/lib/wallet/lantern-config.ts`. Its server headers, client bridge configuration and session policy use the same runtime `LANTERN_ORIGINS` configuration. Centient's `NEXT_PUBLIC_LANTERN_ORIGINS` build-time instruction must not be copied as Kleym's variable name or deployment behavior.

Lantern's public `develop` source was inspected at commit `ed512f6d3a478e4fc9eaab498627a6d0f8165d30`; this is newer than the local Lantern checkout (`73d5b34`) and is not proof of a distributed APK/extension version. At that commit:

- `src/shared/origin.ts` and `manifest.config.ts` pin `chrome-extension://iflpkjgolcbleombhldiibhojohjpnmd` through an extension public key. The older supplied 0.6.2 manifest still lacks this key. Confirm the rebuilt installed ID before enabling it; the earlier unpinned-build warning below is historical package evidence.
- `src/core/miniapps/directory.ts` lists Centient with `session: true`, `networks: ['TESTNET']`, the beta URL and an extra apex origin. It does not list Kleym. Add a separate Kleym entry with `url: 'https://kleym-testnet.up.railway.app/dashboard'`, `session: true`, `verified: false` and `networks: ['TESTNET']`. Extra origins are unnecessary for the current single host.
- `src/core/miniapps/deep-link.ts` accepts exact directory origins and drives Android asset statements. Regenerate them with `npm run android:assets` after the directory addition. Opening an arbitrary URL does not provide the authenticated directory-app session permissions.
- `lantern:getPublicKey`, correlated `lantern:signXdr`, acknowledgement, signed-XDR replies and sign-only behavior match Kleym's bridge. Lantern validates that the active wallet is a required transaction or operation signer; the sponsor being transaction source is supported. Code compatibility still needs actual sponsored-transaction device proof.

### Required export capability before sender acceptance

Lantern's current `src/core/miniapps/frame.ts` uses `allow-scripts allow-forms allow-popups allow-same-origin` for session apps, without `allow-downloads`. Kleym's `src/app/(sender)/campaigns/new/download-gate.ts` saves its browser-only CSV through a Blob URL and an anchor with a `download` attribute. Clicking that anchor does not prove a file was saved; the sender must still explicitly confirm the private export.

A cross-origin Chromium 151 fixture reproduced this capability gap using a harmless CSV: the current sandbox produced no download; adding `allow-downloads` completed the download. This is a browser simulation, not an Android APK or real-wallet run. Evidence and harness: [download-sandbox-proof.json](reviews/2026-10-12/lantern-integration-analysis/evidences/download-sandbox-proof.json) and [verify-download-sandbox.cjs](reviews/2026-10-12/lantern-integration-analysis/evidences/verify-download-sandbox.cjs). The harness reuses the local QA checkout's Playwright package.

The Lantern owner should grant downloads specifically to the curated Kleym sender experience, using a scoped directory capability if needed, and verify WebView handling of Blob downloads and Android file saving. Do not remove the sandbox or send private CSV contents through a server, intent or wallet bridge to solve export. See [MDN's sandbox download permission](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#allow-downloads).

### Integration acceptance and ownership

1. Lantern owner adds the Kleym directory entry, scoped export permission and regenerated Android asset statements, then supplies rebuilt extension/APK identities.
2. Kleym operator configures the exact confirmed Android and pinned-extension origins through `LANTERN_ORIGINS`. Until then, the public deployment remains disabled for framing; this review does not authorize enabling it.
3. Verify loading, login persistence/logout, all sender navigation, manual and connected funding accounts, local phrase/CSV saving, sponsored funding and owner-signed reclaim in both rebuilt packages. Verify rejection, timeout, account/network switches and duplicate taps. Compare public ledger hashes, amounts and reserve cleanup independently.
4. Qualify recipient delivery separately. Kleym intentionally refuses to put secret-bearing claim fragments into Android intents. A sender deep link and successful wallet connection do not establish private claim-link handoff. Define and test a browser-only delivery mechanism before advertising Chrome-to-Lantern private-link claiming.

The initial anonymous Centient request returned 404. The owner subsequently authorized GitHub CLI sign-in and completed browser approval as Adealix. CLI authentication is stored in the system keyring; authenticated access to both repositories was verified. The GitHub connector was not installed or changed.

Centient's authenticated `develop` source was inspected at `875a5fef020e13cc3fa1b1f7e0f7e011681c57e1`, covering `lib/stellar/lantern.ts`, `lib/stellar/wallet-lantern.ts`, `next.config.ts`, its web manifest and integration guide. Its implementation confirms the screenshot framing requirements, Android intent, public-key/network exchange, five-second sign acknowledgement and three-minute review timeout. Centient additionally signs a one-time ownership challenge for contributor login; Kleym retains its existing organization/account login and does not need to copy that authentication mechanism to approve funding or reclaim.

Kleym already checks the exact parent window and configured origin, uses correlated signing replies, verifies the reviewed transaction hash and expected signature, and preserves existing sponsor/local signatures. Do not replace these checks with Centient's less restrictive source parser or its older idless reply handling. Scoped runtime origins and existing Kleym authentication remain the recommended design.

Focused verification after authentication: both existing Lantern test files passed, **27 tests**. The QA source/test files matched canonical source after normalizing Windows line endings; raw byte hashes differed for line-ending reasons. This confirms mocked bridge, signature and header policy behavior, not a real Lantern wallet approval or native export. No asset transactions, deployment changes, GitHub writes or Lantern checkout edits occurred.

Latest update: October 9, 2026 (Asia/Manila). Kleym's mobile and sender navigation changes are deployed to the existing Railway Testnet host. Templates, Approvals and History are included in the exact-boundary embedding allowlist. Production header/bridge checks passed (14); deployed authenticated browser navigation passed (27). The public Lantern switch remains disabled pending a curated directory-enabled Lantern rebuild and device acceptance. Earlier October 8 implementation evidence below is historical. See [the navigation release report](reviews/2026-10-09/lantern-navigation-release/README.md).

## User journey

- Android browser: **Open in Lantern** hands the current public sender page to `com.lantern.wallet`, with the same public path as browser fallback (query parameters are removed). It is offered only when this deployment enables Lantern; installation detection is not assumed. Freighter phone pairing remains available outside Lantern, with an explicit reopen link and connection cancellation.
- Desktop: use Freighter normally, or open Kleym from Lantern's Apps directory once the extension build lists it. The Android app-opening link is absent on desktop. Lantern does not inject a browser extension provider into ordinary Kleym tabs.
- Inside Lantern: sign in to the existing Kleym sender account, create/manage campaigns, connect the wallet to populate the funding address, and review each funding/reclaim transaction in Lantern. No replacement wallet-login identity or organization authentication was added.
- Recipient pages already opened inside a trusted Lantern frame select **Connect Lantern**, not the Freighter phone control. Connection only selects an address; **Claim** is still a separate action. Private claim fragments are never copied into Android intents. Moving a private claim from Chrome into Lantern is not implemented by this sender-page launcher.

## Deployment switch and prerequisites

`LANTERN_ORIGINS` is empty by default. Enable only after the Lantern owner has added the exact Kleym deployment to the directory and the APK/extension builds have been tested:

```dotenv
LANTERN_ORIGINS=https://android.golantern.xyz
```

For desktop embedding append `chrome-extension://<verified-32-letter-installed-id>`. No wildcard, bare extension scheme, shared Capacitor localhost, alternate Android hostname/port or HTTP origin is accepted. The supplied extension manifest has no pinned `key`; do not guess its installed ID or assume it is stable after repackaging.

Only a validated public 32-character identifier reaches the client; invalid configuration is withheld. The public WalletConnect project identifier still uses `WALLETCONNECT_PROJECT_ID`, configured with the deployed web origin in Reown. Both wallet settings are passed from the server at runtime; no wallet seed, password, session token or sponsor secret is passed to the client. API and ledger network configuration remains authoritative. Testnet directory metadata does not constitute Mainnet readiness.

### Changes required in Lantern

Current packaged 0.6.2 lists Centient but not Kleym. Its Android handler refuses unknown directory origins. Typing Kleym in the generic URL bar uses the opaque sandbox and is insufficient for authenticated campaigns.

Add a curated entry to `src/core/miniapps/directory.ts` in Lantern:

```ts
{
  id: 'kleym',
  name: 'Kleym',
  tagline: 'Distribute USDC through claim links.',
  category: 'Payments',
  icon: 'link',
  url: 'https://kleym-testnet.up.railway.app/dashboard',
  session: true,
  verified: false,
  networks: ['TESTNET'],
},
```

This is the approved Kleym Testnet host; its Railway services are running. Confirm it is the intended deployment before building. Add only exact additional deployment origins, if needed. Regenerate Android directory-derived asset statements, then rebuild both packages using Lantern's own procedure. A proposed patch is saved in `reviews/2026-10-08/lantern-integration/lantern-directory.patch`; it has not been applied or published externally. Do not patch distributed minified bundles.

Kleym serves `/manifest.webmanifest` with Lantern as a related application. The Android intent is the same `intent://open?url=...#Intent;scheme=lantern;package=com.lantern.wallet;S.browser_fallback_url=...;end` route used by Centient.

## Bridge and settlement safeguards

`src/lib/wallet/lantern.ts` implements `lantern:getPublicKey` and correlated `lantern:signXdr`, using `event.source === window.parent`, exact configured origin and exact `id` on signing replies. One request runs at a time. Connect validates the public key and TESTNET/PUBLIC network. Signing renews the app grant before requesting approval, catches changed account/network, and uses **sign-only**, never `signAndSubmit`.

Returned XDR must preserve the reviewed transaction hash, contain a valid selected-account signature on the expected passphrase, and retain every existing sponsor/local signature. Existing Kleym APIs still validate preparation, signatures, replay and ledger settlement. No principal, fee, reserve, predicate, campaign renewal or submission contract was changed. Signed bytes are not silently rebuilt.

Signing acknowledgement times out after five seconds; review waits up to three minutes. Connection replies in 0.6.2 have no correlation ID. After a timeout the bridge requires reopening Kleym so a late idless reply cannot complete a different connection. Save the campaign's private export before reopening; unsaved phrases/keys cannot be recovered by Kleym. Rejections clean up listeners and permit retry. Arbitrary parent error text is not displayed or logged.

## Embedding and authentication

Only the public entry/login, sender, MFA and claim route families can be embedded by configured exact Lantern origins. Administrative pages and API documents retain `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Framed pages omit X-Frame-Options and use the exact CSP allowlist. Claim/invite no-referrer behavior and nonce-based script policy remain.

October 9 navigation correction: the sender route families include `/templates` (and template detail), `/approvals` and `/history`, covering all six navigation destinations. Exact route boundaries are enforced; similarly prefixed paths, administrative pages and API documents remain denied. The configuration stays disabled until the directory-enabled Lantern build is qualified. This change does not enable the missing private-link Android handoff.

When Lantern is enabled, sender sessions use `__Host-kleym_session; HttpOnly; Secure; SameSite=None; Partitioned; Path=/`, supporting Chromium's trusted in-app frame. Normal and Lantern partitions have separate login sessions; a browser login is not automatically imported into Lantern. Disabled deployments retain SameSite=Lax. Logout expires the matching cookie attributes and revokes the session row.

With this setting enabled, unsafe API requests with an Origin must match the configured **Kleym** origin, not the parent wallet. Originless cookie mutations/authentication requests are refused with RFC9457/correlation ID; non-browser token/worker calls without cookies retain their existing behavior. Organization membership, API tokens, MFA and fresh-auth checks remain in their existing handlers. HTTPS, actual partition-cookie persistence, SSO redirects and cross-frame passkey permission require deployment/device acceptance; they are not established by the mocked bridge test.

## Verification completed

- Production webpack build, TypeScript and changed-file ESLint passed.
- Full unit suite: 621 tests / 50 files passed. Three stale network-boundary fixtures initially failed because they omitted the existing durable preparation record. Fixtures now include it, plus an additional unprepared-envelope refusal assertion. No production submission guard was weakened.
- Three additional sender-phone routing/cancellation tests passed separately.
- Five production Chromium checks passed: desktop launcher absent; Android sender launcher present; trusted iframe hydrates and uses Lantern without signing/submitting on connect; actual embedding/no-referrer headers; cross-origin authentication refusal.
- Screenshots reviewed at Android width. Browser bridge and claim resolution were mocked; no external relay, actual Lantern key or ledger transaction was used.

Evidence: `reviews/2026-10-08/lantern-integration/`. Historical Centient QA packages remain separate and unchanged.

## Next acceptance run

After the directory-enabled Lantern build and an approved HTTPS Kleym Testnet deployment are available: test Chrome warm/cold launch and cancellation; login/partition persistence and logout; desktop exact extension origin; Android campaign local phrase generation, private CSV download and export gate; 3 links x 1 test USDC funding, desktop/mobile claim and unused-link reclaim; wallet rejection, retry, network/account switches and durable timeout recovery. Inspect exact ledger amounts, signer sets, temporary cleanup and persistent reserve obligations. Confirm Android WebView can save the private export before funding. No live or Mainnet readiness claim follows from these local tests.

## References

- [Centient Lantern integration](https://github.com/webnxt-2030/Centient/blob/main/docs/lantern-integration.md) and its `lib/stellar/lantern.ts`, `wallet-lantern.ts` (reference commit b7a3718d93595e10e99bfb10ace4b16a7a11b67e).
- [Lantern directory](https://github.com/kimerran/stellar-lantern/blob/develop/src/core/miniapps/directory.ts) (reference commit 68e87a4a55f5e753ebc5294afa6b418a0f1214eb), plus the supplied 0.6.2 extension's actual Apps bundle and manifest. This is reference source, not an edited Lantern checkout.
