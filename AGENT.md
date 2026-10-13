# AGENT.md — Kleym

Instructions for the coding agent building this application. Read `SPEC.md` for what to build and `BRAND.md` for how it should look. This file is about how to work.

---

## 1. The one rule

**Kleym never stores, logs, transmits, or persists a Stellar secret seed.**

Ephemeral seeds are generated in the sender's browser, placed in URL fragments, and exported to a CSV the user downloads. They exist nowhere else, ever.

Before writing any line that touches a keypair, ask: *could this value reach the server, a log, a database, or a third party?* If yes, the design is wrong — stop and reconsider rather than adding a mitigation.

Current deployments use local-link distribution only (#108). Bearer-link email ingress is disabled, and new email-only campaigns are refused. Historical email code persists full URLs in Redis job payloads and may have copied them into backups/provider systems; it did not provide the browser-only guarantee. A development-only Testnet flag qualifies that historical path, and cannot enable it in production or on the public network. Existing legacy jobs are held for explicit operator review, not silently deleted. Receipt/reminder messages contain no claim URL. See `docs/data-handling.md`; do not extend the historical exception.

**Self-check before every commit:**
```bash
# Nothing that looks like a seed in source, schema, or fixtures
grep -rn "secretKey\|SECRET_SEED\|\.secret()\|rawSecretKey" src/ prisma/ \
  | grep -v "SPONSOR_SECRET_KEY"
```
`SPONSOR_SECRET_KEY` is the only legitimate secret key in the system. It belongs to Kleym's own sponsor account, comes from the environment, and never touches the database.

---

## 2. Do this first

**Before scaffolding anything, spike the claim transaction on testnet.**

SPEC §3.3 specifies a 15-operation, three-signer, sponsored transaction that creates an ephemeral account, claims into it, forwards the asset, and merges the account away. That design is reasoned but **unverified**. If it is wrong, everything built on top of it is wasted.

Write a standalone Node script — no Next.js, no database, no UI — that runs all four permutations:

| | Native (XLM) | Non-native (USDC) |
|---|---|---|
| **New recipient** | ✅ | ✅ |
| **Existing recipient** | ✅ | ✅ |

Assert, for each: the recipient's balance increased by the exact amount; the ephemeral account no longer exists; the sponsor's XLM decreased by fees only, with no reserve leakage.

Only when all four pass do you proceed to step 2 of SPEC §11. If they do not pass, report what happened and what you propose instead — do not improvise a workaround and continue quietly.

---

## 3. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js, App Router, TypeScript strict |
| Runtime | Node.js LTS (Route Handlers must set `runtime = 'nodejs'` — the Stellar SDK is not edge-compatible) |
| Package manager | pnpm, with a committed lockfile |
| ORM | Prisma + PostgreSQL |
| Queue / cache | BullMQ on Redis |
| Styling | Tailwind CSS |
| Validation | Zod, at every boundary |
| Stellar | `@stellar/stellar-sdk` |
| Wallets | `@creit.tech/stellar-wallets-kit` |
| Passwords | `argon2` (argon2id) |
| Money | `decimal.js` |
| Email | `resend` |
| Testing | Vitest (unit), Playwright (e2e) |
| Hosting | Railway |

### 3.1 Dependency versions

The brief requires latest versions. **Do not trust training data for version numbers.** At scaffold time:

```bash
pnpm dlx create-next-app@latest
pnpm add <pkg>@latest
pnpm dlx npm-check-updates -u && pnpm install
pnpm audit --audit-level=moderate
```

Then verify the installed majors against each library's changelog before writing code — Next.js, Prisma, and Tailwind have all had breaking major releases, and APIs assumed from memory will be wrong. Record the resolved versions in the README.

If a major version has a known incompatibility with another dependency, pin the lower version and write a comment naming the conflict. Do not silently downgrade.

---

## 4. Non-negotiable engineering rules

### 4.1 Money

- `Decimal(23,7)` in Postgres. Stellar's precision is exactly 7 decimal places.
- `decimal.js` or string arithmetic in application code. **Never JavaScript `Number` for an amount.** `0.1 + 0.2 !== 0.3` is a bug that ships to production and loses funds.
- Amounts cross API boundaries as strings, not numbers. JSON numbers lose precision.
- Never round a user-facing amount for display without rounding *down*.

### 4.2 The chain is authoritative

The database is a cache. It is never the authority on whether money moved.

- `/api/claims/prepare` re-verifies against Horizon that the balance exists and the predicate holds. A stale `ACTIVE` row is not authorisation.
- Reconciliation resolves every disagreement in the chain's favour and logs the drift.
- Never mark a link `CLAIMED` from a client assertion. Only from a confirmed ledger entry.

### 4.3 Idempotency

Every mutating endpoint that touches chain state requires an `Idempotency-Key` header, stored with the response. Replaying a key returns the stored response without re-executing.

Submitting the same signed XDR twice must not create two claims. Network retries and double-clicks will happen.

### 4.4 Errors

- RFC 9457 `application/problem+json`.
- Never return a stack trace, SQL fragment, or internal ID to a client.
- Log the full error server-side with a correlation ID; return the ID to the client so support can trace it.
- Failures around money are logged at `ERROR` with enough context to reconstruct what happened — minus any secret.

### 4.5 Logging

Structured JSON via `pino`. Redact by allowlist, not denylist — log named fields explicitly rather than dumping objects.

**Never log:** anything from `window.location.hash`, request bodies on claim routes, `SPONSOR_SECRET_KEY`, session tokens, API keys, OTP codes, email link URLs.

---

## 5. Security requirements

### 5.1 Auth

- argon2id with sensible memory and time costs. Never bcrypt, never SHA-anything.
- Sessions are opaque random tokens stored hashed (SHA-256) in Postgres. Not JWTs — JWTs cannot be revoked, and this application needs revocation.
- Cookie: `__Host-kleym_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. With explicitly configured Lantern origins, Chromium embedded sender sessions use `SameSite=None; Partitioned` plus exact-origin mutation checks. See `docs/lantern-integration.md`.
- Rotate the session ID on login and on password change.
- Rate limit login to 5 attempts per 15 minutes per IP, with per-account lockout after 10.
- Identical error text and comparable response time for unknown username and wrong password.
- Password change invalidates all other sessions.
- Federated sign-in (#46): OIDC per organisation; identities link on the IdP's stable subject only, never on an email; "SSO only" is enforced at `/api/auth/login`; SCIM deactivation ends the membership and revokes every live session in one request. The session issued after the IdP handshake is Kleym's own — no IdP token is stored or logged. `docs/sso.md`.
- Second factor (#47): TOTP (RFC 6238) and passkeys (WebAuthn), recovery codes single-use and argon2id-hashed. A session whose user has a factor unlocks nothing until the factor is presented; an organisation policy (`OFF` / `APPROVERS` / `ALL`) holds a member without one at enrolment, enforced on every request. Step-up: batch signing, reclaim and API key issuance require a factor verified in the last five minutes, whatever the session's age. The TOTP key is encrypted at rest under `CREDENTIAL_ENCRYPTION_KEY` (in `SECRET_ENV_KEYS`); TOTP guesses are counted before the comparison, five then a fifteen-minute lockout — the recipient OTP's semantics. `docs/mfa.md`.

### 5.2 The claim page is a hardened surface

`/claim` handles bearer secrets. Treat it as the most sensitive route in the system.

- Zero third-party network requests. No analytics, no tag manager, no font CDN, no Sentry browser SDK.
- Self-hosted fonts via `next/font/local`.
- `Referrer-Policy: no-referrer` on this route specifically.
- `history.replaceState` after reading the fragment.
- Strict CSP with no `unsafe-inline` and no `unsafe-eval`.

Verify by loading the page with devtools open and confirming the network tab shows only same-origin requests.

### 5.3 Headers

Set globally in `middleware.ts`: `Content-Security-Policy` (nonce-based), `Strict-Transport-Security` with preload, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` (overridden to `no-referrer` on `/claim`), and a restrictive `Permissions-Policy`. Explicit Lantern integration permits only designated sender/public routes to be framed by exact configured wallet origins; those pages omit X-Frame-Options. Administration stays unframeable. See `docs/lantern-integration.md`.

### 5.4 Input handling

- Zod at every boundary, rejecting unknown keys.
- Validate every Stellar address with `StrKey.isValidEd25519PublicKey` before use.
- **Reject anything that parses as a secret seed**, on every endpoint, and log it as a security event.
- Prisma parameterises queries; if you reach for `$queryRaw`, justify it in a comment.
- Enforce ownership on every campaign query — `where: { id, userId }`, never `where: { id }` followed by a check.

### 5.5 Secrets

`SPONSOR_SECRET_KEY` lives in Railway's secret store. Never in the database, never in git, never in a client bundle, never in a log line, never in an error message.

Any environment variable containing a secret must not be prefixed `NEXT_PUBLIC_`. Add a startup assertion that no `NEXT_PUBLIC_*` variable contains a value matching a secret-key pattern.

### 5.6 Rate limits

| Endpoint | Limit |
|---|---|
| `/api/auth/login` | 5 / 15 min / IP |
| `/api/claims/resolve` | 20 / min / IP |
| `/api/claims/prepare/materialise` | 20 / min / IP |
| `/api/claims/prepare/claim` | 10 / min / IP |
| `/api/claims/submit` | 10 / min / IP |
| `/api/claims/otp/verify` | 5 attempts per OTP, then invalidate |
| `/api/auth/sso/start` | 30 / 15 min / IP |
| `/api/scim/v2/*` | 120 / min / token |
| `/api/auth/mfa/verify`, `/api/auth/mfa/passkey/authenticate` | 20 / 15 min / IP, plus the factor's own 5-then-lock counter |
| `/api/v1/*` (reads) | 100 / min / key |
| `POST /api/v1/*` (writes, #51) | 30 / min / key, counted separately — a runaway integration cannot spend a key's read budget creating campaigns |

`/api/claims/resolve` returns an identical response shape for unknown, expired, and claimed links. Differential responses let an attacker enumerate valid links.

`prepare` is two endpoints because steps 2 and 5 of `SPEC.md` §3.3.3 are different operations (see §3.3.3 for the full reasoning). `materialise` gets the looser limit: §3.3 requires a ledger boundary before TX2, so clients legitimately re-poll it.

---

## 6. Working practice

### 6.1 Vertical slices

Build one narrow path end-to-end before widening. The claim flow — resolve, prepare, sign, submit, confirm — working for a single link on testnet is worth more than a complete UI over an unproven protocol layer.

Follow the build order in SPEC §11. Each step ends in something checkable. Do not proceed past a failing step.

### 6.2 Verify by execution

"It compiles" and "it ran without error" are not "it is correct."

- Run the code on real testnet inputs and check the output values.
- For anything touching money, verify balances before and after against an independent path (Horizon directly, or the Stellar Expert explorer).
- For UI, open the actual page. Verifying the component source is not verifying the page.
- After any schema change, run the migration against a copy of real data, not just an empty database.

### 6.3 When something surprises you

Stop and find the wrong belief before continuing. "Weird, but it works" around a payment system is deferred debugging at a terrible exchange rate.

If the same approach fails twice, the approach is wrong — zoom out rather than trying a third variation.

### 6.4 When to ask

Ask when the fork is a genuine product decision, when an action is irreversible, or when something you discovered changes the agreed scope. Decide yourself when the choice is cheap to reverse — but state the assumption in your summary.

Specifically: **stop and ask** if the §2 testnet spike fails, if a dependency conflict forces a materially different library, or if any requirement here appears to conflict with the non-custodial guarantee. Never resolve such a conflict by weakening §1.

### 6.5 Never ship a known defect silently

If something is fragile, unverified, or working around a limitation, say so in the delivery summary. Distinguish "verified by execution" from "believed correct but unchecked."

### 6.6 Kleym release destination

The owner approved `develop-ade` for Kleym releases; the senior's `develop` branch is separate. For authorized releases, merge only after current checks pass, then update and verify the senior-owned Railway project `57849f8f-8c9f-4565-8b88-6faf9ce085dd`, Testnet environment `72ccf46d-3e64-4bcb-bde8-9d4af62157ff`. The app is `https://kleym-testnet.up.railway.app`. Use explicit project/environment/service selectors and the source-only release exporter; check the target identity before any mutation. Do not deploy to the retired personal project or upload ignored runtime files. Keep database volumes, credentials, Mainnet disablement and pending Lantern qualification intact. Record the Git commit, deployed source identity, web readiness and worker proof. See `docs/railway.md` for service IDs and source-connection status.

The marketing website is a separate static service built from `landing/Dockerfile` and the shared marketing view. Give it only public landing settings, never app/sponsor/database/session credentials. Activate the app's `MARKETING_SITE_URL` only after that website is verified; an empty marker preserves the compatibility homepage. The senior developer owns DNS/domain attachment. Keep old exported claim addresses available during domain migration and review passkey/SSO origin changes. See `docs/website-app-architecture.md` for rollout and rollback.

---

## 7. Testing

### 7.1 Required coverage

| Area | Tests |
|---|---|
| Claim transaction | All four permutations on testnet (§2) |
| Batching | 200 links → exactly 3 batches; boundary at 90 and 91 |
| Balance ID extraction | Against a known transaction result XDR |
| Predicates | Recipient cannot claim after expiry; sender cannot claim before |
| Reserve recovery | Sponsor net change is fee-only across a full claim |
| Money precision | Decimal arithmetic never produces a float artefact |
| Auth | Rate limiting, lockout, session rotation, timing consistency |
| Seed rejection | Posting a valid seed to `/links` returns 400 |
| Idempotency | Replayed key returns stored response without re-execution |
| Reconciliation | Introduced drift is detected and reported |
| CSV gate | Continue is unreachable until download fires |
| Claim states | Every state in SPEC §5.1 renders |

### 7.2 Integration test environment

Testnet only. Never write a test that submits to the public network. Fund test accounts via Friendbot. Assert on Horizon responses, not on local state.

### 7.3 CI

Typecheck, lint, unit tests, `pnpm audit`, the §1 grep guard, and a Prisma schema check that no field name suggests secret storage. Integration tests run on a schedule rather than per-commit, since they depend on testnet availability.

---

## 8. Project layout

```
kleym/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── scripts/
│   └── spike-claim.ts          # §2, run this first
├── src/
│   ├── app/
│   │   ├── (public)/           # /, /login, /claim
│   │   ├── (sender)/           # /dashboard, /campaigns, /settings
│   │   ├── (admin)/            # /admin/*
│   │   └── api/
│   ├── components/
│   ├── lib/
│   │   ├── stellar/            # tx builders, horizon client, sponsorship
│   │   ├── auth/
│   │   ├── db/
│   │   ├── queue/
│   │   └── validation/         # Zod schemas
│   └── workers/
├── docker-compose.yml
├── .env.example
├── SPEC.md
├── BRAND.md
└── AGENT.md
```

Keep every transaction builder in `lib/stellar/`. It should be possible to read the entire on-chain surface of the application in one directory.

---

## 9. Definition of done

Do not report the build complete until every acceptance criterion in SPEC §10 passes, and state for each whether it was verified by execution or believed correct but unchecked.

The four that matter most, because failing them means the product is broken in a way that costs users money:

1. All four claim permutations succeed on testnet.
2. Sponsor reserves are fully recovered after each claim.
3. No secret appears in any database column, log line, or server request in a full end-to-end run.
4. The CSV gate cannot be bypassed.
