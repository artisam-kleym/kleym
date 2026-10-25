# Email verification through Zender

## User flow

The creator selects **Anyone with the link AND email verification** in Recipients & expiry. Download the recipient CSV template, fill **Email Address**, and optionally label/amount/reference/category/note. Leave public_key, secret, claim_url and claim_code blank. Insert the CSV; populated rows determine link count and prize order. Duplicate emails are allowed for separate prizes. Review the email and amount for every row, save the private secrets export, and fund normally.

The creator privately shares each recipient's own claim URL. Kleym does not email these URLs. The recipient opens their link, requests an OTP, checks their assigned inbox (including spam), enters six digits, then continues through the existing wallet flow. Neither recipient nor creator needs to sign into Zender. Lantern and Freighter transports are unchanged.

This is an application-level claim gate, not an additional Stellar signing condition. A holder of the private link key may construct transactions outside Kleym. Keep links private; use wallet-bound claims when on-chain recipient restriction is required. Email verification proves mailbox access, not identity or wallet ownership.

## Configuration using the existing team service

No new Zender application or mail-provider account is created by this integration. Use a credential from an existing team application approved for Kleym's use. Zender still requires an application-scoped API key; a dashboard login cannot replace it.

Set these on Kleym's web and worker services in the team's Railway project:

```dotenv
EMAIL_PROVIDER=zender
ZENDER_BASE_URL=https://zender-web-production.up.railway.app/api/v1
ZENDER_API_KEY=<existing-team-application-key>
EMAIL_FROM=<approved-sender-address>
LEGACY_BEARER_EMAIL_ENABLED=false
```

The key needs `emails:send` and `emails:read`: the latter powers background delivery-status checks. Do not use a Postmark token, login password, browser cookie, or NEXT_PUBLIC variable. No webhook setup is required: delivery is reconciled through polling, so no webhook scopes or signing credential are needed. The creator option remains disabled and the campaign API refuses new email policies until the Zender provider/key are configured. Removing the credential never downgrades existing email claims to open claims. RESEND_API_KEY is not required for the Zender transport; existing Resend deployments retain their previous provider selection by default.

Before enabling live traffic, the Zender operator must verify the approved sender and disable open/click tracking for these transactional messages. The current API does not offer a per-message tracking switch; Kleym cannot force provider tracking settings through the documented payload. A TEST-labelled Zender key may send real mail.

## Storage and safety

- Registration sends public keys, assigned emails and prize metadata only. No recovery phrase, seed or claim URL goes to Kleym or Zender.
- Email assignment and public link registration commit in the same serializable transaction. Replaying identical terms is allowed; changed/redacted email assignments are refused.
- Existing Delivery records hold the assigned email with `sentAt=null`; that field is not used to falsely claim an invitation was sent. Existing erasure and retention processes redact the binding. Redacted links stay gated.
- Six-digit codes use the CSPRNG, expire after ten minutes, and are stored in Kleym only as Argon2 hashes. An OTP necessarily exists in the mail payload at Zender/provider and recipient inbox; their retention controls must be handled by the operator. Do not log it.
- Verification atomically bounds attempts and consumes the challenge once. Authorization tokens are hashed in Redis, scoped to one link, and expire after thirty minutes.
- Requests are rate limited by IP, link and hashed mailbox; concurrent requests for the same binding are serialized. Settled, expired or suspended links do not trigger OTP mail. The public request response does not reveal recipient addresses or mail-provider failures.
- Zender uses HTTPS server-side fetch with redirects refused and a fifteen-second overall send budget. Transient failures receive at most three attempts with jittered backoff and the exact original body and event identity. Permanent 4xx/409 failures are not retried. Retry-After is honored; if the requested wait exceeds the remaining budget, the helper stops instead of sending early. Provider response bodies and raw network errors are never logged. An explicit recipient request issues a replacement challenge. Codes from earlier requests become invalid.
- HTTP acceptance is **queued**, not delivery. The adapter rejects suppressed/empty/malformed accepted responses. Logs record only binding ID, message ID and sanitized status. After an OTP is accepted, a durable `email-status` job polls its provider ID, without storing the email address, OTP, claim URL or authorization token. Queued/sending/sent remain unconfirmed. Delivery and terminal failures are logged separately; polling never resends mail. Six checks with exponential backoff exhaust after about sixteen minutes. Exhausted or terminal failures produce an operator error and retain the identifier-only failed job for up to seven days (bounded to 1,000); successful jobs are retained up to one day (bounded to 1,000). The queue appears in operator status/metrics. A monitor-enqueue failure is logged as an operator error without calling the email send again.
- Legacy bearer email ingress remains disabled. No schema migration is needed: the existing retained/redactable binding is reused.

## Boundaries and rollout proof

Reusable email recipient templates are intentionally refused in this implementation: use a fresh CSV per campaign so recipient emails are not duplicated into long-lived template/run snapshots outside Delivery retention. Existing non-email templates continue to work. OTP registration sends no automatic invitations or reminder mail. Receipts, when explicitly selected, can use Zender with their own stable event keys. Historical reminder eligibility is unchanged.

Before deployment, run typecheck, lint and unit tests. Before declaring the feature live, configure the existing credential, inspect GET /me, send one OTP to an owned inbox, verify status in Zender, test wrong/expired/replaced codes, and finish a Testnet claim on desktop and Android. Do not claim live delivery or Mainnet readiness from mocked transport tests alone.

Rollback: restore the previous code/provider configuration. Keep EMAIL campaign bindings and the OTP gate; never silently convert them to OPEN. Outstanding recipients may need the original Zender configuration restored to finish verification. No database downgrade or deletion is needed.

Reference: Zender Email Integration Guide, API v1, 24 October 2026, pages 2–9. Deployed contracts may change; recheck them before altering payloads.

## Guide coverage

Sections 02–04 cover server configuration, credential checks, one owned-inbox send and backend transport. Section 05's saved templates, batch emails and scheduling are optional alternatives; OTPs use one inline immediate email. Section 06 is implemented through bounded same-event retries and status polling. Sections 07–08's signed webhook receiver are an alternative to polling and are not installed or advertised. No unused webhook permissions are requested. Section 09 still requires live OTP campaign/claim qualification and provider tracking verification; raw API delivery alone does not complete those gates. OTP payloads deliberately remain transient in the web process, rather than being persisted as plaintext retry jobs. If the process dies during a send, request a fresh challenge; the old code is replaced, and no automatic process-restart resend occurs.
