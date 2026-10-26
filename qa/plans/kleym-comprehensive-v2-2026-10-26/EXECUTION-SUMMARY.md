# Kleym QA execution summary — 26 October 2026

The new plan is ready; **complete application/Mainnet sign-off is not yet granted**. The preflight combined current CI evidence, new source regressions, hosted page checks and a newly configured Android Studio emulator. Those UI checks generated no recovery phrase, sent no email and moved no assets. A subsequent standalone protocol run used fresh Friendbot-funded Testnet accounts and a disposable custom issuer; its results are separated below.

## Build and proof boundaries

- Hosted browser/emulator observations: `4b5f29920383d3730f81cd4c9633a581b4ae29ae` on the team's Testnet deployment.
- Source fixes and new plan candidate: `b842fe3` (full SHA in `evidences/case-specs.json`). No transaction builder, wallet-signature rule or Mainnet enablement changed.
- Existing desktop/physical Android EMAIL claim proof remains in `docs/reviews/2026-10-26/freighter-readiness`, tied to its original build. It is not copied as a new emulator or full-plan pass.

## Actually checked

| Check | Result | Scope |
|---|---|---|
| Latest baseline develop CI | All four jobs succeeded | Real PostgreSQL/Redis lifecycle, permissions, concurrency, reclaim, SSO/MFA, backup, SDK/webhooks, Chromium export gate and build/audit; exact job steps in `evidences/develop-ci.json` |
| Patched source regression suite | **943 passed / 90 files / 0 failed** | Vitest, two workers, 58.44 seconds |
| New regression checks | Two prepatch failures; **three postpatch passes** | Missing reminder eligibility, honest passkey boundary, qualified legacy reminder compatibility |
| TypeScript, ESLint, production build | Passed | Node 24.22.1 / Next.js 16.4.3 |
| Fresh production audit | **0 vulnerabilities** | Registry audit snapshot; not an independent security audit |
| Fresh standalone Testnet protocol matrix | **7/7 passed; 22 successful transactions** | New/existing recipient × XLM/custom token; exact credits, account cleanup, reserve recovery, excess-signature refusal and both expiry predicates. Disposable Node signers/custom issuer, not official Circle USDC or Freighter acceptance. Public evidence in `evidences/runs/release-733d5e1/protocol-matrix.json` |
| Hosted scoped smoke | **34 named observations passed** | Thirteen authenticated routes at desktop and 360px, plus menu, input, manual balance lookup and native emulator observations; not all controls or full case steps |
| Android Studio emulator | Android 16 / API 36.1 booted; Chrome 134.0.6998.135 | Login, dashboard, campaign screen, phone-wallet button/manual address fallback, header-to-Settings navigation, password-field layout and logout observed |
| Plan artifact validation | 373 unique cases, 24 pages, 121 API methods, 296 static controls, 17 claim states | All catalog rows initially Not Run; workbook reopened; every case ID found in PDF; all 122 PDF pages rendered with no text outside margins |

The authenticated routes checked were Dashboard, Campaigns, Templates, Approvals, History, Settings, second-factor settings and all six admin pages. Each loaded with a heading, no application-error screen and no page-wide horizontal overflow at the measured sizes. At 360px, password fields measured 287 × 49 CSS pixels. Invalid funding account/negative amount kept Continue disabled; the manual public-address lookup showed 16 test USDC and zero XLM. Review displayed three links, total three USDC, three XLM reserve and the expected fee bid before any keys were generated.

## Defects fixed during this review

1. **KLM-QA-20261026-01 — P2 usability:** new local-link campaigns exposed email-reminder choices despite having no invitation-delivery path. Creator reminder controls now require the qualified legacy Testnet mode; new local/OTP campaigns explain private sharing and deadlines. Existing historical reminder behavior is preserved.
2. **KLM-QA-20261026-02 — P1 misleading security copy:** the passkey option claimed later link copies were useless. It now states that passkey verification is a Kleym application check, not an added Stellar signature, and recommends assigned-wallet claims for an on-chain wallet lock.

The initial failure and corrected behavior are covered by `tests/lib/campaign/recipient-controls.test.ts`. PR #142 merged into `develop` as `733d5e14faa3b03742f3942208d790ece1486dc3`, with all four checks passed. An Ubuntu font-mirror stall was cancelled and the browser job passed on a fresh runner with unchanged test requirements. Hosted retest/deployment results belong in the release follow-up evidence, rather than being inferred from source tests. The tested application sources match the merge; later differences are QA documentation and evidence.

At an earlier 26 October deployment observation, the new web image was still publishing and its status was BUILDING. The existing app returned health/readiness 200, but still displayed the old controls. At that point the fixes were **merged and source-tested, not yet verified live**. The landing update had succeeded and the worker update was still deploying. No deployment region was changed and no success was inferred from the older healthy replica.

**Later checkpoint verification:** all three PR #142 deployments reached SUCCESS at the exact merge commit. An authenticated hosted retest then confirmed zero unavailable reminder checkboxes, the new private-sharing guidance, and removal of the false passkey promise. See `evidences/runs/release-733d5e1/hosted-controls.json` and its screenshot. The earlier pending-publication observation is preserved as history; these two fixes are now verified live. This does not qualify the remaining full release matrix or enable Mainnet.

## Remaining qualification

- The 373-case catalog is an execution plan, not 373 completed tests. Full conditional controls, every role/state combination, all invalid field matrices and the fresh full wallet lifecycle matrix still need case-by-case evidence. The 34 narrow observations and 943 unit assertions must not be added together as equivalent user journeys.
- Official Freighter installation in the emulator requires private Play Store authentication; the operator has agreed to install it. No official v1.26.29 APK asset was available at the inspected GitHub release; no mirror or unreviewed developer preview was installed. The image's Chrome 134 is a compatibility observation, not qualification of the current supported Chrome release. Update through Google Play. The emulator was logged out, reopened for private installation and gracefully stopped again when the user deferred work until tomorrow. Its persistent disk and Android Studio registration were verified; installation/version remain unverified.
- Physical OEM app return/backgrounding, secure hardware/biometrics, current production Freighter signing and fresh fund/claim/reclaim combinations are not replaced by viewport emulation. No physical USB phone is needed for routine emulator browser checks.
- Mainnet stays disabled. Separate approved domain/deployment/keys/queues, sponsor and treasury capital/ownership, real alert delivery, populated restore/rollback proof, sender authentication/provider tracking confirmation and explicit real-asset qualification remain release gates. No arbitrary global campaign-USDC cap is introduced.
- Lantern remains deferred pending its approved curated build. Optional SSO, SCIM, compliance/conversion and operational providers require their configured isolated fixtures and the appropriate sign-off; a generic page load does not prove those external systems.

See `docs/android-qa.md` for Android Studio start/stop instructions. All supporting JSON, screenshots, generators and layout renders are under `evidences/`. Private credentials, codes, keys, recipient CSVs and full claim URLs are excluded.
