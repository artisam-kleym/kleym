# Freighter release readiness and OTP email design

26 October 2026, Asia/Manila. Freighter desktop extension and Android mobile app are the current wallet targets. Lantern is deferred; its future integration code is retained. No Mainnet deployment, asset movement or DNS/provider-account change was made by this verification.

## Changes

- Rebuilt the OTP email as a Kleym claim ticket using the homepage navy, mint, butter yellow and pink palette. An HTML-table gift illustration needs no external asset. The selectable six-digit code stays contiguous; the subject no longer contains it. Copy explains single use, expiry measured from request, the original claim tab and recovery-word privacy. Plain-text content remains available.
- Used only Zender-supported HTML and inline styles. The preview passes through the checked-out Zender sanitizer and its locked sanitize-html 2.18.0 dependency. No remote font/image, script, form, SVG, tracking link or media query is required. Browser render proof is not a substitute for every mail client.
- Fixed readiness cutting Horizon off at three seconds while its identity request allows five. The outer Horizon guard is six seconds; PostgreSQL/Redis remain bounded at three. Completed probe timers are cleared. Transaction identity checks and their five-second timeout are unchanged.
- Hid unusable reminder controls when no unclaimed recipient has an emailed invitation. The PATCH API refuses nonempty reminder schedules for OTP-only EMAIL campaigns without historical invitations. Historical invitation reminders and schedule clearing remain supported.
- Clarified provider comments: Kleym adds no tracking assets, but Zender/provider tracking defaults still need operator confirmation.

## Verification

| Check | Result |
|---|---|
| Full regression suite | **936 passed / 88 files / 0 failed**, Vitest 4.1.12, two workers, 48.56 seconds |
| TypeScript and ESLint | Passed |
| Production build | Passed, Next.js 16.4.3 / Node 24.22.1 |
| Production dependency audit | **0 vulnerabilities**, all severity categories |
| Readiness regression | Before patch: a valid 3.5-second Horizon response was incorrectly unavailable; after patch: accepted; identity mismatch and stuck database still refused |
| Sanitized email preview | Desktop 800px and mobile 320px; at 320px document width 320px and contiguous code width about 158px; no horizontal overflow |
| Desktop EMAIL claim | User-reported inbox/wallet flow plus independent public ledger/signature proof |
| Public network identity | Read only: correct passphrase, official USDC issuer exists; zero writes |
| Physical Android | Completed by user with Freighter v1.26.29; funding, exact one-USDC claim and cleanup independently verified below |

The preview uses synthetic `000000`, not a recipient OTP. See [desktop](evidences/otp-email-desktop.png), [mobile](evidences/otp-email-mobile.png), and [sanitized HTML](evidences/otp-email-preview.html). The sanitizer harness is isolated under ignored runtime tooling; no application dependency or root lockfile was changed.

## Completed desktop campaign proof

Campaign `cmvo10tax00010dp1cq013vhx`, displayed as Testing Email Verification. Funding hash `93b49ac1a7f4142dbece45ef81b44a201dec4c4c2ec767c88ae62225aa80d776`, ledger 5384239, sponsor fee 300 stroops. Claim hash `b7315cbab094c6a81c70e69ecfc959ef008acb31ff7d4bb5067c6230ebd06743`, ledger 5384271, sponsor fee 400 stroops. Exactly **1.0000000** official Testnet USDC reached `GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW`.

Funding owner/sponsor and claim ephemeral/sponsor signatures verified over the Testnet transaction hashes. The created balance matches the claimed balance; the temporary account and claimable balance now return 404. The recipient currently has zero native XLM. This normal no-memo claim merges to the recipient, as the builder specifies; sponsored reserves return to their sponsor independently. An initial QA-script assumption that every merge destination must be the sponsor was corrected after source inspection; no product change was made for that assumption.

See [independent proof](evidences/independent-ledger-proof.json). These public facts prove movement and cleanup; the ledger cannot prove OTP entry or the physical device. The user reported successful email verification and claiming, and confirmed the OTP reached Gmail Inbox after marking the first plain test Not spam.

