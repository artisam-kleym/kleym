# Zender email verification — implementation verification

25 October 2026. Source access; local implementation on `codex/security-136-landing`, based on commit `a7db0ae`. Changes are uncommitted and not deployed/pushed. No new Zender application, API credential or sender account was created. No live mail or assets were sent in this task.

## Result

Implemented creator-assigned email CSV import, ordered prize review/export, atomic email binding during link registration, and OTP-only Zender transport. Existing private link exports and wallet transports remain in place. Legacy bearer-link email ingress remains disabled. The email policy is unavailable until an existing approved Zender application credential is configured. See [configuration and boundaries](../../../zender-email-verification.md).

The guide was read in full and compared with both projects' source. Zender dashboard login cookies cannot authenticate its public API; an existing team application key is still required. The earlier separate Zender campaign delivery test does not count as live verification of this new Kleym adapter.

## Gates

| Check | Actual result |
|---|---|
| Frozen dependency installation | pnpm 10.6.4; committed lockfile; no dependency changes |
| Prisma generation | Client 7.10.0 generated; schema change is documentation only; no migration |
| Unit/regression suite | **904 passed, 0 failed**, 84 files; Vitest 4.1.12, two workers, 48.69 seconds |
| TypeScript | Passed standalone and inside the final production build |
| ESLint | Passed |
| Production build | Passed, Next.js 16.4.3 / Node 24.22.1 |
| Whitespace | `git diff --check` passed |

The suite covers email/prize alignment, malformed CSV, secrets-export rejection, public-only registration, immutable email replays, missing configuration, suppressed/malformed Zender responses, HTTP error paths, ambiguous network outcomes, OTP expiry/replay, concurrent correct verification, concurrent incorrect guesses, scoped tokens, suspended/redacted links, request rate/lock behavior, and template restrictions.

An initial run using reused dependencies found a version mismatch in an existing dependency-security test. A fresh frozen-lockfile installation resolved it. A later run concurrent with the production build timed out in two existing SDK CSV filesystem tests at their unchanged five-second limit. The final complete run without the build load passed all 904 tests. No timeouts or assertions were weakened.

## Browser simulation

Nine executed UI cases passed; one live-delivery case is blocked and three cases were not run. See [cases.csv](cases.csv), [cases.json](cases.json), and [summary.json](summary.json).

The harness bundled current production React components, including the actual CampaignWizard, CSV parser and ClaimScreen. Navigation and account/reserve lookups were isolated fixtures. Styles came from the existing local production stylesheet; screenshots document the tested component states, not a deployed authenticated session. Synthetic OTP callbacks exercised UI behavior only; server OTP logic was checked separately in unit tests. Neither signatures nor key generation were invoked in the browser.

The creator imported three ordered email rows: 20, 15 and default 5 USDC, total 40. Invalid input was refused. Phone-width review retained the assignments and showed Links 3. At 390px viewport width, creator document width measured 375px and OTP document width 390px; neither overflowed horizontally. Incomplete input stayed disabled, request buttons were disabled while busy, and wrong/valid synthetic codes produced the expected screen transitions.

Evidence:

- [Desktop creator](evidences/creator-desktop.png)
- [Phone-width creator](evidences/creator-mobile.png)
- [Phone-width review](evidences/review-mobile.png)
- [Wrong-code screen](evidences/otp-mobile.png)
- [Implementation hashes](evidences/implementation-sha256.json)

Screenshots use synthetic recipient addresses. Some were captured before final explanatory-copy changes; their tested layout and ordering behavior is unchanged.

## Remaining qualification

1. Team operator supplies an existing Zender application key (`emails:send`) and approved `EMAIL_FROM`, selects `EMAIL_PROVIDER=zender`, and confirms transactional open/click tracking is disabled. No dedicated Kleym application is required.
2. Verify `/me` with that credential and send one OTP to an owned inbox. Check actual delivery, suppression/error handling and sender configuration.
3. Run real PostgreSQL/Redis registration and OTP concurrency qualification. The current database doubles are not proof of deployment/database behavior.
4. Finish a complete Testnet claim after OTP on desktop and a real Android phone. This viewport simulation does not prove wallet app approvals or deep links.

No Mainnet readiness claim is made. No Railway settings were changed. Reusable email-recipient templates and OTP invitation/reminder delivery are intentionally unsupported in this first implementation; fresh campaign CSVs keep recipient bindings in the existing redactable records. Wallet-bound policy remains the option for an on-chain recipient restriction; email OTP is an application gate.
