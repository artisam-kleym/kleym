# Issue #97: existing recipient proof preparation

**Date:** 2026-09-30 UTC

**Source:** `codex/97-recipient-matrix`, based on merged `origin/develop` at `80e16ff`

**Network:** Stellar Testnet, `Test SDF Network ; September 2015`
**Asset:** official test `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

## Issue acceptance addressed

Issue #97 remains open. The 2026-09-29 Freighter proof covered an absent recipient. This change prepares its existing-recipient cases without changing production funding or claim behavior. The interactive Testnet spike accepts absent, existing-without-trustline and existing-with-trustline modes. It rejects a recipient whose actual ledger state or spendable XLM contradicts the selected mode.

TX2 signing and new recipient reserve units are derived from the built operations. An existing recipient with the official USDC trustline has no recipient-sourced operation and adds no recipient reserve unit. An existing recipient without the trustline needs a recipient signature and adds one sponsored trustline unit. An absent recipient retains the previous three-unit account/trustline path. Receipts check the exact one-USDC increase, unchanged recipient XLM, actual sponsorship, sponsor fee and reserve changes, later-ledger TX2, and ephemeral cleanup. The browser retains a separate user approval and Submit action even when no recipient wallet signature is required.

## Observed checks

| Check | Result |
| --- | --- |
| TypeScript `tsc --noEmit` | Passed |
| Focused Vitest (`freighter-lifecycle.test.ts`) | 8/8 passed, including all three recipient operation/signature/reserve shapes |
| Existing claim tests, run earlier in this session | 37/37 passed across the lifecycle and claim files before the final helper edit; the lifecycle file was rerun after that edit |
| ESLint on changed TypeScript | Passed |
| Browser page at 1280px and 390px | Passed: correct recipient mode and addresses, no horizontal overflow, funding disabled before local keys, no browser errors |
| Browser network before user action | Zero POST requests; server reported zero public link keys, balance IDs or receipts |
| Public Testnet preflight | Sender observed at 19.0000000 official test USDC / 0 XLM; recipient observed at 1.0000000 official test USDC / 0 XLM, three sponsored units |

Browser result: [browser-result.json](browser-result.json), with [desktop](desktop.png) and [mobile](mobile.png) screenshots. Public account facts: [preflight.json](preflight.json). The recipient was rechecked at `2026-09-30T00:38:46.7244353Z`; the sender and network were read earlier in the same session. Both are rechecked by the proof server before preparation.

## Current local proof session

The current existing-trustline page started at `2026-09-30T00:49:20Z` on `http://127.0.0.1:3218`, Windows PID `25952`. Current sponsor public key: `GDX6LUUM4XP5SS4L2OM6MZKPV6YXNJEOGEQ6GDAIXK4A5ZMQDK5IDPOB`. Its key exists only in that process memory. The first session (PID `15756`, sponsor `GCRHVR5CSVIFLB76UWRELFH3U3OY6XVUFHTUYA7ESVBXKX6PJRZUKWEX`) was stopped after a reclaim-preflight regression was caught in source review; it had zero link keys, balance IDs, receipts and attempts, and its sponsor had not been Friendbot-funded. The current session also reports zero links, balance IDs and receipts at start. Verify the PID, `/state` and public ledger state again before resuming. If the process ends before any preparation, a new disposable proof session can start; after any attempt, resolve the saved hash first.

**No new transaction was signed or submitted for this case.** The existing-trustline and existing-no-trustline acceptance boxes remain open. The user must use Freighter for the sender funding/reclaim steps. The ready recipient case deliberately has no recipient signature on TX2; the selected wallet is still checked before user approval and submission. The no-trustline case needs a separate existing recipient fixture and actual Freighter signature. Independent confirmed ledger reads are required before either case is reported as passed.

## Remaining #97 work

1. Complete this existing-trustline lifecycle with Freighter and independently verify hashes, operation sources, exact balances, sponsor fee/reserves and absence of duplicate settlement.
2. Prepare an existing no-trustline recipient with no spendable XLM, then prove its signed trustline sponsorship and claim.
3. Prove nonzero-native/no-spendable-XLM sender funding and reclaim, expiry boundary refusals, duplicate/retry/cancel/recovery and native XLM regressions.
4. Write the final funding envelope decision only after the full matrix; production envelopes and public-network transfer remain separate gates.
