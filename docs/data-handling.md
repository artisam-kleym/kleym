# Data handling: what Kleym stores about people, why, and for how long

Current deployments use local-link distribution: senders privately distribute
individual claim URLs from their saved CSV. Bearer-link email is disabled at the
route, service, producer and worker boundaries (#108). Email verification can
bind a public link key to a creator-assigned email and send OTP-only messages
through Zender once configured. Private URLs remain in the browser/export.
See [Zender integration](zender-email-verification.md). This document also records
the historical email path, which did not meet the browser-only key guarantee.

## Historical bearer delivery and operator action

Historical `DeliveryJob.claimUrl` values were persisted by BullMQ in Redis,
including while workers were stopped or retrying. They could also reach Redis
backups and the mail provider. Completion/failure deletion did not establish
that all copies were erased. Do not apply the local-only guarantee to those jobs.

Existing bearer jobs are held in a delayed state before reading the URL or
calling a provider. Retries remain held without consuming attempts or silently
removing the payload. Workers log only job/link identifiers. Operators must
inventory these jobs without exporting payloads, protect Redis and its backups,
and agree a documented quarantine/erasure decision with the campaign owner.
Disabling the feature is not retrospective deletion. No blanket purge is run.

`LEGACY_BEARER_EMAIL_ENABLED=true` is restricted to non-production Testnet
development harnesses; it cannot enable bearer delivery in production or on
the public network. Receipt/reminder email contains no bearer URL and is
unaffected. Existing email-gated links retain their gates; this change does not
turn them into OPEN links. New deployments must not enable historical bearer-email delivery.

## Senders (Kleym's users)

| Data | Why | Kept |
|---|---|---|
| Username, argon2id password hash | sign-in | life of the account |
| Session token hash, IP, user agent | sign-in, lockout | until the session expires or is revoked |
| API key hash and prefix | read-only API access | until revoked (the row stays, revoked) |
| Audit rows: who did what, when, from which IP | SPEC §5.4 accountability | see `docs/` on the audit log |

No sender's Stellar secret key is held by the application. The sponsor key belongs to Kleym
and lives in the environment, never the database (`AGENT.md` §5.5).

## Recipients (not Kleym's users)

A recipient is someone a sender gave a link to. Kleym never knows who they
are — unless the sender chose email verification or historical delivery, in which case Kleym holds the
one piece of recipient PII it has:

| Data | Why | Kept |
|---|---|---|
| `Delivery.email` | to send verification codes; historical delivery also sent links | until **90 days** after the link or its campaign settles, then redacted |
| `Delivery.sentAt`, `openedAt` | historical invitation send / successful OTP check | survive redaction; new OTP-only bindings leave sentAt null |
| OTP hash, expiry, attempts | the code gate on an emailed link | ten minutes per code; cleared on redaction |

`DELIVERY_RETENTION_DAYS` in `src/lib/api/privacy.ts` is the period; this
file and that constant change together.

**Retention** is a daily maintenance job (`delivery-retention`, 03:23 UTC),
bounded like the other passes; its last run and any shortfall show on
`/admin/reconciliation`. A link counts as settled when it is claimed,
reclaimed or failed, or when its campaign has expired, been reclaimed or
cancelled. The redaction is audited as a count.

**Erasure** — a request to forget an address — is honoured at
`/admin/privacy` (Kleym staff; `POST /api/admin/privacy/erase`): every
delivery to that address, across every campaign, is redacted in one
operation and any email still queued for it is removed. The audit row records
only how many rows were redacted; the address is written nowhere. A link that
is still live stays gated afterwards but can no longer receive a code; its
funds return to the sender at expiry.

**What redaction leaves alone.** The link's status, its `claimedBy`,
`claimedAt` and `claimTxHash` are the record that money moved. They are
evidence, not PII, and the chain — not Kleym — is the authority on them
(`AGENT.md` §4.2). Erasure never touches them.

**Runtime handling.** Logs use the delivery id; audit metadata rejects `email`
keys. Legacy completion/erasure checks scan their disposable fixtures, not
historical backups or provider systems. The local-only endpoint refuses new
bearer payloads before parsing them; the worker does not log held payloads.

## Local-only distribution

New local-only flows send public link keys and signatures to Kleym. Recovery
phrases, ephemeral seeds and private claim URLs remain in the sender's browser
and private export. Claim fragments are removed from browser history after
reading. Historical email payloads are the exception described above; no claim
of retrospective erasure is made. Wallet connection is a separate explicit
action described in `docs/mobile-claims.md`.
