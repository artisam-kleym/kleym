# Features

A running log of shipped user-facing behaviour. Append an entry per merged change — newest first.

An entry earns its place here when the behaviour is real and verified, not when the code compiles. Per `AGENT.md` §6.2, "it ran without error" is not "it is correct."

## Format

```markdown
## YYYY-MM-DD — Short title (#issue)

What changed, in one or two sentences, described from the user's side.

**Verified by:** how it was checked — testnet run, Playwright spec, manual devtools inspection.
```

State plainly when something is believed correct but unchecked (`AGENT.md` §6.5). A log that hides uncertainty is worse than no log.

---

<!-- Entries begin below. Newest first. -->

## 2026-09-12 — Users are created by invitation (#39)

Until now the only code path that created a `User` was the seed script, and
it only ever made an admin; onboarding a second sender meant a shell on
production. `/admin/users` now has **Invite a user**: an admin enters a
username and role, and gets back a single-use link, shown once. The person
opens `/invite/[token]`, chooses their own password (12+ characters, argon2id,
the same path a password change uses), and can sign in. The users table shows
them as *Invited* until then.

**The admin never sets, sees or transmits a password.** The token is 32 random
bytes, stored only as a SHA-256 hash like a session cookie; the plaintext is in
the URL handed to the admin and nowhere else — not the database, not the audit
row, not a log line. The account is created inactive with an unguessable
placeholder hash, so nothing can sign in before redemption. Redemption is
single-use (a conditional update inside a transaction, so two simultaneous
redemptions produce exactly one password), expires after three days, and
unknown, expired and spent tokens all get the same 404 body. The redeem route
is rate limited like login. `POST /api/admin/users` answers 404 to a signed-in
non-admin, matching the rest of the admin surface.

**Verified by:** `pnpm verify:invitations` (in CI) against a real Postgres and
Redis — inactive on creation, hash ≠ token and token in no row, audit row
naming actor and user without the token, planted password material redacted
by the scrubber, first redemption sets the chosen password and the second is
refused without touching it, expired ≡ unknown, one of two concurrent
redemptions wins, the route's refusals are byte-identical, the sixth attempt
per IP is 429. And over HTTP against a production build: no session 401,
SENDER 404 on the route and the page, ADMIN 201, the invitee's login 401
before redemption and 200 after, a second redemption 404, and zero
occurrences of the token in the server log.

## 2026-09-12 — Campaign detail is bounded; the full link table has its own page (#41)

`/campaigns/[id]` no longer loads every link. It used to select the whole
table with no `take` — ten thousand rows into one RSC payload at
`MAX_LINKS_PER_CAMPAIGN` — and then filter that array four times for the
counts. The page now previews the first ten links and takes its counts from
one `groupBy` (at most six rows), the same shape the admin campaign list
already used. `/campaigns/[id]/links`, the table `SPEC.md` §5.2 specifies,
is where the rest is: paginated, filterable by status, showing label, status,
claimant, claim time and transaction hash, in `LINK_ORDER` — so the first page
there is exactly the preview here.

The loaders live in `lib/api/campaign-detail.ts` rather than in the page, so
a script can drive them at full size. That is the regression guard the issue
asks for: this is the second unbounded read to ship, and reading the code
caught it neither time.

**Verified by:** `pnpm verify:campaign-detail` (in CI) against a real
Postgres with a 10,000-link campaign: the preview is ten rows and loads in
~40 ms; the counts match the same campaign counted the slow way and sum to
10,000; the preview equals page one of the table; a filtered page is bounded
and its total is the filtered count; walking every page returns each link
once; another user's loads answer null. With the `take` removed the first
three checks fail (10,000 rows). Production build renders both routes.
**Not verified by execution:** the two pages in a browser — the table uses
the same furniture as `/settings`, believed correct but not opened this pass.

## 2026-09-12 — Campaign list and cross-campaign history (#40)

`/campaigns` and `/history` exist now; until this the sidebar linked to both
and both were 404s, and once a sender left a campaign the only way back was a
URL they had kept. `/campaigns` is the full list, newest first, with a
free-text search on name and a status filter that compose and survive paging.
`/history` is every claim and reclaim across campaigns, newest first, with
amount, asset, date, claimant and the transaction hash linked to Stellar
Expert on the right network, filterable by campaign and date range.

Both are server components with plain GET forms — the URL is the state, so a
filtered page survives reload and can be pasted to a colleague. Every query
carries the signed-in user's id in its `where` (`AGENT.md` §5.4): search runs
inside that scope and cannot enumerate another user's campaigns, and naming
another user's campaign id in the history filter matches nothing. The claimed
count per campaign is a `_count`, not a row load, so a 10,000-link campaign
costs the list one integer. History reads the claim record off the link
(`claimedAt`, `claimedBy`, `claimTxHash`) — there is no separate table.

Ordering is a total order — `createdAt` then `id`, the same reasoning as
`LINK_ORDER` — because campaigns sharing a timestamp is the ordinary case.

