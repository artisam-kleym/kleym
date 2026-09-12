# Write API, webhooks and the SDK

Issue #51. Kleym's public API was read-only because creating a campaign means
generating keypairs, and an endpoint that accepted them would break the
guarantee the product rests on (`AGENT.md` §1). That reason has not changed.
What changed is the *shape*: the SDK generates keys on the caller's machine,
writes the secrets CSV to the caller's disk, signs batches with the sender key
the caller holds, and the API sees public keys and signatures only.

**No HTTP endpoint accepts a secret seed, under any circumstance.** Every write
body is scanned before any schema sees it; a seed anywhere in it is refused
with `400 problems/seed-submitted` and recorded as a `SEED_SUBMITTED` security
event. CI checks every write route runs the guard.

## Authentication and limits

`Authorization: Bearer <api key>` — keys are issued under Settings → API keys,
organisation-scoped, argon2id-hashed, revocable. Reads: 100/min per key. Writes:
30/min per key, counted separately (`x-ratelimit-write-remaining`). Errors are
RFC 9457 `application/problem+json`.

## Write endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/campaigns` | `{ name, network, senderPublicKey, assetCode, assetIssuer?, amountPerLink, linkCount, expiresAt }` | 201, the campaign |
| POST | `/api/v1/campaigns/{id}/links` | `{ publicKeys: [G…], labels?: [], attestations?: [{reference?, category?, note?} \| null] }` | 201 `{ registered, total }` |
| POST | `/api/v1/campaigns/{id}/export` | `{}` | `{ csvExportedAt }` — the activation gate; refused before any link exists |
| POST | `/api/v1/campaigns/{id}/batches/prepare` | `{ sequence? }` | `{ sequence, totalBatches, linkCount, xdr, networkPassphrase, reserve, … }` |
| POST | `/api/v1/campaigns/{id}/batches/submit` | `{ sequence, signedXdr }` | `{ sequence, status, transactionHash, replay }` |

`amountPerLink` is a decimal string. The flow is create → register public keys
→ write the CSV → mark export → for each batch: prepare, sign locally, submit.
The same gates apply as in the browser: dual control (#45) and screening (#52)
refuse `prepare`/`submit` with a 409 whose `detail` says why.

## The SDK

`packages/sdk` (`@kleym/sdk`): `generateLinkKeys` produces a `LinkKeys` value;
`publicHalves` is the only function that turns it into the branded
`PublicLinks` that `KleymClient.registerLinks` accepts; `writeSecretsCsv` is the
only other consumer of the keys (mode 0600, same columns as the browser's
download). The client scans every request body immediately before sending and
throws `SeedInRequestError` rather than send a seed — the type prevents the
mistake, the scan proves it did not happen. `signBatchXdr` signs locally with
the sender secret from the caller's environment. `createCampaignEndToEnd` runs
the whole flow; the `kleym` CLI wraps it, reading `KLEYM_API_KEY`, `KLEYM_URL`
and `KLEYM_SENDER_SECRET` from the environment only.

The package is built (`pnpm --filter ./packages/sdk build`) and versioned in
this repository; publishing to a registry is a release step with credentials
this repository does not hold.

## Webhooks

An Owner adds endpoints under Settings → Webhooks (or `POST /api/org/webhooks`
`{ url, events }`). HTTPS only (loopback HTTP outside production); the signing
key is returned once.

Events: `campaign.created`, `campaign.activated`, `batch.confirmed`,
`link.claimed`, `campaign.reclaimed`, `sponsor.low` (platform-wide: every
endpoint subscribed, once per dedupe window).

Delivery: `POST <url>` with

```
content-type: application/json
x-kleym-event: link.claimed
x-kleym-delivery: whd_…            ← also `id` in the body: your idempotency key
x-kleym-timestamp: 1789189173      ← seconds; inside the signed material
x-kleym-signature: v1=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
```

```json
{ "id": "whd_…", "event": "link.claimed", "createdAt": "…", "organizationId": "…",
  "data": { "campaignId": "…", "linkId": "…", "ephemeralPublicKey": "G…", "claimedBy": "G…", "claimTxHash": "…", "claimedAt": "…" } }
```

**Payloads carry no claim URL, no fragment, no seed and no address.** A body is
a request to somebody else's log. `link.claimed` carries the ephemeral *public*
key — what the ledger already shows. `assertPayloadSafe` refuses anything else
before a delivery row is written, and the verify script proves it.

Verify with the raw body bytes, before parsing, and check the timestamp
against your clock: a captured delivery replayed later fails with `stale` even
with a valid signature. `verifyWebhook(rawBody, headers, signingKey)` in the
SDK does both (tolerance 300 s). Answer 2xx; anything else is retried.

Retries: 7 attempts with exponential backoff from 30 s (about an hour), then
the delivery is **parked** with the last status. Three consecutive parks
disable the endpoint; the organisation sees the parked count and the disabled
state in Settings and `GET /api/org/webhooks`, the per-delivery log at
`GET /api/org/webhooks/{id}/deliveries`, and an Owner re-enables with
`PATCH { "enabled": true }`.

## Verified by

`pnpm verify:write-api` (CI), with a local stand-in Horizon and a local
receiver, the route handlers invoked through the SDK's `fetch` hook: the SDK
creates a campaign end to end (5 keys, CSV at 0600 that re-imports through the
server's parser, export marked, 2 batches prepared, signed locally, submitted,
confirmation queued) with no seed in any request, log line or database row and
the sender secret in no request; the client throws rather than send a seed;
each of the five write endpoints refuses a planted seed with 400 and a
`SEED_SUBMITTED` event, none of which carries the seed; deliveries for
`campaign.created`, `batch.confirmed` ×2, `campaign.activated`, `link.claimed`
arrive signed, the SDK verifier accepts them and refuses a replay (stale), a
tampered body and a wrong key; no delivery contains a claim URL, fragment, seed
or address; a 500-answering endpoint is retried three times with backoff,
parked with `HTTP 500`, disabled after three parks, all visible in the list and
the log, and another organisation cannot read it; the payload guard refuses a
claim URL, a fragment, a seed and an email; the 31st write in a minute is 429
while a read still works.
