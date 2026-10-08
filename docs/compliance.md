# Compliance hooks

Kleym ships the **interface**, not an opinion. It does not screen anyone, bundle a
sanctions list, or carry a risk model (`SPEC.md` §1.2). A regulated buyer plugs in
their own screening provider through the callback below, records their own reference
data against each recipient, and hands their regulator a signed export of what was
distributed. Recipients stay anonymous — there is no KYC of claimants and none is
planned; that is the product.

Everything here is optional. An organisation with no callback configured is signed
exactly as before: no request, no row written, no audit entry (`pnpm verify:compliance`
proves that, along with the rest of this page).

## 1. Screening callback

### Where it runs

The sender sees it as "Prepare" taking up to `SCREENING_TIMEOUT_MS` per batch; the
wizard says so while batches are being signed.

Before **batch submission** — in `prepareBatch` (when the unsigned envelope is
built) and again in `submitBatch` (when the signed one is sent). That is the last
moment where nothing has happened on-chain and a hold costs nothing. After
submission the funds sit in claimable balances and the only remedy is reclaim after
expiry.

### Configuring it

An Owner sets the URL under **Settings → Organisation → Compliance screening**, or
`PATCH /api/org` with `{"screeningUrl": "https://…"}` (`null` switches it off). HTTPS
only, no embedded credentials. Outside production (`NODE_ENV !== 'production'`) plain
HTTP to a loopback address is also accepted so a local receiver and the verify script
work; in production it is refused.

### What the URL may reach — and the deployment's half of it

This is the first place a value a **tenant** controls drives a request from Kleym's
own process, so the URL is treated as hostile input:

- **No redirects.** The request is sent with `redirect: 'error'`, deliberately: a
  redirect is a way to turn an approved public hostname into a request to somewhere
  else, and a provider that redirects is answered with a HOLD.
- **No private or reserved literal addresses in production.** URL-parser-normalized
  IPv4 (including shorthand, octal and hexadecimal), IPv6 loopback/private/link-local,
  mapped/translation/transition ranges, documentation ranges and local hostnames
  are refused. Only public HTTPS destinations without credentials pass; isolated
  non-production HTTP/HTTPS loopback fixtures remain supported. Otherwise an Owner could make Kleym
  POST to whatever shares the application host — the Next.js server, a metrics
  sidecar, a co-located service.
- **Stated limitation:** Kleym does **not** resolve the hostname before connecting.
  An HTTPS hostname that resolves — or later rebinds — to a private, link-local or
  metadata address is not detected here. Deploy so that the application host cannot
  reach internal services over HTTPS using an enforced egress policy/proxy that
  validates resolved addresses and every connection. This is a Mainnet release
  gate, not protection established by URL-parser tests. Do not rely on a one-time
  DNS preflight: a later lookup could return a different address.

The same canonical host rule applies to webhook, screening, OIDC and federation
requests. Stored webhook/screening URLs and OIDC issuer/endpoint requests are
revalidated when executed, so a previously accepted private HTTPS URL is refused
without sending its payload. The shared request wrapper forces `redirect: 'error'`.
SSO discovery caches are separated by environment; the actual `jose.customFetch`
export routes JWKS downloads through the same wrapper. Transport errors are
recorded using fixed categories, without echoing URLs or provider error text.

The literal-range policy conservatively excludes special IPv6 protocol assignment
ranges and admits global unicast only. Range references: [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/)
and [IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/), reviewed
2026-10-08. Reassess the policy if an integration legitimately requires a excluded
special-purpose range; do not bypass it with an unrestricted fetch.

Deployment-wide environment:

| Variable | Default | Meaning |
|---|---|---|
| `SCREENING_WEBHOOK_SECRET` | unset | When set, every request carries `x-kleym-signature: sha256=<hex HMAC-SHA256 of the body>`. Verify it before trusting a request — anyone who finds the URL can POST to it. Redacted from logs like every other secret. It is one secret per deployment, shared by every organisation's provider: it proves "this came from Kleym", and a provider serving several Kleym tenants tells them apart by `organization.id` in the body. A per-organisation secret is the obvious next step if that is not enough. |
| `SCREENING_TIMEOUT_MS` | `5000` | The whole budget for one call, connect to last byte. Past it the campaign is **held**. |

### Request

`POST <screeningUrl>`, `content-type: application/json`, `user-agent: kleym-screening/1`.
Redirects are not followed.

```json
{
  "version": 1,
  "campaign": {
    "id": "cmt…", "name": "September payroll", "network": "testnet",
    "assetCode": "USDC", "assetIssuer": "GA5Z…", "amountPerLink": "250", "totalAmount": "30250",
    "linkCount": 120, "expiresAt": "2026-10-12T00:00:00.000Z", "createdBy": "mh"
  },
  "organization": { "id": "cmt…", "name": "Acme Treasury" },
  "recipients": [
    { "linkId": "cmt…", "label": "alice", "reference": "PAY-2026-001", "category": "payroll", "note": "September salary", "amount": "500" },
    { "linkId": "cmt…", "label": "bob",   "reference": null, "category": null, "note": null, "amount": "250" }
  ]
}
```