**Verified by:** 10 unit tests over the where-clauses and query parsers
(owner always present, filters compose, a `to` date runs through the end of
its day, bad input refused), and `pnpm verify:campaign-list` against a real
Postgres: another user's campaign unreachable by list, search or id; search +
status filter across pages; 90 campaigns with one `createdAt`, walked in nine
pages before and after relocating 30 tuples — with the `id` tiebreak removed
that check fails (87 distinct of 90, the #27 shape), with it, the same order
every time; history rows carrying what the page renders, date range inclusive
of its last day. Production build renders both routes. **Not verified by
execution:** the 375px rendering (criterion 5) — the pages use the same
`Table` / `table-scroll` furniture as `/settings`, believed correct but not
opened in a browser this pass.

## 2026-08-22 — Hardening and release readiness (#17)

The SPEC §10 acceptance matrix is now walked by execution rather than asserted.
`pnpm acceptance` runs it against a production build and prints, for each of the
fourteen criteria, whether it was verified by execution or not — and a criterion it
cannot execute says so rather than going green. `docs/release.md` records the result.

**14 of 14 verified by execution.** The four that matter most, because failing them
costs users money, were all run against the live network or a real browser: all four
claim permutations on testnet, sponsor reserves fully recovered (`-0.0001 XLM, fees
only`), no secret in any column or log line, and the CSV gate unbypassable.

Two criteria were initially claimed on weaker evidence than they deserved and were
re-done: 8 and 11 cited the existence of Playwright specs rather than a run, so the
suite was executed (19/19); and criterion 9 first returned 401, because posting a seed
unauthenticated is refused before the guard runs — correct, but not the rejection the
criterion is about. Signed in, it returns 400 `seed-submitted`, and the seed reaches no
audit row.

`pnpm loadtest` answers whether `MAX_LINKS_PER_CAMPAIGN` is survivable or aspirational.
10,000 links register in 2.7 s, plan into exactly 112 batches in 451 ms, re-plan
idempotently in 1 ms, and a full paged walk returns **10,000 distinct rows in 93 ms** —
which also proves the #27/#28 ordering bug fixed at full scale, not just in a fixture.

The header audit covers five routes: the whole §5.3 set present, no `unsafe-inline` or
`unsafe-eval` anywhere, and `/claim` overriding `Referrer-Policy` to `no-referrer`.

SPEC §12 requires the known limitations to live in the product, not only in a document.
Four already did. Two did not and now do: a recipient reading `/claim` is told that
anyone holding the link can claim it and to claim rather than forward, and `/dashboard`
states that campaigns belong to one account — no colleague, and not Kleym, can see or
reclaim them.

### After review

**The load test measures the maintenance jobs.** At 10,000 links the ceiling
is not the batch path but `reconcileAll` and `watchEphemerals`, one serial
Horizon read per link on fixed schedules. `pnpm loadtest` now walks both over
the same 10,000 live links with the reads stubbed, counts the passes the
bounded limits take to cover the set, and projects a pass at a nominal Horizon
latency against its schedule interval — failing if it does not fit or a walk
misses a link. Result at 150 ms/read: reconcile ≈150 s per pass of 300 s, full
coverage every ≈55 min; ephemeral-watch ≈450 s of 900 s, every ≈60 min. The
numbers are in `docs/release.md`.

**A server that never starts reads as that.** The acceptance step's readiness
loop now fails the job with the server log if `/api/health` never answered,
instead of running the matrix against nothing and reporting criteria failures.

**Base branch:** this PR still targets `integration/all-open-prs`, which the
#33 merge-order note calls a throwaway reference. The plan is to retarget it
to `develop` once #32–#37 land; the branch has had all six updated heads
merged in so its CI runs against the reviewed fixes.

**Verified by:** `pnpm acceptance` against a production build, 14/14; `pnpm spike`
against testnet, 7/7; `pnpm loadtest` at 10,000 links; `pnpm test:e2e`, 19/19 in a real
browser; 193 unit tests; all nine verify suites; typecheck, lint, and a cold build with
no environment.

**Not verified, and stated as such:** a real email send (this environment's provider key
is a placeholder, so every call 401s), Horizon throughput for 112 real submissions, and
reclaim's decimal balance comparison on a live ledger.

## 2026-08-22 — Admin area and audit logging (#15)

Admins get `/admin/users`, `/admin/campaigns` and `/admin/audit` alongside the sponsor
float and drift report already there. Every mutating action now writes an audit row:
who did it, to what, and from which address.

Deactivating a user means signed out, not paused. It deletes their sessions rather than
relying on the active-check that already blocks the next request — a session row that is
merely inert still exists, still shows in a count, and would come back to life the moment
the account was reactivated. Confirmed live: a sender's cookie went from working to
redirecting the instant an admin deactivated them, and sign-in then failed with the same
generic message as a wrong password, so the failure does not reveal account state.

Audit `metadata` is scrubbed rather than trusted. Two independent rules, because either
alone has a hole: field names that look like credentials are redacted whatever they hold
— which is the only way to catch an opaque session token, since nothing about the string
gives it away — and any value containing a Stellar seed is redacted whatever it is called,
which catches a seed hiding under `note` or `label`. Callers being careful is still the
real defence; this is the backstop for the one that is not. A seed reaching the server now
writes an audit row too, recording the **field path** and never the value.

Admin access is enforced in every route handler, not by hiding navigation. A signed-in
sender gets **404 rather than 403** on all five admin pages and on the users API, so the
route's existence is not disclosed; an anonymous request is redirected or gets a 401.

### After review

**The scrubber no longer treats `code` as a credential suffix.** It was in the
forbidden list as a substring, so `assetCode`, `statusCode`, `resultCode` and
`countryCode` would all have been silently redacted — and every campaign
creation would have fired the "credential-shaped fields" alarm the moment
someone added `assetCode` to its metadata. The credential words (`seed`,
`secret`, `password`, `token`, `otp`, `apikey`, `privatekey`…) still match as
substrings of the flattened key, whatever the spelling — a whole-segment
rewrite was tried and let `apikey`, `privatekey` and `sessiontoken` through —
and only a field named exactly `code` is treated as an OTP. `verify:admin`
checks both lists, including run-together and all-caps spellings.

**`sessionsEnded` is reported only on deactivation.** Activation used to
sweep the user's expired sessions and return that count under the same name,
so "activated Alice, 4 sessions ended" read as a sign-out. Activation now
touches no sessions, returns `sessionsEnded: 0`, and its audit row carries no
such field.

**Verified by:** `pnpm verify:admin`, 7 sections against a real Postgres. The scrubber is
attacked with the shapes a careless caller actually produces — a session token, an API
key, an OTP, a password, an oddly-spelled secret, an authorization header, and a seed
hidden under two innocent field names — because criterion 7 is a claim about every call
site, present and future, not about the four written today. Each section first shown to
fail against a planted regression: dropping the key rule, dropping the value rule, not
deleting sessions on deactivation, and allowing an admin to deactivate themselves.

Checked live against a production build: the access matrix above across all five pages
and the users API; `GET /api/health` returns `{"status":"ok"}` with no auth and no
version, dependency or internal detail; `GET /api/ready` reports reachability; the audit
viewer renders, filters and pages; and posting a seed writes an audit row whose metadata
contains the field name and, confirmed by query, the seed nowhere at all.

**Honest caveat on one check.** `queryAudit` breaks `createdAt` ties on `id`, the fix
#27/#28 needed for paged link lists. The section that walks 30 rows sharing one timestamp
verifies that paging returns each row exactly once — but removing the tiebreaker does
**not** fail it, because Postgres returns those rows consistently at this size either way.
The tiebreaker stays because it is correct and free; it is not proven by a test.

**Not wired yet:** `link.reclaim`, whose action is defined here but whose call site lives
on #13's branch. It gets its `recordAudit` call when that merges.

## 2026-08-22 — Email delivery with OTP-gated retrieval (#14)

Kleym can now email claim links, and email-delivered links ask for a six-digit code
before they will pay out. Senders choose this at the end of the wizard, where the
default is still to take the file and send it themselves.

This is **the one deliberate exception** in the system (SPEC §6.5). Everywhere else,
link material never touches the server; here the sender's browser sends the full claim
URL per recipient. Every mitigation the spec requires is implemented somewhere
specific: the URL goes to the mail provider and is discarded, reaches no database
column, is in no log line, and its queue job is removed from Redis on completion **and**
on final failure — `removeOnFail: true`, unlike every other queue here, because a
delivery that gives up must not leave a claim URL sitting in Redis.

The exception is kept narrow rather than blanket. The seed guard still runs on the
delivery request, over the body with the URLs removed, so a seed smuggled into an email
address or any other field is rejected exactly as it would be anywhere else. And each
URL must parse as this deployment's own `/claim` page with a fragment whose seed derives
the public key of the link it is being sent for — without that, a compromised sender
page could have Kleym email any URL at all from Kleym's own address.

The code exists because email is the one channel Kleym does not control: a forwarded
message or a shared inbox turns a link into a bearer instrument (§12). The code
re-binds it to the address the sender chose. Sender-distributed links have no delivery
record and are not gated — Kleym never saw those URLs and has nothing to bind them to.
Codes are argon2id-hashed, single-use, ten minutes, five attempts, and destroyed rather
than merely counted out when those attempts run out.

One bug was found by testing the live routes: a request for a code on a real
email-delivered link answered **500** when the mail provider was unreachable, while an
unknown key answered **200**. That pair of answers is an enumeration oracle — exactly
what the identical-response rule closes on `resolve` — so a provider outage would have
revealed which keys are live emailed links. A failed send now answers identically and
logs the failure for an operator instead.

### After review

**The gate's wiring is checked, not only the gate.** Every earlier check
exercised `otpSatisfied` as a function; deleting the `otpGate` call from
`submit/route.ts` — the route that moves the money — left all of them green.
`verify:email` now sends three requests against a gated link through the
`prepare/claim` and `submit` route handlers themselves: no header and a wrong
header are refused, the right token gets past the gate. The refusal carries
its own problem `type` (`…/conflict/otp-required`) and the check reads that,
not the prose — with the gate deleted from `submit`, the route still answers
409 for an unrelated reason, so a status-only check would have missed it.
The claim page maps that type back to `otp_required`, so a token lapsing
mid-flow asks for the code again rather than landing on `failed`.

**Verified by:** `pnpm verify:email`, 10 sections against real Postgres and real Redis.
The mailer is injected and records what it was asked to send; the Redis assertions scan
the actual keyspace after the job completes, and the database assertion walks every text
column in the schema looking for the seed rather than checking the columns someone
remembered. Each section first shown to fail against a planted regression: persisting the
URL, keeping completed jobs, mailing any client-supplied URL, removing the five-attempt
lockout, adding a tracking pixel, and restoring the 500 that created the oracle.

Checked live against a production build: a real seed inside `claimUrl` is accepted (202,
queued); **the same seed in the email field is rejected 400 SEED_SUBMITTED**; an
off-origin URL is skipped with a reason; a claim action without a code returns 409 and
with a forged token returns 409; `resolve` returns the same field set for known and
unknown keys; and the seed appears in no log line.

**Not yet verified:** a real send through Resend. This environment's `RESEND_API_KEY` is
a placeholder, so every provider call 401s — which usefully exercised the failure paths
but means no message has actually been delivered end to end. Stated rather than implied,
per `AGENT.md` §6.5.

## 2026-08-22 — Stranded ephemeral account monitor (#19)

`/admin` now shows what the sponsor float has lost to abandoned claims: how many
ephemeral accounts are stranded, how much XLM they lock, and which of them are
something worse than stranded. A job checks every fifteen minutes.

The two-transaction claim is not atomic (SPEC §3.3.2). TX1 can land and TX2 never
follow — a closed tab, a rejected signature — leaving an account on the ledger holding
sponsored reserve. **Kleym cannot recover these**, and the page says so plainly: the
merge needs the ephemeral key, which exists only in the recipient's URL and the
sender's CSV. The same property that makes a database breach harmless makes this
cleanup impossible. No user funds are affected, and the reserve returns by itself when
the link is eventually claimed.

It reports rather than sweeps, and it is careful about what it reports. An account
whose claimable balance has *gone* is not stranded — that claim succeeded and the
database is behind, so it goes to reconciliation instead of being counted as lost
float. An account holding a non-zero balance is not an ordinary strand either: that is
a partially-applied claim, logged at ERROR and labelled "Partial claim" on the report,
because it needs a person rather than patience. And a claim that started minutes ago
is not abandoned, just in progress — the age is taken from the ledger's own record of
when the account was last touched, not from a database column.

The stranded rows are deliberately not reconciliation findings. Drift means something
is wrong; a strand means both sides are telling the truth about a known, documented
cost. Filing it as drift would dilute the one report whose rows are all supposed to
matter.

One bug here came from running the worker rather than reading the code. The sweep only
visits unfinished links, so a link that reached CLAIMED since the last run — a
recipient finally coming back, the *ordinary* resolution — was never revisited, and its
row sat on the report forever reporting float as locked that had already returned. Two
such rows survived every sweep against real data. Settled links are now cleared
explicitly, which is acceptance criterion 5.

### After review

**A scheduled pass is bounded.** `watchEphemerals` reads at most
`WATCH_PASS_LIMIT` (3,000) candidates per run, oldest-first, continuing from an
`ephemeral-watch:cursor` key in Redis and wrapping at the end — the same shape
as reconciliation's pass, sharing `lib/queue/pass-cursor.ts`. What it does not
reach is `remaining` in the report and a WARN in the log. Previously a
10,000-link campaign meant a `*/15` pass that never finished inside its own
interval, with nothing saying so. The verify script drives a limit of 2 over 3
links and checks every one is reached across passes.

**Verified by:** `pnpm verify:stranded`, 10 sections against a real Postgres with every
ledger read injected — a monitor that describes the ledger cannot be checked against a
stub of itself, and one that passes when Horizon is unreachable would report a healthy
float while the real one drained. Each section first shown to fail against a planted
regression: dropping the succeeded-claim hand-off, dropping the age threshold, dropping
the partial-claim detection, sweeping finished links, miscomputing the reserve as
`(1 + subentries) × base`, and removing the settled-link clear. Reserve arithmetic is
checked against SPEC §3.3.2's own figures: 1.0 XLM bare, 1.5 with a trustline.

Checked in a browser against a production build: `/admin` renders the counts, the
locked total and the table, with the total matching the sum of its rows. The sponsor
balance read failed against this environment's unfunded key, which exercised the path
that matters — it renders "Unknown" and says *this is not a balance of zero*, rather
than rendering a zero that would raise a permanent false exhaustion warning. The worker
registers `ephemeral-watch`, runs the job, and two consecutive runs produce an
identical report.

## 2026-08-22 — Reclaim: unclaimed funds return to source (#13)

An expired campaign now has a "Reclaim" button on `/campaigns/[id]`, behind a
confirmation that says plainly what it costs: every unclaimed link stops working.
Signing returns the money to the funding wallet, in batches of 90, and the page
then shows what came back and under which transaction. This closes the loop on the
promise the wizard makes — *"Unclaimed funds return to source."*

The rule underneath it is SPEC §3.4: the ledger decides what may be reclaimed, never
the database. Stellar transactions are atomic, so one operation for a balance a
recipient already took fails with `op_does_not_exist` and voids the other 89 refunds
in the same batch. So the operation list is built from a live Horizon query, and the
signed envelope is re-checked against a FRESH query before submission — a recipient
claiming while the sender is in their wallet is the ordinary case, and the answer is
to rebuild the batch, not to send a doomed one.

Two things the sender never sees but is protected by. A signed envelope reaching for
a balance belonging to a different campaign is refused, and so is one that reclaims
correctly but smuggles an extra payment operation alongside — the wallet's answer is
untrusted input even though the sender is authenticated. And the same envelope
submitted twice, even simultaneously, records one reclaim and returns the same result
to both callers rather than a 500 about a refund that in fact succeeded.

### After review

**`sequence` is gone from `prepare`.** It was documented as "omit for the first
batch", implying a client walks 1, 2, 3 — but the batch list is recomputed from
a live ledger read on every call, so once batch 1 lands the old batch 2 *is*
batch 1, and asking for `sequence: 2` would have skipped 90 balances. The UI
never used it (it loops on a bare `prepare` and stops at nothing-left, which
is correct), so this was a footgun for the next client rather than a live bug.
`prepare` now always builds the first batch of what is left and reports
`batchesRemaining`; the verify check walks 200 links by shrinking the ledger
between calls and asserts batch 2 is links 91–180.

**The panel ends its loop on the nothing-left 409 only.** `prepare` also
answers 409 for "not expired yet" and "sender account does not exist on this
network"; breaking on any 409 turned both into "There was nothing left to
reclaim". Conflicts now carry a `type` suffix (`…/conflict/nothing-left`,
`…/conflict/not-expired`, `…/conflict/no-sender-account`) and the panel
matches on that, surfacing the other two as errors.

