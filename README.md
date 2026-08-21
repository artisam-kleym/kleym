# Kleym

Kleym turns Stellar assets into one-time claim links. A sender generates a batch of links, distributes them through whatever channel they already use, and each recipient opens their link, connects a wallet, and claims the asset — without ever handing over a wallet address in advance.

Recipients need no XLM: Kleym sponsors account creation and trustlines.

## The one rule

**Kleym never stores, logs, transmits, or persists a Stellar secret seed.**

Ephemeral keypairs are generated in the sender's browser and exist only inside URL fragments and a CSV the sender downloads. The database stores the ephemeral *public* key — enough to index a link, useless for spending it.

Read [`AGENT.md`](AGENT.md) §1 before writing any line that touches a keypair.

## Documentation

| Document | Purpose |
|---|---|
| [`SPEC.md`](SPEC.md) | Technical specification — protocol, data model, API, jobs, acceptance criteria |
| [`BRAND.md`](BRAND.md) | Design system — tokens, components, voice, accessibility floor |
| [`AGENT.md`](AGENT.md) | Engineering rules and working practice |
| [`docs/features.md`](docs/features.md) | Running log of shipped features |
| [`docs/migrations.md`](docs/migrations.md) | Database and migration conventions |
| [`docs/railway.md`](docs/railway.md) | Deployment topology and secret handling |
| [`docs/design-system.md`](docs/design-system.md) | Tokens, components, and the §10 contrast audit |

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js, App Router, TypeScript strict |
| Package manager | pnpm |
| ORM | Prisma + PostgreSQL |
| Queue / cache | BullMQ on Redis |
| Styling | Tailwind CSS |
| Stellar | `@stellar/stellar-sdk` |
| Wallets | `@creit.tech/stellar-wallets-kit` |
| Hosting | Railway |

### Resolved versions

Resolved at install time, not assumed (`AGENT.md` §3.1). Verified against each library's
changelog before use.

| Package | Version |
|---|---|
| `next` | 16.3.1 |
| `react` / `react-dom` | 19.2.8 |
| `tailwindcss` | 4.3.3 |
| `typescript` | **5.9.3** — pinned, see below |
| `prisma` / `@prisma/client` | 7.9.1 |
| `argon2` | 0.45.1 |
| `zod` | 4.4.3 |
| `@stellar/stellar-sdk` | 16.2.0 |
| `eslint` | 10.8.1 |
| `pino` | 10.3.1 |
| `decimal.js` | 10.6.0 |

#### Prisma 7 deviates from SPEC.md §4 in two places

`SPEC.md` §4 shows a schema written for Prisma 5/6. Two things in it are rejected or
broken by Prisma 7, so the schema here differs. The **models, fields and indexes are
unchanged** — only the generator and datasource plumbing.

1. **`url` is gone from the `datasource` block.** Prisma 7 reads the connection string
   from `prisma.config.ts`. Leaving it in the schema fails validation outright
   (`P1012`). `DATABASE_URL` is read there straight from the environment rather than
   through `src/lib/config/env.ts` — the CLI runs outside the app, and pulling in the
   full Zod schema would make `prisma migrate` require every unrelated key, including
   `SPONSOR_SECRET_KEY`, to run a migration.
