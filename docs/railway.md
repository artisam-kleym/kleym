# Railway public Testnet deployment

## Default release destination — October 25

The owner requests that verified Kleym releases be merged into **develop** and kept current in the senior's Railway project. Use this destination for subsequent authorized releases:

| Setting | Value |
| --- | --- |
| Project | `57849f8f-8c9f-4565-8b88-6faf9ce085dd` |
| Testnet environment | `72ccf46d-3e64-4bcb-bde8-9d4af62157ff` |
| Web service | `d0149eaa-d1c4-4c64-a3e8-4a659362714c` |
| Worker service | `1449f6c7-2843-4dfa-820f-7c49d87a1fba` |
| Public origin | `https://kleym-testnet.up.railway.app` |

Merge qualified PRs into `develop`, deploy the exact release to these services and verify web readiness, the changed browser behavior and worker consumption. Preserve current database/Redis volumes and credentials. The old personal project is retired. Source connection/autodeploy must be verified in Railway; a Git push alone is not deployment proof. Mainnet and Lantern enablement still require their own acceptance gates.

## Patched runtime — October 25

The existing Docker build is now declared explicitly in both Railway configuration files. Web, worker and static landing images pin `node:24.22.1-bookworm-slim`; no builder migration or data-plane upgrade is required. Set compatibility variables `NIXPACKS_NODE_VERSION` and `RAILPACK_NODE_VERSION` to `24.22.1` on web and worker without triggering an intermediate deployment. The Dockerfiles remain authoritative. Verify deployed container versions with `railway ssh`, not local `railway run`.

## Latest October 12: migrated to the senior developer's project

