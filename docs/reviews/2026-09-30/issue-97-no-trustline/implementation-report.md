# Issue #97: recipient without a trustline - preparation

Date: 2026-09-30. [Issue #97](https://github.com/webnxt-2030/kleym/issues/97), [draft PR #118](https://github.com/webnxt-2030/kleym/pull/118).

## Result

The interactive bootstrap now supports `recipient-account-only`, creating an existing recipient fixture with literal zero XLM and no USDC trustline. The live fixture and its funding/claim/reclaim cycle are **pending** the user's new public G-address and actual Freighter approval. No acceptance criterion for that live case is marked complete.

The existing `sender-usdc` mode remains the default. Production APIs, queues and transaction envelopes are unchanged. This preparation continues the wallet/ledger gate before production funding and treasury signing implementation.

## Implementation

- Reuse the existing builder and signature verifier. Account-only setup has exactly three operations: begin sponsorship, create the recipient with zero starting balance, and end sponsorship sourced by the recipient. It transfers no USDC and creates no trustline.
- Require exactly the sponsor and recipient signatures over the reviewed Testnet body. A missing recipient signature, a foreign signature or an added trustline is rejected.
- Check the target is absent before submission. After confirmation assert zero native balance, account sponsorship, no trustline, exactly two sponsored reserve units, exact sponsor fee debit, and preservation of the existing sender snapshot.
- Make page labels, connected-wallet checks, review operation count and confirmation text reflect the selected mode. Opening the page and connecting do not prepare or submit transactions.
- Add an optional `-BootstrapMode recipient-account-only` to the existing hidden Windows launcher. Sponsor keys remain process-local; only public records are written.
- Read the canonical ledger from SDK `ledger_attr`, with a numeric raw-response fallback, rather than accidentally serialising the SDK's `ledger` follow-up method. Historical receipts are preserved.

## Checks actually run

| Check | Result |
| --- | --- |
| Bootstrap, lifecycle and claim Vitest | 56 tests / 3 files passed |
| TypeScript `tsc --noEmit` | Passed |
| ESLint on the four changed TypeScript files | Passed |
| Git whitespace validation | Passed |
| Chromium, both bootstrap modes | Passed at 1280px and 390px; correct target/labels, initially disabled signing steps, no horizontal overflow, Freighter chooser visible |
| Browser mutation boundary | No POST requests, no browser errors, no account funding or transaction submission |
| Public Testnet baseline | Passed all five assertions; sender 18 official USDC / zero XLM, prior recipient 2 USDC / zero XLM, completed lifecycle sponsor zero sponsored units |
| Live account-only bootstrap and lifecycle | Pending; no user fixture address or signature received |
| Hosted CI | Unresolved startup failure on the prior pushed head; no hosted pass established |

Public proof: [browser result](browser-2026-09-30T10-17-23-105Z/result.json), [recipient mobile screenshot](browser-2026-09-30T10-17-23-105Z/recipient-account-only-mobile.png), [Testnet baseline](preflight-2026-09-30T10-19-16-356Z.json). [Browser harness](browser-check.mjs) uses an offline public placeholder, starts its own unmutated child server and stops it after checking both modes. An initial harness attempt failed before server startup due to an incorrect checkout-relative path; [failure record](browser-2026-09-30T10-16-50-653Z/failure.json) is preserved. The corrected run passed. A clean browser profile proves chooser rendering, not installed-wallet signing.

## Next wallet and ledger steps

1. Receive only the public G-address of a distinct new Freighter Testnet wallet, labelled `Kleym Recipient - No Trustline`. Leave it unfunded and do not share private CSV files or wallet keys.
2. Independently check that address is absent from Testnet. Start the bootstrap with the existing sender as reference, a fresh dated evidence directory, and account-only mode. Verify exact HTTP readiness before giving the user the page.
3. Have the recipient connect, review the three-operation setup, sign and submit. Stop after confirmation. Independently verify its zero XLM, absent USDC trustline, exact envelope/signatures, sponsor fees/reserves and preserved sender state.
4. Start a separate `existing-no-trustline` lifecycle session. Reuse the existing sender's official test USDC. Require the recipient's actual TX2 signature to create its sponsored trustline; verify claim/cleanup and expiry reclaim at their respective ledger stages.
5. Track the account sponsor's two persistent units and the later claim sponsor's one persistent trustline unit separately from temporary reserves. Those obligations do not disappear when the lifecycle finishes. Retain operational signing access for their recovery.

The previous local listeners were absent when checked on resume. No old server was restarted or account topped up. Read-only browser child processes have been stopped and no user signing page is currently running. Historical launch PIDs are not current readiness proof. Root treasury documentation and the earlier session snapshot remain preserved. PR #118 stays draft while its CI startup reason and #97 matrix remain incomplete.
