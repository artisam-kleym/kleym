# Kleym email verification — live integration qualification

25 October 2026, Asia/Manila. Continues the earlier local implementation and API Quickstart records, which remain historical. Work is on `codex/security-136-landing`; source is uncommitted. The fetched `develop` merge commit `3858fe2` has the same starting tree as local base `a7db0ae`, so no newer source change was overwritten.

## Implemented and checked

- Creator email-assignment CSV import, aligned prizes/private export and immutable email binding during public-key registration.
- OTP-only backend mail through the existing Kleym Zender application, approved test sender and server-side credentials. No claim URL or Stellar seed is emailed.
- Up to three transient send attempts within fifteen seconds, preserving the exact body and event identity. Permanent 4xx/409 failures stop. Retry-After and jittered backoff are respected; a long delay ends the synchronous attempt instead of retrying early. Process-restart replay is deliberately not supported for transient OTP content; a new explicit request replaces the challenge.
- Identifier-only durable delivery polling, terminal-failure handling, retained failed status jobs and operator queue/metrics visibility. Polling respects Retry-After and never resends email. Engagement alone without a delivery timestamp is not called delivered.
- Native-fetch Quickstart replay already proved HTTP 202 plus Idempotent-Replay true and the original message ID, without an extra message. See the separate Quickstart report.

## Verification

Final regression suite: **920 tests passed / 85 files / 0 failed**, Vitest 4.1.12, two workers, 47.66 seconds. TypeScript, ESLint (full and follow-up changed-file checks), production build and whitespace checks passed. Runtime: Node 24.22.1 / Next.js 16.4.3. No dependency upgrade was required.

The live integration harness ran inside the team Railway Testnet worker. It created and migrated a separate disposable PostgreSQL database and used a unique prefix in Redis DB 15. Synthetic ACTIVE rows existed only in that isolated database; no live campaign rows or ledger balances were created or changed. Its actual source functions and actual PostgreSQL/Redis checks passed:

1. Concurrent registration, exactly two email bindings, immutable assignment and identical replay.
2. Expired and replaced codes refused.
3. Eight concurrent wrong guesses bounded at five, with the spent hash removed.
4. Two concurrent correct verifications produced exactly one authorization token; replay and cross-link use were refused.
5. Actual Kleym adapter sent one OTP to the explicitly authorized QA inbox, zenderdev@artisam.xyz; identical retry returned the same provider ID.
6. Zender reported **delivered**, message `cmvny6v25001s0tmpfh6b6lpv`.
7. The actual OTP verification route refused a wrong code, accepted the correct code, and refused replay. Codes and tokens stayed in memory and are absent from reports.
8. The deployed worker completed the queued status check. The disposable database and scoped Redis test keys were cleaned up. **Zero asset transactions.**

The core integration run used the initial release. The final release adds the independently tested polling Retry-After and engagement-evidence refinement; final deployed hashes/status are recorded separately after postflight. This distinction avoids presenting an earlier runtime as the final artifact.

Hosted desktop (1440px) and phone-width (390px) creator checks imported three synthetic email rows with amounts 3, 2 and default 1 USDC in order. Review showed three links, total six, one signature and three XLM reserve. A malformed replacement CSV blocked Continue; a valid replacement restored it. At 390px the document width was 375px, with no horizontal overflow. No browser key generation or funding was invoked and no campaign was created by this UI check. These are responsive browser checks, not physical Android wallet tests.

Public endpoint checks passed: malformed request 400, injected destination 400, unknown-link request generic 200, unknown-link verification 409; health and readiness returned 200. Evidence is in `evidences/`.

## Guide disposition

| Section | Applied behavior |
|---|---|
| 02 Credentials | Existing Kleym application; send/read key in Railway web/worker secrets; approved test sender |
| 03 Quickstart | One accepted and provider-confirmed delivered API mail; same-event replay proved |
| 04 Node.js | Native fetch, time budget, secret-free diagnostics and stable event identity |
| 05 Sending options | Inline immediate OTP chosen; optional saved templates, batch and scheduled mail are not needed |
| 06 Tracking/retries | Bounded identical retries, polling, suppression refusal, failed/stuck-job operator signal |
| 07–08 Webhooks | Polling selected instead; no webhook endpoint/scopes/secret or unsigned receiver exists |
| 09 Launch checks | Automated backend and responsive UI proof completed; human inbox/wallet qualification and provider tracking confirmation remain |