**Amounts are `toFixed()`, never `toString()`.** One stroop rendered as
`1e-7` in the panel and was stored as `1e-7`; it is now `0.0000001` on the
wire and in `ReclaimBatch.amount`, with a check. The panel's reclaimed total
also summed with `Number` — a §4.1 violation — and now uses `Decimal`.

**Verified by:** `pnpm verify:reclaim`, 10 sections against a real Postgres with the
ledger reads and the network submit injected — a check that passes when Horizon is
unreachable would prove nothing about a rule that is *about* the ledger. The
envelopes are really signed and really parsed by the SDK; only the network boundary
is faked. Each section was first shown to fail against a planted regression: removing
the expiry refusal, deriving operations from rows instead of the ledger, dropping the
staleness re-check, dropping the cross-campaign ownership check, and letting the
duplicate-hash collision propagate. The concurrency section needed a barrier in the
injected submit to make the race actually happen — without it, the first write
finishes before the second reads and the check passes no matter what the code does.

Checked in a browser against a production build: `/campaigns/[id]` renders the
campaign, its links and the reclaim panel; the warning panel appears only on
confirmation, not on load; `prepare` on a campaign with nothing on-chain returns 409
with a plain explanation; unauthenticated returns 401 and the page redirects. Posting
a real Stellar seed to `reclaim/submit` returns 400 `SEED_SUBMITTED`, records a
security event, and the seed appears nowhere in the log.

