# Zender API Quickstart — live delivery proof

25 October 2026, Asia/Manila. Followed page 3, section 03 / QUICKSTART of the supplied Zender Email Integration Guide (24 October 2026 edition). User explicitly requested the first email; the destination was the previously authorized team QA inbox, zenderdev@artisam.xyz.

## Result

- Used the existing Kleym application credential read privately from the team Railway Testnet web service. No API credential was printed or persisted in evidence.
- Sent exactly one inline HTML/text message with subject `Kleym — first Zender API email — 25 October 2026`, metadata, tags and business-event idempotency key `kleym-zender-quickstart-20261025-001`.
- Omitted `from`, as in the PDF example, to exercise Zender's configured default sender. Status lookup confirmed `zenderdev@artisam.xyz`, matching Kleym's configured EMAIL_FROM.
- POST /api/v1/emails: **HTTP 202**, one queued message, zero suppressed recipients.
- Message ID: `cmvnxg7ai001m0tmpeq997fzr`.
- GET /api/v1/emails/{id}: **HTTP 200**, status **delivered**, no error code; queued, sent and delivered events present.
- Provider-reported delivery: **2026-10-25 22:32:48 Asia/Manila** (14:32:48 UTC).

HTTP 202 alone was not treated as delivery. The status and event endpoint supplied the delivery evidence. Actual inbox placement, spam classification and client rendering were not inspected.

## Scope and retained evidence

This proves the application's credential, documented API request and provider delivery path for one authorized inbox. It does not prove Kleym's deployed OTP flow, which still requires deployment and end-to-end qualification. No campaign, private claim URL, recovery phrase, real OTP or asset transfer was involved. No code was deployed or Railway configuration changed in this Quickstart task.

Local ignored evidence is retained at `.runtime/zender-quickstart-20261025-001/`: synthetic request, attempt marker, accepted receipt and sanitized delivery status. The script records an attempt before sending and refuses a repeat execution; reconcile any uncertain result before retrying with the same business-event identity and body. Prior implementation and Zender QA reports remain historical and unchanged.

## Section 04 — Node.js backend verification

At 22:36 Asia/Manila, verified the guide's next section using Node **24.22.1** native fetch, server-read credential, a 15-second timeout and redirects refused. Replayed the saved Quickstart request with its original body and idempotency key. Zender returned **HTTP 202**, **Idempotent-Replay: true**, the exact original message ID `cmvnxg7ai001m0tmpeq997fzr`, and zero suppressed recipients. This confirms reuse of the existing message rather than creation of a second message. Sanitized evidence: `.runtime/zender-quickstart-20261025-001/node-replay-result.json`.

Kleym's existing `src/lib/email/zender.ts` already implements the backend helper for inline transactional messages with explicit sender, event identity, bounded request time, suppressed/malformed acceptance refusal and secret-free HTTP errors. Its focused transport suite passed **10 tests / 1 file**, Vitest 4.1.12, 8.97 seconds. Tests cover success, stable event identity, configuration/secret refusal, suppressed responses, HTTP 401/403/409/422/429/503 and an ambiguous network outcome without automatic resend.

The native-fetch live replay exercises the guide's documented request, not a deployed Kleym OTP request. The helper intentionally does not automatically retry; request-ID/Retry-After diagnostics, durable general-purpose retry/outbox processing and optional webhook handling have not been qualified by this step. They belong to the later tracking/retries and webhook sections. No product source change or deployment was needed to verify section 04; the complete OTP campaign/claim lifecycle remains pending.