The approved project is [kleym](https://railway.com/project/57849f8f-8c9f-4565-8b88-6faf9ce085dd), in the shared workspace. Use **https://kleym-testnet.up.railway.app** for the app; the project URL opens Railway administration. The separate `testnet` environment has web, worker, Postgres and Redis running. Its unused `production` environment is inactive; Mainnet remains disabled. The owner selected this cleaner generated Railway hostname and confirmed its Reown origin allowlist.

All 35 database tables were restored with matching row counts/content digests and index/constraint definitions. Redis reloaded the verified snapshot with 219 keys. The old personal project's four services are stopped; original volumes and private backups are retained. No seed/reset or volume deletion occurred. Runtime migration and updated mobile recovery/receipt UI are deployed. See `D:/kleym/docs/reviews/2026-10-12/senior-railway-migration/README.md` for verified targets, scope and rollback constraints. Old source IDs/domains below are historical; do not run their commands without checking the target.

## Historical October 9: services resumed and mobile fixes deployed

At the owner's request, web, worker, Postgres and Redis were resumed in the existing Testnet environment with the original database volumes. The public URL remains https://kleym-web-testnet.up.railway.app. Mobile header navigation, Settings layout, phone handoff, expiry tracking and the Templates/Approvals/History embedding allowlist are included in this release. Mainnet is disabled; GitHub remains signed out. Earlier shutdown records below are historical.

See [the October 9 navigation release report](reviews/2026-10-09/lantern-navigation-release/README.md) for exact deployment identities, live checks and remaining physical-wallet/Lantern gates. The current campaign's unused 1 USDC has now been independently verified as reclaimed; no further refund is due for that campaign. Expiry alone still does not authorize an automatic refund.

## Latest October 6: all services stopped at user request

Web, worker, Postgres and Redis are fully stopped; both environments have zero active deployments. Original volumes remain retained, Redis final disk save and Postgres clean shutdown passed, and public readiness is 404. Configuration/domain and qualified web v6 source are preserved. Resume only when requested using [the pause runbook](reviews/2026-10-06/paused-services/runbook.md). Prior online descriptions below are historical. Retained volume storage remains billable and the trial expiry clock continues: [pricing](https://docs.railway.com/pricing/plans), [trial terms](https://docs.railway.com/pricing/free-trial).

## October 6 resume and expiry release

The user requested development resume after the October 3 overnight pause. The previous removed runs could not be directly redeployed. Databases were restored with their exact previous image digests and original volumes: Postgres18 reused its existing directory, Redis8.2 loaded the saved RDB. No seed, reset, volume deletion or database upgrade was performed. Worker restored from qualified v4 source; the new expiry UI is web-only. The web pre-deploy command remains `pnpm db:deploy`.

For current deployment status, recovery and retained campaign checks see [the October 6 report](reviews/2026-10-06/expiry-ui/implementation.md) and its verification artifacts. The latest confirmed ledger has one expired unused1USDC; the older2USDC refund and two paid links are already settled. Mainnet and physical Android signing qualification remain pending. Earlier deployment and pause records below are historical.

Updated 2026-10-03. User-owned project `kleym-testnet` is deployed in its separate `testnet` environment at **https://kleym-web-testnet.up.railway.app**. Web, worker, Postgres and Redis are running. Public login, readiness, claim hydration/privacy and web-to-worker empty-database reconciliation passed. Physical Android signing and public funded claim/refund remain pending. See [deployment evidence](reviews/2026-10-03/railway-testnet/deployment.md).

The cloud database is fresh; historical local campaigns were not copied. WalletConnect origin allowlisting was confirmed by the account owner. Private admin login is in `.runtime/railway-operator/admin-login.txt` on the operator's computer, outside source/export. Seed credentials were removed from both services and `ALLOW_PROD_SEED=false` was verified. Email delivery is disabled for this manually shared OPEN-link Testnet pilot.

Start with a user-owned Railway account and generated HTTPS domain. A custom domain can follow the first Android Testnet claim. The Hobby plan starts at $5/month, with resource usage affecting the total; review the budget for web, worker, Postgres and Redis. [Pricing](https://docs.railway.com/pricing), [generated domains](https://docs.railway.com/networking/public-networking).

Four services. `SPEC.md` §2.2.

| Service | Config | Start command |
|---|---|---|
| `kleym-web` | dashboard settings below; `railway.json` is the legacy reference | `pnpm exec next start --hostname 0.0.0.0 --port $PORT` |
| `kleym-worker` | dashboard settings below; `railway.worker.json` is the legacy reference | `pnpm worker` |
| `postgres` | Railway Postgres plugin | — |
| `redis` | Railway Redis plugin | — |

**No object storage service is provisioned, deliberately.** See `SPEC.md` §2.2 — the
only file Kleym produces is the secrets CSV, and it is generated in the browser and never
uploaded. Adding a bucket would create somewhere for secrets to land by accident.

## Secrets

Set the required configuration from `.env.example` on both application services. Omit optional values to use defaults: do not paste empty numeric/enum fields. Use new deployment session, audit, credential-encryption and sponsor keys. Keep values in Railway's secret store and a private operator backup; never paste them into chat.

`SPONSOR_SECRET_KEY` lives in Railway's secret store and a protected private operator backup — never in the database, git, client bundle or logs (`AGENT.md` §5.5). This Testnet setup has a Windows CurrentUser DPAPI backup with restricted file permissions; it is not a portable/off-site Mainnet recovery plan.

Do not prefix any secret with `NEXT_PUBLIC_`. Next.js inlines those into the client
bundle; startup validation refuses to boot if a `NEXT_PUBLIC_*` variable holds a
secret-shaped value.

`DATABASE_URL` and `REDIS_URL` come from the Railway plugins via reference variables.

## First setup

1. Create a Railway account using your GitHub identity. Create project `kleym-testnet`, an environment named `testnet`, and managed Postgres/Redis with persistent volumes. Keep database ports private.
2. Create empty application services `kleym-web` and `kleym-worker`. Do not select a stale GitHub branch: the validated app work is currently local in `.worktrees/app-sending-pilot`. Prepare/review an exact release commit or a source-only CLI upload before deploying.
3. Set the dashboard build/start settings in the table below. Generate a public domain only for the web service. Set `APP_URL` to its exact `https://…` origin on both services, with no path or fragment.
4. Reference Postgres `DATABASE_URL` and Redis `REDIS_URL` on both services. Use one replica of each application service for the initial pilot. Keep the worker running continuously, with no public domain and no sleeping mode.
5. Use the checked-in Dockerfile with Node 22 and pnpm 10.6.4. Set `NODE_ENV=production`, `STELLAR_NETWORK=testnet`, `HORIZON_URL=https://horizon-testnet.stellar.org`, `NETWORK_PASSPHRASE=Test SDF Network ; September 2015`. Keep development dependencies in this pilot image: the worker uses `tsx` and pre-deploy/bootstrap use Prisma's CLI. Use a separate Testnet hot sponsor and privately provision its Testnet XLM. Sender USDC remains sender-owned. No cold treasury key belongs in either service.
6. Set the required session/audit/encryption credentials, sponsor public/secret pair and email configuration. For the initial manually shared OPEN-link pilot, an explicitly unusable `RESEND_API_KEY=disabled-testnet-pilot` and `EMAIL_FROM=pilot@example.invalid` satisfy configuration without enabling delivery; do not test email/OTP policies until real email configuration is provided.
7. Create a WalletConnect project at [the dashboard](https://dashboard.walletconnect.com/), allowlist the exact public origin, and set `WALLETCONNECT_PROJECT_ID` on the web service (the ID is public, not a private API token). Re-deploy the web service after changes. The mobile option remains hidden when unset.
8. Deploy web first, allowing `pnpm db:deploy` to apply migrations, then worker after migrations pass. Check worker logs and `/api/status`; web readiness alone does not prove workers are processing settlement. The public status exposes only component states; detailed status stays behind admin access. New environments may report scheduled passes as degraded before their first hourly/daily run. Verify a manual reconciliation reaches the worker instead of treating an empty queue as consumer proof.
9. Bootstrap one administrator with privately set `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` and `ALLOW_PROD_SEED=true`. For one-time pre-deploy bootstrap, use the explicit-shell command `sh -c 'pnpm db:deploy && pnpm db:seed'`; the plain combined command ran only migration in the observed Railway release. Confirm `Admin created` in logs. Then restore migration-only pre-deploy, remove seed variables, set `ALLOW_PROD_SEED=false`, and upload the same source again to activate the new configuration. The observed `railway redeploy` reused its prior command snapshot. Never put a password in a command or deployment file.

| Setting | Web | Worker |
| --- | --- | --- |
| Builder | Dockerfile auto-detected | same Dockerfile |
| Build | Dockerfile: frozen install, Prisma generation, webpack production build | same image/build |
| Pre-deploy | `pnpm db:deploy` | none; deploy after web migrations |
| Start | `sh -c 'exec pnpm exec next start --hostname 0.0.0.0 --port ${PORT:-3000}'` | `pnpm worker` |
| Healthcheck | `/api/ready`, 180 seconds | inspect worker status/logs |
| Restart | on failure, up to 5 retries | on failure, up to 5 retries |

Current Railway documentation deprecates `railway.json` for new services and recommends project-level IaC. This first setup uses dashboard settings; the updated JSON files preserve legacy-service configuration and are not a guarantee that new services read them. See [current configuration documentation](https://docs.railway.com/infrastructure-as-code). Use the pinned `pnpm@10.6.4` and Node 22; the global pnpm 11 installation here does not honor the existing package overrides. [Railpack start commands expand `$PORT`](https://docs.railway.com/deployments/start-command).

CLI uploads use a newly exported source-only directory, never the repository parent containing personal files. Run `node scripts/prepare-railway-release.mjs D:/kleym/.runtime/deploy-source/NEW_VERSION` from the active app checkout. The allowlist includes the explicit nonsecret `tests/env-placeholders.ts` dependency of retained operator commands, excludes private/ignored files and symlinks, and writes a per-file hash manifest. `.dockerignore` independently limits image contents. Build that exported directory with `docker build .`, then use `railway up . --path-as-root --project PROJECT_ID --environment ENVIRONMENT_ID --service SERVICE_ID --detach` from the exported directory. Review the manifest before upload; do not deploy the local checkout wholesale. GitHub deployments require a release commit containing the current source and migrations; this deployment did not push a branch or set up GitHub auto-deploys.

## Acceptance and next release

Run `pnpm exec tsx scripts/check-public-deployment.ts https://YOUR_GENERATED_HOST` for read-only HTTP/readiness/claim-header proof. Then perform the [Android claim test](mobile-claims.md) with test USDC on the public URL. Share only public receipts, never full private claim URLs or CSVs. Existing local funded links remain local; do not replace their hosts or copy private database/configuration files into the new project.

After the public Testnet claim, expiry refund, worker recovery and backup/restore pass, prepare a separately reviewed Mainnet environment with separate database, Redis and keys. Agree real-USDC totals, recipients, reserve capital and incident/refill ownership before real transfers. See [Mainnet pilot](mainnet-pilot.md). Changing this Testnet environment to Mainnet would strand its current obligations.
