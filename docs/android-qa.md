# Android Studio QA device

Prepared 26 October 2026 for the Kleym Testnet regression plan v2. This is a separate Android Studio AVD; no physical phone, USB cable or existing Lantern wallet data is required for routine Android-browser checks.

## Installed configuration

- AVD: `kleym-qa-api36`, display name **Kleym QA Pixel 6 API 36.1**.
- Android 16 / API 36.1, Google Play x86_64 image revision 4 already installed in the local SDK.
- Pixel 6 screen: 1080 × 2400, density 420; 3 GiB RAM, two CPU cores. WHPX hardware acceleration is available.
- Device data: `D:/Android-AVDs/kleym-qa-api36.avd`; registration: the operator's `.android/avd/kleym-qa-api36.ini`. D: was selected because C: had insufficient space for a new data partition. Both drives have limited free space; avoid cloning extra images or retaining unlimited snapshots.
- Android Studio: installed under `D:/Android Studio`, build `261.26222.65.2613.16025427`.
- Chrome bundled with the system image: **134.0.6998.135**. This is a recorded compatibility target, not a current-browser qualification. Update through official Google Play before treating it as the supported release baseline.

The initial emulator display scale was invalid (`-1`), placing the phone outside the capture area. The dedicated AVD's `emulator-user.ini` was corrected to a positive scale and an on-screen position. Existing Lantern AVD files were not changed.

## Start and stop

In Android Studio, open **Tools → Device Manager**, find **Kleym QA Pixel 6 API 36.1**, and click Play. From the welcome screen, use **More Actions → Virtual Device Manager**. This uses the same AVD registration.

Alternatively run `scripts/start-android-qa.ps1` from this repository. It opens only the named existing AVD and disables RAM snapshots. Run `scripts/stop-android-qa.ps1` to stop only that named emulator. It does not stop physical phones, the Lantern emulator, Android Studio, or Railway. Device data remains available for future sessions; sign out and keep only disposable Testnet wallets there.

Open Chrome inside Android, then use the team's [Kleym Testnet login](https://kleym-testnet.up.railway.app/login). Login, dashboard and browser navigation can be tested without a Google account. Approve the local emulator debugging prompt when Android asks; do not enable debugging on a real phone for these browser checks.

## Freighter installation and evidence boundary

Use the [official Freighter Google Play listing](https://play.google.com/store/apps/details?id=org.stellar.freighterwallet), published by Stellar Development Foundation. A Google account sign-in in Play Store may require the operator to complete authentication privately. Do not use a third-party APK mirror or import a real-money recovery phrase. The official GitHub v1.26.29 release inspected during setup had no public APK asset; an unreviewed developer preview is not equivalent to the production app.

Use only fresh disposable Testnet wallets. Browser viewport emulation, Android Studio emulator execution, and physical-device execution must be labelled separately. Real OEM background restrictions, secure hardware/biometrics, Play Integrity and exact production wallet app handoffs may still need physical-device release checks. This setup removes the physical-phone requirement for routine mobile UI work; it does not turn unexecuted wallet approvals into passes.

Reference: [Android emulator command-line documentation](https://developer.android.com/studio/run/emulator-commandline). See the versioned package under `qa/plans/kleym-comprehensive-v2-2026-10-26` for scenarios, execution statuses and evidence.
