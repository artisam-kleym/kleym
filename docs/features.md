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

## 2026-09-17 — Claim policies: bind a link to a channel or a device (#79)

A sender chooses, when creating a campaign, who may claim its links: **anyone with the link**
(as before), **anyone with the link and a claim code** (a 13-character code per link, written
into the secrets file, handed over through a second channel), **only the email address it is
sent to** (Kleym's email delivery and OTP gate — a self-distributed link under this policy
cannot be claimed), or **only the first device that claims** (the first claimant registers a
passkey and the link is bound to it). The claim page states the policy before the recipient
commits to anything, then asks for the credential — code, emailed OTP or passkey — before the
wallet. None of these identifies a person; recipients stay anonymous.

The OTP gate is generalised into one claim-policy gate, applied on all three claim actions —
materialise, claim and submit — as #14's review required; an emailed link on an open
campaign keeps exactly the OTP behaviour it had. Claim codes are stored hashed and never
logged; guesses are counted before comparison, five then a fifteen-minute lock. `resolve`
answers `policy: open` on every unavailable link, so the new field tells an enumerator
nothing. The policy a claim was held to is recorded on the link (`claimedUnder`) and in the
audit trail (`link.claim`).

**One deliberate deviation from the issue's text:** codes are hashed with SHA-256, not
argon2id. A registration of 10,000 links cannot afford 10,000 argon2id rounds in one
request, and unlike a six-digit OTP a 65-bit code is beyond offline attack on a fast hash;
the attempt counter and lockout are the OTP's verbatim.

**Verified by:** `typecheck`, `lint`, `test` and `build` clean; 14 new unit tests — the
policy decision table for all four policies, code normalisation and hashing, code
generation and CSV export, and the unavailable answer's fixed serialisation.
`scripts/verify-claim-policies.ts` drives the three route handlers per policy with no,
wrong and right credentials, checks the hash at rest, the lockout and its expiry, and
`resolve`'s byte-identity across unknown / expired / claimed / cancelled under every policy —
written but **not run** here (no Postgres/Redis). The WebAuthn ceremony and every page were
not exercised in a browser. Coordinate with #77: the claim code is drawn randomly beside the
key and is not yet derivable from the recovery phrase.

## 2026-09-17 — Different amounts per recipient in one campaign (#73)

A campaign can now pay each recipient a different amount. In the wizard, the pasted CSV
takes an `amount` column beside `label`, `reference`, `category` and `note`; a blank cell
pays the campaign's amount per link, a malformed or non-positive one is refused naming its
row, and the seed and address checks apply to that column too. The cost estimate is the
sum of what the links pay, not a multiplication. The downloaded secrets file carries the
amount as its last column so it round-trips. Over the API, `POST …/links` takes `amounts`
(strings, `null` for the default) and `GET …/links` returns each link's `amount`.

Each `ClaimLink` carries its own `amount` (Decimal(23,7), backfilled from the campaign so
no existing row is ambiguous), and money reads the link everywhere: the batch builder
writes it, the batch verifier checks every operation against **that link's** row by
position — one altered operation in an otherwise valid batch is refused — the claim path
and delivery email use it, and reconciliation opens an `amount_mismatch` finding when the
ledger holds something else. Dual control (#45) gates on the SUM of the links' amounts and
never less than the uniform figure, so 9,999 tiny links and one enormous one cannot slip
under the threshold; a uniform campaign's terms hash — and every approval already
recorded — is unchanged, keyed on the campaign's `variableAmounts` flag rather than on the
running sum, so registering a uniform campaign in several batches never invalidates an
approval. The dashboard's "total distributed", the claim history, the signed regulator
export (new `amount` column) and the screening request (`amount` per recipient and a
`totalAmount`, both under the ALLOW hash) all read the link's own figure, as do the
outstanding value on a suspended campaign and a per-link suspension. Detail and link tables
show the per-link amount; the campaign, dashboard and admin lists say "varies" where it does.

**Verified by:** `typecheck`, `lint`, `test` and `build` clean; 32 new unit tests — the
planted single-altered-operation batch and a two-links-swap-amounts batch both refused, a
per-link batch accepted with each operation carrying its own figure, the one-large-link
approval case, the CSV amount column's accept/refuse table, and the summed cost estimate.
Existing batch and claim tests run unmodified. `scripts/verify-reconcile.ts` gained the
amount-mismatch case but was NOT run here (no database in this environment), and the
backfill migration was authored from the schema diff and not run against a copy of real
data — both believed correct, unchecked. The wizard was not opened in a browser.

## 2026-09-17 — Receive-as: the recipient chooses which asset they claim (#74)

A sender can list up to five assets a recipient may receive as (wizard step 1, one per
line; `receiveAs` on `POST /api/campaigns` and the v1 API). On `/claim`, a recipient with
such a link sees a "Receive as" chooser; picking an asset fetches a live price from
Kleym's own backend — `POST /api/claims/quote`, which prices the link's asset through
Horizon's `strictSendPaths` — and shows both the expected figure and the floor the claim
will be held to. `/claim` still makes zero third-party requests.

The conversion happens inside TX2 or not at all: a `pathPaymentStrictSend` from the
ephemeral account replaces the plain payment, sending the whole link amount and
delivering at least `destMin` (the fresh server-side quote less 1%, rounded down, never
zero) of the chosen asset. The trustline Kleym sponsors is for the **destination** asset.
When no path exists the claim is refused with `no-path`; when the book moves past the
floor between quote and ledger the transaction fails (`op_under_dest_min`), Kleym answers
`quote-missed`, and in both cases the page drops the conversion and offers the asset as
sent — a claim that fails because a market moved is worse than one that delivers what the
sender sent. With no conversion, TX2 is byte-identical to before.

**Verified by:** `typecheck`, `lint`, `test` and `build` clean; 34 new unit tests —
the builder swaps exactly one operation, sponsors the destination trustline across
new/existing × native/non-native, needs no trustline when converting into XLM, still
zeroes the sent asset's ephemeral trustline before the merge, `needsRecipientSignature`
equals "the recipient sources an operation" across every permutation with conversion on
and off, and conversion-off XDR is byte-identical; `destMin` rounding and the asset-ref
and allow-list parsers. **Not verified:** a conversion on testnet (acceptance criterion 1
needs a funded link and an order book — `pnpm spike` was not extended here), the claim
page in a browser, and the Playwright zero-third-party check, which was not run in this
environment (the quote is same-origin by construction).

## 2026-09-17 — Suspend, not cancel: a funded campaign's links stay claimable until expiry (#72)

A sender can suspend a live campaign, or a single link, and the product tells the truth
about what that does: Kleym stops resolving and preparing the links, but every balance is
still on the Stellar ledger with the recipient as a valid claimant until `expiresAt`. The
claimant model gives the sender no earlier instant, so nothing Kleym does can stop a link
holder claiming before then — and the suspend dialog, the campaign header, the link tables
and the API response all say so. "Cancel" is now reserved for drafts, which have nothing on
the ledger.

Suspending schedules the reclaim. The suspended panel shows what is still outstanding and
what it is worth in the campaign's asset, and names the date the return is scheduled for.
When that date passes, the hourly expiry sweep marks the reclaim due and fires
`campaign.reclaim_due` to the organisation's webhooks (with `campaign.suspended` at the
moment of suspension). The sender still signs the return with their wallet: Kleym holds no
key that can move the money, so "scheduled" means announced and ready, not submitted.
`SPEC.md` §12 records the limitation; true pre-expiry revocation is a product decision the
issue leaves open. One consequence is stated in the dialog and on the suspended panel: a
claim that had landed its first transaction when Kleym stopped will not get its second from
Kleym, so each in-flight claim becomes the §12 "abandoned claim strands sponsor reserves"
case — the panel shows how many, and the reserve stays locked until the holder finishes with
their own tooling or the link is reclaimed.

