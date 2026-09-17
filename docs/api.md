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
organisation-scoped, argon2id-hashed, revocable. Each key has a **scope**:
`READ` (the default, and what every key issued before scopes existed is — they
were issued when v1 was read-only and do not start writing because the API
grew) or `WRITE`. A `READ` key on any write route is `403 problems/insufficient-scope`
with `WWW-Authenticate: Bearer realm="kleym", scope="write"` and no side
effect; a `WRITE` key reads too. Issuing either is an Operator action, audited
with the scope. Reads: 100/min per key. Writes: 30/min per key, counted
separately (`x-ratelimit-write-remaining`). Errors are RFC 9457
`application/problem+json`.

## Write endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/campaigns` | `{ name, network, senderPublicKey, assetCode, assetIssuer?, amountPerLink, linkCount, expiresAt, receiveAs?: [{ assetCode, assetIssuer? }], allowExchangeDeposit?: boolean, reminderDaysBefore?: number[], claimPolicy?: "open" \| "code" \| "email" \| "passkey" }` | 201, the campaign |
| POST | `/api/v1/campaigns/{id}/links` | `{ publicKeys: [G…], labels?: [], attestations?: [{reference?, category?, note?} \| null], amounts?: ["12.5" \| null], codes?: [13-char] }` — `codes` required, one per key, when the campaign's `claimPolicy` is `code`; hashed on arrival | 201 `{ registered, total }` |
| POST | `/api/v1/campaigns/{id}/export` | `{}` | `{ csvExportedAt }` — the caller's **attestation** that the secrets file is saved (see below); refused before any link exists |
| POST | `/api/v1/campaigns/{id}/batches/prepare` | `{ sequence? }` | `{ sequence, totalBatches, linkCount, xdr, networkPassphrase, reserve, … }` |
| POST | `/api/v1/campaigns/{id}/batches/submit` | `{ sequence, signedXdr }` | `{ sequence, status, transactionHash, replay }` |

`amountPerLink` is a decimal string, and the DEFAULT: `amounts` (#73), one
entry per public key, gives a link its own amount — a string with up to seven
decimal places, greater than zero — and `null` takes the default. Omit it for a
uniform campaign. `GET …/links` returns each link's `amount` as a string. The
flow is create → register public keys → write the CSV → mark export → for each
batch: prepare, sign locally, submit.

**The export gate is an attestation over the API.** In the browser the gate is
a real download; here, `POST …/export {}` is the caller *saying* the secrets
are saved — the server cannot check a file on your disk. The SDK writes the
file at 0600 *before* it calls export, so SDK users are covered. A raw caller
who marks export without having saved the keys funds a campaign whose seeds
exist nowhere: nobody can claim those links, and the funds come back only by
reclaim after `expiresAt` (`SPEC.md` §3.4). Not lost, but locked for the
campaign's lifetime — and it is the caller's own funds.
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
key is returned once. It is stored in the clear on the endpoint row, as it must
be to sign each delivery — the same position every webhook provider is in.
Encrypting at rest under a deployment key, or deriving per-endpoint keys from
one secret and the endpoint id, is the follow-up; rotation today is delete and
re-add.

Events: `campaign.created`, `campaign.activated`, `batch.confirmed`,
`link.claimed`, `campaign.expiring_soon`, `campaign.suspended`,
`campaign.reclaim_due`, `campaign.reclaimed`, `sponsor.low` (platform-wide:
every endpoint subscribed, once per dedupe window).

`campaign.expiring_soon` (#78) fires once per campaign, from the hourly
reminder pass, when a campaign with unclaimed links is within seven days (or
its earliest reminder point) of expiry.

`campaign.suspended` (#72) says Kleym stopped serving the links; its
`outstanding` / `outstandingAmount` are still claimable on the ledger until
`reclaimScheduledFor`. `campaign.reclaim_due` fires once, from the hourly
expiry sweep, when any campaign passes its expiry with links unclaimed (#78):
the reclaim is ready for the sender to sign.

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
  "data": { "campaignId": "…", "linkId": "…", "ephemeralPublicKey": "G…", "claimedBy": "G…", "claimTxHash": "…", "claimedAt": "…",
            "claimMemoType": "id" | "text" | "hash" | null, "claimMemo": "…" | null,
            "receiptId": "rcpt_…" | null } }
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

Also: a `READ` key on each of the five write routes is 403 `insufficient-scope`
with `WWW-Authenticate … scope="write"` and no campaign, link or audit row
results; the same key still reads; a `WRITE` key reads; a key issued without a
scope is `READ`.

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
