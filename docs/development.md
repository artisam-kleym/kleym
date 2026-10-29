# Developing Kleym

For the product introduction, see the [repository overview](../README.md).
Read [AGENT.md](../AGENT.md), [SPEC.md](../SPEC.md) and [BRAND.md](../BRAND.md)
before changing application behaviour, transaction code or visual design.

## Requirements

- Node **24.22.1**, matching `.node-version`, `.nvmrc`, Docker and CI.
- pnpm **10.6.4**, as declared by `packageManager` in `package.json`.
- PostgreSQL and Redis; the local Compose configuration provides both.
- A private local `.env` based on [`.env.example`](../.env.example).

The lockfile records dependency versions. Historical dependency decisions and
the October security refresh are documented in
[security qualification](reviews/2026-10-25/security-136/README.md).
Do not replace the pinned runtime or suppress the audit gate to make a build pass.

## Local setup

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Fill in the required environment values privately before starting services.
docker compose up -d
pnpm db:deploy
pnpm db:seed
pnpm dev
```

The seed command requires explicit `SEED_ADMIN_USERNAME` and
`SEED_ADMIN_PASSWORD`; there are no published default credentials. Start
`pnpm worker` separately for confirmations and background processing. The app
validates runtime configuration when accessed. A successful build alone does not
prove the database, worker, wallet or sponsor is configured.

Never commit `.env`, sponsor keys, wallet phrases, private claim URLs or recipient
exports. Use Testnet for development. Builds must not require a sponsor secret.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local Next.js application |
| `pnpm worker` | Queue consumers and scheduled processing |
| `pnpm build` / `pnpm start` | Build and serve the application |
| `pnpm build:landing` / `pnpm start:landing` | Separate public website |
| `pnpm typecheck` | TypeScript checks |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest suite |
| `pnpm test:e2e` | Playwright browser tests |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:migrate` | Create/apply local development migrations |
| `pnpm db:deploy` | Apply committed migrations |
| `pnpm spike` | Standalone Testnet protocol verification; submits Testnet transactions |

Prisma 7 reads the database URL from `prisma.config.ts` and generates its client
under the ignored `src/generated/prisma` directory. Tailwind 4 tokens are CSS-first
in `src/app/globals.css`. Next.js linting uses ESLint directly.

## Verification

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --prod --audit-level=moderate
```

For browser tests, install Chromium with `pnpm exec playwright install chromium`
and use the configured isolated Postgres/Redis fixture environment. The E2E
account is supplied through private environment values, not repository files.
Read the suite configuration before running against any existing database.

CI runs on every pull request and on pushes to `develop` and `main`. Its four
jobs cover typecheck/lint/tests/build/audit, secret-handling guards, real-database
concurrency checks and the browser CSV-export gate. Full wallet acceptance and
operated recovery are separate checks; passing CI is not Mainnet approval.

Use the [QA plan](../qa/plans/kleym-comprehensive-v2-2026-10-26/README.md) for
case-specific execution and the [Android guide](android-qa.md) for the saved AVD.
Never submit development tests to the Stellar public network.

## Repository map

| Directory | Responsibility |
| --- | --- |
| `src/app` | Pages, route handlers and application flows |
| `src/lib/stellar` | Transaction builders, signing verification and ledger access |
| `src/workers` | Confirmation and background work |
| `prisma` | Schema and committed migrations |
| `tests` / `e2e` | Unit and browser regression tests |
| `scripts` | Verification, build and operational helpers |
| `landing` | Standalone website deployment |
| `packages` | API SDK and related packages |
| `docs` / `qa` | Guides, dated evidence and test plans |

## Branches and contributions

Target `develop` for integration and the team Railway source. Keep current checks
green before merging. `develop-ade` is the owner's preserved pre-cleanup backup;
updating it is a separate owner-authorised action. `main` is retained and is not
changed by this repository cleanup.

Prefer small changes with observable acceptance and evidence. Keep historical
reports dated and distinguish a planned case from an executed pass. Do not include
private runtime files or wallet material in pull requests. For deployment, use
the explicit project and service instructions in [the Railway guide](railway.md).
