# Kleym checkpoint — 10 October 2026

## Resume here

Comprehensive automated QA and the report package are complete. Read `D:/kleym/docs/reviews/2026-10-09/comprehensive-qa-v1/README.md` and its release-gap tracker before proceeding.

Final aggregate: 2,621 PASS, zero final FAIL, two N/A, six NOT RUN, three BLOCKED. 788 units/71 files; 32 real PostgreSQL/Redis suites/1,307 assertions; 54 Chromium and 105 Firefox/WebKit passes; 181 broad browser checks; 121 API methods/96 files; 44 restore checks; seven real disposable Testnet scenarios/22 successful transactions; 10,000-link load checks. Aggregate deduplicates anonymous-API overlap and counts assertions, not exhaustive user journeys. One existing lint warning and one low audit advisory remain.

Three product defects fixed and retested: safe retry for temporary claim-resolution outages, campaign input hydration loss, and WebKit mobile-menu Escape. SDK Windows private-export ACL creation hardened and verified, Linux 0600/exclusive-create verified, audit subprocess launch and current template fixtures corrected. Existing mobile header/Settings/signing/expiry work preserved.

Canonical source `D:/kleym/.worktrees/app-sending-pilot`; branch `codex/mobile-header-signing-fixes`; base `2ec20e1d30bf4cd5d00a316110399a1cd3f61e54`. Changes remain uncommitted. QA checkout `D:/kleym/.worktrees/ci-issue-qualification`; 392-file runtime export digest `04077ca233b66c77ed4f27f4277a173602dcd4903d35568edca386dd61e19f80`; build `Jv1wuGDwPhWsUniEUur7s`. Final normalized source comparison and 148 verification inputs agree. Historical verification hashes have checkout line-ending differences; final normalized hashes saved. QA-only stale SDK README synchronized without executable changes.

## Current external state

Railway October 10 read-only evidence reports zero active deployments for all four services; public login/ready/status unreachable. Cause unknown. Do not infer a user shutdown, deleted volumes, or successful current hosting from older entries. Original retained volumes were not deleted. No service restart/deploy/shutdown performed in this QA. October 9 v7 hosted checks are historical. New fixes not deployed.

GitHub remains intentionally signed out. Do not reconnect automatically or claim issue closure/PR/merge. Mainnet stays disabled. Docker Desktop remains unavailable; no Docker data reset was performed.

Prior owner-approved campaign `cmuzrnf7200020dnzr49itmq6` is settled: two claimed, one reclaimed. Reclaim hash `1f4e4ba8886bba22c35e638cc2a127b1f6a93b8a40de75afadfa911191635d4b`; sender was 9 USDC / native 0 at that ledger. Do not resubmit. Current live balance was not re-certified in this QA.

## Evidence and cleanup

PDF, Excel, README at report root; screenshots/logs/initial failures/retests/generator/machine results under `evidences/`. All case links verified, workbook counts reopened, all four PDF pages inspected. Public-text/PDF/workbook secret-pattern/checksum scan clean. Private raw execution files stay in ignored `D:/kleym/.runtime/comprehensive-qa-2026-10-09`; never publish private fixtures, login files, envs, TLS keys, database dumps or wallet recovery material.

Disposable PostgreSQL/Redis WSL RAM environment from October 9 no longer exists; final October 10 Linux CSV RAM mount is also absent at cleanup inspection. No broad WSL shutdown or Docker deletion was needed. Lantern browser harness stopped its own temporary production server.

## Next acceptance

1. Investigate Railway's current zero-deployment state and restore/deploy only to the approved Testnet environment; verify retained data, worker and readiness.
2. Run physical Android creator login/export/funding/reclaim plus desktop/mobile official-USDC recipient matrix, including cancellation, backgrounding, timeouts, missing trustline and fresh recipient. Browser emulation cannot prove app approvals.
3. Senior developer rebuilds Lantern with a curated Kleym entry and trusted origins; run actual in-app acceptance. Mock bridge/header proof is complete but not integrated-wallet certification.
4. Finish vesting #76 and per-organisation rehearsal #83; operational backup/rollback/provider/treasury drills and Mainnet deployment/capital/incident ownership remain unqualified. Keep Mainnet disabled.
