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

Resolved dependency versions are recorded here once the scaffold lands (#2). Per `AGENT.md` §3.1, versions are resolved at install time — do not assume them from memory.

## Setup

> Not yet applicable — the application is scaffolded in #2. This section describes the intended shape.

```bash
pnpm install
cp .env.example .env        # fill in every key; startup validates the full set
docker compose up -d        # Postgres 17 + Redis 7
pnpm prisma migrate dev
pnpm prisma db seed         # requires SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD
pnpm dev
```

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
