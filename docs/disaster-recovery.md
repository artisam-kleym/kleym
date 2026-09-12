# Disaster recovery: RPO, RTO, the rehearsal, the procedure, and runbooks

## The objectives, and why

**RPO — how much can be lost: the interval between database backups, and
only for the data the ledger cannot rebuild.** Kleym's database is a cache
and an index over the Stellar ledger (`SPEC.md` §3.5): whether money moved,
to whom, and in which transaction is on-chain and is re-derived by
reconciliation after a restore. What reconciliation **cannot** rebuild — and
therefore what the backup interval actually governs — is:

| Lost between backup and failure | Consequence | Remedy |
|---|---|---|
| `Delivery` rows and OTP state | an emailed link may need re-sending; a code in flight is gone | re-send from the campaign page; the recipient asks for a new code |
| `csvExportedAt` | a campaign that had exported is re-gated in CREATING | the sender still holds the CSV; export again to release it |
| audit rows | irreplaceable | a signed export taken before the loss is the only other copy (`docs/audit-log.md`) |
| API keys, sessions, idempotency records | clients re-authenticate; a retried request re-executes | nothing to do; the chain is authoritative about money either way |
| approvals, memberships, invitations made after the backup | must be redone | the audit export names them |

Redis is **not** backed up and is not a source of truth: it holds rate-limit
counters, OTP tokens, pass cursors and alert dedupe keys. Losing it means a
recipient mid-claim asks for a new code, rate limits reset, and the next
maintenance pass restarts from the top. That blast radius is documented, not
engineered away.

**RTO — how long to be back: under fifteen minutes from a decision to
restore, for a database of the size a pilot produces.** Measured, not
guessed — see the rehearsal. The floor is the provider's restore time; the
ceiling is the reconciliation pass, which is one Horizon read per live link
(`docs/release.md`, load test) and runs bounded in the background if it does
not finish in the foreground.

## The rehearsal — 2026-09-12

Performed on a database populated by the verification suites (54 users, 39
organisations, 126 campaigns, 50 links, 20 chained audit rows, 12 applied
migrations), restored into a **clean** Postgres 17 container that had never
seen Kleym, followed by the post-restore procedure below against live
testnet Horizon. Wall-clock:

| Step | Time |
|---|---|
| `pg_dump` (plain SQL, 109 KB) | 0.1 s |
| clean environment up (container start to `pg_isready`) | 2.4 s |
| `psql` restore | 0.3 s |
| `pnpm recover`: migrations current | 0.8 s |
| `pnpm recover`: audit chain verifies (20 rows) | 0.9 s |
| `pnpm recover`: reconciliation, 1 pass, 18 links against live Horizon | 8.3 s |
| **total, decision to "RECOVERY CHECKS PASSED"** | **11.9 s** |

Result: schema current, chain intact, 0 corrected, 8 unresolved (fixture
balances that were never on the ledger — Horizon has no operations for
them, which is the honest "re-read next run"), 0 critical. Nothing not
rebuildable was outstanding. Scaled by the load test's numbers, a 10,000-link
campaign adds one bounded reconcile pass of ~2.5 minutes per 1,000 links in
the foreground, or continues in the background at the usual cadence.

Redo this whenever the schema or the procedure changes, and record the date
here. A risk team will ask when it was last done.

## The post-restore procedure (`pnpm recover`)

Reconciliation is not a background job after a restore — it **is** the
recovery step. In order, and the script does exactly this:

1. **Restore** the latest backup into the database the app will use
   (provider snapshot, or `psql < dump.sql` into a fresh database).
2. **Migrations**: `pnpm db:deploy`; `recover` refuses to go on if the schema
   is not the one this build expects.
3. **Audit chain**: `verifyChain()`. A restore that lost audit rows shows here
   before anything else; a chain that verifies is the proof the backup was
   whole up to its timestamp.
4. **Reconcile**: `reconcileAll` in bounded passes until `remaining` is 0,
   against the live ledger. Every link converges to what the chain says. The
   critical case — a row saying settled while the balance is still
   on-ledger — is deliberately **not** auto-corrected: after a restore it is
   the signal that the backup and the chain disagree in the one direction
   that means a Kleym bug, and a person looks before any row changes.
5. **What cannot be rebuilt** is counted and printed (the table above) so the
   operator knows what to re-send, re-export and re-issue.
6. Start the worker; the scheduled passes take over.

## Runbooks

### Sponsor exhaustion
Claims on that sponsor's campaigns answer "temporarily unavailable"; the
low-balance alert has already fired. Top up, add a sponsor, or rotate — all
in [`docs/sponsor-runbook.md`](sponsor-runbook.md). Campaigns bound to the
exhausted sponsor resume on the next claim after the top-up; nothing restarts.

### Redis loss
Symptoms: rate limits reset (harmless), recipients mid-claim get "ask for a
new code", the maintenance passes log a WARN and restart from the top, alert
dedupe resets (a page may repeat once). Nothing about money is in Redis.
Bring Redis back, restart the worker so the BullMQ schedulers re-register
(`scheduleMaintenance` is idempotent), done. Do not restore Redis from a
backup: a stale OTP token is a liability, not data.

### Worker failure
Symptoms: `/admin/reconciliation` shows the last pass older than two
intervals, flagged red; batch confirmations stall (links stay PENDING after
a signed batch); emails do not send. Claims still work — the claim path is
in the web process. Restart the worker; BullMQ resumes the queues, confirms
the stalled batches, and the next pass runs. If a batch was submitted to
Horizon while the worker was down, `batch-confirm` finds it on restart by
its transaction hash.

### A partially-applied campaign
`PARTIAL` means some batches confirmed and some failed: real links are live
and claimable, failed ones are `FAILED` with no on-chain entry. Nothing is
lost. The sender retries the failed batches from the campaign page
(`POST …/batches/retry` re-opens them for signing); the confirmed ones are
untouched. If the sender cannot (lost CSV), the live links run their course
and reclaim after expiry returns the rest. Do not mark FAILED links ACTIVE
by hand — reconciliation would refuse the mismatch, and correctly.

## Backup verification

`pnpm verify:backup` dumps `DATABASE_URL`, restores it into
`RESTORE_DATABASE_URL` (a clean database), and then **asks the restored
copy**: every table's row count matches, the migration ledger is intact,
the audit chain verifies, campaigns join to their links. It runs in CI on
every push, last in the verify job so the database the suites populated is
what gets restored. A check that looks for a file is not a backup check.
