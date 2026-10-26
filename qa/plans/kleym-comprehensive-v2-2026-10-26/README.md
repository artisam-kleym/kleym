# Kleym comprehensive QA v2 — 26 October 2026

This package supersedes the October 8 plan without overwriting it. It contains **373 detailed planned cases**, covering **24 page routes, 121 API methods in 96 handlers, 296 static UI control declarations and all 17 declared claim states**. It includes positive, invalid-input, boundary, permission, retry, interruption, recovery, compatibility and Mainnet release scenarios.

- `kleym-comprehensive-test-plan-v2.pdf`: detailed plan and setup, 122 pages.
- `kleym-comprehensive-test-cases-v2.xlsx`: editable Test Cases, Execution, Pages, API Matrix, Controls, Environment, Defects and Existing Proof sheets.
- `TEST-PLAN-v2.md`: readable case source.
- `EXECUTION-SUMMARY.md`: what was actually checked, defects found/fixed and remaining gates.
- `evidences/`: specifications, generators, source inventory, CI metadata, sanitized browser observations, screenshots and PDF layout proof. Do not put screenshots or scripts alongside the two primary artifacts.

Every catalog case starts **Not Run**. Narrow executed checks and prior CI/device evidence are recorded separately, with the exact build and scope; they do not silently qualify every step of a larger case. Source inventory is traceability, not proof that every conditional button works. A complete app/Mainnet sign-off is withheld while mandatory wallet, platform or operational cases remain unexecuted.

The new Android Studio device is reusable without a physical USB phone. See [Android setup](../../../docs/android-qa.md) from the repository root (`docs/android-qa.md`). Official Freighter installation through Play Store needs a private Google sign-in; no third-party APK is used. The old Lantern AVD is untouched.

Regenerate using `evidences/scripts/inventory.mjs`, `build_plan.py` and `render_pdf.py` with the repository Node runtime, bundled Python artifact libraries and installed PyMuPDF. The workbook preserves formulas; Excel recalculates Summary on open. No formula evaluator refreshed cached values during generation. Reopened row counts, IDs, statuses and validations are checked. All PDF pages are rendered and checked for text outside margins; representative pages/contact sheets are visually inspected.

No Mainnet transaction, recovery-phrase export, provider/DNS change or test email is authorized merely by opening or executing this plan. Keep all secrets and personal recipient lists outside QA artifacts.
