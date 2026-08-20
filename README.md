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
| `zod` | 4.4.3 |
| `@stellar/stellar-sdk` | 16.2.0 |
| `eslint` | 10.8.1 |
| `pino` | 10.3.1 |
| `decimal.js` | 10.6.0 |

Prisma lands with #3 and its version is recorded then.

#### Pinned: TypeScript 5, not 7

`typescript@latest` resolves to 7.0.2, and `typescript-eslint` (a transitive dependency of
`eslint-config-next`) refuses to load against it: *"typescript-eslint does not support TS
7.0."* Linting fails outright.

Per `AGENT.md` §3.1 this is pinned to the lower version with the conflict named rather
than silently downgraded. Revisit when `typescript-eslint` ships TS 7 support.

#### Two toolchain notes

- **Tailwind is v4, which is CSS-first.** There is no `tailwind.config.ts` by default —
  tokens are declared with `@theme` in `src/app/globals.css`. `BRAND.md` §11 assumes a v3
  config file and will need reinterpreting in #4; the tokens themselves are unaffected.
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

Prisma steps (`migrate dev`, `db seed`) arrive with #3.

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm worker` | `kleym-worker` process — BullMQ consumers and cron |
| `pnpm typecheck` | `tsc --noEmit`, strict |
| `pnpm lint` | ESLint over `src` and `scripts` |
| `pnpm spike` | Testnet claim-transaction spike (#1) |
| `pnpm diagnose` | Isolates the two `AccountMerge` constraints behind the two-transaction design |

Startup validates the whole environment through a Zod schema and exits with a readable
list of what is missing. It also refuses to boot if any `NEXT_PUBLIC_*` variable holds a
Stellar secret seed, since Next.js inlines those into the client bundle.

`.env` is gitignored. `SPONSOR_SECRET_KEY` belongs in Railway's secret store and never in the repo.

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
