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
