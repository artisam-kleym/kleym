# Data handling: what Kleym stores about people, why, and for how long

Kleym holds very little about anyone, and nothing that can move money. This
note is the answer to the first page of a data-protection questionnaire.

## Senders (Kleym's users)

| Data | Why | Kept |
|---|---|---|
| Username, argon2id password hash | sign-in | life of the account |
| Session token hash, IP, user agent | sign-in, lockout | until the session expires or is revoked |
| API key hash and prefix | read-only API access | until revoked (the row stays, revoked) |
| Audit rows: who did what, when, from which IP | SPEC §5.4 accountability | see `docs/` on the audit log |

No sender's Stellar secret key is ever held. The sponsor key belongs to Kleym
and lives in the environment, never the database (`AGENT.md` §5.5).

## Recipients (not Kleym's users)

A recipient is someone a sender gave a link to. Kleym never knows who they
are — unless the sender chose email delivery, in which case Kleym holds the
one piece of recipient PII it has:

| Data | Why | Kept |
|---|---|---|
| `Delivery.email` | to send the link and its one-time code | until **90 days** after the link or its campaign settles, then redacted |
| `Delivery.sentAt`, `openedAt` | "did this person get their link?" | survive redaction — they say a delivery happened, not to whom |
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

**Where the address never goes.** Log lines (the delivery id stands in for
it), audit metadata (the scrubber refuses any `email` key), the queue after
a send completes (`removeOnComplete`), the claim page, or the server's
request logs. `scripts/verify-email.ts` and `scripts/verify-privacy.ts` scan
for it after a job completes and after an erasure.

## Not stored at all

Ephemeral secret seeds, claim URLs (they transit memory for one email send),
recipients' wallet addresses beyond the `claimedBy` the ledger reports, any
analytics or tracking on the claim page (`SPEC.md` §5.2).