2. **`prisma-client-js` emits CommonJS only**, so `import { PrismaClient }` fails at
   runtime under ESM. The generator is `prisma-client` (Prisma 7's own default) with
   output to `src/generated/prisma`, which is gitignored and rebuilt by `postinstall`.

#### Pinned: TypeScript 5, not 7

`typescript@latest` resolves to 7.0.2, and `typescript-eslint` (a transitive dependency of
`eslint-config-next`) refuses to load against it: *"typescript-eslint does not support TS
7.0."* Linting fails outright.

Per `AGENT.md` §3.1 this is pinned to the lower version with the conflict named rather
than silently downgraded. Revisit when `typescript-eslint` ships TS 7 support.

#### Pinned: deepmerge-ts >= 8

`prisma@7.9.1 > @prisma/config` depends on `deepmerge-ts@7.1.5`, which carries a **high**
advisory ([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) — stack
exhaustion on recursive object graphs). No fixed Prisma release exists yet; `@prisma/config@latest`
still pins 7.1.5.

A `pnpm.overrides` entry forces `>=8.0.0`. Verified that `@prisma/config` resolves to 8.0.1
and that `prisma validate`, `generate`, `migrate deploy` and the seed script all still work
under it. Remove the override once Prisma ships a release that no longer needs it.

#### Two toolchain notes

- **Tailwind is v4, which is CSS-first.** There is no `tailwind.config.ts` — tokens are
  declared with `@theme` in `src/app/globals.css`. Resolved in #4; see
  [`docs/design-system.md`](docs/design-system.md).
- **`next lint` was removed in Next 16.** The `lint` script calls `eslint` directly, and
  `eslint-config-next` 16 ships flat config natively (no `FlatCompat`). `eslint-plugin-react`
  cannot auto-detect the React version under pnpm's layout, so it is pinned in
  `eslint.config.mjs`.

## Setup

```bash
pnpm install
cp .env.example .env        # fill in every key; startup validates the full set
docker compose up -d        # Postgres 17 + Redis 7, both with healthchecks
pnpm dev                    # http://localhost:3000
```

```bash
pnpm db:migrate             # apply migrations
pnpm db:seed                # requires SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD
```

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm worker` | `kleym-worker` process — BullMQ consumers and cron |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm lint` | ESLint over `src`, `scripts` and `tests` |
| `pnpm test` | Vitest unit tests (no network; integration runs on a schedule). `tests/setup.ts` supplies a placeholder environment, since some modules validate config on import |
| `pnpm db:migrate` / `db:deploy` | Apply migrations locally / in CI |
| `pnpm db:seed` | Create the admin user (refuses without explicit credentials) |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm spike` | Testnet claim-transaction spike (#1) |
| `pnpm diagnose` | Isolates the two `AccountMerge` constraints behind the two-transaction design |

Startup validates the whole environment through a Zod schema and exits with a readable
list of what is missing. It also refuses to boot if any `NEXT_PUBLIC_*` variable *contains*
a Stellar secret seed — anywhere in the value, not just as the whole of it — since Next.js
inlines those into the client bundle.

Validation happens on first access rather than at import, so **`pnpm build`, `pnpm typecheck`
and `pnpm lint` all run with no environment at all.**

#### Verifying the no-secret build locally

`env -i pnpm build` is **not sufficient on its own**. Next auto-loads `.env` from disk, and
a warm `.next` can skip page-data collection entirely — so the check passes while the
coupling is still there. Remove both first:

```bash
rm -rf .next && mv .env .env.bak
env -i PATH="$PATH" HOME="$HOME" pnpm build
```

This has regressed four times. CI is the reliable check because it starts from a clean
checkout with no `.env` at all. The sponsor's secret key is needed by
the running service, never by the build or by CI.

`.env` is gitignored. `SPONSOR_SECRET_KEY` belongs in Railway's secret store and never in the repo.

## End-to-end tests

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

Needs Postgres, Redis and a seeded account (`SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD`, matched by `E2E_USERNAME` / `E2E_PASSWORD`). Runs against a
production build, because the CSP that governs the real page is the one worth
testing against and `next dev` relaxes it. The two Horizon-backed lookups are
stubbed, so the suite needs no network beyond localhost.

## CI

`.github/workflows/ci.yml` runs on every pull request to `develop` or `main`.

| Job | Steps |
|---|---|
| `check` | `typecheck` · `lint` · `test` · `build` · `audit` · CSP has no inline/eval · `/claim` gets `no-referrer` |
| `secrets` | schema stores no secrets · no seed extraction in `src/` · no secret-shaped `NEXT_PUBLIC_*` committed · every env secret is redacted |

**The build step runs with no environment on purpose.** Config validation is deferred to
first access precisely so no secret is needed to compile; if that step ever starts
requiring one, the decoupling has regressed.

Integration tests are deliberately absent — `AGENT.md` §7.2 forbids tests that submit to
the public network, and the testnet spike depends on Horizon being reachable, so it runs
on a schedule rather than per-commit.

### A note on the §1 grep guard

`AGENT.md` §1 suggests grepping for identifier *names*:

```bash
grep -rn "secretKey\|SECRET_SEED\|\.secret()\|rawSecretKey" src/ prisma/ | grep -v "SPONSOR_SECRET_KEY"
```

Run literally against this codebase it returns **seven false positives**, every one inside
the logger's redaction allowlist or the leak-detection regexes — the code whose job is
preventing leaks. It also would not have caught the real leak fixed in `ff1beb7`, where
`logger.info({ env })` printed four secrets in plaintext with no offending identifier on
the line.

CI therefore checks the dangerous *operation* (`.secret()` in `src/`) rather than the
naming, plus redaction coverage. `scripts/` is exempt: the testnet spike legitimately
holds ephemeral seeds in memory, exactly as the sender's browser does.

## Branch model

| Branch | Role |
|---|---|
| `main` | Released state |
| `develop` | Integration branch — all issue branches base off this |

Issue branches are created with `gh issue develop <number> --base develop`. PRs target `develop` and are never auto-merged.

## Tracker

Work is organised into sprints matching the build order in `SPEC.md` §11.

| Label | Scope |
|---|---|
| `sprint-0` | Protocol spike — de-risks everything downstream |
| `sprint-1` | Foundation: scaffold, schema, design system, auth, security guards |
| `sprint-2` | Campaign creation and batching |
| `sprint-3` | Claim flow |
| `sprint-4` | Lifecycle: reconciliation, expiry, reclaim |
| `sprint-5` | Delivery, admin, public API, hardening |

`area:*` labels mark the surface touched. `blocker` marks work that gates others.

**`sprint-0` must complete before anything else starts.** The claim transaction in `SPEC.md` §3.3 is unverified until it does.