**Not yet verified:** the end-to-end testnet path — a funded campaign, expiry, and the
sender's balance rising by exactly the reclaimed sum (SPEC §10.5 criterion 6). That
needs a campaign whose expiry has genuinely passed on-chain, so it is a testnet run,
not a unit check. Stated rather than implied, per `AGENT.md` §6.5.


## 2026-08-22 — Reconciliation and expiry sweeps (#12)

The database no longer has the last word on whether a link was claimed. A sweep runs
every five minutes comparing every ACTIVE link against the ledger and correcting the
row in the chain's favour, and an hourly sweep expires links and campaigns past their
date. Senders see nothing new; admins get `/admin/reconciliation`, a drift report with
severity and a "Resync now" button.

Two rules matter more than the corrections. Reconciliation never guesses: a balance
that has left the ledger without an indexed claim operation is recorded as unresolved
and re-read next run, not assigned an invented claimant. And it never auto-corrects the
critical case — a link the database calls CLAIMED that the ledger still holds — because
that discrepancy means something is wrong that a status update would paper over
(SPEC §7.2 step 5). It is reported at error severity and left exactly as it was.

Three bugs here were found by running it, not by reading it. A Horizon 404 — what an
unindexed balance looks like — threw rather than returning "no disposal"; combined with
an unguarded loop, one unreadable link aborted the entire run, so a single bad row would
have stopped reconciliation for every remaining campaign. And the "Resync now" button had
no deduplication, so twenty clicks queued twenty full multi-minute sweeps to run one
after another. All three are fixed and each has a check that fails without the fix.

### After review

**Criticals sort first, by definition.** `severity` was a String sorted `desc`,
which is lexicographic — `warn > info > error` — so every critical landed at the
bottom of the report under a comment claiming the opposite. It is now a Prisma
enum declared in display order (`error`, `warn`, `info`); Postgres sorts an enum
by declaration order, so `asc` means "as declared" rather than an alphabetical
accident that the next severity name would break. The migration casts the
existing column in place. A check now records a warn before an error and reads
the report in page order; it fails with the old direction.

**A scheduled pass is bounded.** `reconcileAll` reads at most
`RECONCILE_PASS_LIMIT` (1,000) links per run, oldest-first, continuing from a
Redis cursor where the previous pass stopped and wrapping at the end. What it
did not reach is `remaining` in the report and a WARN in the log — previously a
10,000-link campaign meant a pass that never finished inside its own five-minute
interval, with nothing saying so. The cursor lives in Redis rather than a column
because advancing a per-link column would write every row on every run, which is
the noise §10.13 says a second run must not add. The manual per-campaign resync
stays unbounded: an admin asked for that campaign.

`BalanceDisposal.reclaimed` is gone. It was always `false`, carried a comment
promising the caller would fill it in, and the caller computed its own answer.

**Verified by:** `pnpm verify:reconcile`, 10 sections against a real Postgres, every one
first shown to fail against a planted regression — including auto-correcting the critical
case, inventing a claimant, expiring CLAIMED/PENDING links, rethrowing the 404, removing
the per-link isolation, and dropping the queue deduplication (which queued 20 sweeps).
The live Horizon reader is exercised against the real network, not a stub, because the
other checks inject a fake reader and structurally cannot cover it. End to end on the
worker: an admin request reached the queue, the worker picked it up and logged
`reconciliation completed`. `/admin/reconciliation` checked in a browser — 200 with the
drift report, `POST /api/admin/reconcile` returns 202, and unauthenticated returns 404
rather than 403 so the route's existence is not disclosed.


## 2026-09-12 — Dependency bump: audit gate green again

No user-facing change. Advisories published since 22 Aug turned CI's
`pnpm audit --audit-level=moderate` red on every open PR without any of them
touching the lockfile — two critical unauthenticated-RCE advisories on Next.js
among them. `next` → 16.3.5, `prisma`/`@prisma/client`/`@prisma/adapter-pg` →
7.10.0, `@creit.tech/stellar-wallets-kit` → 2.6.0, plus same-major
`pnpm.overrides` for `mysql2`, `fast-uri` and `stream-json`, each with its
reason in `package.json`. Details in the README.

**Verified by:** `pnpm audit --audit-level=moderate` exits 0 (one low remains,
below the gate); typecheck, lint, 167 unit tests and a cold `pnpm build` pass.
`prisma generate` and `migrate deploy` run under 7.10.0 in the verify scripts.

## 2026-08-22 — Claim page: hardened surface and full state machine (#11)

`/claim`, the route that handles a bearer secret in a URL fragment for an
audience who may never have used Stellar. Fourteen states, each with a designed
screen: the twelve `SPEC.md` §5.1 names, plus `materialising` and
`awaiting_ledger`, which the two-transaction claim (§3.3) needs and the original
issue text predates.

