# Release readiness — v1

The `SPEC.md` §10 acceptance matrix, walked by execution. Regenerate with:

```bash
pnpm build && pnpm start &      # a production build, not a dev server
SERVER_LOG=<path> pnpm acceptance
```

Criteria 1-3 are only reported as verified when `SPIKE_LOG` points at output
from a real `pnpm spike` run that passed. Without it they report as **not
executed in this run** — which is what happens in CI, where nothing touches
testnet. A matrix that prints 14/14 in an environment that made no ledger call
would be a green tick nobody earned.

`AGENT.md` §6.2 and §6.5 govern this document: "it compiles" and "it ran without
error" are not "it is correct." Every row below records **how** it was checked,
not merely that someone believes it. A criterion that cannot be executed says so.

## The matrix

Walked against the integrated tree of the six open feature branches on
2026-08-22. **14 of 14 verified by execution.**

### Protocol

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | All four claim permutations succeed on testnet | **Verified** | `pnpm spike` against `horizon-testnet.stellar.org`, 7/7 — new/existing recipient × native/non-native, both predicate directions, signature discipline |
| 2 | The ephemeral account no longer exists after a claim | **Verified** | Same run; post-merge existence asserted on the ledger, not inferred |
| 3 | Sponsor net XLM change is fee-only | **Verified** | Same run: `sponsor balance -0.0001 XLM (fees only); reserve obligation +0 XLM; ephemeral reserves fully recovered` |
| 4 | A 200-link campaign produces exactly 3 batches | **Verified** | `batchCount(200, 90) = 3`, and `pnpm verify:batches` drives plan → prepare → submit against Postgres |
| 5 | Reclaim returns all unclaimed funds and updates every row | **Verified** | `pnpm verify:reclaim`, 10 sections; campaign reaches `RECLAIMED`, every link `RECLAIMED` with its transaction hash, totals summed with `Decimal` |

### Security

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 6 | No schema column stores a seed | **Verified** | Every field name in `prisma/schema.prisma` scanned; CI enforces it independently |
| 7 | No log line contains a fragment-derived value | **Verified** | A full server log scanned for seed-shaped tokens and for `#s=`: none |
| 8 | `/claim` loads zero third-party requests | **Verified** | `e2e/claim-page.spec.ts` in a real browser; the fragment appears in no request, cookie or storage |
| 9 | Posting a seed to `/api/campaigns/[id]/links` returns 400 and logs a security event | **Verified** | Live authenticated POST with a real seed → 400 `problems/seed-submitted`; the seed reaches no audit row |
| 10 | The seed script refuses without credentials, and refuses production without a flag | **Verified** | Both refusals executed |

### Product

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 11 | Wizard Continue is unreachable until the CSV download has fired | **Verified** | `e2e/csv-gate.spec.ts`; regenerating shuts the gate again |
| 12 | Every `/claim` state has a designed screen | **Verified** | All 14 states in `CLAIM_STATES` have a case in `screens.tsx`, `expired` and `already_claimed` included |
| 13 | Reconciliation detects and reports a manually-introduced drift row | **Verified** | `pnpm verify:reconcile`; the critical class is reported and deliberately **not** corrected |
| 14 | Sponsor balance below threshold produces a visible admin warning | **Verified** | `/admin` renders the warning from `sponsorSpendable < SPONSOR_MIN_BALANCE_ALERT`; an unreadable balance renders "Unknown", not a false zero |

## Headers

Audited across `/`, `/login`, `/claim`, `/dashboard` and `/api/health`:

- The full `AGENT.md` §5.3 set is present on every route.
- CSP carries **no** `unsafe-inline` and **no** `unsafe-eval` anywhere.
- `/claim` overrides `Referrer-Policy` to `no-referrer`; other routes use `strict-origin-when-cross-origin`.

## Load

`pnpm loadtest` drives `MAX_LINKS_PER_CAMPAIGN` (10,000 links) through the batch
path. Measured, not assumed:

| Stage | Time |
|---|---|
| Registration, in the 500-link chunks the wizard posts | 2,679 ms (≈3,700 links/s) |
| Planning — one serializable transaction, 112 batches | 451 ms |
| Re-planning (the idempotent double-click path) | 1 ms, batch count unchanged |
| Full paged walk of all 10,000 links | 93 ms, **10,000 distinct** |
| Loading one batch's 90 links, as `prepare` does | 2 ms |

10,000 links produce exactly 112 batches. The ceiling is survivable rather than
aspirational.

