# Issue #97: no-trustline recipient lifecycle independently passed

## Completed lifecycle - 2026-09-30T15:04:55Z

The user completed sender Freighter expiry reclaim. Independent Testnet verification at `2026-09-30T15:04:55.443Z` passed **13 final assertions** for **4d6e291951ba1c91ef98957487c2c8255e703e55fa3068a493a3ee61e69168e8**, ledger **4951366**, closed `2026-09-30T15:00:17Z`, after the original sender predicate became valid at14:38:40Z. Exact sponsor/sender signatures and the sole sender-sourced reclaim operation were verified from the confirmed body. The original funding operation, principal owner, balance ID and predicate were independently decoded too.

| Stage | Transaction hash | Ledger | Charged fee (stroops) |
| --- | --- | --- | --- |
| Recipient account-only setup | c383fdd719e141f4f2ad12abb4a85ec4f68618595eb8ad8700236ae1b1f800cf | 4950698 | 300 |
| Fund two1USDC balances | a3b7f0d1d07c953597db3c2cf3c08da134103da67059c115e7e60dc977697005 | 4951045 | 400 |
| Materialise TX1 | e91852b85a8939d2f317ed6800b1a277e74b1db916ea4635c6e492bd39ab9284 | 4951278 | 600 |
| Recipient claim TX2 | 400b8848574356aa5c4a33c0240760c8f631e8137b6c3b17743b0c65377d8fde | 4951288 | 700 |
| Expiry reclaim | 4d6e291951ba1c91ef98957487c2c8255e703e55fa3068a493a3ee61e69168e8 | 4951366 | 100 |

**Final principal:** sender18->16->17officialUSDC; new recipient0->1USDC; combined18USDC conserved for this case. Both user accounts stay native0 and have zero minimum/spendable native reserve. The earlier recipient's2USDC belongs to a separate historical case and is outside this two-account total.

**Fees:** lifecycle400+600+700+100=**1800stroops /0.0001800XLM**, exactly deducted from lifecycle sponsor. Recipient setup separately300stroops /0.0000300XLM from its account sponsor; combined setup plus lifecycle2100stroops /0.0002100XLM. Actual required wallet signatures were obtained through Freighter; recipient signature is present only where its operations require it.

**Reserves and cleanup:** lifecycle sponsor units **0->4->7->3->1**. Reclaim releases the final two claimable-balance units/1XLM. Both original balances and the ephemeral account now return404; the ephemeral trustline was removed before merge. One persistent recipient trustline unit/0.5XLM remains with lifecycle sponsor, whose final native balance is9999.9998200XLM, minimum1.5XLM, spendable9998.4998200XLM. The separate account sponsor retains the recipient's two account units/1XLM, native9999.9999700XLM and minimum2XLM. Persistent reserves are retained obligations, not temporary cleanup failures.

Final proof: [independent reclaim verification](lifecycle/independent-reclaim-proof-2026-09-30T15-04-55-443Z.json), [original reclaim receipt](lifecycle/lifecycle-2026-09-30T14-09-40-137Z-9-reclaim-receipt.json), [mode-specific reclaim verifier](../verify-reclaim.mjs). All original attempts/receipts and earlier9setup/9funding/13claim proofs remain unchanged; no private CSV or spending secret is stored. The earlier ready-recipient verification scripts are preserved separately. Do not rerun historical stage snapshots against the final changed balances.

This completes the **existing zero-XLM recipient without a USDC trustline** case. Together with [the already verified existing-trustline case](../../issue-97-recipient-matrix/implementation-report.md), the issue's combined existing-recipient acceptance condition is proven. The broader #97 remains open for the nonzero-native/reserve-only sender case, expiry-boundary/duplicate/retry/cancel/recovery/native-XLM regressions and final supported-wallet/envelope decision. Production envelopes and treasury signing/refill services are unchanged; PR#118 remains draft with CI startup reason unresolved. No agent ledger submission or new push occurred.

All attempted transactions in this session are resolved. The completed browser tab can be closed after privately retaining its CSV. Keep backend **PID9428** account sponsor and **PID6868** lifecycle sponsor available for their persistent obligations; their signing keys remain process-only. Historical pending-stage instructions below are superseded by this completion.

## Latest stage: recipient claim independently verified

The user completed the full claim, including its actual recipient Freighter signature. Independent raw Testnet reads at `2026-09-30T14:58:47.051Z` passed **13 assertions** for TX1 **e91852b85a8939d2f317ed6800b1a277e74b1db916ea4635c6e492bd39ab9284**, ledger **4951278**, and TX2 **400b8848574356aa5c4a33c0240760c8f631e8137b6c3b17743b0c65377d8fde**, strictly later ledger **4951288**. TX1 has exactly sponsor/ephemeral signatures; TX2 exactly sponsor/ephemeral/recipient signatures. The seven TX2 operations claim, sponsor/create/end the recipient trustline, pay exactly1officialUSDC, remove the ephemeral trustline, and merge the ephemeral account. Their exact sources, destinations, asset, amount and order were verified from the confirmed envelopes.

Recipient **0->1USDC**, native **0.0000000**, minimum reserve0, account sponsor unchanged, new official-USDC trustline sponsored by the lifecycle sponsor, sponsored units **2->3**. Sender remains **16USDC /zeroXLM** with original sponsorship. Ephemeral account and claimed balance return404. The account sponsor independently retains exactly2units and its post-bootstrap native balance9999.9999700XLM.

TX1 fee600stroops; TX2 fee700stroops. Exact lifecycle sponsor fee debit so far is **1700stroops /0.0001700XLM**, including funding400. Sponsoring units **4->7->3**: five temporary units released at claim, one persistent recipient trustline unit added, net four units released /2XLM freed. Of the three remaining units, two back the unclaimed1USDC balance and one backs the new recipient trustline. The latter is retained after reclaim and is not a temporary reserve leak. The recipient's original two account units remain with its separate account sponsor.

Proof: [independent TX1/TX2 claim verification](lifecycle/independent-claim-proof-2026-09-30T14-58-47-051Z.json), [original TX1 receipt](lifecycle/lifecycle-2026-09-30T14-09-40-137Z-5-materialise-receipt.json), [original TX2 receipt](lifecycle/lifecycle-2026-09-30T14-09-40-137Z-7-claim-receipt.json), [mode-specific claim verifier](../verify-claim.mjs). Earlier ready-recipient script/evidence is unchanged. This proof is a historical stage snapshot; reclaim will change sender/sponsor values.

The remaining balance is independently verified expired, exact1officialUSDC, sponsor-owned reserves, and reclaimable only by the sender under its now-valid predicate. [Reclaim readiness](lifecycle/reclaim-ready-2026-09-30T14-59-52-820Z.json) confirms HTTP200, exact confirmed claim/no fatal state, no reclaim receipt, expiry passed and both operational processes available. User prompted to stay in the same tab, select Sender/Testnet, connect, prepare/review/sign/submit the single-operation1USDC reclaim and return with its public receipt. Expected final sender17USDC/zeroXLM, recipient1USDC/zeroXLM, lifecycle sponsor1persistent trustline unit/minimum1.5XLM, separate account sponsor2units. Actual reclaim is **pending**; #97 remains open and PR#118 draft. No agent submission, restart, new push or production transfer occurred. Historical claim-pending instructions below are superseded.

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
