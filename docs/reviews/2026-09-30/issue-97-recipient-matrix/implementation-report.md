# Issue #97: existing recipient lifecycle proof

**Completed:** 2026-09-30; final independent verification at `2026-09-30T02:40:38.976Z`.

**Source:** `codex/97-recipient-matrix`, implementation commit `7407286`, based on merged `origin/develop` at `80e16ff`. Review: [draft PR #118](https://github.com/webnxt-2030/kleym/pull/118).

**Network:** Stellar Testnet, `Test SDF Network ; September 2015`.

**Asset:** `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`.

## Result and accounting

The user completed funding and expiry reclaim with Freighter in Brave. For the existing recipient with an official USDC trustline, claim approval correctly required no recipient wallet signature: the confirmed claim envelopes contain only sponsor and locally held ephemeral signatures. Independent Horizon reads verified the exact confirmed envelopes, signature sets, operation sources, ledger ordering, amounts, expiry predicate and cleanup. Funding passed nine independent assertions, claim passed twelve, and reclaim passed twelve. This completes this recipient case; issue #97 remains open for its broader matrix.

| Stage | Confirmed hash | Ledger | Actual fee (stroops) |
| --- | --- | --- | --- |
| Fund two one-USDC balances | `4219edf4457d049ddba0d46eecc20010671c4157a797e1625a8bcbf048eb9931` | 4941970 | 400 |
| Materialise temporary account, TX1 | `d8fd4787b0d53db5baab360032d3ca01541d969e6c5aca2d3786f1c44f74045b` | 4942105 | 600 |
| Claim and cleanup, TX2 | `fd62f8a04558b168a19d617b37d403697ad2d870e62adc754522176337d7f76d` | 4942119 | 400 |
| Expiry reclaim | `3ffe30a060d5f09641cce3ba680bd3bb7d5a239fe3f16eac17e5a0741ff16625` | 4942388 | 100 |

Sender: `GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A`. USDC **19 -> 17 -> 18**; native balance remains **0.0000000**. Recipient: `GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW`. USDC **1 -> 2**; native balance remains **0.0000000**. Combined principal remains **20 USDC**. Existing sender and recipient account/trustline sponsorship is preserved, with three sponsored units each.

Lifecycle sponsor: `GDX6LUUM4XP5SS4L2OM6MZKPV6YXNJEOGEQ6GDAIXK4A5ZMQDK5IDPOB`. Its reserve units went **0 -> 4 -> 7 -> 2 -> 0**. Claim released five units / 2.5 XLM; reclaim released the final two units / 1 XLM. No new recipient reserve was needed. Final sponsor native balance is **9999.9998500 XLM**, minimum reserve **1 XLM**, and sponsoring count **zero**. Its exact lifecycle fee debit is **1,500 stroops / 0.0001500 XLM**.

Reclaim ledger closed at `2026-09-30T02:32:07Z`, after the funded sender predicate became valid at `2026-09-30T02:02:42Z`. The confirmed reclaim has exactly one sender-sourced claim operation and cryptographically verified sponsor/sender signatures. Both original claimable balances and the temporary account return HTTP 404. No temporary reserve obligation remains with this lifecycle sponsor. Persistent sender/recipient reserves remain with their original sponsors.

## Public evidence

- [Independent funding proof](independent-funding-proof-2026-09-30T02-01-11-609Z.json), saved before claim changed balances.
- [Independent TX1/TX2 claim proof](independent-claim-proof-2026-09-30T02-14-01-954Z.json), saved before reclaim changed balances.
- [Independent final reclaim proof](independent-reclaim-proof-2026-09-30T02-40-38-976Z.json), including all four confirmed transaction records, reclaim ledger/operations/effects and final account/entry states.
- Original timestamped `lifecycle-2026-09-30T00-49-21-101Z-*` attempts and receipts, retained unchanged.
- [Funding verifier](verify-funding.mjs), [claim verifier](verify-claim.mjs), [reclaim verifier](verify-reclaim.mjs). These scripts verify the recorded stage; earlier stage snapshots are historical and should not be rerun expecting unchanged current balances.

Evidence excludes private link keys, wallet recovery material and the user's local CSV. The sponsor key remains in process memory; it is absent from these artifacts. The initial reclaim verifier assumed a plain-object predicate and failed before producing a proof; SDK predicates are XDR unions. It was corrected to inspect the decoded union and exact absolute expiry before the successful independent verification above.

## Implementation and checks

The interactive Testnet spike accepts `absent`, `existing-no-trustline` and `existing-trustline` modes and rejects mismatched ledger state or spendable XLM. TX2 recipient-signature requirements and new reserve units derive from its actual operations. An existing recipient without the trustline requires its wallet signature and one sponsored trustline unit; an absent recipient retains the three-unit account/trustline path. Those two operation shapes are covered by focused tests; today's live proof covers only the existing-trustline mode. Production funding/claim/reclaim behavior is unchanged.

| Check | Result |
| --- | --- |
| Focused lifecycle and claim Vitest | 40 tests / 2 files passed after the final implementation edit |
| TypeScript `tsc --noEmit` | Passed |
| ESLint on changed TypeScript | Passed |
| Chromium at 1280px and 390px | Passed: mode/addresses correct, no horizontal overflow or browser errors |
| Browser before user action | No POST; funding gated on privately saved keys |
| Actual wallet/ledger lifecycle | Passed, with independent public verification at each settlement stage |
| Hosted CI for implementation commit `7407286` | `startup_failure` before jobs ran; no passing hosted result established |

Initial browser artifacts: [browser-result.json](browser-result.json), [desktop](desktop.png), [mobile](mobile.png). Public preflight: [preflight.json](preflight.json). Historical failed startup runs: [PR event](https://github.com/webnxt-2030/kleym/actions/runs/36653249733), [push event](https://github.com/webnxt-2030/kleym/actions/runs/36653194181). No job logs were available; the cause is not established. Keep PR #118 draft until current checks and review are resolved.

## Session and remaining work

The completed session runs at `http://127.0.0.1:3218/`, Windows PID `25952`, started at `2026-09-30T00:49:20Z`. The first unfunded session was stopped before links, attempts or receipts existed; its historical launch record is preserved. All transactions in the current session are resolved. The browser tab can be closed after retaining the private CSV. Check saved attempts, `/state` and ledger state before starting a different case.

1. Prepare an existing recipient without the USDC trustline and without spendable XLM; prove its actual Freighter-signed sponsored trustline and claim.
2. Prove the nonzero-native/reserve-only sender case, ledger expiry-boundary refusals, duplicate/retry/cancel/recovery and native XLM regressions.
3. Complete supported-wallet evidence and the written funding envelope decision after the matrix passes. The issue's aggregate criteria stay unchecked until their remaining cases pass. No production deployment or public-network asset movement occurred.
