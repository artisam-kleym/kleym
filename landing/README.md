# Static Kleym website

This service builds the shared marketing view into static HTML, CSS, self-hosted fonts and a small external animation module. It has no application runtime, credentials, database, queues or wallet integration.

Build: `pnpm build:landing`. Verify: `pnpm verify:landing`. Serve: `pnpm start:landing` (`PORT=8080` by default).

Public build variables: `LANDING_APP_URL`, `LANDING_SITE_URL`, `LANDING_NETWORK`. Production origins must use public HTTPS and have no path, query, fragment or credentials. `--allow-local` is reserved for local preview builds. Rebuild when a public destination changes.

Railway: repository root context; `RAILWAY_DOCKERFILE_PATH=landing/Dockerfile`; service start command `node server.mjs`; health `/health`; port 8080; no pre-deploy command. New Railway services use provider settings instead of deprecated deployment JSON/TOML. The final Docker stage copies only `dist` and `server.mjs` and runs as `node`.

See [the architecture and domain handoff](../docs/website-app-architecture.md) for staged rollout, compatibility, rollback, deployment configuration deprecation and the senior developer's DNS checklist. Domain ownership and DNS are outside this change.
