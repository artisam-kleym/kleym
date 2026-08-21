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

Every listing orders by `(createdAt, id)` rather than `createdAt` alone.
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