The seed lives in one component ref for the length of one claim. It derives a
public key and signs two transactions in memory, and is never sent, stored, or
logged. `readFragment` returns a bare `false` on every failure — no reason, no
echo of the input — so a caller cannot render or report a value that is very
often a real seed with a typo.

**Retry resumes at TX2, not at the start.** TX1 has landed by the time TX2 can
fail, and the ephemeral account it created is sponsored by Kleym; restarting
would materialise a second account and strand the first's reserves, which §3.3.2
says Kleym cannot recover.

### After review

**The reason screens are wired to a discriminator, not to prose.** `expired`
and `already_claimed` were reached by regex over the 409's `detail` — a
copy-edit on the server would have left both screens unreachable with every
test green. The conflict now carries a `type` (`…/conflict/expired`,
`…/conflict/already-claimed`, `…/conflict/not-ready`) and both sides import
the URIs from `lib/claim/problem-types.ts`; the machine test reads the
response the route function actually emits, so a change to either side
breaks there rather than in a browser.

**`retryTarget` now drives the retry.** Its answer is passed into `run(from)`:
`preparing` skips the wallet connect and TX1, `ready` runs the whole flow.
Previously the value was overwritten by `run()`'s first `setState` and the
skip was decided by a separate ref, so the tested function had no effect.

**The ledger wait is no longer only a clock.** After TX1 the page waits about
one ledger, then treats a `not-ready` 409 from `prepare/claim` as "ask again"
— up to eight times, 2.5s apart — rather than as a failure with a message
about waiting.

### The fragment format changed

The wizard was writing `/claim#<seed>` while `SPEC.md` §3.6 specified
`#s=<base64url-encoded-seed>` — two merged pieces disagreeing. Settled as
`#s=<seed>`: the spec's named parameter, so a second field can be added later,
but the seed **raw**.

Encoding it would blind every leak guard in the repo. `scanForSecretSeed`, the
`NEXT_PUBLIC_` env scan and the CI grep all match `S[A-Z2-7]{55}`, and none of
them recognises `U0FTWkJXWkRDUll…`. A format that hides a leaked seed from the
machinery built to catch leaked seeds is worse than one that does not, and the
fragment is withheld from the network either way. `SPEC.md` §3.6 and §5.1 and
the wizard now agree.

### Voice

`BRAND.md` §8 matters more here than anywhere: this audience did not choose to
be here, someone sent them a link. No "crypto", "web3", "dApp", "protocol" or
"non-custodial" — the footer says "Only you can access these funds. Kleym never
holds them." No exclamations: "Claimed", not "Success!". The failure screen
leads with *your funds are untouched*, because that is the first thing a person
fears.

**Verified by:** 26 unit tests over the fragment reader and the state machine —
including that a base64url seed is refused, that a failure reveals nothing about
what it rejected, and that the retry target is `preparing` rather than `ready`.
15 Playwright tests against a production build with the real CSP: zero
third-party requests, `Referrer-Policy: no-referrer`, no `unsafe-inline` or
`unsafe-eval`, the fragment gone from the URL and absent from every request,
cookie, storage entry **and the DOM**, and the public key — not the seed —
crossing the wire.

The hydration test is the one that matters most: #6 shipped a CSP that refused
every script while the route still returned 200, so reaching `ready` is asserted
rather than a status code. Two leaks were planted and both caught — a
`clearFragment` made into a no-op, and the seed sent where the public key
belongs.

Closes the two criteria #6 carried forward and could not verify: §10.7 (no log
line derived from a fragment) and §10.8 (zero third-party requests).

## 2026-08-22 — Claim API: resolve, prepare, submit (#10)

The server half of the claim flow — the only place Kleym signs on a recipient's
behalf, and the only place `SPONSOR_SECRET_KEY` is used.

`GET /api/claims/resolve` returns link metadata for the claim page. `POST
/api/claims/prepare/materialise` builds TX1, `POST /api/claims/prepare/claim`
builds TX2, and `POST /api/claims/submit` submits either and records what the
ledger did. All four are unauthenticated and rate limited per IP.

The transaction shapes follow the #1 spike, not the original spec text — two
transactions, TX2 in a later ledger, with the ephemeral trustline removed before
the merge because `AccountMerge` refuses an account holding a subentry. The
recipient signature is conditional: they sign only when they source an operation,
because Stellar rejects an unnecessary signature with `tx_bad_auth_extra`.

**The ledger is the authority.** `prepare` reads the claimable balance from
Horizon before building anything, so an `ACTIVE` row pointing at a balance that
has already been claimed or reclaimed is refused. A link becomes `CLAIMED` only
from a transaction Horizon accepted into a closed ledger, and `claimedBy` is read
out of the submitted envelope's merge destination rather than from the request —
so the recorded recipient is who the chain paid, not who the caller said.

**Resolve answers identically for every unavailable link.** Unknown, expired,
claimed, cancelled and pending all return the same shape with every field null. A
live link is a bearer instrument, so any difference between "no such link" and
"expired" is a way to walk the keyspace and find live ones. Even the failure path
returns that shape: a 500 there would be a differential response by another name.

Idempotency is keyed on the transaction **hash** rather than an
`Idempotency-Key` header. These endpoints are unauthenticated, so there is no
user to scope a key to — and `lib/api/idempotency.ts` is keyed on `(userId, key)`
precisely so one caller's key cannot address another's row. The hash is intrinsic
to the envelope, so the same bytes land on the same link whoever sends them.

### The binding gap, and what it taught

Review of #31 found `submitClaim` accepted any Kleym-built envelope under any
link's key. `ephemeralPublicKey` and `signedXdr` arrive as two independent
inputs; the only envelope check was `source === SPONSOR_PUBLIC_KEY`. So a valid
TX2 prepared for link A — which A's own holder obtains legitimately — could be
posted under link B's key. Reproduced: B's row went `CLAIMED` with A's hash and
the attacker's address, while B's balance sat untouched on the ledger with no
path out until expiry.

That made knowing a PUBLIC KEY sufficient to destroy a link, when the design
rests on the opposite — the seed is the bearer instrument, the public key is
not, which is why `resolve` takes `pk` over the wire at all.

The envelope is now bound to the row: TX2 must name this link's `balanceId` AND
source its payment and merge from this link's ephemeral account; TX1 must create
this ephemeral account. Both halves are needed — removing only the op-source half
leaves the cross-link case passing, so it has its own check.

`submitClaim` had no test at all, which is where the bug lived. The Horizon
submit is now injectable, and the checks assert on which row was written and what
went into it.

Two more from the same review. TX1 replay was not idempotent: `claimTxHash`
records only TX2, so a `materialise` double-submit — the ordinary case, since
§3.3 requires a ledger boundary and clients re-poll across it — reached Stellar
and returned `tx_bad_seq` as a 409. It now answers from the ledger: if the
ephemeral account exists, TX1 landed. And the on-chain amount and asset were
fetched and discarded; they are now compared against the campaign, because a
divergence fails TX2 on the network with `op_underfunded` or `op_invalid_limit`,
which a recipient cannot act on.

