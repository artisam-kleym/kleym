# Kleym — Technical Specification

**Version:** 1.0
**Status:** Ready for implementation
**Audience:** Code-generation agent + human reviewers

---

## 1. Overview

Kleym turns Stellar assets into one-time claim links. A sender generates a batch of links, distributes them through whatever channel they already use, and each recipient opens their link, connects a wallet, and claims the asset — without ever handing over a wallet address in advance.

### 1.1 The problem

Distributing crypto to a group means collecting wallet addresses first: a spreadsheet, a form, chasing stragglers, transcription errors that send funds nowhere. Recipients new to Stellar hit a second wall — an unfunded account cannot hold a non-native asset without XLM for reserves and a trustline.

Kleym removes both. The sender never needs an address. The recipient never needs XLM.

### 1.2 Non-custodial guarantee

**Kleym never holds spendable keys.** Ephemeral keypairs are generated in the sender's browser and exist only inside the URL fragments. The database stores the ephemeral *public* key — enough to index and reconcile a link, useless for spending it.

This is the central design constraint. Every other decision in this document defers to it. It means a database breach cannot drain a campaign, and it keeps Kleym infrastructure rather than a money transmitter.

The cost: if the sender loses the CSV, those funds are stranded until expiry and then reclaimed. This is why CSV export is a **hard gate**, not a convenience button.

### 1.3 Scope

**In scope for v1**
- XLM and any Stellar (SEP-41 / classic) asset
- Batch link creation with client-side key generation
- Sponsored claims (account creation + trustline paid by Kleym)
- Expiry and one-click reclaim
- Campaign tracking and per-link status
- Forced CSV export
- Email delivery of links with OTP-gated retrieval
- Public REST API with API-key auth

**Out of scope for v1**
- Multi-tenancy / organisations (single sender account owns its campaigns)
- Soroban smart contracts
- Cross-chain anything
- Fiat on/off ramps

---

## 2. Architecture

### 2.1 Topology

```
┌──────────────────────────────────────────────────────────┐
│ Browser (sender)                                          │
│  • generates ephemeral keypairs        ← SECRETS LIVE HERE│
│  • signs batch tx via Freighter                           │
│  • forces CSV download                                    │
└───────────────┬──────────────────────────────────────────┘
                │ public keys + metadata only
                ▼
┌──────────────────────────────────────────────────────────┐
│ Next.js (App Router) on Railway                           │
│  • Route Handlers = API      • Server Components = pages  │
│  • Prisma → Postgres         • BullMQ → Redis             │
│  • Sponsor signing key (Railway secret, never in DB)      │
└──────┬──────────────────┬─────────────────┬──────────────┘
       │                  │                 │
       ▼                  ▼                 ▼
   Postgres            Redis           Stellar Horizon
   (Railway)          (Railway)          + Soroban RPC
                          │
                          ▼
                    Worker process
                    (reconciliation, email, expiry sweep)
```

### 2.2 Services on Railway

| Service | Purpose |
|---|---|
| `kleym-web` | Next.js app (pages + API route handlers) |
| `kleym-worker` | Node process running BullMQ consumers and cron jobs |
| `postgres` | Railway Postgres plugin — primary datastore |
| `redis` | Railway Redis plugin — job queue, rate limiting, OTP store |

**No file storage service is provisioned.** The brief mentions one; it is deliberately omitted. The only file Kleym produces is the secrets CSV, and that is generated in the browser via `Blob` + `URL.createObjectURL` and **never uploaded**. Adding object storage would create a place for secrets to accidentally land. If branding assets are needed later, serve them from `/public`.

### 2.3 Trust boundaries

| Boundary | What crosses it | What must never cross |
|---|---|---|
| Browser → API | ephemeral **public** keys, labels, campaign metadata, signed XDR | ephemeral seeds, CSV contents |
| API → Postgres | public keys, balance IDs, statuses | any seed, any secret |
| URL → Server | *nothing* — the seed lives in the fragment (`#`), which browsers do not transmit | — |
| Server → Stellar | sponsor-signed XDR | — |

---

## 3. Core protocol design

This section is the load-bearing part of the spec. Implement it exactly.

### 3.1 Why claimable balances need more than a signature

A naive design says: make the ephemeral keypair the claimant, and the recipient signs with it. **This does not work.**

`ClaimClaimableBalanceOp` credits the *claimant account*. The op's source account must exist on the ledger and, for non-native assets, must hold a trustline. An ephemeral keypair has no account. A transaction whose op source does not exist fails with `tx_no_source_account`.

So the claim transaction must materialise the ephemeral account, claim into it, forward the asset onward, and dispose of it — atomically.

### 3.2 Campaign creation (sender side)

For each link, the browser generates a fresh Ed25519 keypair. The batch transaction contains one operation per link:

```
CreateClaimableBalanceOp
  asset:   <campaign asset>
  amount:  <amount per link>
  claimants: [
    { destination: <ephemeralPubKey>,  predicate: BEFORE_ABSOLUTE_TIME(expiresAt) },
    { destination: <senderPubKey>,     predicate: NOT(BEFORE_ABSOLUTE_TIME(expiresAt)) }
  ]
```

The two predicates are mutually exclusive: the recipient can claim only before expiry, the sender only after. There is no window in which both can claim, and no window in which neither can.

**Batching.** Stellar permits up to 100 operations per transaction. Kleym uses a batch size of **90** to leave headroom. A 1,000-link campaign is 12 transactions and 12 Freighter signatures. The UI shows batch progress (`Batch 3 / 12 signed`).