- `amountPerLink`, `totalAmount` and each recipient's `amount` are decimal **strings**; never
  parse them as floats. `amount` is what that link pays (#73 — links may differ from the
  campaign default) and `totalAmount` is their sum: the figure to screen, not
  `amountPerLink × linkCount`.
- `recipients` carries what the sender recorded, one entry per link, in link order. It
  never carries a claimant address (nobody has claimed yet) and never key material.
- `version` is bumped only for an incompatible change. Fields may be added within a
  version; ignore what you do not know.

### Response

`200` with JSON:

```json
{ "decision": "allow" | "hold" | "block", "reason": "shown to the sender", "reference": "your case id" }
```

| Decision | Effect |
|---|---|
| `allow` | The envelope is handed over. Recorded on the campaign, bound to a digest of exactly this request and the callback URL; `submitBatch` honours it without asking again, and any change to the terms, the recipients' fields or the URL asks again. |
| `hold` | Refused now (`409`, detail `Screening hold: … <reason>`). The next signing attempt asks again — for a manual review that finishes later. |
| `block` | Refused, and **final**: the callback is not asked again for this campaign. Cancel the campaign and start another if the decision is reversed. |

`reason` is optional, single-line, and shown to the sender verbatim (capped at 300
characters) — write it for them. `reference` is your own case id: written to the audit
log, shown to nobody.

### Fail closed

Anything other than a `200` with a readable decision **holds** the campaign: a timeout,
a connection error, a redirect, a 4xx/5xx, a body that is not `{ "decision": … }`. The
sender sees `Screening hold: the screening service did not answer; try again later.`
and the audit row (`campaign.screening`) records `source: timeout | error | status |
invalid` so an outage is visible as an outage, not as a run of holds. A screening
step that fails open is not a control; this matches `rateLimit` and `otpSatisfied`.

### What is written

- `Campaign.screeningDecision / screeningReason / screeningHash / screenedAt` — the
  last answer. Shown on the campaign page when it is not `ALLOW`.
- An audit row `campaign.screening` per call: decision, source, recipient count,
  the provider reference and the digest. Changing the URL writes `org.screening_url`
  with the old and new **host** only (a path may itself be a credential).

## 2. Attestation fields

Three optional free-text fields per link, the sender's own reference data:
`reference` (≤120 chars), `category` (≤60), `note` (≤500). Seed-free like every
string Kleym accepts; a cell that is a Stellar address or secret seed is refused at
import exactly as a label is.

- **Import**: paste or upload a CSV in the wizard's Labels box with a header row
  naming any of `label, reference, category, note`, in any order. Columns not named
  are ignored — a pasted spreadsheet row routinely carries an address in a later
  column, and Kleym reads a column only when the sender said what it is. Without a
  header only the first column is read, as before.
- **Export**: the secrets CSV gains `reference, category, note` **after** the existing
  four columns, so anything reading `label, public_key, secret, claim_url` by position
  is unaffected. A downloaded file re-imports as-is.
- **API**: `POST /api/campaigns/{id}/links` accepts `attestations`, one object (or
  `null`) per public key.
- **Where they go**: the screening request, the regulator export, the sender's links
  page. **Where they never go**: any `/api/claims/*` response. `resolveLink` does not
  select the columns, so a link with attestation and one without answer with the same
  keys (`SPEC.md` §6.4) — the verify script asserts both.

## 3. Regulator export

`GET /api/org/compliance/export?format=json|csv&from=&to=` — Owner only, scoped to the
session's organisation and never by a parameter. One row per link: campaign terms and
creator, sponsor and sender accounts, the screening decision, the sender's label and
attestation fields, link status, the ephemeral account, the funding transaction hash,
and the claimant address, time and claim transaction. Delivery email is deliberately
absent: it is PII with its own retention (`docs/data-handling.md`) and a compliance
file should not extend it.

The body is signed byte-for-byte with the audit-log key (`AUDIT_SIGNING_SEED`) and the
same headers as the audit export:

```
x-kleym-signature:     <base64 Ed25519 signature over the body>
x-kleym-signing-key:   <base64 SPKI public key>
x-kleym-signature-alg: ed25519-over-body-bytes
```

A saved file verifies offline with the public key alone, no Kleym involved:

```
pnpm audit:verify-export kleym-regulator-<org>-<date>.json "<x-kleym-signature>" "<x-kleym-signing-key>"
```

(`docs/audit-log.md` §"Signed export" covers the key and how to distribute it.) Each
export writes an audit row `org.regulator_export` with the window and the row count.

## 4. Accounting export

Current exports are v2 with explicit `timeSource` and `feeEvidence` columns.
New valuations require confirmed ledger time; missing history is not priced
using the application clock. Historical rows remain `legacy-unverified`, and
unknown fees produce no invented fee expense. See [settlement time and compatibility](settlement-time.md).

