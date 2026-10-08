# Kleym inside Lantern

October 8, 2026 (Asia/Manila). Local implementation in `codex/app-sending-pilot`. No public deployment, Railway restart, new wallet transaction or Lantern rebuild was performed.

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
  url: 'https://kleym-web-testnet.up.railway.app/dashboard',
  session: true,
  verified: false,
  networks: ['TESTNET'],
},
```

This is the previously approved Kleym Testnet host; its Railway services remain paused. Confirm it is the intended deployment before building. Add only exact additional deployment origins, if needed. Regenerate Android directory-derived asset statements, then rebuild both packages using Lantern's own procedure. A proposed patch is saved in `reviews/2026-10-08/lantern-integration/lantern-directory.patch`; it has not been applied or published externally. Do not patch distributed minified bundles.

Kleym serves `/manifest.webmanifest` with Lantern as a related application. The Android intent is the same `intent://open?url=...#Intent;scheme=lantern;package=com.lantern.wallet;S.browser_fallback_url=...;end` route used by Centient.

## Bridge and settlement safeguards

`src/lib/wallet/lantern.ts` implements `lantern:getPublicKey` and correlated `lantern:signXdr`, using `event.source === window.parent`, exact configured origin and exact `id` on signing replies. One request runs at a time. Connect validates the public key and TESTNET/PUBLIC network. Signing renews the app grant before requesting approval, catches changed account/network, and uses **sign-only**, never `signAndSubmit`.

Returned XDR must preserve the reviewed transaction hash, contain a valid selected-account signature on the expected passphrase, and retain every existing sponsor/local signature. Existing Kleym APIs still validate preparation, signatures, replay and ledger settlement. No principal, fee, reserve, predicate, campaign renewal or submission contract was changed. Signed bytes are not silently rebuilt.

Signing acknowledgement times out after five seconds; review waits up to three minutes. Connection replies in 0.6.2 have no correlation ID. After a timeout the bridge requires reopening Kleym so a late idless reply cannot complete a different connection. Save the campaign's private export before reopening; unsaved phrases/keys cannot be recovered by Kleym. Rejections clean up listeners and permit retry. Arbitrary parent error text is not displayed or logged.

## Embedding and authentication

Only the public entry/login, sender, MFA and claim route families can be embedded by configured exact Lantern origins. Administrative pages and API documents retain `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Framed pages omit X-Frame-Options and use the exact CSP allowlist. Claim/invite no-referrer behavior and nonce-based script policy remain.

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