**Reserves.** The sender funds the ClaimableBalanceEntry reserve for every link. The multiplier is a function of base reserve and claimant count and **must be read from the current protocol at runtime**, not hardcoded — call `GET /ledgers?order=desc&limit=1` on Horizon and compute from `base_reserve_in_stroops`. Show the total reserve cost in the review step before the sender signs. Do not guess this number in the UI.

**Failure atomicity.** If batch 7 of 12 fails, batches 1–6 are on-chain and real. The campaign record must reflect partial creation: links from failed batches are marked `FAILED` and never appear in the CSV. The UI offers "retry failed batches" which creates a new transaction for only those links.

### 3.3 The claim transaction

**Verified on testnet (issue #1).** An earlier single-transaction design was disproven
and replaced; §3.3.1 records why, because the constraint will look arbitrary otherwise.

The claim is **two transactions**. Both are built server-side and sourced from SPONSOR,
which pays both fees.

**TX1 — materialise the ephemeral account.** Signers: SPONSOR, EPHEMERAL.

```
 1. BeginSponsoringFutureReserves(sponsoredId: ephemeralPubKey)     source: SPONSOR
 2. CreateAccount(destination: ephemeralPubKey, startingBalance: 0) source: SPONSOR
 3. EndSponsoringFutureReserves()                                    source: EPHEMERAL

    — if asset is non-native —
 4. BeginSponsoringFutureReserves(sponsoredId: ephemeralPubKey)     source: SPONSOR
 5. ChangeTrust(asset, limit: max)                                   source: EPHEMERAL
 6. EndSponsoringFutureReserves()                                    source: EPHEMERAL
```

The recipient is deliberately absent from TX1 — it needs only the sponsor and the
ephemeral key, and the ephemeral key is derivable from the URL fragment as soon as the
claim page loads.

**Do not submit TX1 on page load.** It is tempting, because it would hide the ledger wait
entirely. But every abandoned page would then strand sponsor reserves (§3.3.2), and Kleym
cannot recover them. Merely opening a link would cost 1.0–1.5 XLM of float.

Submit TX1 when the recipient **commits** to claiming — the tap on *Connect Wallet to
Claim* — so the ledger wait overlaps the wallet modal instead of preceding it. Abandoned
claims then require deliberate action rather than idle curiosity.

**TX2 — claim, forward, dispose.** Must land in a **later ledger** than TX1 (see
§3.3.1). Signers: SPONSOR, EPHEMERAL, and RECIPIENT **only when the recipient is an
operation source**.

```
 7. ClaimClaimableBalance(balanceId)                                 source: EPHEMERAL

    — if recipient account does not exist —
 8. BeginSponsoringFutureReserves(sponsoredId: recipientPubKey)     source: SPONSOR
 9. CreateAccount(destination: recipientPubKey, startingBalance: 0) source: SPONSOR
10. EndSponsoringFutureReserves()                                    source: RECIPIENT

    — if asset is non-native and recipient lacks a trustline —
11. BeginSponsoringFutureReserves(sponsoredId: recipientPubKey)     source: SPONSOR
12. ChangeTrust(asset, limit: max)                                   source: RECIPIENT
13. EndSponsoringFutureReserves()                                    source: RECIPIENT

14. Payment(destination: recipientPubKey, asset, amount)            source: EPHEMERAL

    — if asset is non-native —
15. ChangeTrust(asset, limit: 0)                                     source: EPHEMERAL

16. AccountMerge(destination: recipientPubKey)                      source: EPHEMERAL
```

Op 15 is not optional. `AccountMerge` refuses an account holding any subentry, and the
sponsored trustline is one. Removing it also returns its reserve to the sponsor.

Op 16 releases the ephemeral account's remaining sponsored reserves. Without it every
claim would permanently leak reserve XLM from the sponsor account.

**Do not add a recipient signature when it is not required.** Stellar rejects a
transaction carrying a signature it does not need with `tx_bad_auth_extra`. For an
existing recipient that already holds the trustline, TX2 has no recipient-sourced
operation and the recipient must not sign.

**Receive-as (#74).** When the sender has allowed it (`Campaign.receiveAsAssets`) and the
recipient chooses another asset, op 14 becomes
`PathPaymentStrictSend(sendAsset: asset, sendAmount: amount, destAsset, destMin, path)`
sourced from EPHEMERAL, and the trustline in ops 11–13 is for the **destination** asset —
what the recipient ends up holding. `destMin` is the quote (Kleym's own Horizon,
`strictSendPaths`, served through `/api/claims/quote` so `/claim` still makes no
third-party request) less 1%, rounded down; below it the whole transaction fails, the
balance stays claimable, and the page offers the asset as sent. With no conversion TX2 is
byte-identical to the list above. The recipient-signature rule is unchanged: sign exactly
when the recipient sources an operation.

#### 3.3.1 Why two transactions

Both constraints are protocol rules on `AccountMerge`, confirmed with isolated controls
in `scripts/spike-diagnose.ts`. Neither has a workaround.

1. **An account cannot be merged in the transaction that created it.** A new account's
   sequence number is `currentLedgerSeq << 32`, above the merge ceiling derived from the
   last closed ledger. Same-transaction merge fails `op_seq_num_too_far`; the identical
   merge one ledger later succeeds. A later transaction in the *same* ledger is not
   enough — the boundary is the ledger, roughly five seconds.
2. **An account holding a trustline cannot be merged.** Fails `op_has_sub_entries`.

#### 3.3.2 The cost: an unrecoverable intermediate state

Two transactions are not atomic. TX1 can land and TX2 never follow — a closed tab, a
rejected signature, a dropped connection.

The resulting state is safe but untidy: an ephemeral account exists, sponsored by Kleym,
possibly holding a trustline. **No user funds are at risk** — the claimable balance is
untouched and still claimable. What is stranded is Kleym's own reserve float: 1.0 XLM
for the account plus 0.5 for a trustline, at a 0.5 XLM base reserve.

**Kleym cannot recover a stranded account itself.** `AccountMerge` must be signed by the
ephemeral key, which exists only in the sender's CSV and the recipient's URL. Kleym holds
the public key alone — the same property that makes a database breach harmless makes this
cleanup impossible. `RevokeSponsorship` is no escape either: it transfers the reserve
obligation to an account with a zero balance, which cannot meet it.

The reserve is released when the link is eventually claimed. If it is never claimed, it
stays locked. This is a permanent cost of the non-custodial guarantee, and §12 states it.

Three consequences the implementation must handle:

- **Do not submit TX1 speculatively** — it fires on the recipient's commitment, never on
  page load.
- **Retry is cheap and must be supported.** TX1 need not be repeated; `prepare` checks
  whether the ephemeral account already exists and skips straight to TX2.
- **Stranded accounts must be monitored**, since they consume the same sponsor float every
  claim depends on. See §7.3.

#### 3.3.3 Signing sequence

1. Client derives `ephemeralPubKey` from the fragment seed **in the browser**.
2. On the recipient's commitment to claim, client
   `POST /api/claims/prepare/materialise`. **The seed is not sent.** Server returns
   TX1 sponsor-signed, or `{ alreadyExists: true }` with no XDR when the ephemeral
   account is already on the ledger and TX1 should be skipped.
3. Client signs TX1 with the EPHEMERAL key in memory and submits it.
4. Client waits for the next ledger while the recipient connects a wallet.
5. Client `POST /api/claims/prepare/claim` with `{ ephemeralPublicKey, recipientPublicKey }`.
   Server inspects the ledger — does the recipient account exist? does it hold a
   trustline? — builds TX2's conditional op list, signs as SPONSOR, and returns the
   partially-signed XDR together with whether a recipient signature is required.
6. Client signs with the EPHEMERAL key, then requests a RECIPIENT signature via the
   wallet kit **only if required**.
7. Client `POST /api/claims/submit`. Server submits and records the result.

**Why `prepare` is two endpoints and not one with a `phase` field.** Steps 2 and 5 are
different operations, not one route parameterised by a body field. A single endpoint
returning different transactions for different payloads also collides with
`AGENT.md` §4.3, which requires an `Idempotency-Key` on every mutating endpoint that
touches chain state and mandates that a replayed key return the stored response: a
genuine second phase then has to be distinguishable from a replay by inspecting the
body. Splitting makes that structural. It also puts the §3.3.2 hazard — the ledger
boundary between TX1 and TX2, where an abandoned claim strands sponsor reserves Kleym
cannot recover — in the URL rather than in a discriminator, and lets the two carry
different rate limits, which they need: `materialise` is the retry-prone one, because
§3.3 requires a ledger boundary before TX2 and clients will re-poll.

### 3.4 Reclaim

After `expiresAt`, the sender's predicate becomes satisfiable. Reclaim is a batched transaction of `ClaimClaimableBalanceOp` with source = SENDER, one per unclaimed link, batched at 90 per transaction, signed in Freighter.

Reclaim must query Horizon for which balance IDs still exist rather than trusting the database, then reconcile the database from that result.

### 3.5 The chain is the source of truth

The database is a cache and an index. It is never the authority on whether money moved.

A reconciliation job (§7.2) queries Horizon for each campaign's balance IDs. A balance ID absent from the ledger was claimed or reclaimed; the operation history reveals which and by whom. Any disagreement between database and chain resolves in favour of the chain, and the discrepancy is logged at `WARN`.

### 3.6 Fragment discipline

The link format is:

```
https://kleym.app/claim#s=<seed>
```

The seed is after the `#`. Browsers do not send fragments in HTTP requests, so the seed never reaches server logs, referrer headers, or analytics.

The seed is carried **raw**, not base64url-encoded as this section first specified. Encoding it defeats Kleym's own leak detection: `scanForSecretSeed`, the `NEXT_PUBLIC_` env scan and the CI guard all match `S[A-Z2-7]{55}`, and none of them recognises `U0FTWkJXWkRDUll…`. A format that hides a leaked seed from the machinery built to catch leaked seeds is worse than one that does not, and the fragment is withheld from the network either way. The `s=` parameter is kept so a second field can be added without changing how the first is read.

**Enforcement rules for the implementing agent:**
- Never place a seed in a query string, path segment, POST body, cookie, or `localStorage`.
- Never log a value derived from `window.location.hash`.
- Set `Referrer-Policy: no-referrer` on the claim route.
- The claim page must have zero third-party scripts. No analytics, no tag managers, no font CDN — self-host fonts on this route.
- Call `history.replaceState` after reading the hash to reduce shoulder-surfing and history leakage.

---

## 4. Data model (Prisma)

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  SENDER
}

enum CampaignStatus {
  DRAFT        // created, not yet funded on-chain
  CREATING     // batches being signed/submitted
  ACTIVE       // links live and claimable
  PARTIAL      // some batches failed
  EXPIRED      // past expiresAt, reclaim available
  RECLAIMED    // all unclaimed funds returned
  CANCELLED
}

enum LinkStatus {
  PENDING      // row exists, batch not yet confirmed
  ACTIVE       // claimable balance live on ledger
  CLAIMED
  EXPIRED
  RECLAIMED
  FAILED       // batch failed; no on-chain entry
}

enum BatchStatus {
  PENDING
  SUBMITTED
  CONFIRMED
  FAILED
}

model User {
  id           String    @id @default(cuid())
  username     String    @unique
  passwordHash String                        // argon2id
  role         Role      @default(SENDER)
  isActive     Boolean   @default(true)
  failedLogins Int       @default(0)
  lockedUntil  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  campaigns    Campaign[]
  sessions     Session[]
  apiKeys      ApiKey[]
  auditLogs    AuditLog[]

  @@index([username])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique               // sha256 of the opaque cookie value
  expiresAt DateTime
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model ApiKey {
  id         String    @id @default(cuid())
  userId     String
  name       String
  prefix     String    @unique              // first 8 chars, shown in UI
  keyHash    String                         // argon2id of the full key
  lastUsedAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([prefix])
}

model Campaign {
  id              String         @id @default(cuid())
  userId          String
  name            String
  network         String                        // "testnet" | "public"
  senderPublicKey String                        // G... that funded it
  assetCode       String                        // "XLM" or e.g. "USDC"
  assetIssuer     String?                       // null for native
  amountPerLink   Decimal        @db.Decimal(23, 7)  // the DEFAULT per link; each ClaimLink carries its own (#73)
  variableAmounts Boolean        @default(false)     // any link differs from the default — display only
  linkCount       Int
  expiresAt       DateTime
  status          CampaignStatus @default(DRAFT)
  csvExportedAt   DateTime?                     // hard gate: null blocks activation
  reserveEstimate Decimal?       @db.Decimal(23, 7)
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  user            User           @relation(fields: [userId], references: [id])
  links           ClaimLink[]
  batches         Batch[]

  @@index([userId, status])
  @@index([expiresAt, status])
}

model Batch {
  id              String      @id @default(cuid())
  campaignId      String
  sequence        Int                        // 1-based batch index
  transactionHash String?     @unique
  status          BatchStatus @default(PENDING)
  errorCode       String?
  submittedAt     DateTime?
  confirmedAt     DateTime?
  createdAt       DateTime    @default(now())

  campaign        Campaign    @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  links           ClaimLink[]

  @@unique([campaignId, sequence])
}

model ClaimLink {
  id                 String     @id @default(cuid())
  campaignId         String
  batchId            String?

  /// Ephemeral PUBLIC key (G...). The corresponding seed NEVER touches this system.
  ephemeralPublicKey String     @unique

  balanceId          String?    @unique      // set once the batch confirms
  amount             Decimal    @db.Decimal(23, 7)  // what THIS link pays (#73); amountPerLink is the default
  status             LinkStatus @default(PENDING)
  label              String?                 // sender's own note: handle, email, etc.

  claimedBy          String?                 // recipient G...
  claimedAt          DateTime?
  claimTxHash        String?

  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  campaign           Campaign   @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  batch              Batch?     @relation(fields: [batchId], references: [id])
  delivery           Delivery?

  @@index([campaignId, status])
  @@index([balanceId])
}

model Delivery {
  id          String    @id @default(cuid())
  linkId      String    @unique
  email       String
  sentAt      DateTime?
  openedAt    DateTime?
  otpHash     String?                        // argon2id, 6-digit
  otpExpires  DateTime?
  otpAttempts Int       @default(0)
  createdAt   DateTime  @default(now())

  link        ClaimLink @relation(fields: [linkId], references: [id], onDelete: Cascade)

  @@index([email])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String                          // "campaign.create", "link.reclaim", ...
  entityType String?
  entityId   String?
  metadata   Json?
  ip         String?
  createdAt  DateTime @default(now())

  user       User?    @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
  @@index([entityType, entityId])
}

model IdempotencyKey {
  key         String
  userId      String
  requestHash String
  response    Json?
  statusCode  Int?
  createdAt   DateTime @default(now())

  @@id([userId, key])
  @@index([createdAt])
}
```

### 4.1 Schema invariants

The implementing agent must uphold these. Add a CI check that greps for violations.

1. **No column ever stores a seed, secret key, or mnemonic.** `ephemeralPublicKey` is a public key. If a field name suggests otherwise, the schema is wrong.
2. `Campaign.csvExportedAt` gates activation. A campaign cannot leave `CREATING` until it is set.
3. `ClaimLink.balanceId` is null until the owning batch is `CONFIRMED`.
4. Money columns are `Decimal(23,7)` — Stellar's precision is 7 decimal places. **Never `Float`.** In application code use `decimal.js` or string arithmetic; never JavaScript `Number` for amounts.

### 4.2 Seed script

`prisma/seed.ts` creates one admin:

- Username from `SEED_ADMIN_USERNAME`, password from `SEED_ADMIN_PASSWORD`.
- **Refuse to run if either is unset.** No hardcoded fallback, no `admin/admin`.
- **Refuse to run in production** unless `ALLOW_PROD_SEED=true` is explicitly set.
- Idempotent: upsert on username.
- Print the username; never print the password.

---

## 5. Pages

All routes are Next.js App Router. Design tokens and component conventions are in `BRAND.md`.

### 5.1 Public

| Route | Purpose | Notes |
|---|---|---|
| `/` | Landing page | Hero, three value props, three-step flow diagram. Matches provided mock. |
| `/login` | Sender sign-in | Username + password. Generic error text on failure. |
| `/claim` | **Recipient claim page** | Reads `#s=<seed>` (raw — see §3.6). Zero third-party scripts. Self-hosted fonts. |

#### `/claim` states

The page is a state machine and every state needs a designed screen:

| State | Screen |
|---|---|
| `loading` | Resolving the link |
| `invalid` | Link is malformed or not recognised |
| `ready` | "You've received 500.00 USDC from *Sender*" + Connect Wallet to Claim |
| `otp_required` | Six-digit code entry (email-delivered links only) |
| `wallet_connecting` | Wallet kit modal |
| `preparing` | Building your claim |
| `awaiting_signature` | Confirm in your wallet |
| `submitting` | Submitting to Stellar |
| `claimed_success` | Amount, asset, tx hash, link to explorer |
| `already_claimed` | Claimed on *date* by *G...* |
| `expired` | This link expired on *date* and funds returned to the sender |
| `failed` | What went wrong, and a retry action |

The "New to Stellar?" panel is shown in `ready` and explains that Kleym sponsors the account and setup, so no XLM is required.

### 5.2 Sender (authenticated)

| Route | Purpose |
|---|---|
| `/dashboard` | Overview: total distributed, active campaigns, pending claims, recent campaigns table |
| `/campaigns` | Full campaign list with search and status filter |
| `/campaigns/new` | Three-step wizard (§5.3) |
| `/campaigns/[id]` | Detail: progress, per-link table, labels, reclaim action |
| `/campaigns/[id]/links` | Paginated link table with status and claimant |
| `/settings` | Account, password change, API keys |
| `/history` | Cross-campaign claim activity |

### 5.3 Campaign wizard

**Step 1 — Asset & amount.** Network, asset (native or code+issuer, validated against the sender's balances), amount per link. Shows the sender's available balance.

**Step 2 — Recipients & expiry.** Link count, expiry datetime, optional label list (paste or CSV upload of labels only — never addresses). Displays total asset cost, total reserve cost, and batch count.

**Step 3 — Review & batch.** This is where secrets are created.

Order of operations in step 3 is mandatory and must not be reordered:

1. Show the security checkpoint warning (see mock: red panel, "We cannot recover them for you if lost").
2. Generate all keypairs in browser memory.
3. **Force the CSV download.** The Continue button is disabled until the download fires.
4. Build and sign batches, showing `Batch n / N signed`.
5. On completion, offer the CSV again and warn that it will not be available after navigation.

If the user navigates away mid-batch, show a `beforeunload` warning naming the consequence: unsigned links will be lost.

### 5.4 Admin

| Route | Purpose |
|---|---|
| `/admin` | System health, sponsor account balance, reconciliation drift |
| `/admin/users` | User list, activate/deactivate |
| `/admin/campaigns` | All campaigns, any user |
| `/admin/reconciliation` | Database vs chain drift report, manual resync trigger |
| `/admin/audit` | Audit log viewer |

**Sponsor balance monitoring is not optional.** If the sponsor account runs dry, every claim in the system fails. Surface it on `/admin` and alert below a configurable threshold.

---

## 6. API

Base: `/api`. All handlers are Next.js Route Handlers with `runtime = 'nodejs'`.

### 6.1 Conventions

- **Auth:** session cookie (`__Host-kleym_session`, `HttpOnly`, `Secure`, `SameSite=Lax`) for the app; `Authorization: Bearer <api_key>` for the public API.
- **Validation:** every input parsed with Zod. Reject unknown keys.
- **Idempotency:** all `POST` that touch chain state require an `Idempotency-Key` header.
  The key is scoped to the user — `@@id([userId, key])`, amended from `key @id`.
  Keys are client-chosen, so two users presenting the same value is ordinary,
  not adversarial; under a global primary key one user's stored response is
  addressable by another's write and replays back to the wrong account.
  The row is reserved with a null response *before* the work runs, so two
  concurrent requests carrying one key cannot both execute; the loser is told
  the original is in flight, and a failed request releases its reservation.
- **Errors:** RFC 9457 problem+json. Never leak stack traces or internal identifiers.
- **Rate limits:** enforced in Redis, per IP and per user.

### 6.2 Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ username, password }` | 5/15min per IP. Constant-time compare. Generic failure message. Rotate session ID on success. |
| POST | `/api/auth/logout` | — | Deletes session row. |
| GET | `/api/auth/session` | — | Current user or 401. |
| POST | `/api/auth/password` | `{ current, next }` | Invalidates all other sessions. |

### 6.3 Campaigns

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/campaigns` | List, paginated, filterable by status |
| POST | `/api/campaigns` | Create draft. Body: name, network, asset, amountPerLink, linkCount, expiresAt, `receiveAs?` (#74: up to five assets a recipient may convert into) |
| GET | `/api/campaigns/[id]` | Detail with aggregate counts |
| PATCH | `/api/campaigns/[id]` | Rename, cancel draft |
| POST | `/api/campaigns/[id]/links` | Register ephemeral **public** keys. Body: `{ publicKeys: string[], labels?: string[], amounts?: (string \| null)[] }` — a per-link amount (#73), `null` for `amountPerLink`. **Rejects any 56-char value beginning `S`.** |
| POST | `/api/campaigns/[id]/batches/prepare` | Returns unsigned XDR for batch `n` |
| POST | `/api/campaigns/[id]/batches/submit` | Body: `{ sequence, signedXdr }`. Submits, records hash, extracts balance IDs |
| POST | `/api/campaigns/[id]/export` | Marks `csvExportedAt`. Returns nothing — the CSV is built client-side |
| POST | `/api/campaigns/[id]/reclaim/prepare` | Unsigned reclaim XDR |
| POST | `/api/campaigns/[id]/reclaim/submit` | Signed reclaim |
| GET | `/api/campaigns/[id]/links` | Paginated link rows |
| PATCH | `/api/campaigns/[id]/links/[linkId]` | Update label only |

**Input guard on `/links`:** any submitted value that parses as a Stellar secret seed must be rejected with `400 SEED_SUBMITTED` and logged as a security event. This is a defence against a future refactor accidentally posting seeds.

### 6.4 Claims (public, unauthenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/claims/resolve?pk=<G...>` | Link metadata: asset, amount, sender name, status, expiry. Rate-limited 20/min/IP. Returns identical shape for unknown and expired keys to prevent enumeration. |
| POST | `/api/claims/prepare/materialise` | `{ ephemeralPublicKey }` → TX1 sponsor-signed XDR, or `{ alreadyExists: true }`. Rate-limited 20/min/IP — retried across the ledger boundary. |
| POST | `/api/claims/quote` | `{ ephemeralPublicKey, receiveAs: { assetCode, assetIssuer } }` → `{ destAmount, destMin }` from Kleym's own Horizon (#74). OTP-gated like every claim action; one 404 for anything not claimable; 409 `no-path` when no market exists. Rate-limited 20/min/IP. |
| POST | `/api/claims/prepare/claim` | `{ ephemeralPublicKey, recipientPublicKey, receiveAs?: { assetCode, assetIssuer, destMin? } }` → TX2 sponsor-signed XDR, whether a recipient signature is required, and `conversion` (`destAmount`, `destMin`) when receiving as another asset (#74). `destMin` is the floor the page showed: the envelope is bound to the higher of it and the fresh bound, and refused `quote-missed` if the fresh quote is below it. |
| POST | `/api/claims/submit` | `{ ephemeralPublicKey, signedXdr, phase }` → submits, records claim. Rate-limited 10/min/IP. |
| POST | `/api/claims/otp/request` | Email-delivered links only |
| POST | `/api/claims/otp/verify` | 6 digits, 5 attempts, 10-minute expiry |
| POST | `/api/claims/code/verify` | `{ ephemeralPublicKey, code }` — the CODE policy's 13-character claim code (#79); 5 attempts then a 15-minute lock, per link and caller; on an emailed link the OTP token must already be on the request; returns the token the claim actions require |
| POST | `/api/claims/passkey/register/options`, `…/register`, `…/authenticate/options`, `…/authenticate` | The PASSKEY policy's WebAuthn ceremony (#79), keyed by the link and challenge; registration binds the first device and needs `proof`, the ephemeral keypair's signature over the challenge; authentication asserts it; an unclaimable link answers 404 like an unknown one; both return the token |

Both `prepare` endpoints must re-verify against the ledger — not the database — that the balance still exists and the predicate is satisfiable. A stale `ACTIVE` row is not authorisation to build a claim. See §3.3.3 for why `prepare` is split rather than carrying a `phase` field.

### 6.5 Delivery

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/campaigns/[id]/deliver` | Queue email sends. Body: `[{ publicKey, email }]`. **The server does not know the link URLs** — the client sends the full URL per recipient, the server queues it for immediate send, and it is never persisted. |

This is the one place a full link transits the server. Mitigations, all mandatory: the URL is passed to the mail provider and discarded, never written to the database, never logged, and the job payload is deleted from Redis on completion. Document this trade-off prominently. If the sender prefers zero exposure, they distribute the CSV themselves.

### 6.6 Public API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/campaigns` | List |
| GET | `/api/v1/campaigns/[id]` | Detail and claim stats |
| GET | `/api/v1/campaigns/[id]/links` | Link statuses |
| POST | `/api/v1/campaigns` | Create a draft from its terms and the sender's PUBLIC key (#51) |
| POST | `/api/v1/campaigns/[id]/links` | Register link PUBLIC keys, with labels and attestation |
| POST | `/api/v1/campaigns/[id]/export` | The caller has written the secrets file (the activation gate) |
| POST | `/api/v1/campaigns/[id]/batches/prepare` | The unsigned envelope for the next batch |
| POST | `/api/v1/campaigns/[id]/batches/submit` | A batch the caller signed |

Reads 100/min per key; writes 30/min per key, counted separately. Writes exist
because of the SDK (`packages/sdk`, #51), which generates link keys on the
caller's machine, writes the secrets CSV to the caller's disk, signs batches
with the sender key the caller holds, and sends public keys and signatures
only. No endpoint accepts a seed under any circumstance: every write body is
scanned before validation and a seed is a `SEED_SUBMITTED` security event, and
CI checks each write route runs that guard. Outbound webhooks (`campaign.created`,
`campaign.activated`, `batch.confirmed`, `link.claimed`, `campaign.reclaimed`,
`sponsor.low`) are signed per endpoint and carry no claim URL — `docs/api.md`.

### 6.7 System

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness. No auth. No detail. |
| GET | `/api/ready` | DB + Redis + Horizon reachability. |

---

## 7. Background jobs

BullMQ on Redis, consumed by `kleym-worker`.

### 7.1 Queues

| Queue | Trigger | Work |
|---|---|---|
| `batch-confirm` | After submit | Poll Horizon until the tx is in a closed ledger; extract balance IDs from the result XDR; mark links `ACTIVE` |
| `email-deliver` | Sender action | Send one link email; discard the URL immediately |
| `reconcile` | Cron, every 5 min | §7.2 |
| `expiry-sweep` | Cron, hourly | Mark past-expiry links `EXPIRED`, campaigns `EXPIRED` |
| `ephemeral-watch` | Cron, every 15 min | Detect and report stranded ephemeral accounts — see §7.3 |

### 7.2 Reconciliation

For each `ACTIVE` campaign:

1. Fetch all balance IDs from the database.
2. Query Horizon `/claimable_balances?claimant=...` and per-ID lookups.
3. For each ID absent from the ledger, read its operation history to find the `claim_claimable_balance` op — record the claimant and transaction hash.
4. Update link rows to `CLAIMED` or `RECLAIMED`.
5. Any database row claiming `CLAIMED` whose balance still exists on-chain is a **critical** inconsistency: log at `ERROR`, surface on `/admin/reconciliation`, do not auto-correct.

Extracting balance IDs from result XDR is notoriously fiddly. Use the SDK's helper rather than manual XDR walking, and cover it with a test against a known transaction.

### 7.3 Stranded ephemeral account monitor

Required by the two-transaction claim design (§3.3.2). When TX1 lands and TX2 never
follows, an ephemeral account persists holding sponsored reserves that **Kleym cannot
reclaim** — the merge needs the ephemeral key, which Kleym deliberately does not hold.

This job detects and reports; it does not sweep. Calling it a sweeper would imply a
recovery it cannot perform.

For each ephemeral public key whose link is not `CLAIMED` and whose account exists on the
ledger, older than a threshold (default 1 hour):

1. Confirm the claimable balance still exists. If it does not, the claim actually
   succeeded and the database is stale — hand off to reconciliation (§7.2).
2. Confirm the ephemeral account holds no asset balance. A non-zero balance means a
   partially-applied claim: log at `ERROR` and surface it as a critical inconsistency.
3. Record the account and its locked reserve.

Surface the count and total locked XLM on `/admin` alongside the sponsor balance. This
float is unavailable for future claims, so it belongs in the same view as the exhaustion
warning (§5.4).

Reserves return on their own when a stranded link is eventually claimed. Retrying a claim
skips TX1 (§3.3.2), so a recipient returning to their link resolves it naturally.

---

## 8. Third-party services

| Service | Purpose | Config |
|---|---|---|
| **Stellar Horizon** | Ledger queries, tx submission | `HORIZON_URL`. Run against testnet by default. |
| **Freighter + Stellar Wallets Kit** | Sender and recipient signing | `@creit.tech/stellar-wallets-kit` — supports Freighter, xBull, Albedo, Rabet, Lobstr, Hana. Do not integrate Freighter's API directly; the kit gives every other wallet for free. |
| **Railway** | Hosting, Postgres, Redis | — |
| **Resend** (or Postmark) | Transactional email | `RESEND_API_KEY`. Chosen for a simple API and no analytics pixel by default — pixels on a claim email would leak. |
| **Sentry** *(optional)* | Error tracking | **Must not be loaded on `/claim`.** Server-side only. |

No analytics provider is specified. If one is added later, it must be excluded from `/claim` by route config, not by a runtime flag.

---

## 9. Configuration

### 9.1 Environment variables

```bash
# ─── Core ───────────────────────────────────────────────
NODE_ENV=development
APP_URL=http://localhost:3000

# ─── Database ───────────────────────────────────────────
DATABASE_URL=postgresql://kleym:kleym@localhost:5432/kleym

# ─── Redis ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Sessions ───────────────────────────────────────────
SESSION_SECRET=            # 32+ random bytes, base64
SESSION_TTL_HOURS=12

# ─── Stellar ────────────────────────────────────────────
STELLAR_NETWORK=testnet    # testnet | public
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Sponsor account — pays recipient reserves and claim fees.
# Railway secret ONLY. Never in the database, never in git.
SPONSOR_PUBLIC_KEY=
SPONSOR_SECRET_KEY=
SPONSOR_MIN_BALANCE_ALERT=100

# ─── Batching ───────────────────────────────────────────
MAX_OPS_PER_BATCH=90
MAX_LINKS_PER_CAMPAIGN=10000

# Per-operation fee in stroops. Network minimum is 100; 1000 leaves headroom
# for surge pricing, and a batch of 90 costs 0.009 XLM at this rate. Raise it
# if batches start failing with tx_insufficient_fee.
BASE_FEE_STROOPS=1000

# ─── Email ──────────────────────────────────────────────
RESEND_API_KEY=
EMAIL_FROM=noreply@kleym.app

# ─── Seed (dev only) ────────────────────────────────────
SEED_ADMIN_USERNAME=
SEED_ADMIN_PASSWORD=
ALLOW_PROD_SEED=false
```

`.env.example` ships with every key present and every value blank. `.env` is gitignored. Startup validates the whole set through a Zod schema and exits with a readable error listing missing keys.

### 9.2 Docker Compose (development)

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: kleym
      POSTGRES_PASSWORD: kleym
      POSTGRES_DB: kleym
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kleym"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

volumes:
  pgdata:
```

No MinIO. See §2.2 — there is deliberately no object storage in this system.

---

## 10. Acceptance criteria

The build is complete when all of the following hold.

**Protocol**
1. Testnet integration test claims successfully in all four permutations: new/existing recipient × native/non-native asset, across both transactions of §3.3.
2. After a claim, the ephemeral account no longer exists on the ledger.
3. Sponsor account net XLM **balance** change across a full claim cycle is fee-only. Sponsoring does not spend XLM — it raises the sponsor's minimum balance — so reserve recovery is asserted on the sponsor's reserve obligation (`2 + subentry_count + num_sponsoring − num_sponsored`) × base reserve, which must rise only by the recipient's own entries. Every ephemeral reserve returns on merge.
4. A 200-link campaign produces exactly 3 batches and 3 signature prompts.
5. Reclaim after expiry returns all unclaimed funds and updates every affected row.

**Security**
6. `grep -ri "secret\|seed" prisma/schema.prisma` returns no storage field.
7. No server log line in a full end-to-end run contains a value derived from a URL fragment.
8. `/claim` loads zero third-party network requests (verify in devtools).
9. Posting a valid Stellar seed to `/api/campaigns/[id]/links` returns 400 and logs a security event.
10. Seed script refuses to run without explicit credentials and refuses production without an explicit flag.

**Product**
11. The Continue button in wizard step 3 is unreachable until the CSV download has fired.
12. Every `/claim` state in §5.1 has a designed screen — including `expired` and `already_claimed`.
13. Reconciliation detects and reports a manually-introduced drift row.
14. Sponsor balance below threshold produces a visible admin warning.

---

## 11. Build order

Each step ends in something checkable. Do not proceed past a failing step.

1. **Testnet spike.** ✅ Done (issue #1). It changed the design: §3.3 is now two transactions. `scripts/spike-claim.ts` proves all four permutations and both predicate directions; `scripts/spike-diagnose.ts` isolates why the single-transaction form cannot work.
2. Scaffold: Next.js, Prisma, Tailwind, Docker Compose, env validation, seed script.
3. Auth: login, sessions, password hashing, rate limiting.
4. Campaign creation: wizard, client-side keygen, batch build/sign/submit, CSV gate.
5. Claim page: resolve, prepare, sign, submit, all states.
6. Reconciliation and expiry jobs.
7. Reclaim.
8. Email delivery and OTP.
9. Admin and public API.
10. Harden: headers, CSP, audit logging, load test the batch path.

---

## 12. Known limitations

State these in the product, not just in this document.

- **Lost CSV means stranded funds** until expiry. By design; the alternative is custody.
- **Sponsor exhaustion halts claims on that sponsor's campaigns.** Sponsorship is a pool (#48): new campaigns are bound to the first sponsor with working float and keep it for life, so one exhausted account cannot stop every campaign, and crossing the alert threshold pages a webhook. It is still float that a person has to top up; `docs/sponsor-runbook.md`.
- **A leaked link is a bearer instrument.** Anyone holding the URL can claim. Email delivery with OTP mitigates this; direct distribution does not.
- **A funded campaign cannot be cancelled, only suspended (#72).** `claimantsFor` gives the recipient the balance before `expiresAt` and the sender from `expiresAt` on — there is no instant at which the sender can take it back early. "Suspend" stops Kleym resolving and preparing the links (campaign-wide or one link at a time) and schedules the reclaim for `expiresAt`, when the sweep marks it due and notifies the organisation; the sender still signs the return, because Kleym holds no key that can move the money. Until then every balance is still on the ledger and claimable by whoever holds the link, and the product says so wherever the action appears. True pre-expiry revocation would mean the sender as an unconditional claimant — a change to what a link promises its holder, and a product decision, not a feature to add quietly.
- **Claim policies (#79) bind a link to a channel or a device, never to a person.** A sender may require a per-link claim code (distributed separately), Kleym email delivery (the OTP gate), or a passkey registered by the first claimant. The gate runs on every claim action. `resolve` reports `policy: open` on every unavailable answer, so the field is not an oracle. Recipients stay anonymous; none of this is identity verification.
- **Partial batch failure** leaves a campaign in a mixed state requiring sender action.
- **An abandoned claim strands sponsor reserves.** If TX1 of a claim lands and TX2 never
  follows, an ephemeral account holds 1.0–1.5 XLM of sponsored reserve. Kleym cannot
  merge it back, because doing so needs the ephemeral key it deliberately does not hold.
  The reserve is released when the link is finally claimed. No user funds are affected.
- **Organisations are flat.** Campaigns belong to an organisation and its members act on them by role (Viewer, Operator, Approver, Owner — #44); there is no sharing of a single campaign across organisations and no hierarchy of organisations.
- **Reserve estimates depend on live protocol values** and can shift between quote and signature.
- **A database restore loses what the ledger cannot rebuild.** Money is re-derived from the chain by reconciliation; delivery state, the CSV-export gate, audit rows, sessions and API keys made after the last backup are not. RPO is the backup interval for those; RTO is measured, not guessed (`docs/disaster-recovery.md`). `/admin/reconciliation` says so, because that is where a person lands after a restore.
