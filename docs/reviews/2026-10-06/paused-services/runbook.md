# Kleym Railway pause: October 6, 2026

User requested all Kleym Railway services off and development deferred until later. Stop requests completed; verified at 2026-10-06T13:48:18.403Z (21:48 Manila).

## Verified result

- All four deployment statuses are REMOVED, not REMOVING.
- Both project environments have zero active deployments. The default production environment has no service instances.
- Public https://kleym-web-testnet.up.railway.app/api/ready returns 404.
- Original Postgres/Redis volume IDs and mount paths match the before snapshot; both Ready, no deletion or pending deletion.
- Redis final RDB saved on disk before exit; Postgres shutdown checkpoint completed and database system shut down.
- Service configuration, domain, WalletConnect allowed origin, qualified source and existing uncommitted work retained. No seed/reset, asset transfer, volume deletion, billing change, commit or push.
- Temporary local verification services were already stopped before this pause.

Evidence: `services-before.json`, `volumes-before.json`, `stop-requests.json`, `verified-stop.json`, `shutdown-log-evidence.json`. Shutdown logs contain only filtered persistence/lifecycle messages. No keys or passwords.

## Preserved targets

Project `48614d0d-2e58-4848-af96-2184e3044c47` (kleym-testnet); Testnet environment `cbca2958-d44a-4ca8-8d4e-746a61584d02`.

| Service | Service ID | Removed deployment |
| --- | --- | --- |
| Web | 4d547645-da9f-4e1e-aec3-2511f6239fc3 | 7f8d8f84-36c5-4234-8d27-24a17292c5e4 |
| Worker | 2490753a-e4ba-471c-87c9-a6dd7d74d567 | d4a6a2f6-951d-4f9a-b5f8-b5303a1ea981 |
| Redis | 45121e0c-a4e7-4961-8004-102e6dfa6d03 | 829424a6-4c5f-436f-a330-131566d3f730 |
| Postgres | 37702f7c-d942-4b00-96aa-16b5c4a8b58e | e30d0532-dbb9-4964-89f3-46c214853754 |

Postgres volume `73798d01-f324-42dc-bee7-5d08a3648688`, `/var/lib/postgresql/data`; Redis volume `38b09453-d0b2-4446-8e9c-e795a874bcca`, `/data`. Each has a 500-MB capacity; measured usage at shutdown about 112 MB and 44 MB respectively.

Exact Postgres source: `ghcr.io/railwayapp-templates/postgres-ssl@sha256:4b89e3c89d9262f02f23e927ff9f1390a19f7c03e2483321bc05c30872a333a3`.
Exact Redis source: `redis@sha256:164c759a0c342ee69d08fc99219382b0fd682181465c0df2e0e6911f4c85d73c`.

Web v6 candidate: `D:/kleym/.runtime/deploy-source/2026-10-06-expiry-ui-v6`, 371 allowlisted files, digest `b27d11ba4338a019c13ac9191cd6f19ee68851fafa6d6a604f5caca28329f609`. This is the qualified expiry UI; do not restore older web v4. Worker remains the unchanged qualified backend from `D:/kleym/.runtime/deploy-source/2026-10-03-phone-approval-v4`. No dependency/schema/worker changes in expiry UI release.

## Resume after explicit user request

1. Check project, remaining trial/account eligibility and retained volumes before any start. Provider retention is time limited; never recreate a missing volume and claim the data was restored.
2. Start original Postgres/Redis services using their exact pinned source images and existing mounts. No database upgrades, seed/reset or volume deletion. Removed-run direct redeploy previously returned No deployment found; if unavailable, deploy the existing pinned service source.
3. Confirm existing database directory and Redis RDB load, then restore qualified worker and web v6. Preserve domain/configuration and protected credentials. Do not print private variables.
4. Verify readiness, worker/reconciliation, retained campaigns and transaction journals before new signing. Read October 6 expiry UI evidence for release details.
5. Recheck Horizon before the next user-signed action: reclaim only the newer campaign's unused expired 1 USDC, expected sender 12 from last verified 11. Campaign `cmusjy67f00020dp4imc8q054`; unused balance `00000000994080e58ae9a9e6e4445f9e05444f39a60e301b035c229bb949f027005f6f74`. Earlier 2-USDC refund and paid links are already settled. Stopping Railway does not alter Stellar expiry or assets.
6. Continue physical Android transaction approval and Mainnet qualification; neither is complete. GitHub Issues remain deferred by user instruction.

## Credit and retention limits

Stopping deployments removes running compute usage. Retained volume storage is separately billed; stopping does not pause the trial calendar. Railway trial credits expire after 30 days or exhaustion, and trial volumes are subject to deletion 30 days after credit expiry. No current account-specific expiry or remaining credit amount was established. This retained state is not an indefinite backup.

Official terms checked October 6: [resource pricing](https://docs.railway.com/pricing/plans), [free trial and retention](https://docs.railway.com/pricing/free-trial).
