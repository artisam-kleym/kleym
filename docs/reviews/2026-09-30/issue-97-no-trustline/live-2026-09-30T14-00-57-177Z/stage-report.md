# Issue #97: account-only setup and funding verified; claim pending

## Latest stage: funding independently verified

The user completed actual sender Freighter funding. Independent raw Testnet reads at `2026-09-30T14:36:42.814Z` passed all nine checks for **a3b7f0d1d07c953597db3c2cf3c08da134103da67059c115e7e60dc977697005**, ledger **4951045**. Sponsor and sender signatures, transaction source/fee payer, sponsorship bracket, exact two official-USDC principal operations, generated balance IDs and mutually complementary expiry predicates were verified from the confirmed envelope and public balances.

Sender18->16USDC, literal native0, persistent sender sponsorship unchanged. Recipient remains native0, no trustline/subentries, and two sponsored account units with its original account sponsor. Lifecycle sponsor paid **400stroops / 0.0000400XLM**, sponsoring units0->4 and minimum reserve1->3XLM: **2XLM reserved**, not spent. The first1USDC balance is claimant-redeemable before `2026-09-30T15:33:40Z`; the other1USDC is sender-reclaimable from `2026-09-30T14:38:40Z`. The verifier uses the canonical ledger predicates, floored to whole seconds.

Proof: [independent funding verification](lifecycle/independent-funding-proof-2026-09-30T14-36-42-814Z.json), [original funding receipt](lifecycle/lifecycle-2026-09-30T14-09-40-137Z-3-fund-receipt.json), [funding verifier](../verify-funding.mjs). The earlier ready-recipient verifier is preserved; this mode-specific adaptation explicitly proves the USDC trustline is absent and sender sponsorship is unchanged. This is public accounting verification, not a production envelope change. Preserve this funding snapshot; later claim/reclaim will change account/balance states.

At `2026-09-30T14:37:52.638Z`, [claim readiness](lifecycle/claim-ready-2026-09-30T14-37-52-638Z.json) confirmed HTTP200, exact funded hash/recipient/mode, original public keys/balance IDs, no fatal state, no materialise/claim receipts, and unexpired claim window. Both operational sponsor PIDs9428/6868 remain alive; no process restart or agent ledger submission occurred.

**User next:** use the same tab/local keys, select the new recipient/Testnet, connect, deliberately begin TX1, wait for its confirmation and a later ledger, prepare/review TX2, sign in Freighter and submit. TX2 must include this recipient's signature for its new sponsored trustline. Stop after claim and return with the public receipt before reclaim. Conservative user deadline:11:33PM Manila today. Actual TX1/TX2 claim and reclaim remain pending; no-trustline lifecycle and issue#97 are incomplete. The historical funding-pending section below is superseded by this result.

## Confirmed setup

The user approved the recipient setup in Freighter. Independent raw Testnet reads at `2026-09-30T14:08:31.567Z` passed all nine setup assertions for transaction **c383fdd719e141f4f2ad12abb4a85ec4f68618595eb8ad8700236ae1b1f800cf**, ledger **4950698**. The exact three-operation body and two sponsor/recipient signatures were verified cryptographically against the confirmed envelope. The sponsor is the transaction source and fee payer.

Recipient **GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I** now exists with **0.0000000 XLM**, no trustline, zero subentries, and **two sponsored account reserve units**. Sponsor **GAUKFGMOCJ6CW6MTQZZHRTKH6F2EAYHLJUZ6YWWKO3WHURVX35AHAGIX** paid exactly **300 stroops / 0.0000300 XLM**. Its sponsoring count rose0->2 and minimum reserve rose1->2XLM; the extra1XLM is reserved, not spent. Sender **GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A** remains **18 official test USDC / zero XLM**, with account/signers/thresholds/balances/sponsorship state unchanged from the preflight.

Public proof: [independent setup verification](independent-bootstrap-proof-2026-09-30T14-08-31-567Z.json), [original receipt](bootstrap-receipt-2026-09-30T14-01-36-569Z.json), [original attempt](bootstrap-attempt-2026-09-30T14-01-36-569Z.json). [Verifier](../verify-bootstrap.mjs) compares the historical preflight with the current setup stage; later funding/claim will change these snapshots, so do not rerun it expecting the setup balances to persist.

## Current runtime and funding step

Account sponsor process **PID9428** stays alive at `http://127.0.0.1:3217/`; its memory-only key backs two persistent recipient account units. The separate lifecycle process **PID6868** is now ready at **http://127.0.0.1:3218/**, mode **existing-no-trustline**, with sponsor **GBDHTO6Y7WGHJVOKDDKIEDG2H2EFKCGL5GOEIL5GDESX4PWR2OA2VUIL**. Both process identities were checked after launch.

The lifecycle [readiness result](lifecycle/ready.json) at `2026-09-30T14:10:45.728Z` verifies HTTP200, exact recipient/mode, empty link keys/balances/receipts, no fatal state, browser rendering at1280px/390px, no overflow/errors/POST, and funding gated on saved local keys. No agent Friendbot call, link-key generation, wallet signature or funding submission occurred. [Desktop](lifecycle/ready-desktop.png), [mobile](lifecycle/ready-mobile.png).

The user was asked to select Kleym Sender/Testnet, connect, generate fresh browser-local keys, privately save this session's CSV, review/sign/submit exactly **2 USDC**, then return with the public funding receipt before recipient claim. Expected funding sender18->16USDC; recipient still0XLM/noUSDCtrustline; lifecycle sponsor adds four temporary claimable-balance reserve units. Actual funding is **pending**.

After independent funding verification, the claim requires the new recipient's actual Freighter TX2 signature to create its sponsored official USDC trustline. Its original account sponsor remains separate from the lifecycle trustline sponsor. Expected later claim recipient0->1USDC with no XLM top-up; expected expiry reclaim sender16->17USDC. Verify temporary cleanup separately from the two persistent account units and one persistent trustline unit. Resolve original recorded hashes before replacing attempted work or restarting either process.

Issue #97 remains open; the no-trustline lifecycle is not yet complete. PR#118 remains draft with an unresolved startup failure; user error text is still pending. These are local public artifacts; no new push, production deployment or public-network transfer occurred.
