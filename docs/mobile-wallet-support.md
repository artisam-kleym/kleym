# Desktop, Android and Lantern support

Updated October 12, 2026 (Asia/Manila). Current public deployment: **https://kleym-testnet.up.railway.app**, inside the senior developer's shared Railway project. Mainnet remains unavailable. Earlier October 9 deployment addresses and receipts below are historical.

October13 local preparation now names each actual wallet in creator/recipient controls, prioritizes Lantern within its frame, blocks the Android launcher during campaign Review, withholds it for extension-only origins and retires interrupted Lantern approvals. Embedded Review explains the required file-save confirmation. These changes have passed801units/73files, types/lint/build, seven component browser journeys and fourteen production policy checks, but are not deployed. Manual balance lookup remains; ordinary-address recipient claiming and private-link app handoff remain unfinished. See [the dated integration evidence](lantern-integration.md#october-13-local-preparation-completed).

## Wallet priority agreed October 12

The target experience is Lantern first (Android APK and desktop Chrome extension), Freighter second, with manual public-address entry retained. This is a product target, not a claim that every transport is currently available.

- Inside an enabled, trusted Lantern Apps frame, existing connect/sign routing already selects Lantern. The ordinary desktop website currently uses Freighter's extension; Lantern's Apps frame is not an injected provider for arbitrary Chrome tabs. Desktop Lantern launch instructions and explicit alternative-wallet choices need to reflect that boundary.
- On Android outside Lantern, the configured sender launcher can open a public page in Lantern. Freighter Mobile stays available. Unsaved campaign keys must not be discarded by switching applications; choose the environment before generating the private export.
- Typed funding addresses remain available for balance lookup and campaign setup. Funding/reclaim still require the matching owner's signature from Lantern or Freighter; an address alone cannot authorize spending.
- General typed recipient-address claiming is not implemented. The existing campaign-gated exchange address/memo flow is separate. A future ordinary-address fallback must check the ledger account, exact asset trustline, authorization, capacity, destination confirmation and campaign policy. Where account/trustline setup needs the recipient signature, require a connected wallet; never promise arbitrary-address receipt without that prerequisite.
- Do not silently switch wallets after a rejected or timed-out approval. Clear or reconcile pending state, explain the result and let the user deliberately select the next wallet.

Before complete integration acceptance: finish explicit wallet-choice UX and the desired ordinary-address recipient policy; agree secure private-link delivery with the Lantern maintainer; obtain directory-enabled builds with scoped CSV download permission; then verify Android file saving, embedded login/navigation and funding/claim/reclaim plus rejection, timeout and account/network changes. These concrete requirements can be sent to the maintainer now; full qualification needs their rebuilt APK/extension. See [the source comparison and export proof](lantern-integration.md).

## October 12 creator acceptance

Manual funding-address entry passed on the actual hosted wizard at 320/393/1440px, with real Testnet balance reads and a correct three-link Review. The owner also connected sender GBV6…OQQY5A in Android Chrome through Freighter v1.26.29, privately saved the CSV, and approved a three-link × one-official-Testnet-USDC campaign. Funding `c77fec9f34d20866752fe2d20f5c88d4148a17691911c74f8d0257701b073f5a`, ledger5158585, exact operations and sender/sponsor signatures independently verified; sender9→6USDC, native remains0; sponsor paid500stroops. Device context and saved-file confirmation are owner reported, not inferred from the ledger.

The owner observed an in-progress idempotency error after the successful payment. The deployed fix reconciles that response or a lost response through read-only batch status, requiring the exact signed-transaction hash; it does not submit again. A synchronous guard blocks overlapping Sign actions. Nine negative/recovery unit cases and before/after/live production-browser simulations passed: one wallet request, one POST, three status reads, no stale red error. Full suite797 tests/72files, strict types, focused lint and production builds pass. Campaign details now show the full Campaign ID and paginated funding hashes; Admin Campaigns shows the ID and latest funding hash. Seven live display/auth checks passed at phone and desktop widths.

Manual address entry still only checks balance; the matching owner must sign, on desktop or phone. This one Android creator run does not qualify all mobile browsers, cancellations/background states, new-recipient signing, Lantern or Mainnet. Evidence: `D:/kleym/docs/reviews/2026-10-12/senior-railway-migration/`.

| Journey | Implementation | Evidence / remaining gate |
| --- | --- | --- |
| Desktop campaign and claim | Freighter extension; manual funding-address balance lookup remains | Owner-funded 3 × 1 official Testnet USDC campaign and desktop claim independently verified on October9 |
| Android Chrome campaign setup | Responsive wizard, labels/custom amounts, expiry, browser key generation and CSV download; funding address may be typed | Hosted manual lookup/Review passed at phone widths; owner reported privately saved phone CSV in the October12 physical Freighter creator run. Lantern WebView export is still unverified |
| Android Chrome campaign signing | `connectWallet` routes phones to Freighter Mobile pairing; signing reopens the app and verifies the selected account/network | October12 physical Android Chrome/Freighter1.26.29 funded3links, with independent official-USDC ledger proof. Broader rejection/background/device coverage and actual Lantern signing remain unqualified |
| Android Chrome recipient | Connect Freighter on phone; automatic app launch plus an explicit Open Freighter retry; separate deliberate Claim | Physical Android Chrome + Freighter v1.26.29 claim passed October9: official Testnet USDC3→4, native0; independent ledger proof in `docs/reviews/2026-10-09/mobile-release/phone-claim-ledger-verified.json` |
| Kleym inside Lantern | Exact-origin bridge selects Connect Lantern and uses sign-only requests for campaign/claim/reclaim | Implementation and mocked bridge proof; requires a directory-enabled Lantern build, deployment origin configuration and hardware acceptance |
| Chrome private claim → Open Lantern | Not implemented | Current0.6.2 refuses the unlisted Kleym origin; sender launcher deliberately excludes claim URLs/fragments |
| Recipient types an ordinary wallet address | No general address-only recipient fallback | Existing address-and-memo exchange deposit is separate, requires campaign permission, and cannot sign for missing account/trustline setup |

## Freighter phone journey

Open the public website in Android Chrome and sign in to create/manage campaigns. Keep the manual funding-address field as a balance-check fallback; entering an address is not authority to spend its balance. At signing, select the matching sender account and Testnet in Freighter Mobile. Save the campaign CSV and recovery phrase privately before signing; do not refresh or close the tab while unsaved keys or an approval are pending.

For recipients: open only their own private URL, tap **Connect Freighter on phone**, approve wallet access, return to Chrome, check the destination and tap **Claim**. Connection is not a claim. If the transaction requires the recipient's signature, Freighter opens for approval and Kleym resumes in the original Chrome tab. An existing trusted recipient may require no recipient signature, so an additional wallet approval is not always expected.

Only the WalletConnect pairing URI is sent to Freighter's app-opening route, never a private claim URL or secret. The collapsed copy/scanner path is a recovery option when app launch fails, not the normal path.

Campaign signing requires both a browser download and the creator's confirmation that the CSV is saved on their device. A download click cannot prove that Android saved the file. A signing request that stalls for two minutes fails safely and requires reconnection; a late approval cannot resume the expired attempt.

### Deployed mobile fixes (October 9)

The sender UI now uses a top header menu below desktop width. Settings fields use explicit container widths because the custom spacing tokens otherwise make Tailwind's named width classes collapse. Phone inputs have 16px text and a 44px minimum height; form rows stack on narrow screens.

Campaign signing and reclaim reuse a validated existing phone session instead of pairing again unnecessarily. The Freighter app link opens in a separate browsing context, preserving the original Review tab's in-memory keys and unsaved-work guard. If Chrome blocks the automatic opening, use the visible Open Freighter link, then return to the original tab. Local browser and mocked wallet tests cover this behavior; actual Android campaign funding still needs a hardware retest before qualification. The deployed site passed 27 authenticated browser checks, including all six destinations at 320, 393, 768 and 1440px and the three-link Review summary; this is browser emulation, not a physical phone approval.

Expiry makes unclaimed funds **available to reclaim**; it does not submit a refund. The owner must approve Reclaim in their wallet. The open campaign view updates at the deadline without a reload, and the worker's expiry sweep runs every minute while the worker is online. This is not an exact-time refund guarantee. A stopped Railway worker cannot run the sweep or notifications; the ledger's expiry predicate still applies.

Expiry timestamps now render a stable UTC server snapshot before switching to the browser's local timezone, avoiding a cloud-UTC/phone-timezone hydration mismatch. The retained three-link retest campaign has two successful claims and one confirmed 1-USDC reclaim; see [the release evidence](reviews/2026-10-09/lantern-navigation-release/README.md).

## Lantern release dependency

`LANTERN_ORIGINS` is empty on the public deployment. A sender-page Open in Lantern launcher is implemented but withheld while the integration is disabled. The packaged Lantern0.6.2 includes Centient, not curated Kleym; typing the URL into its generic browser does not qualify the trusted wallet bridge or authenticated campaigns.

The Lantern maintainer must add the exact Kleym Testnet directory entry and rebuild the packages. Then enable only the verified Android/extension origins and test sender login, CSV saving, sign-only funding, claim/reclaim, rejection and account/network changes. See [Lantern integration](lantern-integration.md) and the existing proposed directory patch.

A private claim handoff needs a separately reviewed wallet-side design that preserves the bearer secret locally. The sender launcher must not be repurposed by passing a complete private claim link through an Android intent. Do not display a working Open Lantern claim button until that transport and its recipient signature flow are supported and tested.

No physical-wallet or Mainnet readiness claim follows from browser emulation, Node signatures or mocked bridge replies.