**Verified by:** `typecheck`, `lint`, `test` and `build` clean; 14 new unit tests, including
one that evaluates the claimant predicates `claimantsFor` writes and asserts the recipient
can and the sender cannot claim at every instant before expiry — the check acceptance
criterion 6 asks for, so nobody later mistakes suspension for revocation. The migration
adds three nullable timestamps and was authored from the schema diff; it has NOT been run
against a copy of real data (no database in this environment) — believed safe, unchecked.
The pages were not opened in a browser here.

## 2026-09-12 — Single sign-on (OIDC) and SCIM provisioning with deprovisioning (#46)

An Owner connects their organisation's identity provider under Settings →
Single sign-on (issuer, client id and secret, subject and groups claims,
group → role mappings, default role, "SSO only"), and members sign in from
`/login/sso` by handle: authorization code with PKCE, state and nonce held
five minutes, the ID token verified against the IdP's JWKS, and then a
normal Kleym session — no IdP token is stored or logged. Identities link
on the IdP's stable subject only; an unknown subject asserting an existing
account's email is refused, verified or not, until that account links
explicitly from Settings. "SSO only" refuses password sign-in at the API,
identically for a right and a wrong password. SCIM 2.0 (`/api/scim/v2`,
per-organisation bearer tokens) creates members on `externalId` — the same
id the IdP asserts at sign-in — maps groups to roles on every change, and
on `active: false` or `DELETE` ends the membership and revokes every live
session in the same request. The client secret is encrypted under
`CREDENTIAL_ENCRYPTION_KEY` (new, required). SAML is deliberately not
shipped: the connection model leaves room for it. `docs/sso.md`;
`AGENT.md` §5.1 and §5.6; `docs/release.md` rollout note.

**Verified by:** `pnpm verify:sso` (in CI) against Postgres and Redis with
a local OpenID Provider signing real RS256 ID tokens and the login and SCIM
route handlers in-process — full list in `docs/sso.md`: provisioning at the
mapped role and a normal session; a group change reflected on the next
sign-in; single-use state; wrong audience and issuer refused; SSO-only
refusing both passwords identically with no session; SCIM create,
duplicate, filter, OIDC/SCIM meeting on one id, group changes moving the
role in-request, deactivation revoking four live sessions in one request
and audited, reactivation, DELETE, cross-tenant isolation; the email
collision refused for `email_verified` false and true with nothing created
and the refusal audited, then the explicit link; no token or secret in any
log line or row, planted ones redacted. `verify:admin`,
`verify:organisations`, `verify:invitations`, `verify:api-keys`, 226 unit
tests, typecheck, lint, build. Not exercised: the pages in a browser, a
real IdP (Entra/Okta/Google), SAML. Review: the discovery document is now checked at save time and on every start and callback — its `issuer` must equal the configured one, and every endpoint it names goes through the shared `outboundUrl` rule; the ID token is verified against the configured issuer and a `userinfo` `sub` that differs from the token's is ignored. Verified: a document claiming another issuer, and one naming a loopback `token_endpoint` under the production rule, are refused at discovery, at save, at start and mid-flow at the callback; a mismatched `userinfo` merges nothing while a matching one does. On merge with #47: the two at-rest keys became one — `CREDENTIAL_ENCRYPTION_KEY` (replacing `MFA_ENCRYPTION_KEY`, which never shipped) encrypts TOTP keys and OIDC client secrets through `lib/auth/at-rest.ts`; `verify:mfa` and `verify:sso` both green on the merged branch.

