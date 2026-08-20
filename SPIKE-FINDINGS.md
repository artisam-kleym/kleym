# Issue #1 — spike result: SPEC.md §3.3 does not work as specified

**Status: FAILED, 2 of 6 checks passed.** Reported rather than worked around, per `AGENT.md` §2.

All four claim permutations fail on the **final operation**, the `AccountMerge`. The
predicate design is sound and passed both directions.

| Check | Result |
|---|---|
| New recipient × native | FAIL — `op_seq_num_too_far` |
| Existing recipient × native | FAIL — `op_seq_num_too_far` |
| New recipient × non-native | FAIL — `op_has_sub_entries` |
| Existing recipient × non-native | FAIL — `op_has_sub_entries` |
| Predicate — recipient blocked after expiry, sender reclaims | PASS |
| Predicate — sender blocked before expiry | PASS |

Balance-ID extraction via `Transaction.getClaimableBalanceId()` matched the ledger in
every case, so `SPEC.md` §7.2's concern is settled.

## Two independent causes

Both are protocol restrictions on `AccountMerge`, not implementation defects.

**A. An account cannot be created and merged in the same transaction.**
A newly created account's sequence number is `currentLedgerSeq << 32`, which exceeds the
merge ceiling derived from the last closed ledger. Isolated in `spike-diagnose.ts`:
merging in the same transaction gives `op_seq_num_too_far`; the identical merge one
ledger later succeeds.

**B. An account holding a trustline cannot be merged.**
`AccountMerge` requires zero subentries. The ephemeral account's sponsored trustline is a
subentry, so the merge gives `op_has_sub_entries`. Removing the trustline
(`ChangeTrust` with `limit: 0`) immediately before the merge succeeds.

Cause A alone breaks all four permutations. Cause B breaks the two non-native ones and
would still break them after A is fixed.

## Verified alternative: two transactions

Tested end-to-end on the hardest permutation (new recipient × non-native), result:
recipient credited exactly `500.0000000 USDC`, ephemeral account gone, sponsorships
resolved to the recipient's own entries only.

**TX1 — materialise the ephemeral account.** Source SPONSOR; signers SPONSOR, EPHEMERAL.

```
BeginSponsoringFutureReserves(ephemeral)   SPONSOR
CreateAccount(ephemeral, 0)                SPONSOR
EndSponsoringFutureReserves()              EPHEMERAL
  -- non-native only --
BeginSponsoringFutureReserves(ephemeral)   SPONSOR
ChangeTrust(asset)                         EPHEMERAL
EndSponsoringFutureReserves()              EPHEMERAL
```

**TX2 — claim, forward, dispose.** Must land in a later ledger than TX1.
Source SPONSOR; signers SPONSOR, EPHEMERAL, and RECIPIENT only when the recipient is an
operation source.

```
ClaimClaimableBalance(balanceId)           EPHEMERAL
  -- recipient account absent --
BeginSponsoringFutureReserves(recipient)   SPONSOR
CreateAccount(recipient, 0)                SPONSOR
EndSponsoringFutureReserves()              RECIPIENT
  -- non-native and recipient lacks trustline --
BeginSponsoringFutureReserves(recipient)   SPONSOR
ChangeTrust(asset)                         RECIPIENT
EndSponsoringFutureReserves()              RECIPIENT
Payment(recipient, asset, amount)          EPHEMERAL
  -- non-native only, and this op is new --
ChangeTrust(asset, limit: 0)               EPHEMERAL
AccountMerge(recipient)                    EPHEMERAL
```

## What this costs

- **Atomicity is gone.** TX1 can succeed and TX2 fail, stranding a funded ephemeral
  account holding sponsored reserves. Recovery needs a sweeper: any ephemeral account
  older than N ledgers with no claimable balance left gets its trustline removed and is
  merged back. This is new scope not in `SPEC.md`.
- **Two sponsor fees per claim** instead of one, and two round trips.
- **The recipient must sign a transaction built after TX1 confirms**, so the claim page
  gains a waiting state between the two.
- **A failed TX2 leaks sponsor reserves until swept.** `SPEC.md` §10.3 must be restated
  as "fee-only after the sweeper runs" rather than unconditionally.

## Third signature is conditional

Separate finding. `SPEC.md` §3.3 states signers are always SPONSOR, EPHEMERAL, RECIPIENT.
For an existing recipient that already holds the trustline, the recipient is not an
operation source, and signing anyway returns `tx_bad_auth_extra`. The recipient signature
must be requested conditionally.

## Not decided here

Whether to accept the two-transaction design with a sweeper, or reconsider the approach.
`AGENT.md` §6.4 puts this with a human.
