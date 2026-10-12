# Kleym mobile header, settings and signing fixes

Checked October 9, 2026, Asia/Manila. Local changes only. Source: D:/kleym/.worktrees/app-sending-pilot, branch codex/mobile-header-signing-fixes. Railway remains stopped and GitHub remains signed out. These changes have not been pushed, merged or deployed.

## Changes and causes

| Reported scenario | Evidence and change | Qualification |
| --- | --- | --- |
| Bottom navigation crowds the phone UI | Mobile navigation moved into a sticky top header with a collapsible six-link menu and organisation switcher. Escape closes it; navigation resets it. Main content no longer reserves bottom-bar space. | Rendered component checks and screenshots at phone/tablet/desktop widths |
| Settings password fields are tiny | Measured max-w-md computed max-width was 16px due to the project's custom spacing token; Current password was only 34px wide at a 320px viewport. Replaced affected named max widths with explicit rem widths. Settings rows stack, missing mt-2xl spacing becomes the defined mt-xl, controls use 16px phone text and at least 44px input height, and wide tables scroll inside their container. | Production render passes at 320, 360, 393, 768 and 1440px; password network failure allows retry |
| Freighter opens through the guarded Review tab and warns about leaving | Sender pairing/signing previously assigned window.location.href on the document with unsaved keys. App opening now uses a separate browsing context; a visible manual link covers blocked automatic opens. Signing/reclaim reuse a validated existing phone session rather than always requesting another connection. Original Review keys and its guard remain in memory. | Unit tests and an armed-guard production browser fixture pass; actual Android sender approval still needs retesting |
| Expired unused links do not refund themselves | Ledger expiry enables the sender's claimant predicate; it does not transfer funds. Owner approval remains required. Open campaign UI now observes the deadline without reload; outstanding data refreshes on the transition. Expiry scheduler is updated from hourly to every minute using its existing scheduler ID. Copy distinguishes due refunds from confirmed refunds. | Deadline-crossing browser proof and scheduler regression pass. No owner key storage or automatic refund introduced |

## Verification

- QA checkout D:/kleym/.worktrees/ci-issue-qualification with release dependencies: **775 tests pass in 69 files**.
- Lint and TypeScript pass. Optimized Next.js production build passes, with temporary local fixture route included. Existing middleware deprecation remains.
- Development and production Chromium runs each pass **35 checks**. Widths: 320/360/393/768/1440px. No browser page errors in either completed run.
- Browser scenarios: Settings control dimensions/font/page width, six usable header links and Escape, consistent AppShell widths across representative fixture pages, password retry after network failure, Reclaim appearing at deadline without reload, expiry/Review layout with three links, and original guarded Review surviving a stubbed wallet launch.
- Fixture pages use real UI components but mocked account/reserve lookups. Dashboard/campaigns/templates/approvals/history content is representative fixture content, not authenticated production data. Pairing/app launch is stubbed; no actual wallet signature or payment is requested. Disposable browser keys never leave browser memory; no generated phrase, CSV or private claim URL is saved in this package.
- Regression files: e2e/mobile-settings.spec.ts, updated e2e/csv-gate.spec.ts, tests/lib/wallet/phone.test.ts, tests/lib/wallet/sender-mobile.test.ts and tests/lib/queue/expiry-schedule.test.ts. The authenticated Postgres-backed Playwright suite and hosted CI were not run this turn while infrastructure/account access remains paused.
- The source checkout's initial unit run was 774 pass / 1 fail: dependency-globs resolved the older shared fast-glob installation instead of the repository's patched tinyglobby replacement. The prepared QA checkout with release dependencies passed all 775. No dependency manifest changes were made for these UI fixes. Use the pinned package manager and isolated release installation before future source gates.
- git diff --check passes.

## Evidence files

- production/browser-results.json: completed production fixture checks, mode and scope.
- production/evidences/settings-android.png: fixed fields and Settings spacing.
- production/evidences/header-menu-android.png: top navigation.
- production/evidences/review-android.png: Review totals and link count before private key generation.
- production/evidences/refund-ready-android.png: expired-link owner approval requirement.
- browser-results.json and evidences/: earlier completed development fixture run, preserved separately.

## Remaining gates / resume order

1. Reauthenticate only the GitHub account the user authorizes. Review local diff, run authenticated CI, then push/merge/deploy when authorized. Do not automatically restore Adealix's access or start Railway.
2. Retest physical Android Chrome + Freighter v1.26.29 creator flow: private CSV saving, connection, Sign batch, original-tab return, rejection, retry, background/resume and reclaim. Test both successful automatic launch and the manual fallback; confirm the new browsing context is accepted by Android Chrome.
3. Resume retained Railway services when requested, deploy this build, check readiness and the worker's minute scheduler. A one-minute sweep is best effort while online, not an exact settlement deadline. Worker downtime prevents due notifications; ledger expiry continues independently.
4. Complete the deferred owner-approved reclaim for campaign cmuzrnf7200020dnzr49itmq6 and verify its public transaction and accounting. The current unused 1 USDC remains unreclaimed; this turn moved no assets.
5. Mainnet remains disabled. Lantern hardware integration, missing-trustline phone signatures, vesting, rehearsal and the remaining issue acceptance work stay open. These local UI tests do not establish Mainnet readiness.
