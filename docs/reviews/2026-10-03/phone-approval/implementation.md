# Desktop connection routing and phone approval hand-off

Date:2026-10-03. Active checkout `codex/app-sending-pilot`, base4163d79 plus preserved local work. Previous phone-launch evidence is historical and retained.

## Request and scope

User requests removal of desktop's phone connection choice and asks whether Claim can occur inside the installed Freighter app. User reports Kleym opens Android Freighter, connection approval succeeds, and returning to Chrome shows Claim. Device remains Android/Freighter v1.25.28 (1788217824); this report does not turn connection approval into proof of payment.

The supported native interface has connection and transaction request events, not a remotely injected Kleym Claim screen. Official [v1.25.28 event manager](https://github.com/stellar/freighter-mobile/blob/v1.25.28/src/hooks/useWalletKitEventsManager.ts) routes session requests to the wallet, decodes pairing queries and ignores a native reopening URL with no URI parameter. [Signing docs](https://github.com/stellar/freighter-developer-docs/blob/main/mobile/signing.md) define signXDR returning signed bytes; submission stays with Kleym. A recipient with an existing correct trustline needs no signature; adding an unnecessary signature would violate existing Stellar transaction rules. The request to insert a custom Claim UI in the existing wallet cannot be implemented through these supported APIs.

## Changes

- Desktop has only extension connection, including after connection and at a narrow viewport. Mobile keeps only the phone connection entry.
- Connected phone shows explicit unclaimed status, destination review and separate Claim action. Connection neither prepares nor submits a claim automatically.
- Required mobile signing registers an attempt-scoped `session_request_sent` observer with the installed SignClient2.23.0. It checks active session identity/validity, exact topic/chain/method/XDR; unrelated events cannot open the wallet. The first matching publish event sets pending approval UI and tries `freighterwallet://wc-redirect` with no query/fragment. It never re-pairs or sends the private URL/link key. One launch per exact request; listener removed on success/rejection.
- Pending approval offers Open Freighter to approve and return-to-tab guidance. Tapping it reopens the app only, without another claim or signing request. Pending UI clears when signing resolves/rejects.
- Existing selected destination, network/account/session validation, returned body/signer/sponsor signature verification, claim-key privacy and exact-hash submission remain. No new schema/API/dependency/worker configuration.

## Verification and release

54 checks passed across phone URI/device routing, mobile session/signature/request-sent boundary, desktop signing and rendered claim screens. TypeScript and targeted ESLint passed. Windows webpack build passed with existing Next/BullMQ warnings. Exact immutable v4 candidate has370 files, digest `a79f36e9189265e924989b9d7370077830e17eb66aff8f2443d7ce7d6718d0cd`; five app source files differ from v3, none removed. Disposable network-disabled Linux build passed after369 context files matched the manifest, using qualified v2 dependencies (package/lockfile unchanged).

Initial local browser run could not connect: PowerShell Start-Process failed on duplicate Path/PATH inherited environment keys. It was interrupted; a hidden Node spawn started the same production preview and HTTP health200 was confirmed before rerunning. This was a harness failure, not passing browser evidence.

All20 production Chromium claim checks passed after preview recovery. Web deployment `197465e3-afaf-4e54-9eb4-28316963f324` SUCCESS. Public two-test mobile/desktop fixture smoke and readiness/privacy probe passed at15:58UTC. Only the five client source files differ from v3; backend/worker/schema/dependencies remain byte-identical and the worker was not redeployed. [Verification](verification.json) and [manifest](release-manifest.json) retain the release identity. Physical signing-time reopening and approval/decline still need an actual phone test. No agent ledger write or Mainnet qualification.

## Updated actual accounting

The earlier preflight is historical. Read-only public ledger/campaign checks discovered that the user already reclaimed the old two balances: `3c2a5e9f4cced936ebe5714ac8946a9ddafcb32de2a2137db7ce0f70467589e9`, ledger5003587, sponsor200stroops, sender/sponsor signatures verified. The user then funded3x1USDC in a new campaign `cmusjy67f00020dp4imc8q054`: `b41d0e63d16c13ed1b895f495a23ff0464085d659b5d25b250da2e79e6b0bdf0`, ledger5003613, sponsor500stroops and exact official asset/sender debit/signatures verified. This records observed new funding, not an assertion that it was a two-link renewal.

Two exact1USDC claim payments confirmed with sponsor400stroops each and cleanup merges: `0616c193a2f4c76c89b4b8cb24951a79015e6ab33a14b0e2a1e0463aa69f006d` to GAI3...LDHWW (now4USDC/0XLM), and `08b0d23b3e1517d35e95738875723c9096a1757a76f3d5cc27d80c7c9ada55a1` to GCUF...KSXGH3I (now3USDC/0XLM). Both have existing correct sponsored trustlines and four-operation claim transactions; no recipient changeTrust/recipient signature is required. A public payment address does not independently prove which device performed the claim. User reports physical connection, but the new signing hand-off remains untested on hardware.

One1USDC balance remains, ID `00000000994080e58ae9a9e6e4445f9e05444f39a60e301b035c229bb949f027005f6f74`, expired15:50UTC/23:50Manila. Sender11USDC/0XLM. Next: reclaim this campaign's **one** remaining USDC, expected sender12USDC with recipients unchanged, then verify public receipt. Do not repeat the earlier refund or the two successful payments. New hand-off testing requires a future expiry and a recipient needing a signature; an already-trusting recipient will not show that prompt. [Current accounting](current-accounting.json) was checked15:58UTC without asset writes; only isolated operator login/session writes occurred.