Writing the check exposed flakiness in an existing one: section 2 drew its client
IP from 250 addresses, so two runs in quick succession shared a Redis bucket and
the second saw the first's counts. Three spurious failures that read as a
regression. It is now unique per run.

### What the verification caught

The first version of the ledger-authority check **passed with the expiry check
deleted**. `prepareMaterialise` reaches Horizon for the sponsor guard, and in the
test environment that fails for an unrelated reason — so the call was refused,
the check asserted only "not ok", and it read as green. The ledger read is now
injectable and the checks assert on the *reason*, not merely that something was
refused. Re-planted, all three regressions now fail correctly.

**Verified by:** 19 unit tests over both transaction shapes — op lists for all
four permutations, the trustline-before-merge ordering asserted by index rather
than by presence, and the conditional recipient signature cross-checked against
whether the recipient actually sources an operation. `pnpm verify:claims` runs
against real Postgres and Redis: the five unavailable shapes are byte-identical
including key order, resolve and claim hold separate per-IP budgets at 20 and 10,
and eight row states are refused for the right stated reason. Every check was
confirmed to fail against a planted regression.

Exercised through a running production server: a live link resolves with its
metadata, an unknown key returns the unavailable shape, 25 resolves from one IP
gave exactly 20 allowed and 5 limited with `Retry-After: 60`, and a seed planted
in a request body was refused with a `SEED_SUBMITTED` security event and appears
nowhere in the log.

The four on-chain permutations themselves were proven on testnet by the #1 spike
and stay there — AGENT.md §7.2 keeps network-dependent tests out of the commit
gate.

## 2026-08-22 — Resolved design decisions applied

Eight open decisions were settled interactively. Five were confirmations of what the
documents already said; three changed code or spec.

**`/api/claims/prepare` is now two endpoints** — `.../materialise` and `.../claim`.
Steps 2 and 5 of `SPEC.md` §3.3.3 are different operations, not one route
parameterised by a body field, and a single endpoint returning different transactions
for different payloads collides with the `Idempotency-Key` rule in `AGENT.md` §4.3: a
genuine second phase has to be distinguishable from a replay. Splitting makes that
structural, puts the §3.3.2 ledger-boundary hazard in the URL, and lets the two carry
different rate limits — `materialise` is the retry-prone one, so it gets 20/min against
`claim`'s 10/min. `SPEC.md` §3.3.3 and §6.4 and `AGENT.md` §5.6 all amended. This
unblocks #10, and #11, #12, #14 and #19 behind it.

**`/api/ready` reports status only.** It was returning per-dependency detail including
raw exception text — and a connection error carries the host and port. The endpoint is
unauthenticated because Railway's health check calls it, so that was topology and
current failure state handed to anyone who asked. It now returns `{ ready }` with a 200
or 503, and the detail goes to the structured log where operators are already looking.
It was also stale: it still reported Postgres and Redis as "not wired yet". Both are
now really checked, bounded at 3s so a hung dependency cannot hold the health check
open.

**Three accent colours darkened.** `BRAND.md` §10 asked for `#7DCCAD` and every accent
pairing to be verified, and predicted several would fail. Measured against the real
page surface rather than white: `action` 1.80, `accent-yellow` 1.15, `accent-pink`
1.95, where WCAG 1.4.11 wants 3:1 for anything identifying a UI component. The
`#7DCCAD`/`#002116` pairing §10 flagged was never the problem — that was 9.04. The
failure was the primary button's *edge* against the page, effectively invisible to a
low-vision user. Hue and saturation held, lightness moved only as far as 3:1 required:
`#3FA07A`, `#AC8D00`, `#EF57A1`. Hover now deepens rather than lightens, because
lightening from the darkened base lands at 2.62 — a hover state that drops the control
below the floor it just met, at the moment the user points at it.

Confirmed unchanged, with the reasoning recorded: no `position` column on `ClaimLink`
(the confirm worker derives balance IDs from the ledger's claimants, so a position
column would be a second source of truth about something the chain already answers);
the rate limiter keeps failing closed; `SPONSOR_SECRET_KEY` stays a single Railway
secret; Resend stays the mail provider; public-network cutover waits for the #17
acceptance matrix. Sentry was not adopted.

**Verified by:** 13 new contrast tests that read the tokens out of `globals.css`, so
the floor cannot drift back with a palette edit — confirmed to fail on all four
component-fill assertions against the old pastels. 148 unit tests, typecheck, lint. The
built stylesheet was fetched from a running production server and checked to carry the
new values and none of the old. `/api/ready` was exercised with Redis genuinely
stopped: 503 with no detail to the caller, `{"redis":"Command timed out"}` in the log,
and 200 again once it came back.

## 2026-08-21 — Campaign wizard, client-side keygen and the CSV hard gate (#8)

`/campaigns/new`, in three steps: asset and amount, recipients and expiry, then
review and create. This is where every secret the product will ever hold is
created, and the order in step 3 is fixed — checkpoint warning, generate,
**export**, sign, offer the export again.

The gate is a piece of state only the download handler can set, after the browser
has actually been handed the file. Signing is unreachable while it is false, and
going back — which discards the generated keys — shuts it again, because a file
downloaded before a regeneration describes keys that no longer exist.

Seeds live in React state and in the downloaded CSV. Nothing else: no
`localStorage`, no `sessionStorage`, no cookie, no URL, no request body. Only
`publicHalves` — the G… addresses and the sender's own labels — crosses to the
server.

Reserve is read from `GET /api/stellar/reserve`, which reads the live
`base_reserve_in_stroops` off the last closed ledger. The browser cannot ask
Horizon itself: CSP is `connect-src 'self'`, and relaxing that would open an
egress path on the same origin that generates the seeds.

Labels refuse anything that parses as a Stellar address or a secret seed, naming
the line. Only the first column of a pasted row is read — a pasted spreadsheet
row routinely carries an address in a later column, and reading it would be
reading the thing this refuses.

### Two things worth recording

**The `.secret()` CI guard forbade the thing the product must do.** It banned seed
extraction anywhere under `src/`, but `AGENT.md` §1 says seeds are "generated in
the sender's browser" — which is `src/`. Rather than weaken it, the guard now
exempts exactly one module, and that module is constrained instead.

The constraint is `import 'client-only'` at the top of `keygen.ts`. That package
throws under the `react-server` condition, so a server component or route handler
importing it fails the **build**, by name — enforcement by the compiler rather
than by a text search. Verified against a planted route handler.

A CI step still runs as the earlier, friendlier signal, and it now matches any
spelling of the module path. The first version matched `@/lib/campaign/keygen`
but not `./keygen` — the natural way to write it from inside that directory — so
a planted server module using the relative form went entirely unseen. It also
accepts either quote style around `'use client'` and looks past a licence header.

The guard caught `download-gate.ts` on its first run, which manipulates
`document` and `Blob` and had no client marker.