## 2026-09-12 — Second factor for senders: TOTP, passkeys, recovery codes, policy and step-up (#47)

A sender can enrol an authenticator app (TOTP, RFC 6238) and/or a passkey
(WebAuthn) at `/settings/security`; TOTP enrolment hands back eight
single-use recovery codes once. A session whose user has a factor unlocks
nothing until the factor is presented (`/login/mfa` after the password);
an Owner can require a factor of Approvers and Owners or of every member,
and a member without one is held at enrolment — on every request, from the
moment the policy is set. The actions that move money ask again: batch
signing, reclaim and API key issuance need a factor verified in the last
five minutes whatever the session's age, and the wizard, the reclaim panel
and the key form prompt for it inline. The TOTP key is AES-256-GCM
encrypted under `MFA_ENCRYPTION_KEY` (new, required, in `SECRET_ENV_KEYS`);
TOTP guesses follow the recipient OTP's semantics — counted before the
comparison, five then a fifteen-minute lock; a recovery code works once and
its use is logged at warn and audited. `docs/mfa.md`; `AGENT.md` §5.1 and
§5.6 amended; `docs/release.md` rollout note.

**Verified by:** `pnpm verify:mfa` (in CI) against Postgres and Redis with
a synthetic P-256 WebAuthn authenticator — see `docs/mfa.md` for the full
list: TOTP and passkey enrolment and sign-in, consumed challenges and
cross-account credentials refused; policy holding an existing session at
enrolment and releasing it; step-up required on a six-hour session, fresh
after a factor, required after 301 s, the five gated routes checked
statically; the key encrypted at rest and redacted from a log call it was
planted in along with codes and the encryption key; recovery code once with
warn log and audit; five-then-lock with the right code refused while locked
and one step of skew accepted. `verify:admin`, `verify:organisations`,
`verify:invitations`, `verify:api-keys`, `verify:write-api`, 226 unit
tests, typecheck, lint, build. Not exercised: the pages and the passkey
browser prompt in a real browser (the routes and the WebAuthn verification
are exercised at the library level with a synthetic authenticator); a QR
code for the TOTP key is not rendered — the key and an `otpauth://` link
are shown instead. Review: a TOTP code is now accepted once (`lastUsedStep`, race-safe), verified by the same code refused a second time and the previous step refused after a later one; adding a factor to an account that has one takes a fresh step-up and marks nothing on the session (verified: a six-hour session is blocked from enrolling, opens after a step-up, and registering a second passkey leaves `mfaAt`/`stepUpAt` untouched); recovery codes are issued with the first factor of either kind, so a passkey-only user has them.

## 2026-09-12 — Write API, outbound webhooks and a local-keygen SDK (#51)

Kleym can now be driven by something other than a browser, without the
guarantee moving an inch. `@kleym/sdk` (`packages/sdk`, with a `kleym` CLI)
generates link keys on the caller's machine, writes the secrets CSV to the
caller's disk at 0600, signs batches locally with the sender key from the
caller's environment, and calls five new `POST /api/v1/...` endpoints —
create, register public keys, mark export, prepare, submit — with public keys
and signatures only. `registerLinks` accepts only the branded value
`publicHalves` produces, and the client scans every body and throws rather
than send a seed. Server-side, every write body is scanned before any schema
and a seed is a `SEED_SUBMITTED` event; CI now checks that each v1 write
route runs the guard (replacing the old "v1 has no writes" check). Writes are
limited at 30/min per key, apart from the 100/min reads (`AGENT.md` §5.6).

Outbound webhooks: an Owner adds endpoints (Settings → Webhooks, HTTPS only)
for `campaign.created`, `campaign.activated`, `batch.confirmed`,
`link.claimed`, `campaign.reclaimed` and `sponsor.low`. Each delivery is a
row and a BullMQ job: HMAC-SHA256 over `timestamp.body` with a per-endpoint
key shown once, 7 attempts with exponential backoff, then parked; three
parks disable the endpoint until re-enabled; list and per-delivery log are
the organisation's. Payloads carry ids, public keys, amounts and hashes and
never a claim URL, a fragment, a seed or an address — refused before a row
is written. `docs/api.md` is the contract; SPEC §6.6 amended.

**Found on the way:** the BullMQ 6 job-id regression from #55 (also fixed on
#68) — `enqueueBatchConfirm` has thrown since that bump.

**Verified by:** `pnpm verify:write-api` (in CI) — see `docs/api.md` for the
full list: SDK end to end against the route handlers and a stand-in Horizon
with no seed in any request, log or row; planted seed refused by all five
endpoints with five audited events; signed deliveries accepted, replay/tamper/
wrong-key refused; retry, park, disable and visibility; payload guard; write
limit apart from reads. Also `verify:api-keys`, `verify:batches`,
`verify:claims`, `verify:reclaim`, `verify:confirm`, `verify:compliance`, 217
unit tests, typecheck, lint, build. Not exercised: the SDK against a running
`next start` over real HTTP (handlers are called in-process), a real Horizon,
and the Settings → Webhooks form in a browser. Review: API keys gained a scope (`READ` default, `WRITE` opt-in at issue time, audited); the migration backfills every existing key to `READ`, since all were issued while v1 was read-only; `requireApiWriter` refuses a `READ` key with 403 `insufficient-scope` and `WWW-Authenticate … scope="write"` before touching anything — verified on all five write routes with no campaign, link or audit row resulting, while both scopes still read. `docs/api.md` now states that the export gate over the API is the caller's attestation and what a lie costs (funds locked until reclaim after expiry), and that webhook signing keys are stored in the clear with the follow-up named.

