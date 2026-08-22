# Release readiness — v1

The `SPEC.md` §10 acceptance matrix, walked by execution. Regenerate with:

```bash
pnpm build && pnpm start &      # a production build, not a dev server
SERVER_LOG=<path> pnpm acceptance
```

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

## Known limitations, and where the product states them

`SPEC.md` §12 requires these in the product, not only in a document.

| Limitation | Where the affected person reads it |
|---|---|
| Lost CSV means stranded funds until expiry | Wizard export step — the warning panel on the download gate, and again after signing |
| Sponsor exhaustion halts all claims | `/admin`, beside the balance, with the threshold warning |
| A leaked link is a bearer instrument | The `/claim` ready screen, and the claim email |
| Partial batch failure needs sender action | Wizard export step, and `/admin/campaigns` status |
| No multi-tenancy | `/dashboard` |
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
