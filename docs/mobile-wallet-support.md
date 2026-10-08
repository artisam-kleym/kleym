# Desktop, Android and Lantern support

Checked October 9, 2026 (Asia/Manila). Public deployment: https://kleym-web-testnet.up.railway.app. Mainnet remains unavailable.

| Journey | Implementation | Evidence / remaining gate |
| --- | --- | --- |
| Desktop campaign and claim | Freighter extension; manual funding-address balance lookup remains | Owner-funded 3 × 1 official Testnet USDC campaign and desktop claim independently verified on October9 |
| Android Chrome campaign setup | Responsive wizard, labels/custom amounts, expiry, browser key generation and CSV download; funding address may be typed | Public Android browser emulation reached Review with3links; physical Android export/download and funding approval still require execution |
| Android Chrome campaign signing | `connectWallet` routes phones to Freighter Mobile pairing; signing reopens the app and verifies the selected account/network | Routing/cancellation unit and browser fixture coverage; current physical Android sender flow is not qualified |
| Android Chrome recipient | Connect Freighter on phone; automatic app launch plus an explicit Open Freighter retry; separate deliberate Claim | Physical Android Chrome + Freighter v1.26.29 claim passed October9: official Testnet USDC3→4, native0; independent ledger proof in `docs/reviews/2026-10-09/mobile-release/phone-claim-ledger-verified.json` |
| Kleym inside Lantern | Exact-origin bridge selects Connect Lantern and uses sign-only requests for campaign/claim/reclaim | Implementation and mocked bridge proof; requires a directory-enabled Lantern build, deployment origin configuration and hardware acceptance |
| Chrome private claim → Open Lantern | Not implemented | Current0.6.2 refuses the unlisted Kleym origin; sender launcher deliberately excludes claim URLs/fragments |
| Recipient types an ordinary wallet address | No general address-only recipient fallback | Existing address-and-memo exchange deposit is separate, requires campaign permission, and cannot sign for missing account/trustline setup |

## Freighter phone journey

Open the public website in Android Chrome and sign in to create/manage campaigns. Keep the manual funding-address field as a balance-check fallback; entering an address is not authority to spend its balance. At signing, select the matching sender account and Testnet in Freighter Mobile. Save the campaign CSV and recovery phrase privately before signing; do not refresh or close the tab while unsaved keys or an approval are pending.

For recipients: open only their own private URL, tap **Connect Freighter on phone**, approve wallet access, return to Chrome, check the destination and tap **Claim**. Connection is not a claim. If the transaction requires the recipient's signature, Freighter opens for approval and Kleym resumes in the original Chrome tab. An existing trusted recipient may require no recipient signature, so an additional wallet approval is not always expected.

Only the WalletConnect pairing URI is sent to Freighter's app-opening route, never a private claim URL or secret. The collapsed copy/scanner path is a recovery option when app launch fails, not the normal path.

Campaign signing requires both a browser download and the creator's confirmation that the CSV is saved on their device. A download click cannot prove that Android saved the file. A signing request that stalls for two minutes fails safely and requires reconnection; a late approval cannot resume the expired attempt.

## Lantern release dependency

`LANTERN_ORIGINS` is empty on the public deployment. A sender-page Open in Lantern launcher is implemented but withheld while the integration is disabled. The packaged Lantern0.6.2 includes Centient, not curated Kleym; typing the URL into its generic browser does not qualify the trusted wallet bridge or authenticated campaigns.

The Lantern maintainer must add the exact Kleym Testnet directory entry and rebuild the packages. Then enable only the verified Android/extension origins and test sender login, CSV saving, sign-only funding, claim/reclaim, rejection and account/network changes. See [Lantern integration](lantern-integration.md) and the existing proposed directory patch.

A private claim handoff needs a separately reviewed wallet-side design that preserves the bearer secret locally. The sender launcher must not be repurposed by passing a complete private claim link through an Android intent. Do not display a working Open Lantern claim button until that transport and its recipient signature flow are supported and tested.

No physical-wallet or Mainnet readiness claim follows from browser emulation, Node signatures or mocked bridge replies.
