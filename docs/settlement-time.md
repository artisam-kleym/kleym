# Settlement time, receipts and accounting (#110)

`ledgerSettledAt` is the confirmed transaction/operation `created_at` reported
by Horizon. `observedAt` is Kleym's local observation time. Direct submission
may omit `created_at`; Kleym reads the exact confirmed hash before persisting
its time. Missing history remains null. Ledger success remains success even
when its timestamp is unavailable; no receipt or new valuation invents a time.

Direct claim, reclaim and reconciliation write the same authoritative field.
New `claimedAt` mirrors it for compatible readers. Historical `claimedAt` and
`ReclaimBatch.submittedAt` are retained, and are not proof of ledger time.
Observations and time bounds continue to use the application clock for their
own purposes; they are not signed as settlement timestamps.

## Signed contracts

- New claim receipts are **v3**, with `claim.timeSource: "ledger"` and
  `claim.claimedAt` taken only from `ledgerSettledAt`.
- Stored v1/v2 canonical bytes, signature and key are returned unchanged and
  remain verifiable. Their timestamp semantics remain historical; no new v3
  guarantee is retroactively attached to them.
- New accounting exports are **v2**. CSV/JSON journal lines identify
  `timeSource` and `feeEvidence`. New valuations use `timeSource: ledger`.
  Existing rows default to `legacy-unverified`; they are not repriced on an
  assumed date. A missing fee is `feeKnown: false`, never a confirmed zero fee.
  The compatible numeric placeholder is not emitted as a fee expense.
- Existing signed accounting files remain byte-for-byte verifiable. The
  merged accounting implementation from PR #92 is extended here; no parallel
  export implementation is introduced.
- `link.claimed` webhooks may now report `claimedAt: null`, with
  `timeSource: unavailable` and separate `observedAt`. Consumers must not
  replace missing time with their own clock.

## Expansion, history and rollback

Migration `20261008150000_settlement_time_provenance` adds nullable timestamp
columns and provenance defaults. It does not copy legacy timestamps, rewrite
signed bytes, delete rows or guess historical fees. Deploy the migration
before the new web/worker versions. Old writers can continue using the expanded
schema; their rows have no verified timestamp, and new receipt/valuation
writers refuse to promote them to verified evidence.

Inventory missing history with scoped queries:

```sql
SELECT id, "claimTxHash" FROM "ClaimLink"
WHERE status IN ('CLAIMED', 'RECLAIMED') AND "ledgerSettledAt" IS NULL;
SELECT id, "transactionHash" FROM "ReclaimBatch" WHERE "ledgerSettledAt" IS NULL;
SELECT id FROM "Valuation" WHERE "timeSource" = 'legacy-unverified';
```

Backfill requires the exact hash on the campaign's verified network and
authoritative history. Verify successful inclusion and confirmed time/fees;
do not infer missing values from the application timestamp or expiry. If
history is unavailable, retain the unknown status and existing signed bytes.
Do not overwrite existing valuations/rates or receipts as a silent backfill.
A retrospective accounting correction requires a separately reviewed entry.

Rollback retains the additive columns/data and previous signed artifacts.
Disable new receipt/accounting issuance before rolling web/workers back to a
version that does not understand provenance. Do not drop these columns or
resume old issuance that calls application time ledger time. Settlement
journals and replay/recovery remain intact.

Verification uses disposable Testnet-shaped Horizon fixtures, PostgreSQL and
Redis. It proves timestamp provenance and compatibility; it does not replace
fresh supported-wallet/Testnet lifecycle acceptance or Mainnet release gates.
