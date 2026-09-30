# Issue #97: account-only setup verified; funding pending

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