**The wallet kit brought 34 advisories, one critical.**
`@creit.tech/stellar-wallets-kit` depends on Trezor, Ledger, WalletConnect and
Reown adapters, all hard dependencies, so no subset install avoids them. Every
finding traced to pinned `protobufjs@7.4.0`, `axios@1.16.0` and an old `uuid`, all
of which have patches within the same major — so they are overridden to patched
versions with the reasoning recorded in `pnpm.overridesReason`, alongside the
existing `deepmerge-ts` entry. `pnpm audit --audit-level=moderate` now reports one
low advisory (`elliptic`, no patch published), below the gate.

Also removed a dead `clientIp` in `lib/security/guard.ts` that read the
**leftmost** `X-Forwarded-For` entry — the spoofable one #25 fixed. Nothing
imported it, but it sat next to the guard every route already imports.

**Verified by:** 25 unit tests over keygen, CSV quoting, claim-URL fragment
placement, label refusal and Decimal cost arithmetic. Four Playwright tests
against a production build with the real CSP: the gate resists a click, a keyboard
activation and a dispatched event; the downloaded CSV's seeds appear in no request
the page made, nor in storage, cookies or the URL; regenerating shuts the gate;
labels refuse an address. Confirmed to fail against a planted removal of the gate.
Both CI guards proven against a planted violation and a clean tree.


## 2026-08-21 — Batch build, sign, submit and the batch-confirm worker (#9)

A campaign's registered public keys become live claimable balances on-chain. One
`CreateClaimableBalance` operation per link, batched at 90 under the protocol's
ceiling of 100, signed by the sender in their own wallet, submitted by Kleym, and
confirmed from the ledger rather than from anything the client said.

`POST /api/campaigns/[id]/batches/prepare` returns the unsigned envelope for the
next batch that still needs signing, with the reserve it locks computed from the
base reserve read off the last closed ledger. `POST .../batches/submit` re-derives
the signed envelope against the campaign row before submitting — the operations
are compared to the campaign's asset, amount, expiry and registered ephemeral keys,
and the sender's signature is verified. `POST .../batches/retry` re-opens failed
batches; `GET .../batches` is what "Batch 3 / 12 signed" renders from.

Links become `ACTIVE` only in the `batch-confirm` worker, which waits for the
transaction to reach a closed ledger, takes the balance IDs out of the result XDR,
and reads each balance back off the ledger before writing it. A transaction Horizon
has not indexed yet is retried, never treated as failed — "not found" and "did not
happen" are different answers, and confusing them would mark funded links `FAILED`.

Partial creation is recorded honestly: when a batch fails its links go to `FAILED`,
never reach the CSV, and the campaign becomes `PARTIAL`. A fully confirmed campaign
still waits in `CREATING` until the CSV export is recorded, because the sender holds
the only copy of every seed.

Two things the verification caught that would otherwise have shipped:

- Comparing `transaction.networkPassphrase` to the expected one checks nothing. An
  envelope carries no network identifier — `fromXDR` labels the parsed transaction
  with whatever passphrase it is handed. The network is only mixed in when the
  signature payload is hashed, so verifying the sender's signature is what actually
  rejects a wrong-network envelope, and one the sender never signed.
- Two prepare calls racing from an unplanned campaign both open a serializable
  transaction; the loser aborts, which is the transaction working. Letting that
  abort propagate turned an ordinary double-click into a 500.

**Verified by:** 30 unit tests covering the 90/91/200 batching boundaries, both
predicate directions, reserve arithmetic at a base reserve that is not 0.5, and
nine envelope-tampering cases (substituted claimants, shifted expiry, altered
amount, wrong source, wrong signer, wrong network). Balance-ID derivation is
checked against a real testnet transaction whose IDs were read back from Horizon
(`tests/fixtures/balance-id.json`, regenerate with `pnpm fixture:balance-id`), and
against the same IDs parsed out of its result XDR. `pnpm verify:batches` exercises
the lifecycle against real Postgres — planning, the 7-of-12 partial failure, the
`balanceId`/`CONFIRMED` invariant, CSV-gated activation, retry touching only failed
links, and re-submission returning the original result. Each check was confirmed to
fail against a planted regression before being kept. Both scripts run in CI against
a real Postgres service.

`pnpm verify:confirm` drives the worker end to end against the fixture's real
testnet transaction — balance IDs out of the result XDR, each balance read back
from Horizon, links ACTIVE and mapped to the right ephemeral key, and a second run
a no-op. It runs the same transaction twice, the second time with links enumerating
in the opposite order, which is what distinguishes a ledger-derived mapping from a
positional one. It needs the network, so it stays out of the commit gate
(AGENT.md §7.2).

### Link ordering

Every query that lists links orders by `(createdAt, id)`, from one shared
`LINK_ORDER` constant. `createdAt` defaults to `CURRENT_TIMESTAMP`, which in
Postgres is *transaction* time, so all 90 links registered by one `createMany`
carry an identical timestamp — and `ORDER BY "createdAt"` over equal keys is not a
total order. Updating fifteen of ninety links so their tuples relocate returns a
different permutation from the same query; with the `id` tiebreak it does not.

Because batch membership, operation index and balance-ID mapping are all
positional, two queries disagreeing about order would write one recipient's
balance ID onto another recipient's link. The confirm worker no longer relies on
that agreement at all: it matches each balance to the link whose ephemeral key is
one of the balance's claimants, so the mapping comes from the chain rather than
from list position (AGENT.md §4.2).

## 2026-08-21 — Public read-only API v1, API keys, and settings (#16)

Three read-only endpoints under `/api/v1`, authenticated with `Authorization: Bearer`,
rate limited at 100 requests per minute per key, and scoped to the key's owner in the
query rather than by a check afterwards.

There is no write endpoint and there will not be one in v1. Creating a campaign means
generating a keypair per link in the sender's browser; an API that accepted them would
move secrets through a server. CI fails the build if a `POST`, `PUT`, `PATCH` or
`DELETE` handler appears under `src/app/api/v1/`, so the boundary is enforced rather
than remembered.

Keys are issued and revoked on `/settings`, alongside password change. A key is shown
exactly once — only an argon2id hash is stored, and the settings page renders from a
query that selects the prefix and timestamps and cannot return the key. Revocation
takes effect on the next request, because resolution reads `revokedAt` every time
rather than caching.

Amounts cross the boundary as strings. A JSON number cannot hold Stellar's seven
decimal places across its range: `922337203685.4775807` — the protocol maximum —
becomes `922337203685.4775` as a double.

One bug the verification caught, which would have failed roughly half of all issued
keys: base64url's alphabet contains `_`, and the parser split the key on `_` and
expected three parts. Any key whose random half happened to contain an underscore was
rejected as malformed, and the rest worked — which is exactly how that reaches
production. The prefix is now hex and the key is parsed by a fixed-width pattern that
takes the secret as everything after the second separator, so its alphabet cannot
matter.

Every listing orders by `(createdAt, id)` rather than `createdAt` alone — links
through the shared `LINK_ORDER` constant #9 introduced, campaigns and API keys
inline for the same reason.
`createdAt` defaults to `CURRENT_TIMESTAMP`, which in Postgres is *transaction*
time, so all 90 links registered by one `createMany` carry an identical
timestamp — and ordering by it is not a total order over them. Under
`LIMIT`/`OFFSET` that means a consumer walking pages sees some links twice and
never sees others: measured at 90 rows returned but only ~45 distinct, with
roughly half the campaign's links unreachable. The `id` tiebreak is a cuid,
unique always, so it breaks every tie and introduces none.

