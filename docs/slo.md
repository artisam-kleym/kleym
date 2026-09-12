# Service level objectives

Issue #53. What Kleym commits to, measured by the metrics in
`docs/observability.md`, and the error budget each objective implies. An SLA
clause is negotiated from these; nothing here is promised that cannot be read
off a dashboard.

Windows are rolling 30 days. Budgets are what the objective leaves: at 99.9 %,
43 minutes a month.

| Objective | Target | Measured as | Budget / 30 d |
|---|---|---|---|
| **Claim availability** — a live link can be claimed | 99.9 % of claim `submit` calls end `ok` or `conflict` (a user-side condition), not `unavailable` or `error` | `kleym.claim.outcomes{phase=submit}` | 43 min of failing submits |
| **Claim latency** — the ledger boundary | 95 % of `claim.submit` spans under 10 s | span duration, `claim.submit` | 5 % of submits |
| **Batch confirmation** | 99 % of batches confirmed within 60 s of submission | `kleym.batch.confirm.latency` | 1 % of batches |
| **Reconciliation currency** | every scheduled pass completes with `remaining = 0` at least once per hour | `kleym.reconcile.passes{outcome=complete}` per `job` | 1 missed hour a month |
| **Sponsorship** | no sponsor below `SPONSOR_MIN_BALANCE_ALERT` for longer than 4 h | `kleym.sponsor.spendable` | 4 h |
| **Readiness** | `/api/ready` answers 200 for 99.95 % of probes | `kleym.dependency.up` all = 1 | 22 min |
| **Rate limiter integrity** | `reason=unavailable` rejections are zero outside a declared Redis incident | `kleym.ratelimit.rejections{reason=unavailable}` | 0, by design — the limiter failing closed is an incident |

## What is out of the budget

- **The Stellar network itself.** A Horizon outage or a ledger that stops closing
  fails claims; `kleym.dependency.up{dependency=horizon}` records it and the
  status page shows it, but it is not Kleym's budget to spend. The SLA should
  say so.
- **A sender who never downloaded the CSV.** A campaign held in CREATING is
  correct behaviour (`docs/migrations.md` invariant 3).

## When the budget is spent

The error budget is a policy, not a number: while an objective is inside its
budget, feature work proceeds; once it is spent for the window, work on the
system stops until the cause is understood and the objective is back inside.
An alert is worth paging on when it would spend a meaningful part of the
budget before a human could act:

- claim availability burning at a rate that spends the month in a day
- any bounded pass two intervals stale (`/status` shows "Degraded")
- a sponsor below threshold — `ALERT_WEBHOOK_URL` already fires this (#48)
- `kleym.queue.oldest_waiting` over 120 s on any queue — the worker is gone
- any `reason=unavailable` rejection

## Reporting

`/status` is the public view; the metrics above are the auditable one. An
SLA report for a customer is the objective, the measured value over the
window, and the budget consumed, taken from the same series — never from a
log grep.