## 2026-09-12 — Observability: traces, a metric set from this system's own failures, a status page and SLOs (#53)

Both processes export OpenTelemetry over OTLP/HTTP when
`OTEL_EXPORTER_OTLP_ENDPOINT` is set; unset, nothing is registered and every
span and metric call is a no-op. The claim page starts one trace per visit
and sends `traceparent` on every claim call, so resolve, both prepares and
the submit are one trace on the server, each phase its own span with a
phase and an outcome; a batch-confirm job carries the enqueuing request's
context and its worker span joins that trace. The metric set is the one the
issue asked for, each instrument named for the failure it makes visible:
reconcile pass completion and remaining, sponsor spendable and runway,
claim outcomes by phase, batch confirm latency, stranded reserve and
critical accounts, queue depth and oldest waiting job, job duration,
rate-limit rejections by route with `unavailable` distinguishing the
limiter failing closed from a real limit, and dependency up/down.

Span attributes and metric labels go through one allowlist
(`lib/observability/attributes.ts`): a key not named there is dropped, and a
seed, a `#s=` fragment, an envelope or a non-sponsor public key is dropped
under any key. CI's secret-handling job now refuses any OpenTelemetry use
outside the two wrappers, refuses an allowlist naming link or caller data,
and runs the planted-value test. `/status` and `/api/status` are public and
computed live from the readiness probes, the queues, the last bounded
passes and the sponsor float, cached 15 s; `/api/ready` shares the probes.
`docs/observability.md` and `docs/slo.md` (objectives, budgets, what is out
of budget, when to page).