**Verified by:** 23 unit tests over amount round-tripping at the protocol maximum and
the problem+json shape of every error path. `pnpm verify:api-keys` runs against real
Postgres and real Redis — the limiter fails closed, so without a live Redis the checks
would pass for the wrong reason. It covers key resolution, immediate revocation, the
key being unrecoverable from any stored column, `lastUsedAt`, the 100/101 boundary with
a second key on the same account unaffected, and cross-account isolation. Twenty-five
keys are issued and all must resolve; one key proves nothing when the failure rate is
50%. Paging is walked twice, once with writes landing between pages and once against
an idle table. Each check was confirmed to fail against a planted regression.

## 2026-08-21 — Campaign API (#7)

Senders can create campaigns, register the public half of their claim links, list and
filter their campaigns, rename or cancel a draft, relabel a link, and record that the
secrets CSV was downloaded.

Amounts cross the API as strings and are stored at Stellar's exact seven-decimal
precision — a JSON number would silently lose it. Every mutating endpoint requires an
`Idempotency-Key`, so a retried request returns the original response instead of creating
a second campaign. A campaign belonging to someone else is indistinguishable from one that
does not exist.

Anything containing a Stellar secret seed is rejected before it is parsed, and recorded as
a security event.

**Verified by:** every criterion exercised against real Postgres and Redis with two
separate users — cross-user access 404s on all four endpoints, a replayed key returns the
identical body with `idempotent-replay: true` and creates no second row, the same key with
a different body 409s, three seed-injection shapes are refused with the seed absent from
both response and log, `0.3000000` round-trips exactly, and the declared link count is
enforced.
## 2026-08-21 — Sign-in (#5)

Senders can sign in at `/login`. Sessions are revocable, `/dashboard` and `/admin` are
gated, and an admin who is deactivated loses access on their next request rather than
whenever their session happens to expire.

A failed sign-in says the same thing whether the username exists or not, and takes the
same time either way — otherwise the response is a way to enumerate accounts. Five
attempts per IP in fifteen minutes, and an account locks after ten failures regardless of
source; while locked, even the correct password is refused.

Changing a password rotates the current session and revokes every other one. That is the
point rather than a side effect: if someone else has a session, this is how the owner
evicts them.

**Verified by:** every criterion exercised against real Postgres and Redis — cookie
attributes read off the response, unknown-user and wrong-password responses compared
byte-for-byte and by timing, 6th attempt refused with `Retry-After`, lockout confirmed to
hold against the correct password, two concurrent sessions reduced to one by a password
change with the old token replayed and refused, `/admin` returning 404 (not 403) to a
SENDER, and no password or session token present in any log line.
## 2026-08-20 — Security headers and seed rejection (#6)

Every response now carries a nonce-based CSP with no inline script and no `eval`, plus
HSTS, `nosniff`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`. `/claim`
sends `Referrer-Policy: no-referrer`; everything else sends `strict-origin-when-cross-origin`.

Any request body containing a Stellar secret seed is rejected with `400` problem+json and
recorded as a security event. The scan runs before schema validation, so a seed hidden in
a field the schema would strip is still caught, and it finds seeds embedded in URLs, JSON
blobs and prose — not only bare values.

**Verified by:** all six headers read off a running server; `/claim` confirmed to override
`Referrer-Policy`; four seed-injection shapes (bare, in a label, in an unknown key, deeply
nested) all rejected `400` with the field path recorded and the seed absent from both the
response and the log; a valid request still accepted; 18 unit tests; CI guards confirmed
to fire on planted `unsafe-inline` and `unsafe-eval`.
## 2026-08-20 — Design system and landing page (#4)

Kleym has a visual identity: the token set from `BRAND.md`, a component library, the app
shell with its 256px sidebar, and a landing page describing what the product does.

Fonts are self-hosted, so no route makes a third-party request — a hard requirement for
`/claim`, which handles bearer secrets. The icon font is subsetted from 3.8MB to 24K.

**Verified by:** served HTML inspected for external references — none; all three fonts
confirmed loading same-origin from `/_next/static/media/`; every colour pairing in
`BRAND.md` §10 measured, two contrast failures fixed and the remainder documented in
`docs/design-system.md`; `typecheck`, `lint` and `build` clean.
## 2026-08-20 — Data model and admin seeding (#3)

The database schema exists: campaigns, links, batches, deliveries, sessions, API keys,
audit log and idempotency keys, per `SPEC.md` §4. Money columns are `numeric(23,7)`,
matching Stellar's exact seven-decimal precision — never floating point.

An admin account can be created with `pnpm db:seed`, and only from explicit credentials.
It refuses to run without `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD`, refuses to
touch a production database unless `ALLOW_PROD_SEED=true`, and never prints the password.
Re-running rotates the password rather than creating a second admin.

**Verified by:** migration applied against a real Postgres 17 container and the resulting
columns read back from `information_schema` (`numeric(23,7)`, no float anywhere); all four
seed refusals exercised directly; seed run twice, confirmed one admin row; password hash
confirmed `$argon2id$`; the CI schema guard confirmed to fire on a planted `ephemeralSeed`
field and stay clean on the real schema.
## 2026-08-20 — Application scaffold (#2)

The application boots. Next.js 16 App Router with the route-group layout from `AGENT.md`
§8, Tailwind 4, a `kleym-worker` entrypoint, and `docker compose up` giving healthy
Postgres 17 and Redis 7.

Configuration is validated at startup through a Zod schema: a missing key exits with a
readable checklist rather than surfacing as an undefined mid-request, and a `NEXT_PUBLIC_*`
variable holding a Stellar secret refuses to boot at all.

`/api/health` reports liveness with no detail; `/api/ready` reports per-dependency
reachability and returns 503 until Postgres and Redis are wired in #3.

**Verified by:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm audit` all clean —
build and both checks run with a completely empty environment, so no secret is needed to
compile or to gate a pull request;
containers brought up and confirmed healthy; server started and `/`, `/api/health`,
`/api/ready` all curled; both env-failure paths exercised directly.

## 2026-08-20 — Claim transaction design verified on testnet (#1)

The sponsored claim flow works end to end for all four permutations: new or existing
recipient, native or non-native asset. Recipients need no XLM — Kleym sponsors account
creation and trustlines, and the ephemeral account is disposed of afterwards.

The design in `SPEC.md` §3.3 had to change to get there. It is now two transactions
rather than one, because Stellar refuses to merge an account in the transaction that
created it, or while it holds a trustline. §3.3 records the constraint and §3.3.2 the
cost: an abandoned claim strands sponsor reserves that Kleym cannot recover.

**Verified by:** `pnpm spike` against `horizon-testnet.stellar.org`, 6/6 checks —
four permutations plus both predicate directions. Exact decimal balance comparison,
post-merge account existence checked on the ledger, reserve obligation computed from
live protocol values.