## Delivery and operational qualification

The sender domain currently publishes SPF for Purelymail and DMARC quarantine with relaxed alignment. This alone does not diagnose Postmark authentication: SPF uses the envelope/Return-Path, and aligned DKIM may satisfy DMARC. No DNS changes were made. Source: [Postmark SPF guidance](https://postmarkapp.com/support/article/how-do-i-set-up-spf-for-postmark), [custom Return-Path](https://postmarkapp.com/support/article/910-how-do-i-add-a-custom-return-path).

Before live distribution the Zender/provider operator must confirm aligned sender authentication and disabled open/click tracking on the transactional path. The public API does not expose per-message tracking controls. Request only SPF/DKIM/DMARC results or a provider-setting confirmation; keep complete private headers and provider credentials out of reports. Inbox success after a mailbox-specific Not spam action does not qualify fresh-mailbox deliverability or guarantee universal placement.

Mainnet remains unavailable pending its separate approved deployment/address, production sponsor/treasury capital and incident ownership, backup/restore proof and an explicitly authorized real-asset qualification. No global application-level campaign USDC cap was added. Existing wallet-capacity, asset precision and sponsorship checks remain. See [Mainnet preparation](../../../mainnet-pilot.md).

## Android test prepared

Freighter Android v1.26.29 receiver: `GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I`. At the public pre-check it held **5.0000000 Testnet USDC**, **0.0000000 XLM**, with its account/trustline sponsored (three sponsored units). A one-USDC claim should leave six USDC and zero XLM, absent other account activity. The sender GBV6…OQQY5A is also available on Android per user confirmation. The recipient's inbox address is intentionally omitted from repository evidence.

Full phone creation, private export, funding, OTP entry and recipient claim require the user to operate their wallet and mailbox. Do not request a full claim URL, recovery words, private CSV or OTP in chat. Public campaign IDs and transaction hashes are sufficient for subsequent ledger checks. Avoid another deployment while the user is generating/exporting/signing.

## Completed Android campaign and shared-network follow-up

The user completed campaign creation, export, funding, OTP entry and claim in Android Chrome with Freighter v1.26.29 on the PR #140 deployment (develop merge `623e2bc`). The campaign was named **Android Email Verification**, ID `cmvo2qrnb00010drq5rlzigzh`. Funding `7f1c153944237acda3ee7e78f1cf0e192b3eef530b194107974824671ecca692` succeeded in ledger 5384818; claim `c1a9ecc0e747bc1a7dd3a8149adafec03b8445b209519ba44e8519b1dfcd1b4b` succeeded in ledger 5384842. Independent signature and operation checks prove exactly one official Testnet USDC reached the intended receiver. Its public balance is **6 USDC and 0 XLM**; the temporary account and claimed balance are removed. See [Android ledger proof](evidences/android-ledger-proof.json). Device and OTP interactions are user-reported; ledger facts are independently measured.

PR #140 passed all four GitHub checks and the develop push checks. Railway web, worker and landing auto-deployed that exact merge successfully. Hosted health/readiness returned 200; claim response retained no-referrer, nosniff and CSP protections. The [configuration snapshot](evidences/configuration.json) contains booleans only. External OTLP telemetry remains unconfigured. [Provider observations](evidences/tracking-observation.json) show no recorded open/click events among four scoped messages, which does not prove tracking is disabled.

A follow-up reproduced a shared-Wi-Fi defect: a fourth independent recipient exhausted the three-request IP budget, while several recipients sharing an IP also exhausted each other's verification attempts. Separate aggregate IP budgets now allow 300 requests and 600 verification calls per 15 minutes. Per-link/per-mailbox sends remain three, per-link verification calls remain ten, and each challenge still permits only five wrong guesses. Provider quotas still apply; this is not a throughput guarantee. Four regression cases cover shared recipients and unchanged individual boundaries.

Follow-up local verification: **940 tests passed in 89 files**, zero failed (67.80 seconds); TypeScript and ESLint passed. The physical Android proof predates this narrow rate-budget patch; no second funded transaction was requested for it.