## Material remaining qualification

The earlier team-inbox OTP's client display/spam placement was not inspected. The live code was verified using its in-memory issued value, not by reading the inbox. The user's subsequent plain delivery check arrived in Gmail Spam, as recorded below. A funded desktop/physical Android email-gated claim still needs the user's wallet approval and mailbox interaction; no Mainnet readiness is inferred. The user agreed to perform a funded Testnet check after final rollout.

Zender's API has no documented per-message open/click tracking switch. The operator still needs to confirm provider tracking is disabled; an absent open event does not prove that. Kleym's EMAIL policy is an application gate, not an additional Stellar signer restriction. Keep private links private; wallet-bound claims are the on-chain address restriction.

Initial source digest `191a7eea0a97a46dfdae0c8fa9baf804dccaa631f901cc1d6647a2b10aa572e6`; final source digest `6618c9b7a7a8e433bcf9194c1b81335a8d69f828c1b914e8156ae092549a0b5f`, 416 allowlisted files and no local secrets copied. Only the senior developer's project `57849f8f-8c9f-4565-8b88-6faf9ce085dd`, Testnet environment `72ccf46d-3e64-4bcb-bde8-9d4af62157ff`, is targeted. No landing, database-service or Redis-service deployment was changed. No Mainnet service was activated.

## Final rollout and owned-inbox handoff

Final worker `18aaa089-b305-4bab-8d7d-f6b0c3d7bda2` and web `0fd44f55-cba9-4c97-b9b1-1f03bb3eda88` both reached SUCCESS. Final public health and readiness checks returned HTTP 200. Both remote runtimes are Node 24.22.1. Each runtime's 152 client JS/map files were scanned in place against its actual API credential: no match. Eight critical deployed web source files matched their local SHA-256 values. The final worker completed a new identifier-only monitor job for the earlier delivered message; no additional email was needed for that check. See `evidences/release.json`, `worker.json` and `web.json`.

One earlier postflight HTTP probe returned a non-200 response before its status was saved. Bounded logs from this web deployment contain one Horizon timeout with PostgreSQL and Redis healthy. Immediate repeat health/readiness checks, and the subsequent recorded pair, returned 200. This is a recovered dependency timeout observation, not proof of uninterrupted availability.

Temporary Railway SSH access was revoked and all four newly created local key files were removed. The remote postflight script removed itself. The original Docker engine was unavailable; attempted startup did not provide a running engine, and the official stop command confirmed Docker Desktop was not running. Real database proof therefore used the isolated Railway database described above.

The user clarified that they cannot access the team QA inbox, then explicitly supplied and authorized a personal Gmail recipient for subsequent testing. Its address is omitted from repository evidence. A separate plain delivery check (no OTP or private claim URL) was accepted and provider-confirmed delivered at **23:07:52 Asia/Manila**, message `cmvnypakg001y0tmpzk3ovrz4`; sanitized status is in `evidences/owned-inbox-delivery.json`. The user then confirmed **Yes, in Spam**. Arrival is confirmed by the recipient; Inbox placement is a failed qualification observation. The cause is not established by provider status alone, and actual OTP placement still needs testing. No automatic DNS/provider change was made on this evidence.

The replacement recipient-only fixture is saved privately at `D:/Adealix/Downloads/kleym-email-test-owned-inbox-2026-10-25.csv`: one row, one test USDC, the user's authorized inbox. The earlier team-inbox CSV is historical and must not be used for the real test. The user has been asked to create a fresh Testnet EMAIL campaign with that replacement CSV and stop at Review before generating keys or signing. No recovery words, secrets export or full claim URL are requested in chat. Funded desktop/physical Android qualification remains open until wallet approval, mailbox verification and public ledger evidence exist.

The temporary Kleym and Zender browser sessions were logged out; the unfunded synthetic review tab was closed, and responsive viewport overrides were reset. No private browser keys were generated in these checks.
