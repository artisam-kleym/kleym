# Campaign expiry controls and Testnet resume

Date: October 6, 2026, Manila. Active source: `codex/app-sending-pilot`, base `4163d79` with prior local work preserved. GitHub Issues remain deferred under the user's instruction.

## Product changes

The recipients step offers 1 hour, 24 hours, 7 days, 30 days and Custom. Ordinary new campaigns retain the 30-day default. Presets are elapsed durations measured when selected, rounded up to minute precision and stored as an absolute local deadline. Re-rendering, moving to review and returning do not extend it. Template and prepared renewal terms retain their supplied deadlines; the existing parent fieldset still disables immutable prepared terms.

Custom shows separate labelled date/time inputs that support keyboard entry and native pickers. Both recipients and review steps show the actual deadline, local timezone and UTC instant. Invalid, incomplete, impossible and past deadlines cannot advance. Dates skipped by a timezone's daylight saving transition are rejected. Generation/signing recheck the deadline against the current clock; API future-expiry validation remains authoritative. No funding, claim, reclaim, amount, key derivation, signature, network or immutable ledger predicate rule changed.

The component reuses existing Button/Input components, brand tokens, semantic fieldsets, pressed-state buttons, accessible labels/live status and responsive layouts. No new dependency, database migration or worker change.

## Verification

- Eight expiry unit checks passed, including Manila/New York/UTC conversion, all preset durations, minute rounding, invalid/past dates and daylight saving behavior. A regression check first reproduced a repeated-clock-hour error: the initial preset lost an hour when reparsed without an offset. Presets now retain the selected instant's UTC offset; changing the device timezone also preserves that instant. Custom edits remain local clock input. The repeated-hour check then passed.
- Targeted ESLint and TypeScript passed. Windows production webpack and exact-candidate Linux webpack builds passed. Existing Next middleware/Edge and BullMQ optional dependency warnings remain.
- Two local production browser checks passed in full Chromium: quick selection, fixed deadline after review/back, custom typing, incomplete/past refusal, matching review, 390px layout with no horizontal overflow. Desktop/mobile screenshots were inspected. Hosted login and both UI checks passed. A third hosted regression check freezes the browser clock across New York's repeated daylight saving hour, verifies the exact1-hour UTC deadline and preserves it when switching to Custom and review. Tests use synthetic public account balances and stop before generating keys or creating campaigns.
- Initial headless-shell runs encountered intermittent local sign-in/navigation failures before expiry controls, including pending login and aborted navigation. A separate browser login returned200, retained a Secure session and reached the dashboard. The existing suite then passed using that private session and installed full Chromium. The precise cause of the earlier shell failures is not established; no production auth/CSP rule was weakened.
- No agent ledger write or campaign funding occurred. `current-ledger.json` records official Testnet identity, sender11USDC, recipients4/3USDC, all zeroXLM, and the exact expired unused1USDC balance still present.

## Retained data and release

Direct redeploy of removed Railway runs was unavailable (`No deployment found`). Historical deployment metadata supplied exact original image digests. Postgres18 and Redis8.2 were restored using those digests and their original volumes, without upgrading, reseeding or resetting data. Postgres logged reuse of the existing directory and clean previous shutdown. Redis loaded its saved RDB (125keys). `database-resume.json`, `database-recovery.json` and `volumes-after-resume.json` retain evidence.

Worker restored from immutable qualified v4 source as `d4a6a2f6-951d-4f9a-b5f8-b5303a1ea981`. No backend/schema/dependency difference from its previous release. Initial web v5 deployment `59f03fb1-27ac-4eba-8f76-f532aad56f2e` restored the website; public dependency status, retained funding/claim receipts and expired link were verified. The offset correction is candidate v6:371 allowlisted files, digest `b27d11ba4338a019c13ac9191cd6f19ee68851fafa6d6a604f5caca28329f609`. Linux verification checks370 image files against qualified v2 dependencies. Runtime secrets and private exports are excluded. Pre-deploy is migration-only `pnpm db:deploy`. Final deployment/public checks are recorded in `verification.json` and `public-resume.json` after completion.

Final v6 web deployment `7f8d8f84-36c5-4234-8d27-24a17292c5e4` is SUCCESS. All four Testnet services are SUCCESS. `v6/public-resume.json` confirms final health/readiness, retained two campaigns, original confirmed funding/two claim receipts, exact expired link, operational workers/reconciliation and claim no-referrer headers. `verification.json` records completion. Only four campaign UI/helper files differ from v4; schema/dependencies/backend are identical. Local verification preview and the two test containers started for this task were stopped with their data retained. Public Testnet remains running.

## Remaining work

After fresh accounting, the next wallet action is the sender-signed reclaim of the newer campaign's unused1USDC, expected sender12USDC. Do not repeat the settled older2USDC refund or paid links. Physical Android signing handoff still needs a recipient that actually needs a trustline signature. Mainnet real-money readiness remains unqualified; cold-treasury refills/multisig and operational capital/caps are not established by this UI release.
