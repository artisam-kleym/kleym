# Kleym Testnet overnight pause

User explicitly requested an overnight shutdown to conserve trial credit. Only the `kleym-testnet` project (`48614d0d-2e58-4848-af96-2184e3044c47`), `testnet` environment (`cbca2958-d44a-4ca8-8d4e-746a61584d02`) is in scope. Default production environment, service definitions, variables, generated HTTPS domain and WalletConnect project/origin configuration are retained.

## Stop and evidence

Stop web first, then worker, then Redis/Postgres with Railway `down --project PROJECT --environment ENVIRONMENT --service SERVICE --yes`. This removes running deployments; it does not delete service definitions or persistent volumes. Confirmation requires all recorded deployment IDs REMOVED, original two volume IDs present/not pending deletion, public readiness non200 and database shutdown logs. [Verification](shutdown-verification.json) records completion; initial REMOVING is an intermediate state, not proof of complete shutdown.

Redis uses `redis:8.2`, retained `/data` volume and `--save 60 1`; recent RDB saves succeeded. Initial remote CONFIG GET was unavailable because SSH credentials were not set up. No SSH key/account permission was created. Persistence command metadata and shutdown logs are used instead. Postgres retains `/var/lib/postgresql/data`. These are retained-volume/shutdown proofs, not a tested portable backup/restore.

## Resume on the user's next request

1. Redeploy **Postgres** (`37702f7c-d942-4b00-96aa-16b5c4a8b58e`) and **Redis** (`45121e0c-a4e7-4961-8004-102e6dfa6d03`) from existing deployments using installed CLI5.63.1: `railway deployment redeploy --project PROJECT --environment ENVIRONMENT --service SERVICE --yes --json`. Wait for both SUCCESS and confirm database recovery/readiness. Do not use `--from-source` or upgrade database image versions during resume.
2. Redeploy **kleym-worker** (`2490753a-e4ba-471c-87c9-a6dd7d74d567`) from last qualified v2 deployment `395027b9-21f2-4d15-ab4a-e3d03bb05b97`; verify queue recovery, sessions/journals and reconciliation. Do not seed/reset/flush databases.
3. Redeploy **kleym-web** (`4d547645-da9f-4e1e-aec3-2511f6239fc3`) from qualified v4 deployment `197465e3-afaf-4e54-9eb4-28316963f324`. If source upload is needed, use immutable candidate `D:/kleym/.runtime/deploy-source/2026-10-03-phone-approval-v4`,370 files, digest `a79f36e9189265e924989b9d7370077830e17eb66aff8f2443d7ce7d6718d0cd`. Never upload private runtime/exports or re-seed cloud data.
4. Verify `/api/health`, `/api/ready`, official Testnet identity, retained campaigns, pending exact-hash attempts and worker recovery before user signs anything. Phone SDK sessions are tab-memory only; reconnect from the privately saved link when necessary.
5. Current known campaign `cmusjy67f00020dp4imc8q054` has only one expired unused1USDC, sender11USDC. After fresh ledger review the next user-signed action is reclaim1USDC, expected sender12, recipients4/3 unchanged. Do not repeat the old2USDC refund or paid links. Shutdown does not move funds or pause Stellar predicates.

## Cost and limits

Railway charges resource usage even without visitors. Current official trial: up to30 calendar days with a one-time$5 grant, then Free$1/month. Stopping deployments conserves compute/egress usage; it does not pause the signup-to-expiry clock. Retained volume storage still accrues usage. Credits/usage limits can stop workloads. Trial volume retention is limited after credit expiry; preserve required data before that deadline. Actual remaining balance/trial end was not established by the usage summary. Sample workspace usage was about$0.028 at inspection and may lag; it is not a monthly forecast.

WalletConnect core connection projects can remain configured for free; there is no Kleym server runtime to stop there. No Reown/WalletConnect dashboard mutation, project deletion, origin removal or billing change was made; account-specific dashboard entitlements were not inspected. This does not assert unlimited request capacity or entitlement to paid Reown features.

Official sources checked2026-10-04: [Railway trial](https://docs.railway.com/pricing/free-trial), [resource/storage pricing and retention](https://docs.railway.com/pricing/plans), [deployment remove](https://docs.railway.com/deployments/reference), [WalletConnect core/free projects](https://reown.com/blog/retiring-our-legacy-plans-on-june-30), [Redis shutdown persistence](https://redis.io/docs/latest/operate/oss_and_stack/reference/signals/).