`GET /api/org/accounting/export?format=csv|json&from=&to=&campaignId=` — Operator and up,
scoped to the session's organisation. One journal line per settled claim, **valued at the
claim's own ledger time** in the organisation's reporting currency (Settings → Accounting;
`reportingCurrency` on `PATCH /api/org`), with the rate, its source and the aggregation
window it came from on the line. Reclaims are exported as reversals against the expense
account, valued at the reclaim's own time; the network fee the sponsor paid for each
movement is its own line in XLM.

The rate is captured once, when the movement settles (`Valuation`), and never recomputed:
the same range gives byte-identical bytes on every run, and the generation time travels in
`x-kleym-generated-at` rather than in the body. Rates come from the Stellar DEX's trade
history for the asset against the anchor that stands for the currency (`RATE_ANCHORS`,
`USD=USDC:G…`): the close of the claim's hour, or of its day when the hour did not trade.
A pair with no trades in either window is exported with `rateSource: unavailable` and an
empty fiat column — never dropped — and the hourly `valuations` pass retries it against the
same instant until it fills (the asset rate and the fee's XLM rate are separate lookups, each
with its own source and window on its line; a row's failed tries are counted and the pass
takes the least-tried rows first, so a pair that never trades cannot starve newer ones);
`x-kleym-unpriced-lines` counts them. The pass also creates the row for any settled movement
whose claim-time write failed — a claimed link, a reclaim batch, or a link reconciliation
corrected from the ledger — so every settled movement has a line within the hour. At claim
time the price lookup is given three seconds; past that the row is written unpriced for the
pass, and the claim is not held.

The fee line is TX2's fee (the claim or reclaim transaction). TX1 (materialise) is
submitted separately and its result is not kept on the link, so its fee is not on the line;
a reconciliation-corrected movement has no fee line at all, its fee being unknown.

`from` and `to` accept a bare date (`YYYY-MM-DD`), read as that whole day — `to=2026-09-30`
includes the 30th — or an ISO instant, taken as is. Signed and verified like
the regulator export (`pnpm audit:verify-export`); audited as `org.accounting_export`.

Accounts are fixed strings a bookkeeper maps once: `Payouts expense`, `Digital assets
(<code>)`, `Network fees`. The JSON carries both the flat lines and balanced
debit/credit entries per movement. This is reporting, not tax determination.
## 5. Claim receipts

Every settled claim with verified time and delivered/payee evidence can receive a signed receipt (#81), issued when that evidence is available and
never regenerated: the recipient address (read off the submitted envelope), what was
delivered — for a receive-as claim (#74) the destination asset and the amount the ledger paid
out — the ledger time, the transaction hash, the memo where one applied (#75), the delivery
channel and the claim policy that applied (#79), and the campaign's terms. The link is named
by id only: the sender's label, reference, category and note are never in a receipt or a
recipient's copy; the sender-facing CSV bundle carries them as unsigned columns beside each
receipt. Nothing derived from the link — no URL, no fragment, no seed.

New v3 receipts explicitly attest ledger time. Existing v1/v2 signatures and
canonical bytes are preserved with their historical semantics. Missing ledger
time prevents new issuance; it does not turn a successful claim into a failed
transfer. See [settlement time and rollback](settlement-time.md).

- `GET /api/campaigns/{id}/links/{linkId}/receipt` — one receipt; the body is its exact
  signed bytes, the signature and key in the headers above.
- `GET /api/campaigns/{id}/receipts?format=json|csv` — every receipt of one campaign
  (Operator and up; audited as `campaign.receipts_export`). A settled claim the claim-time
  issue missed is issued when a bundle is built.
- `GET /api/org/receipts?from=&to=&format=` — every receipt of the organisation in a
  claim-date range (Operator and up; audited as `org.receipts_export`).

A bundle is signed as a whole and each receipt inside carries its own signature over its
own canonical bytes (the CSV's last column), so one can be lifted out and verified alone:

```
pnpm receipts:verify kleym-receipts-<campaign>-<date>.json                       # every receipt inside
pnpm receipts:verify kleym-receipt-rcpt_….json "<x-kleym-signature>" "<x-kleym-signing-key>"
```

`link.claimed` carries `receiptId`. With "Email each recipient a signed receipt" on, an
email-delivered recipient is mailed their receipt — the bytes, the signature and the public
key in the message — when they claim; it carries no link.

## Verification

`pnpm verify:compliance` (CI) stands up a local receiver and proves: the request shape
and HMAC; hold and block refuse `prepareBatch` and `submitBatch` with the reason;
timeout, 5xx, unreadable body and connection refused all hold within the budget; block
is final; an ALLOW is invalidated by a changed reference or URL; no URL means no call,
no row, no audit; attestation is stored and absent from `resolveLink`; the export is
per-organisation, signed, and fails on one flipped byte.
