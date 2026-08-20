# Railway deployment

Four services. `SPEC.md` §2.2.

| Service | Config | Start command |
|---|---|---|
| `kleym-web` | `railway.json` | `pnpm start` |
| `kleym-worker` | `railway.worker.json` (set as the service's config path) | `pnpm worker` |
| `postgres` | Railway Postgres plugin | — |
| `redis` | Railway Redis plugin | — |

**No object storage service is provisioned, deliberately.** See `SPEC.md` §2.2 — the
only file Kleym produces is the secrets CSV, and it is generated in the browser and never
uploaded. Adding a bucket would create somewhere for secrets to land by accident.

## Secrets

Every key in `.env.example` must be set on both `kleym-web` and `kleym-worker`.

`SPONSOR_SECRET_KEY` lives in Railway's secret store and nowhere else — never in the
database, never in git, never in a client bundle, never in a log line (`AGENT.md` §5.5).

Do not prefix any secret with `NEXT_PUBLIC_`. Next.js inlines those into the client
bundle; startup validation refuses to boot if a `NEXT_PUBLIC_*` variable holds a
secret-shaped value.

`DATABASE_URL` and `REDIS_URL` come from the Railway plugins via reference variables.
