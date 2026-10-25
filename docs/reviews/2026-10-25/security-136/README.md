# Issue 136: patched runtime and dependency qualification

## Scope and boundaries

The owner requested promotion of the latest app to `develop`, patching issue #136 and closing only completed issues. This branch incorporates the existing qualified app work from `develop-ade` and preserves `develop` ancestry. No database schema, principal-transfer protocol or Mainnet enablement is introduced by this security patch.

The owner explicitly approved the focused wallet dependency migration after refreshed audit evidence showed nested Zod 3 copies had no same-major fixed release. Kleym used only the wallet kit's desktop Freighter adapter. It now directly uses the same official `@stellar/freighter-api@6.0.0`, preserving explicit access, network verification, reviewed transaction bytes, requested signer, returned signer checks and cancellation. Existing Lantern and mobile WalletConnect transports are unchanged. The two historical browser proof harnesses now use that adapter too.

## Before and change

- Remote `railway ssh ... node --version` measured **v22.23.3** on both web and worker. Only the senior project's `testnet` environment was available; `main` and `staging` cannot be measured because they are not accessible targets in this project.
- Actual deployments already used **DOCKERFILE**. Checked-in configuration now explicitly matches that existing builder; this is not a migration from Nixpacks. Both app and landing Dockerfiles pin **24.22.1-bookworm-slim**. Engines, local version files, all four CI setup steps and scheduled protocol CI match **24.22.1**. Provider compatibility variables were staged with `--skip-deploys` on both services before release.
- Next/eslint-config-next **16.4.3**, Zod **4.6.7**, Vitest **4.1.12**, Vite **8.2.4** and patched transitive floors replace vulnerable versions. TypeScript remains **5.9.3**. The pre-existing `@types/node@26`/runtime-24 mismatch is retained as requested.
- Federation sends identity-only requests and rejects any other response encoding before body reads on both hops. The raw HTTPS transport rejects such headers before buffering. Existing public-DNS pinning, destination validation, redirect refusal and byte limits remain intact.
- All six registration collections have parse-time length caps before element validation and explicit inner `.max()` limits. This also covers `publicKeys` and `recipientPublicKeys`; configuration remains lazy so builds need no sponsor credentials.

## Evidence

- `evidences/runtime-before.json`: sanitized remote version measurements, service identities and immutable image references.
- `evidences/audit-before.json`: fresh baseline, 2 critical / 7 high / 9 moderate / 4 low findings.
- `evidences/audit-after.json`: refreshed lockfile audit, **zero advisories**, no muted findings, moderate gate unchanged.
- The intermediate audit identified `elliptic` as unpatched (no fixed version), alongside nested Zod 3. Both left with the unused non-Stellar wallet dependency tree. No false patched-version override or advisory ignore was added.

Local qualification uses a separately downloaded official Node 24.22.1 distribution checked against Node's SHASUMS256 file and pnpm 10.6.4. Test results and exact CI/deployed identities are recorded in the release completion evidence and linked issue/PR. Physical wallet approval on the new dependency graph still requires an operator session; mocked browser transport checks cannot establish a new physical-wallet result.

## Provider findings and remaining work

Remote service binaries measured PostgreSQL **18.6** and Redis **8.2.10**, matching their currently documented maintenance/security floors. These are binary measurements, not authenticated SQL/INFO observations. Database and Redis engines, volumes and credentials were preserved. A Node patch does not establish OS-wide or application-wide security.

Railway's [23 October incident announcement](https://railway.com/changelog/2026-10-23-october-21-security-incident) recommends rotation of sensitive credentials stored before 21 October. Rotation is a separate open operational action; see [compatibility requirements](credential-rotation.md). No Kleym compromise is asserted. Railway CLI also reports legacy JSON service configuration remains supported until 1 December 2026; plan a separately qualified IaC migration before that date.

Primary references: [Node October security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Next sharp advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [PostgreSQL security](https://www.postgresql.org/support/security/), [Redis 8.2.10 release notes](https://raw.githubusercontent.com/redis/redis/8.2.10/00-RELEASENOTES).

## Deployment correction

The first landing rollout selected the root app Dockerfile despite the provider settings reporting the landing Dockerfile. Build logs confirmed an app build; startup failed with `Cannot find module '/app/server.mjs'`. The previous landing deployment stayed available. A dedicated `landing/railway.json` and explicit landing-service Config File selection isolate the static Dockerfile/start/health settings from the app. Web and worker were already patched and healthy during this correction.
