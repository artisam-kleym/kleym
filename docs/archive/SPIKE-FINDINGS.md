# Issue #1 — spike result

**Status: PASSED, 7/7.** The claim design is verified on testnet — but not the design
`SPEC.md` §3.3 originally specified. That one is disproven. §3.3 has been rewritten.

```
PASS  New recipient      x  native (XLM)
PASS  Existing recipient x  native (XLM)
PASS  New recipient      x  non-native (USDC)
PASS  Existing recipient x  non-native (USDC)
PASS  Signature discipline — over-signed transaction
PASS  Predicate — recipient blocked after expiry, sender reclaims
PASS  Predicate — sender blocked before expiry
```

`pnpm typecheck` is clean under `strict` with `noUnusedLocals`.

Run with `pnpm spike`. Testnet only.

## What the original design got wrong

The single 15-operation transaction fails on its **final operation**, the `AccountMerge`,
in all four permutations. Two independent protocol rules, each isolated with a control in
`scripts/spike-diagnose.ts`:

**A. An account cannot be merged in the transaction that created it.** A new account's
sequence number is `currentLedgerSeq << 32`, above the merge ceiling derived from the last
closed ledger. Same-transaction merge gives `op_seq_num_too_far`; the identical merge one
ledger later succeeds. The boundary is the *ledger*, not the transaction — roughly 5s.

**B. An account holding a trustline cannot be merged.** `AccountMerge` requires zero
subentries; the sponsored trustline is one. Gives `op_has_sub_entries`. Removing it with
`ChangeTrust limit: 0` immediately before the merge succeeds.

Cause A alone broke all four permutations. Cause B broke the non-native two independently.

## What replaced it

Two transactions, TX2 in a later ledger than TX1. Full op lists in `SPEC.md` §3.3.

## Findings that changed the spec beyond §3.3

**The recipient signature is conditional.** §3.3 previously said signers are always
SPONSOR, EPHEMERAL, RECIPIENT. When the recipient already exists *and* holds the trustline
it is not an operation source, and signing anyway returns `tx_bad_auth_extra` — observed,
not assumed: the spike submits an over-signed transaction, asserts the code, then submits
the same transaction correctly signed to show the rejection was the signature and not the
operations. Affects #10.

**§10.3 was measuring the wrong thing.** "Sponsor net XLM change is fee-only" is true of
the *balance*, but sponsoring never spends XLM — it raises the sponsor's minimum balance.
Reserve recovery has to be asserted on the reserve obligation
`(2 + subentry_count + num_sponsoring − num_sponsored) × base_reserve`. My first run
failed two permutations on this before the assertion was corrected; the transactions
themselves were already right. §10.3 now states both halves.

**Kleym cannot clean up after an abandoned claim.** If TX1 lands and TX2 never follows,
the ephemeral account persists holding 1.0–1.5 XLM of sponsored reserve. Merging it needs
the ephemeral key, which Kleym deliberately does not hold — the same property that makes a
database breach harmless. `RevokeSponsorship` does not help: it moves the obligation to a
zero-balance account that cannot meet it.

So the job in §7.3 is a **monitor, not a sweeper**. Reserves return only when the link is
eventually claimed.

**Consequence for the claim page:** TX1 must fire on the recipient's *commitment* to
claim, not on page load. Firing on load would hide the ledger wait, but would strand
1.0–1.5 XLM every time anyone merely opened a link. Affects #11.

## Verified by execution, not assumed

Every claim above was run against `horizon-testnet.stellar.org`. Balances were compared
as exact decimals, account existence checked on the ledger after merge, and reserve
obligations computed from live `base_reserve_in_stroops` rather than a constant.

`Transaction.getClaimableBalanceId()` matched the ledger's balance ID on every run,
settling the §7.2 concern about manual XDR walking.

Negative cases assert the specific result code rather than merely that submission threw.
A timeout bound, a stale sequence number, or a Horizon 5xx would otherwise be
indistinguishable from an enforced predicate. Both predicate directions assert
`op_cannot_claim` on the claim operation; the signature check asserts `tx_bad_auth_extra`.