The paged walk returning 10,000 distinct rows matters beyond throughput: it is
the ordering bug from #27/#28 — links sharing a `createdAt` and a paged read
skipping and repeating them — proven fixed at full scale.

**Not measured:** Horizon submission throughput for 112 real transactions. That
would spend real sequence numbers and measures Horizon rather than Kleym.

### The maintenance jobs, which are the actual ceiling

The batch path was never the bottleneck at this size. `reconcileAll` (every 5
minutes) and `watchEphemerals` (every 15) each do one serial Horizon read per
live link, so at 10,000 links the question is whether a pass fits inside its
own schedule. Both passes are bounded (#33, #35: `RECONCILE_PASS_LIMIT` 1,000,
`WATCH_PASS_LIMIT` 3,000, continuing from a cursor), and `pnpm loadtest` now
walks both over the same 10,000 live links with the ledger reads stubbed, then
projects the pass at a nominal 150 ms per Horizon read (`HORIZON_LATENCY_MS`
to change it):

| Job | Limit / pass | Passes to cover 10,000 | Projected pass at 150 ms/read | Fits its interval | Full coverage |
|---|---|---|---|---|---|
| reconcile | 1,000 | 11 | ≈150 s | yes, of 300 s | every ≈55 min |
| ephemeral-watch | 3,000 | 4 | ≈450 s | yes, of 900 s | every ≈60 min |

Kleym's own side of a pass is under 700 ms; the Horizon reads are the pass.
The load test fails if a projected pass does not fit its interval or a walk
does not cover every link. **What this means for an operator:** at the
supported maximum, a drift is detected within about an hour rather than five
minutes, and the report says `remaining` when a pass stopped short. That is
the honest number, and it is a number rather than a queue silently running
behind.

## Rolling out #47 (MFA) on an existing deployment

Set `MFA_ENCRYPTION_KEY` (32 random bytes, base64: `openssl rand -base64 32`)
in the secret store before the deploy — the environment schema requires it
and the build serves nothing without it. Optionally `WEBAUTHN_RP_ID` when the
app is served from a subdomain but passkeys should bind to the parent domain.
Rotating `MFA_ENCRYPTION_KEY` invalidates every TOTP enrolment (users re-enrol);
passkeys and recovery codes are unaffected. Nothing is required of users:
policies start `OFF` and no session changes state until a factor is enrolled
or a policy is set.

## Rolling out #49 (audit chain) on an existing deployment

Two steps before the deploy, in this order:

1. Set `AUDIT_SIGNING_SEED` (32 random bytes, base64) in the secret store.
   Record the public key it produces (`signingPublicKey()`, or the
   `X-Kleym-Signing-Key` header of the first export) somewhere outside the
   database — that copy is what auditors verify against.
2. Run the migration, then `pnpm audit:chain-backfill` against the
   production database **before** the new build serves traffic. It chains
   every existing audit row once; it refuses if a live write has already
   taken `seq` 1. Then `pnpm audit:verify` should be `ok`.

A fresh deployment needs only step 1.

## Known limitations, and where the product states them

`SPEC.md` §12 requires these in the product, not only in a document.

| Limitation | Where the affected person reads it |
|---|---|
| Lost CSV means stranded funds until expiry | Wizard export step — the warning panel on the download gate, and again after signing |
| Sponsor float has to be topped up; a pool fails over for new campaigns only | `/admin`, the sponsor pool table with per-sponsor float and runway |
| A leaked link is a bearer instrument | The `/claim` ready screen, and the claim email |
| Partial batch failure needs sender action | Wizard export step, and `/admin/campaigns` status |
| Organisations are flat: no cross-organisation sharing | `/dashboard`, in the note on who can see campaigns |
| A restore loses what the ledger cannot rebuild | `/admin/reconciliation`, the recovery note above the passes |
| Reserve estimates can shift between quote and signature | Wizard step 2, under the cost breakdown |

## What is not verified

- **A real email send.** Every provider call in this environment 401s against a
  placeholder `RESEND_API_KEY`. The failure paths are exercised; a successful
  delivery is not. Worth one manual send before production.
- **Horizon throughput at 112 batches**, as above.
- **Reclaim on a live ledger.** `SPEC.md` §10.5's decimal balance comparison —
  the sender's balance rising by exactly the reclaimed sum — needs a funded
  campaign whose expiry has genuinely passed on-chain.

These are stated rather than implied, per `AGENT.md` §6.5.
