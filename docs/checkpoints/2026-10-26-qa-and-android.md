# Kleym checkpoint — 26 October 2026

## Resume tomorrow

Read `qa/plans/kleym-comprehensive-v2-2026-10-26/EXECUTION-SUMMARY.md` and `docs/android-qa.md` first. The plan has **373 detailed cases**, 24 page routes, 121 API methods, 296 static control declarations and 17 claim states. The PDF, Excel, summary and sanitized supporting files are saved together; the catalog remains Not Run where a complete case has not been executed. Do not replace those statuses with the unit-test count.

Current application release: PR #142, merged into `develop` at `733d5e14faa3b03742f3942208d790ece1486dc3`. All four CI jobs passed. The browser job required a fresh runner after an Ubuntu font-mirror download stalled; its test requirements were unchanged. Application sources match tested commit `b842fe3`; the later commits added QA files.

Two fixes are included: creator reminder controls are hidden when local-link delivery cannot use them, and passkey copy explains its application-level boundary instead of promising protection for a leaked private key. No wallet signature or transaction-builder behavior changed.

## Verified evidence

- **943 tests / 90 files**, zero failed; TypeScript, ESLint and production build passed. Fresh production dependency audit: zero findings.
- **34 scoped hosted/responsive/emulator observations** passed. Seven additional route/error observations and the three-link Review screenshot are retained separately. These are not 373 completed user journeys.
- Fresh standalone Testnet protocol run: **7/7 checks, 22 successful transactions**, using fresh Friendbot accounts, disposable Node signers and a custom issuer. Four recipient/asset permutations, excess-signature refusal, both predicate directions, exact credits, account cleanup and reserve recovery passed. This is not official Circle USDC or Freighter acceptance.
- Prior desktop and physical Android EMAIL claim proof remains separately identified under `docs/reviews/2026-10-26/freighter-readiness`. Do not repeat funding or claim of those settled links for screenshots.

## Saved Android Studio device

The AVD is registered as **kleym-qa-api36**, display name **Kleym QA Pixel 6 API 36.1**. Android 16 / API 36.1, Google Play x86_64, 1080 × 2400 / 420 dpi, 3 GiB RAM and two CPU cores. Hardware acceleration was verified and the device booted successfully.

Persistent device files are at `D:/Android-AVDs/kleym-qa-api36.avd`; Android Studio's registration is in the operator's `.android/avd/kleym-qa-api36.ini`. The SDK's `emulator -list-avds` lists both Kleym QA and the unchanged Lantern device. No user-data wipe, emulator deletion or unrelated Studio project change was performed. Do not commit or copy the user-data disk: it may contain private Google/wallet credentials.

Tomorrow open **Android Studio → Tools → Device Manager → Kleym QA Pixel 6 API 36.1 → Play**. From Studio's welcome screen use **More Actions → Virtual Device Manager**. The repository also provides `scripts/start-android-qa.ps1` and a targeted `scripts/stop-android-qa.ps1`. The stop helper now verifies the exact AVD name and can stop the virtual device even while its Android debugging trust prompt is pending. It cannot target a physical-device serial.

The emulator was gracefully stopped for this checkpoint; the persistent disk and registration remain. Native Chrome login/dashboard, campaign phone-wallet button/manual sender-address fallback, header navigation, Settings layout and logout were observed. The image includes Chrome 134.0.6998.135, which needs an official Play update before current-browser qualification.

The user agreed to install official Freighter through Play Store. Installation/version and wallet setup are **not yet verified**; the last Android connection was awaiting local debugging authorization. Do not inspect the emulator during private Google sign-in. Use a fresh Testnet wallet and have the owner retain recovery material privately. Routine emulator browser checks need no physical phone or USB cable.

## Hosting

Use only the senior-owned Railway project `57849f8f-8c9f-4565-8b88-6faf9ce085dd`, Testnet environment `72ccf46d-3e64-4bcb-bde8-9d4af62157ff`.

- App: `https://kleym-testnet.up.railway.app`
- Homepage: `https://kleym-home-testnet.up.railway.app`
- PR #142 web deployment: `f31e4938-f35a-4508-9f26-03892db357a8`
- Worker: `8e884414-1b46-48c3-b305-883140173d08`
- Homepage: `96f17d5d-6219-490d-9d19-00cb4757f831`

All three subsequently reached SUCCESS after a delayed image publication. Earlier evidence that says BUILDING is a historical observation, not the latest state. Preserve both. Further documentation/checkpoint merges may automatically create newer deployments; distinguish those from a changed application binary and verify their exact commit rather than assuming an older healthy replica is current. No Railway shutdown is included in this request.

The final authenticated hosted retest verified both fixes: no unavailable creator reminder checkboxes, private-sharing guidance present, and the old false passkey promise absent. Public proof is under `qa/plans/kleym-comprehensive-v2-2026-10-26/evidences/runs/release-733d5e1`. The temporary operator session was logged out afterward; no link keys were generated and no campaign was funded by this check.

## Remaining work

1. Finish/verify official Freighter installation and browser update in the saved emulator; obtain only its version and public Testnet address. Complete fresh wallet flows without collecting phrases, keys, private exports or OTPs in chat.
2. Execute the outstanding v2 financial, role/state, failure/recovery and compatibility cases with case-specific evidence. Real OEM lifecycle/biometrics may still need a physical-device release check.
3. Complete sponsorship-capacity, operated restore/alert/incident ownership and other open release gates. EMAIL/CODE/passkey application checks do not replace assigned-wallet on-chain authorization.
4. Keep Mainnet disabled until its separately approved deployment/domain, keys/queues, capital/ownership, provider authentication/tracking, restore/alerts and explicit real-asset qualification are complete. No arbitrary global campaign-USDC cap is authorized.

See `docs/reviews/2026-10-26/issue-closure-review.md` for issue-by-issue disposition. The remaining open issues must not be closed just to reduce their count. Lantern integration remains deferred pending its approved curated build.
