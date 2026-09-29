# Kleym development resume — issue #96

Date: 2026-09-29. Checkout: `D:/kleym/.worktrees/96-usdc-network`, branch `codex/96-usdc-network`, base commit `290d5894994f323e83103b29f8dec0a94a3ef12e`. The initial checkpoint's 33 file hashes all matched before editing. Changes remain local and uncommitted.

## Changes and reproduced scenario

The initial authenticated production-browser run passed 22/23 checks. A funding account with native XLM and an impostor USDC issuer, but no official test USDC, displayed official USDC as unavailable while enabling Continue. The first-step gate now requires the exact selected code/issuer in the fresh account response. Explicit XLM still advances; official USDC remains the default. The browser regression passes on the rebuilt candidate.

The database claim harness initially stopped after 28 passing checks because its identity-only fixture returned a non-Horizon error for an account-existence lookup. The fixture now optionally returns a standard missing-account response for the claim harness. A unit test verifies the Stellar SDK recognises it as a 404. Account reads remain opt-in; transaction submission is always refused by this fixture. Production claim/network logic was unchanged by that correction.

Added `docs/freighter-testnet-proof.md` in the checkout with official setup links, an unactivated-recipient requirement, existing-code reuse and the required wallet/ledger observations. The user confirmed Freighter needs setup. No production sponsorship envelope was selected.

## Actual verification

Docker Desktop was started. A fresh isolated PostgreSQL 17 database `kleym_verify_96` and Redis 7 were bound only to `127.0.0.1:55496` and `127.0.0.1:6396`. All 27 existing migrations applied. Existing databases, volumes and application services were not reused.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Unit suite, one worker | 425 tests passed in 33 files | `unit.log` |
| TypeScript | Exit 0 | Recorded command result; production build also performs final TypeScript validation |
| ESLint, including e2e | Exit 0 | Recorded command result |
| Production build | Turbopack exit 0 after the gate fix | `production-build-result.json`, `production-build.log` |
| Authenticated production Chromium | 23/23 passed, including official/missing/impostor USDC, explicit XLM, CSV/recovery gates, claim hydration/CSP and secret-boundary checks | `browser/playwright.log`, `browser/result.json` |
| Batch persistence | 36 checks passed | `integration-batches.log` |
| Claim persistence | 30 checks passed after fixture correction | `integration-claims.log` |
| Sponsor persistence | 31 checks passed | `integration-sponsors.log` |
| Reclaim persistence | 57 checks passed | `integration-reclaim.log` |
| WRITE API/SDK | 54 checks passed; one POSIX-mode assertion failed on Windows | `integration-write-api.log`, `integration-results.json` |
| Unchanged SDK CSV writer on Linux | Mode 0600 under umask 000; five rows; overwrite refused; prior content preserved | `csv-posix-result.json`, `verify-csv-posix.mjs` |
| Diff whitespace | Passed | `git diff --check` |

The Windows WRITE API harness **does not have a passing exit code**: Windows `stat` reports mode 0666. The separate Linux check executes the actual unchanged SDK writer in a network-disabled Node 24 container on its own Linux filesystem, using inert strings. It establishes the writer's POSIX mode and overwrite behaviour; it does not turn the full Windows harness green or establish Windows ACL guarantees. Its other 54 checks passed, including the SDK's local-signing/funding flow against the local Horizon stand-in.

The shared dependency junction still requires a verification-only Turbopack filesystem-root override. The wrapper restored `next.config.ts` byte-for-byte after both attempts. The first resumed build caught an overly narrow inferred type in the new adversarial browser fixture; an explicit fixture type corrected it before the successful build. That initial build log and initial failing browser/claim results are preserved. Webpack was not rerun; middleware deprecation remains a separate future task.

Browser credentials were generated per run and held only in process memory. Session files created for verification were removed afterwards. Traces and automatic failure snapshots were disabled/removed to avoid retaining bearer material. Retained screenshots show only the first asset-selection step, before key/recovery generation. They establish that step's desktop/390px rendering and absence of horizontal page overflow; they do not prove all responsive states.

## Remaining gate

Issue #96 remains open for review. #97 needs user-controlled Freighter installation/setup and actual testnet signatures/ledger evidence before #98–#100 choose and implement sender sponsorship. Mock Horizon, unit tests and production-browser fixtures do not establish exact monetary settlement, sender no-XLM sponsorship, ledger-boundary cleanup or wallet compatibility. No testnet/public transfer, deployment, push or merge was performed.

The latest source manifest/portable patch, issue update readbacks and matching plan MD/PDF are saved alongside this report. Historical development-start evidence and the paused checkpoint remain preserved. The broader October 7 public-pilot release gates remain outstanding.
