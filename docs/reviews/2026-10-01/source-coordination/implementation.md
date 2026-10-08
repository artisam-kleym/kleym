# Transaction source and XLM capacity coordination

Date: 2026-10-01. Product checkout `D:\kleym\.worktrees\app-sending-pilot`, branch `codex/app-sending-pilot`, base `4163d79` plus preserved local work. GitHub Issues remain deferred. Local runtime stays Testnet; no deployment or agent blockchain submission was performed.

## Acceptance and implementation

One unfinished envelope owns a transaction source across app/worker processes.
PostgreSQL transaction advisory locks serialize admission by deployment network
and source; the existing public `Batch`/`LedgerAttempt` journals persist ownership
in the same transaction. No new schema or service was added. Other hot sources
remain independent. Batch prepare/submit and ledger-attempt prepare/execute use
the same guard. Signed bytes and hash are never replaced to resolve uncertainty.

Fresh source sequence and spendable native balance are checked under admission,
including at submit after wallet review. The fee bid, positive native outflows
and new reserve obligations are budgeted from the actual body with a live base
reserve. Cleanup credits are excluded. Native selling liabilities now reduce
spendable XLM. Protocol references: [Stellar sponsored reserves](https://developers.stellar.org/docs/build/guides/transactions/sponsored-reserves)
and [claimable balances](https://developers.stellar.org/docs/build/guides/transactions/claimable-balances), reviewed 2026-10-01.

An unsigned expired envelope ceases to reserve its source and cannot be submitted
late. A stale unsigned sequence can be refreshed before signing. Submitted
attempts remain exclusive even after expiry until recovery checks the exact hash
after a closed ledger beyond the bound. Funding worker recovery now has this
expiry proof too. Historical submitted batches without saved XDR reserve their
bound source conservatively. New legacy sender-paid refunds require the durable
prepared journal; settled historical receipts still replay unchanged.

Claim preparation previously required only a public key on OPEN links. Reserving
a source there would allow public-key-only callers to hold the source. Both HTTP
prepare endpoints now verify a locally generated link-key signature before
lookup/preparation. The public proof lasts 90 seconds (server permits at most
120 seconds), and binds origin, network, phase, public key, recipient, conversion
floor and memo. The seed stays local. Transaction signatures, policy gates and
explicit Connect → review → Claim remain required. Existing tabs should reopen
their saved private claim link after updating.

## Verification

- `concurrency.json`: 26 checks, real PostgreSQL, two independent Node processes and
  simulated Horizon; process race, distinct sources, funding/claim exclusion,
  historical pending funding, expiry, original-hash recovery, capacity changes,
  selling liabilities, stale sequences and legacy refund compatibility. Zero
  chain writes.
- `lifecycle.json`: 122 checks, real app services/PostgreSQL/Redis/SDK signatures with
  simulated Horizon; all three recipient states, concurrent duplicate funding,
  sponsor exclusion/release, worker recovery, exact USDC accounting, cleanup,
  refund and returned-budget renewal. Zero chain writes.
- 241 unit checks in 12 files, 18 production Chromium checks, build/static checks and local process
  health passed and are recorded in `verification.json`. Browser wallet
  behavior uses a Freighter bridge fixture; it is not a new real extension
  signature or public-ledger qualification.

The first concurrency harness run stopped on an SDK timebounds overwrite; the
fixture now overrides clone options correctly. A second stopped because its
throwaway source was outside the test sponsor pool; the fixture now uses its
generated configured sponsor. Both were fixture failures, corrected before the
recorded successful run. An early static pass found two unused/optional fixture
types, subsequently corrected. Historical evidence is preserved separately.

## Operating limits and remaining work

This serializes one unfinished body per source. A sender or legitimate link
holder can hold a source until its unsigned window expires. Users retry after
the other operation confirms; fairness/automatic queuing and production load
capacity have not been qualified. Guards query unfinished journals and use
Horizon under a bounded database transaction; provider failure refuses admission.
Hot keys need exclusive operational use: external transfers can change sequence
or capacity despite app coordination and will require a fresh preparation or
exact-hash recovery. Future rollout must update every web/worker replica.

The capacity check covers the next admitted envelope and current ledger
obligations. It does not reserve XLM for every future claim, assign campaign
budgets across separate hot accounts, implement cold treasury custody/refill,
or prove production backup/restore. Pilot total USDC, recipient count,
per-recipient caps and refill/incident owners still need actual decisions.
Mainnet release and small real-USDC wallet validation remain separate gates.

## Reproduce

Use the isolated `kleym_verify_96` PostgreSQL database and verification Redis DB0
on localhost, never the pilot Redis DB1. With `NODE_ENV=test`, run
`pnpm verify:source-coordination` and `pnpm verify:app-lifecycle`.
Set `VERIFY_RESULT_FILE` to a new evidence path when retaining another run.
The source harness refuses another database name and exposes only simulated
Horizon reads; no sponsor secret or link secret is printed or persisted.
