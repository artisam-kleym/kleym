# Individual prize amounts — October 8, 2026

Implemented in `D:/kleym/.worktrees/app-sending-pilot`, branch `codex/app-sending-pilot`, with existing development changes preserved. The existing per-link registration, claim, reclaim and transaction builder are reused; there is no schema migration or new payout service.

## How to use

1. In **Asset & amount**, set **Amount per link** to the default prize, for example **5 USDC**.
2. In **Recipients & expiry**, set the link count. Names/labels are optional and align by row number.
3. Under **Prize amounts**, select **Set individual amounts**. Enter **20**, **15** and **10** for links 1–3. Leave other fields empty to use **5 USDC** each. For five people the live total is **55 USDC**; for ten people it is **80 USDC**.
4. Check **Prize breakdown** and the total on **Review & create**, then use the existing phrase, export and reviewed signing steps. The export records each override and each link receives its corresponding amount. A blank amount in the export inherits the campaign's fixed default.

Clearing one field restores its default. **Use default for everyone** clears all overrides. Ten people are shown per page, with stable link numbering. Reducing the link count discards overrides for removed links. Invalid amounts block Continue and identify the affected person.

Plain names preserve manual prize amounts. A CSV `amount` column explicitly replaces the overrides, including blank cells that restore defaults. Editing an imported amount in the row editor updates the public CSV too, so later name edits cannot restore a stale amount. Returning from review retains the names and amounts; the existing key/export invalidation on Back is retained.

## Verification

- Full Vitest suite: **667 tests / 55 files passed**, `unit-tests.log`.
- Six new focused tests: example totals, restoring defaults, row alignment/bounds, invalid edits, public CSV snapshots and exact amounts through key generation/export/public registration into SDK-built sponsored funding operations. The signed fixture verifies, and a changed expected prize is refused. No chain submission occurs: `prize-tests.log`.
- TypeScript: `typecheck-qualified.log`; focused ESLint: `lint-final.log`; production webpack build: `build-final.log`.
- Five Chromium checks exercised the actual `CampaignWizard` and child components on desktop **1280 × 1000** and phone **393 × 851**. Verified overrides/defaults, names, invalid-input blocking, read-only review/back, reset, pagination, count reduction, explicit CSV imports and synchronization. No horizontal overflow, page exceptions or mutation requests: `browser-verification.json`, `browser-final.log`.
- The browser harness bundles the real components with production CSS/local fonts, fixture reserve/account reads and router/wallet stubs. It does not qualify authentication, a real device/wallet, deployed API/database behaviour or live USDC transfers. Unit tests independently verify the exact transaction amounts with the actual Stellar SDK.
- Editor screenshots were inspected: `desktop-prize-editor.png`, `phone-prize-editor.png`; full wizard screenshots are retained alongside them.

Historical logs retain an initial TypeScript run that overlapped Next's generated-type rewrite and an initial browser check that exposed unwanted editor collapse after clearing overrides. TypeScript was rerun after the build. The editor now remains open while interacting; final checks pass.

## Existing limits

The existing renewal gate currently supports equal-amount campaigns. Mixed-prize campaigns can reclaim unused amounts after expiry, but automatic renewal of those campaigns remains refused by `src/lib/api/renewal.ts`. This feature preserves that budget guard. It does not qualify Mainnet release; the operational and deployed-wallet gates in `docs/mainnet-pilot.md` remain open.

Railway remains paused. Nothing was deployed, no wallet was connected or asked to approve a live transaction, and no assets moved. Source changes remain local and uncommitted. See `verification.json` for exact source hashes.
