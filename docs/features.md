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

## 2026-08-20 — Application scaffold (#2)

The application boots. Next.js 16 App Router with the route-group layout from `AGENT.md`
§8, Tailwind 4, a `kleym-worker` entrypoint, and `docker compose up` giving healthy
Postgres 17 and Redis 7.

Configuration is validated at startup through a Zod schema: a missing key exits with a
readable checklist rather than surfacing as an undefined mid-request, and a `NEXT_PUBLIC_*`
variable holding a Stellar secret refuses to boot at all.

`/api/health` reports liveness with no detail; `/api/ready` reports per-dependency
reachability and returns 503 until Postgres and Redis are wired in #3.

**Verified by:** `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm audit` all clean;
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