**Found on the way:** since the BullMQ 6 bump (#55) `enqueueBatchConfirm`
threw "Custom Id cannot contain :" on its `batch-confirm:<id>` job id, so
every submitted batch logged "confirmation could not be queued" and waited
for reconciliation. The id is now `batch-confirm-<id>`; the verify script
enqueues under a trace and would have caught it.

**Verified by:** `pnpm verify:observability` (in CI) against Postgres and
Redis with the SDK exporting into memory: three claim spans under a
browser-started trace id with phase and outcome and no ephemeral key or
envelope; outcomes counted by phase with a failed ledger submit as its own
outcome; a batch-confirm job carrying only `batchId` and `trace`, its worker
span in the request's trace with queue, batch id and attempt, its duration
recorded as failed; a queue with no worker showing depth and an ageing
oldest job; a sponsor stubbed to 3 XLM as the gauge with runway; an
incomplete pass counted and its 7 remaining as the gauge, a complete pass
counted; stranded reserve summed and critical counted apart; a batch
submitted 30 s before confirmation as a 30 s histogram sample; a limited
route counted with no address in any label; Horizon (closed port) as
`dependency.up=0` with Postgres 1; no label anywhere with a seed, fragment
or non-sponsor key; a planted seed, fragment, ephemeral key and envelope
dropped from a span leaving only `phase`; the status snapshot reporting
Horizon down, Database operational with no host, overall down, a
below-threshold sponsor as degraded, no campaign id or address, cached
within the TTL and recomputed after it; Redis quit → the limiter denies and
counts `reason=unavailable`. Attribute allowlist and route-label derivation
unit-tested (9). `verify:claims`, `verify:batches`, `verify:confirm`,
typecheck, lint, build. Not exercised: Next.js's own request spans and the
`traceparent` join through a running `next start` (the browser-side header
and the server-side extraction are exercised at the library level), and a
real OTLP backend. Review: the public `/status` and `/api/status` now carry components and states only — no queue depths, pass remainders, stranded counts or sponsor-specific notes (those moved to `/admin/reconciliation`, which gained a live queues table, and to the metrics); the verify script asserts the public snapshot has only `generatedAt`, `overall`, `components` and no digit; `docs/observability.md` states that a browser-chosen trace id is a correlation hint, not an integrity boundary.

## 2026-09-12 — Compliance hooks: screening callback, attestation fields, regulator export (#52)

An organisation that must screen its distributions points Kleym at its own
provider: an Owner sets a callback URL under Settings → Organisation, and
from then on every batch is screened **before** an envelope is handed over —
`prepareBatch`, and again at `submitBatch` — with the campaign's terms and
one entry per recipient carrying the sender's label and reference fields.
The provider answers `allow`, `hold` or `block`; a hold or block refuses
signing with the provider's reason in the 409 and on the campaign page, a
block is final, and an allow is bound to a digest of exactly what was
screened so a changed reference or URL asks again. No answer — timeout
(`SCREENING_TIMEOUT_MS`), connection error, 5xx, unreadable body — **holds**,
and the audit row says why. Requests are HMAC-signed when
`SCREENING_WEBHOOK_SECRET` is set. With no URL configured nothing runs: no
request, no row, no audit. Kleym ships the contract (`docs/compliance.md`),
not a provider or a list.

Recipients gain three optional attestation fields — `reference`, `category`,
`note` — the sender's own reference data. They import through the wizard's
Labels box from a CSV whose header names them (other columns still ignored;
addresses and seeds still refused in any named column), export in the
secrets CSV after the existing four columns, show on the links page, go to
the screening callback and the regulator export, and appear in no
`/api/claims/*` response: `resolveLink` selects none of them, so a link with
attestation answers with the same keys as one without.

`GET /api/org/compliance/export` (Owner) is the regulator export: one row
per link with who sent what, to whom, when, the funding and claim
transactions and the screening decision, scoped to the session's
organisation, signed byte-for-byte with the audit-log key and verifiable
offline with `pnpm audit:verify-export`. Delivery email is deliberately not in it.

**Verified by:** `pnpm verify:compliance` (in CI) against Postgres with a
real local HTTP receiver: the request carries version, terms, organisation
and per-recipient reference fields, no key material, and a valid HMAC; an
allow lets `prepareBatch` through to Horizon and is recorded and audited
with the provider reference; hold refuses `prepareBatch` and `submitBatch`
with the reason (not the case id) and lifts on the next allow; block refuses
and is never asked again; timeout, 5xx, unreadable body and connection
refused all hold within the budget with `source` audited; `submitBatch`
honours an allow without a second call and asks again after a changed
reference or URL; with no URL the gate answers null, no fetch of any kind is
made, nothing is written, no audit row; attestation is stored, absent from
`resolveLink` by key set and by value, and `claims.ts` selects none of the
columns; the export has one row per link of the organisation only, carries
creator, amount, category, claimant and claim hash, has no email column,
signs both formats, fails on one flipped byte, and honours a window; the URL
schema accepts https and loopback http and refuses plain http, credentials
and other schemes. CSV round-trip (export → import), header-named columns,
key material in a named column and per-column caps are unit-tested. Migration
applied to a reset database; `verify:approvals`, `verify:organisations`,
`verify:batches`, `verify:audit-chain`, `verify:claims`, 217 unit tests,
typecheck and lint. Not exercised: the settings form and the campaign-page
notice in a browser (typechecked only), and a live provider end-to-end
through the signing UI. Review: the loopback-HTTP exception is refused in production (`screeningUrlSchemaFor('production')` checked in the verify script); the DNS-rebinding residual and the deliberate `redirect: 'error'` are stated in `docs/compliance.md`; a 409 from prepare (screening hold/block, approval, unfunded sender) now surfaces its detail in the wizard instead of ending the run as "complete"; the wizard says batches are screened while signing.

## 2026-09-12 — Disaster recovery: stated RPO and RTO, rehearsed restore, runbooks (#54)

`docs/disaster-recovery.md` states the objectives with their reasoning:
the RPO is the backup interval, but only for what the ledger cannot rebuild
— delivery state, the CSV-export gate, audit rows, sessions, API keys,
approvals made after the backup — because money is re-derived from the
chain by reconciliation; the RTO is measured. **The post-restore procedure
is code:** `pnpm recover` checks migrations, verifies the audit chain,
reconciles in bounded passes against the live ledger (the critical case is
the operator's signal, not auto-corrected), and counts what cannot be
rebuilt. Backup verification (`pnpm verify:backup`, last in CI's verify job)
restores the dump into a clean database and *asks it* — row counts per
table, the migration ledger, the audit chain, campaign→link joins — rather
than checking that a file exists. Runbooks for sponsor exhaustion, Redis
loss, worker failure and a partially-applied campaign. `SPEC.md` §12 gains
the data-loss limitation and `/admin/reconciliation` states it in the
product, where a person lands after a restore.

**Verified by:** the rehearsal, recorded with its date in the doc — a
database populated by the verification suites, dumped, restored into a
Postgres container that had never seen Kleym, then `pnpm recover` against
live testnet Horizon: 11.9 s from dump to "RECOVERY CHECKS PASSED" (schema
current, chain intact, 0 corrected, 8 unresolved fixture balances, 0
critical). `pnpm verify:backup` run locally: dump, restore, 18 tables with
matching counts, migration ledger, chain and joins all pass in 1.3 s.
Typecheck, lint, build. `verify:backup` refuses up front when the client is older than the server (proven with a stubbed `pg_dump` 16 against Postgres 17: exit 1, dump not attempted), and the join check compares link counts per campaign id against the source rather than asserting a tautology.

## 2026-09-12 — Sponsor pool with failover, outbound alerts and runway (#48)

The sponsor account — Kleym's float, and until now an admitted single point
of failure — is a pool: the primary plus any seeds in
`SPONSOR_SECRET_KEYS_EXTRA`, every one an environment secret. A new campaign
is bound to the first sponsor in pool order with spendable XLM at or above
`SPONSOR_WORKING_THRESHOLD` (the richest if none is), recorded on the
campaign and kept for life — reserves return to the account that sponsored
them, so failover is for new campaigns only. Every claim is checked against,
signed by, and its envelope verified against, that campaign's sponsor;
campaigns older than the pool read as the primary. Creating a campaign
never needs the ledger: if no sponsor balance can be read, the campaign binds
to the primary with a WARN and the claim path gives the honest "temporarily
unavailable" later if it is dry. A campaign bound to a sponsor that has since
left the pool is refused the same way, logged for the operator — never
re-signed by another sponsor, never a stack trace.

Alerts go outward: `ALERT_WEBHOOK_URL` receives a JSON POST on
`sponsor.low_balance` and `sponsor.failover`, deduplicated per sponsor for an
hour in Redis, never failing the claim that raised it; PagerDuty and Slack
relays are documented. `/admin` shows each sponsor's spendable float, live
campaigns, seven-day claim rate and runway — "at the current claim rate this
float lasts N days", fees only, since reserves come back. Runbook in
`docs/sponsor-runbook.md`; `SPEC.md` §12 amended.

**Verified by:** `pnpm verify:sponsors` (in CI) with a two-key pool, stubbed
balances and a real local HTTP receiver: primary below threshold → the second
sponsor is chosen and a failover event reaches the receiver; primary
recovered → chosen again; all below → richest; unreadable → skipped. A
campaign bound to the second sponsor loads with it, a null-bound one as the
primary, and an envelope sourced by the primary is refused for a campaign
bound to the second while the bound sponsor's is accepted. A low-balance
alert is delivered with the event header and sponsor in the body, the second
within the hour is deduplicated, a different sponsor is its own alert, an
unreachable receiver does not throw; no readable sponsor at all still binds
a new campaign to the primary; a campaign bound to a key outside the pool is
"temporarily unavailable" on both load and submit. Per-sponsor status flags the low one;
fee-per-claim and runway arithmetic in `Decimal`. Both pool seeds and the
webhook URL planted in log calls are redacted. `verify:claims`,
`verify:stranded`, 213 unit tests, build.

## 2026-09-12 — The audit log is tamper-evident, append-only and exportable (#49)

Every audit row is now hash-chained to its predecessor (`seq`, `prevHash`,
`rowHash = SHA-256(prevHash ‖ canonical(row))`, with a versioned canonical
form so an upgrade cannot orphan history), written under a lock on a single
head row so concurrent actions queue rather than fork. `pnpm audit:verify`
and `GET /api/admin/audit/verify` recompute the whole chain and name the
first broken link. A database trigger refuses `UPDATE` and `DELETE` on the
table for any connection, except inside the retention job's own transaction
— which removes only a prefix and appends a chained **checkpoint** naming
what it removed, so deletion is itself audited and verification passes
across it. Owners export their organisation's rows as CSV or JSON, signed
byte-for-byte with an Ed25519 key whose public half travels with the file;
`pnpm audit:verify-export` checks a saved file with the public key alone and
recomputes the row hashes inside a JSON export. New secret:
`AUDIT_SIGNING_SEED`. Rows written before the chain are chained once by
`pnpm audit:chain-backfill`, a pre-rollout step on a populated deployment
(`docs/release.md`); it refuses once a live write has taken the first seq.
`docs/audit-log.md` has the detail, including what the chain is and is not
evidence against — a superuser who rehashes everything produces a chain that
verifies, which is why signed exports are kept outside the database and the
public key is recorded out of band.

**Verified by:** `pnpm verify:audit-chain` (in CI) against a real Postgres:
five legacy (unchained) rows, two sharing a timestamp, are reported before
the backfill and chained in `(createdAt, id)` order by it, after which the
chain verifies from genesis and a second run refuses; a modified row, an inserted (unchained) row, a deleted row, a forged
replacement at the same `seq` and a removed tail are each detected at the
right link, and restoring heals; retention over a chain with a mid-chain
gap removes the prefix, writes a checkpoint, and verification passes across
it while a tampered checkpoint is caught; sixty concurrent `recordAudit`
calls produce contiguous `seq`s with each `prevHash` the previous `rowHash`;
JSON and CSV exports verify, one flipped byte fails, and the CLI verifies a
saved file with only the public key while an edited file fails both checks;
`UPDATE` and `DELETE` through Prisma and raw SQL are all refused by the
trigger; the scrubber still redacts before hashing. Every other verify suite
passes and the chain verifies over everything they wrote. The DB-role
`GRANT` in the issue is replaced by the trigger, for the reason in the doc.

## 2026-09-12 — Dual control: a second person approves before a campaign can disburse (#45)

An organisation can require that a campaign worth more than a threshold —
amount per link × link count, in its own asset, so raising the count is not a
way round it — is approved by `N` **Approvers** other than its creator before
any batch can be signed. The gate sits where money moves (`prepareBatch`,
`submitBatch`) and beside the CSV gate on the CREATING → ACTIVE settle, not in
front of the wizard: an Operator drafts and registers links freely, and the
approver reviews exactly what will be signed. Off by default (null threshold),
so nothing changes for a deployment that does not turn it on; Owners set the
threshold and count under Settings.

**Each campaign keeps the policy it was created under.** The threshold and
count are snapshotted onto the campaign at creation and the gate reads the
stricter of that and the organisation's current policy — so loosening the
policy affects only campaigns made afterwards, and an Owner who created a
campaign cannot switch the gate off, sign, and switch it back on. Tightening
still reaches campaigns in flight. The threshold is in units of the
campaign's own asset (100 gates 100 USDC and 100 XLM alike); the settings
page says so.

**An approval is bound to the terms, not the campaign.** Each decision stores
a hash of (asset, issuer, amount per link, link count, expiry); a decision
whose hash no longer matches counts for nothing, and the refusal names what
changed and who had approved the old terms — approve small, edit large, sign
is the first thing a penetration test tries. The creator's own approval never
counts, at any role including Owner. Approvals and rejections are audited
with approver, campaign and terms hash (and the terms themselves, so "what
changed" can be named without a second table). A rejection blocks signing
even alongside approvals. `/approvals` lists what is waiting; the campaign
page shows the state and, for an Approver who is not the creator, the two
buttons. Because the CSV export is already a discrete, audited moment, the
audit log can show an auditor: terms approved by a second person → keys
created → batches signed.

**Verified by:** `pnpm verify:approvals` (in CI) against a real Postgres: a
1,500 campaign is gated and a 500 one is not under a 1,000 threshold, with
`prepareBatch` handing over no envelope and `submitBatch` refusing; approval
opens the gate and empties the queue; dual control off gates nothing; the
creator is refused as Owner and no row is written; a planted `linkCount`
2 → 2,000 after approval is refused naming "link count" and the approver, a
planted amount change names "amount per link", and re-approval reopens it;
the hash covers exactly the five terms; approve and reject each audit with
approver, campaign, hash and organisation; a rejection blocks despite an
approval and 2-of-N counts; the policy is stored, audited, inclusive at the
threshold, and computed with `Decimal` (0.0000001 × 10⁹ = 100); an Owner-creator
setting the threshold to null leaves their existing campaign gated and
`prepareBatch` still refusing, while a campaign created afterwards is not
gated, and tightening reaches both. `verify:batches`
and `verify:organisations` still pass. Not opened in a browser: the approval
panel, the queue page and the policy form.

## 2026-09-12 — Recipient addresses have a lifecycle: retention and erasure (#50)

The address a link was emailed to is the only recipient PII Kleym holds, and
it belongs to someone who is not a Kleym user. It now expires: a daily
maintenance job (`delivery-retention`, bounded and reporting its shortfall on
`/admin/reconciliation` like the others) **redacts** it 90 days after the
link or its campaign settles — nulls the address and the OTP material, sets
`redactedAt`, keeps `sentAt`/`openedAt` as the claim that a delivery
happened. An erasure request is honoured at `/admin/privacy` (Kleym staff):
every delivery to that address, across every campaign and case-insensitively,
is redacted in one operation and any email still queued for it is removed.
Nothing on the link is touched — status, `claimedBy`, `claimedAt`,
`claimTxHash` are the record that money moved, and the chain stays the
authority on them.

The address is written nowhere by either path: the retention and erasure
audit rows carry a count, the scrubber now refuses any `email` key, and the
log lines carry delivery ids. A still-live link whose address was erased
stays OTP-gated but gets no code — the OTP request route answers the same
`sent: true` so the erasure is not an oracle — and its funds return to the
sender at expiry. `docs/data-handling.md` states what is stored, why, and for
how long. The 90 days is a constant (`DELIVERY_RETENTION_DAYS`), stated in
the doc; a cheap decision to revisit.

**Verified by:** `pnpm verify:privacy` (in CI) against real Postgres and
Redis: a link claimed 91 days ago is redacted and one claimed yesterday is
kept, likewise a campaign expired 91 days ago versus yesterday, a live link
is kept; erasure redacts three rows across two campaigns for one address in
two spellings and leaves another address alone; link rows are byte-identical
before and after; a queued send is removed; the live link's gate has no
address; the address appears in no Delivery row, no audit row, no Redis key
or value, and no log line the process wrote; the scrubber redacts `email` and
`recipientEmail`; a limit-2 pass over 5 due rows reports the remainder and
later passes finish the set. `verify:email`, `verify:admin`,
`verify:reconcile`, `verify:organisations`, 213 unit tests, build. Not opened
in a browser: `/admin/privacy`.

## 2026-09-12 — Organisations, memberships and roles (#44)

A campaign now belongs to an **organisation**, not to the person who created
it. Every user is a member of at least one — the migration gave every existing
user a personal organisation with themselves as Owner, so a single-user
deployment behaves exactly as before — and members see each other's
campaigns subject to their role: **Viewer** reads campaigns, links and
history; **Operator** creates, signs, resends and reclaims; **Approver** adds
approval (#45, later); **Owner** manages members and settings. Kleym's `ADMIN`
stays orthogonal — staff, not a customer role.

**This is a query-scope change, not a feature.** `owned()` builds
`{ id, organizationId }` instead of `{ id, userId }`, and every campaign route
and library inherits it; the scope comes from the session's active membership,
resolved on every request, so removing a membership ends that user's access at
once — live session included. Roles are enforced server-side at the route
(`requireUser('OPERATOR')` → 403 for a Viewer), never by hiding a button; the
CSV export is one of those routes. API keys read an organisation's campaigns,
not their issuer's; audit rows carry the organisation and `/admin/audit`
filters by it. Invitations now name the organisation and role the invitee
joins as; owners add members (existing accounts join at once, unknown
usernames are invited) from a new section on `/settings`, and a switcher in
the sidebar moves between organisations.

**Known limitation — adding a member is a username oracle.** An Owner types a
username: an existing account joins at once, an unknown one is invited, and
the two answers differ — so an Owner of any organisation can tell whether a
username exists on the deployment, and can attach an existing account to
their organisation without that person's consent (as a role the Owner
chooses, in an organisation whose data the Owner already controls). Bounded,
and for an admin-provisioned deployment probably what is wanted; the fix if
it stops being is for Owners to always *invite*, with existing accounts
accepting a pending membership from their own settings page and one response
shape either way.

The last-owner guard is one serializable transaction (count and write see the
same rows), so two owners demoting or removing each other at the same moment
leave exactly one owner — the loser gets the same refusal as a plain attempt.

**Verified by:** the #44 migration applied on top of a populated pre-#44
database — three users, three campaigns, a key, audit rows, a pending
invitation — with every row landing in its user's personal organisation and
audit rows without an actor left without one. All 13 existing verify suites
pass on the new schema with fixture-only edits (rows created directly by a
script need the new required column; no assertion changed). New
`pnpm verify:organisations`: two members share a campaign; a member of A gets
nothing for B's campaign by id, detail, search or write at each of the four
roles; the role order; a removed Viewer's live session resolves to no
organisation; the last owner cannot be removed or demoted, and eight rounds
of two owners demoting/removing each other at once each leave one owner
(seven of the eight fail with the transaction dropped to Read Committed);
audit rows filter by organisation. Over HTTP against a production build: Viewer 200 on read,
403 on export and on registering links; outsider 404 on the API and the page;
switching to a non-member organisation 404; a removed member's live session
404 on the next request; the last owner's self-removal 409. 213 unit tests,
typecheck, lint, build.

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

**An invitation can be revoked.** The point of the design is that the admin
never holds a credential they cannot take back, so a link sent to the wrong
person is revocable from `/admin/users` before it expires: the pending
invitation and its still-inactive account (which owns nothing yet) are
deleted, audited as `user.revoke_invitation`, and the token is thereafter
simply unknown. A redeemed account is refused — that is a deactivation, a
different action. `/invite/[token]` carries the token in its path, so it
gets `/claim`'s `Referrer-Policy: no-referrer`. Two admins inviting the same
username at once get one success and one conflict, not a 500.

**Verified by:** `pnpm verify:invitations` (in CI) against a real Postgres and
Redis — inactive on creation, hash ≠ token and token in no row, audit row
naming actor and user without the token, planted password material redacted
by the scrubber, first redemption sets the chosen password and the second is
refused without touching it, expired ≡ unknown, one of two concurrent
redemptions wins, the route's refusals are byte-identical, the sixth attempt
per IP is 429; revoke deletes account and row, the token then fails exactly
as an unknown one, the username is free again, a redeemed account cannot be
revoked, and a simultaneous double invite yields one success and one
conflict. And over HTTP against a production build: no session 401,
SENDER 404 on the route and the page, ADMIN 201, the invitee's login 401
before redemption and 200 after, a second redemption 404, and zero
occurrences of the token in the server log; `/invite/<token>` answers
`no-referrer` where `/login` answers `strict-origin-when-cross-origin`;
`DELETE …/invitation` is 401 without a session, 200 as admin, and the token
is 404 afterwards.

## 2026-09-12 — Scheduled passes report their shortfall on the admin page (#43)

The bounded maintenance passes (#33, #35) already said in the log when they
stopped short of their candidate set. `/admin/reconciliation` now shows it
too: for `reconcile` and `ephemeral-watch`, how many links the last pass read
of its limit, how many it left for the next one, and when it ran — flagged
when the remainder is non-zero or when a job has not run for two of its
intervals. The last report per job lives in Redis beside the pass cursor,
overwritten each run and kept a week, so a job that has stopped shows as
stale rather than as absent. A failed write never fails the pass.

This closes #43: bounding, resuming, reporting in the log and on the page,
and the load test at `MAX_LINKS_PER_CAMPAIGN` (#38) — all in place.

**Verified by:** `verify:reconcile` and `verify:stranded` each assert that
after a limit-2 pass over a 3-link set the recorded report carries the same
`checked`, `remaining` and `limit` as the pass returned, and that the final
pass records zero. Production build renders the page. Not opened in a browser
this pass.

## 2026-09-12 — The sender dashboard (#42)

`/dashboard` — the post-login landing page — now shows what `SPEC.md` §5.2
asked for: total distributed by asset, active campaigns, pending claims (with
how many are still claimable), and the five most recent campaigns linking
into detail. The multi-tenancy note from #38 stays, because until
organisations exist it is the only place a sender is told that colleagues
cannot see their campaigns.

**"Distributed" means claimed, and an asset is (network, code, issuer).** It
is the sum of `amountPerLink` over links in `CLAIMED`, grouped by the
campaign's network, asset code and issuer — a testnet rehearsal and the live
campaign never sum into one "USDC", and neither do two issuers sharing a
code; the card is labelled with the network and the issuer only when a
sender actually has more than one. One `SUM … GROUP BY` in SQL (`$queryRaw`, with
the justification in the code: Prisma's `groupBy` cannot aggregate across a
relation, and the JS alternative is unbounded in campaigns). Not
`linkCount × amountPerLink`: created value is not distributed value, and the
larger number under that heading is what a finance user stops trusting the
product over. Every other figure is a `count`; recent campaigns carry a
`_count` for claimed. Nothing loads a link row and nothing reads Horizon.
Money is `Decimal` and rendered with `.toFixed()`.

**Verified by:** `pnpm verify:dashboard` (in CI) against a real Postgres:
mixed-asset claimed totals (1000.5 USDC from campaigns that *created* 2500.5;
7.5 XLM; an unclaimed asset absent rather than zero), the same code across
testnet/public and across two issuers producing three rows with distinct
labels rather than one 115, scoping between two
users, the recent table equal to the head of `/campaigns` with the same
claimed figures, outstanding excluding an expired campaign's links, one stroop
rendering as `0.0000001` and the largest amount keeping every digit, and a
10,000-link campaign loading in ~5 ms with a payload under 5 KB that contains
no link. Production build renders the route. **Not verified by execution:**
375px (criterion 5) — the metric grid collapses to one column below `md`,
believed correct but not opened in a browser this pass.

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

