# Kleym comprehensive regression test plan v2

Prepared 26 October 2026. Candidate `b842fe3ac451dbfd4e563b3478c5951944c8dbb5`. **373 planned cases; no blanket completion claim.**

## Purpose and build boundary

Comprehensive regression plan for candidate b842fe3ac451dbfd4e563b3478c5951944c8dbb5. Kleym source is available. 24 page routes, 96 API files / 121 method handlers and the static control register are inventoried. A source declaration is not proof of a working button; conditional states and every data-bound row still require execution. No finite test plan proves all possible inputs. This plan covers observable journeys, failures, boundaries, roles and lifecycle transitions; residual risks remain explicit. Older v1 artifacts are preserved.

## Current environments and entry gates

G0: freeze SHA/tree/lockfile and deployed web/worker/landing identities. G1: isolated populated PostgreSQL and Redis with resettable disposable users, roles, keys, provider fixtures and approved test budgets. G2: Testnet passphrase Test SDF Network ; September 2015, official USDC issuer GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 and fresh Horizon snapshots before every write. G3: team app https://kleym-testnet.up.railway.app and static home https://kleym-home-testnet.up.railway.app. Mainnet is disabled and has no approved separate URL. Current credentials are injected privately, never copied into the plan.

## Platform matrix and Android Studio

Desktop: Brave/Chrome with Freighter extension; Firefox/WebKit compatibility where supported. Android: dedicated Android Studio AVD kleym-qa-api36 using existing API36.1 Google Play x86_64 image, Pixel6 geometry1080x2400/420dpi,3GiB RAM,2cores; data on D:/Android-AVDs. Emulator is actual Android, not viewport emulation, but does not qualify OEM lifecycle, real biometrics, Play Integrity or every physical device. Physical Freighter v1.26.29 desktop/Android EMAIL success is prior evidence on merge623e2bc, not automatically a full v2 pass. Lantern is deferred until an approved curated build includes Kleym.

## Fixtures and exact accounting

Use two disposable organisations and OWNER/APPROVER/OPERATOR/VIEWER plus system-admin identities; never alter the real operator role/password. Test funded and literal-zero-XLM sponsored senders; recipient absent/existing-no-trustline/existing-trustline. Assets: official TestnetUSDC andXLM; custom issuer only for freeze/revoke/conversion faults. Main tutorial:3links x1USDC, desktop claim, Android claim and unused expiry reclaim. Final owner net debit2; recipients +1each; reclaim+1; exact fees and reserve deltas from Horizon. Custom prizes20,15,10,5,5=55 are fixture-only until approved balance budget exists. Pure int64 extremes never go on-chain.

## Execution sequence

1. Source/runtime identity, CI and security prerequisites. 2. Static homepage/login, all role-based page/control smoke on desktop and emulator. 3. Invalid input/CSV/policy matrices using isolated fixtures. 4. Real DB/Redis concurrency, crash recovery and queues. 5. Deliberate wallet Testnet creation/export/funding/claim/reclaim matrix. 6. State/compatibility/a11y/performance and cold-recipient UAT. 7. Backup/restore, monitoring and release rehearsal. Re-run affected regressions after any defect patch and freeze the new candidate; never silently combine results from different builds.

## Runbook: guided three-link campaign

Login on approved Testnet host. Select intended sender or manually paste its G-address for balance lookup; manual entry does not authorize signing. Create3links/1USDC, labels Desktop/Android/Unused, choose appropriate expiry and policy. Review count,total,issuer,deadline,reserves,fees. Generate keys privately, save phrase and current secrets export, approve one intended funding batch. Wait for ledger confirmation. Claim desktop link to controlled receiver, Android link in emulator/Freighter if installed and independently snapshot balances. Leave third unused; after actual expiry approve sender reclaim and reconcile. Do not share secrets/export in evidence. For EMAIL upload owned-inbox assignment before review; use new OTP only. For WALLET enforce the assigned owner. Do not reuse settled links to obtain screenshots.

## Evidence and status rules

Catalog rows begin Not Run; expected results are written before execution. Execution records need caseID,candidate,platform/tester/UTC,input-fixture,actual,status,evidence and defect. Statuses: Not Run,Ongoing,Passed,Failed,Blocked,For Re-test,N/A. Blocked needs a named missing prerequisite and cause class (tester, infrastructure, dependency, product). Not Run is not a failure or a pass. N/A needs explicit scope reason. CI proof qualifies only what the named scripts actually executed. Reusing same-candidate immutable CI evidence avoids unnecessary full-suite reruns; prior SHA/device proof stays separately labelled. Store safe evidence under evidences/runs/<run>/<caseID>; sanitize screenshots, HAR and logs before retention.

## Money, secrets and stop conditions

Stop on network/issuer/signer mismatch, unintended approval/broadcast, seed/phrase/bearer leakage, unexplained principal/reserve loss, double payout, false ledger-success state or candidate mismatch. Never persist private keys, OTP values, session/API tokens, private recipient lists, raw claim URLs or secret-bearing XDR dumps in test artifacts. The chain is authoritative. HTTP202 is not delivered mail, submitted is not funded, expired is not automatically refunded, and unchanged native balance does not by itself prove reserves released. Compare charged fees and live reserve obligations, retaining recipient permanent sponsorship separately.

## Release gates and current gaps

All mandatory financial/authentication/recovery cases must pass with required evidence; unresolved critical/high, mandatory Blocked or Not Run prevents full sign-off. Plan completion does not enable Mainnet. Mainnet needs separate approved HTTPS deployment/credentials/queues, sponsor/treasury and incident ownership, measured restore/rollback/alert proof, sender authentication/provider tracking confirmation and explicit real-asset pilot approval. No arbitrary global campaign-USDC cap is introduced; wallet capacity, protocol precision and sponsor admission remain. Automated treasury refill is not presumed implemented. EMAIL/CODE are application gates rather than additional on-chain signer restrictions; WALLET binds the assigned owner on-chain.

## Traceability and reference method

Stable original KLM-D1..D4 IDs retained; new KLM-V2 cases cover current features, each page, each API handler and every declared claim state. Controls sheet lists every static JSX declaration with source line and an explicit execution field. D1-D4 Lantern methodology is reused for independent money proof, adversarial boundaries, installed-artifact identity and cold-recipient UAT; Lantern contract addresses and its product assumptions are not copied. Automated proof, deployed smoke, physical-device proof and operational sign-off remain distinct.

### KLM-D1-TER-001 — Equal prizes: three 1-USDC links

P1 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create a campaign with count 3, amount 1 and a future custom expiry. Review; save export privately. Fund once after approval.

**Expected:** Declared total is exactly 3.0000000 USDC; three distinct public link keys; only funded links can be shared.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-TER-002 — Custom prizes: 20, 15, 10 and two default 5

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create count 5/default 5. Set rows 1-3 to 20,15,10; leave rows 4-5 unchanged. Review, export and inspect public registration.

**Expected:** Row order is stable; amounts are 20,15,10,5,5; exact total 55.0000000; labels, CSV and ledger amounts match.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-TER-003 — Edit custom prizes across pages

P1 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create 25 rows/default 5. Override row 1 and row 21. Move next/back through all pages and return to review.

**Expected:** Overrides persist at their original indices; no duplicate rows or lost edits; displayed total equals exact decimal sum.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-TER-004 — Shrink and expand the recipient count

P1 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Set overrides on rows 1 and 12; shrink count to 10; inspect review. Expand back to 12 and inspect again.

**Expected:** Only current rows affect totals. Removed overrides never silently fund additional rows; new rows use displayed default.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-TER-005 — Change default with existing overrides

P1 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Override one row, change default 5 to 7, then review and export the current list.

**Expected:** Explicit override is preserved; remaining rows reflect current default; review is the exact list sent for registration.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-AMT-001 — Minimum positive amount

P0 | Boundary | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 0.0000001 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Accept exactly one stroop; no rounding to zero.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-002 — Zero / negative / text / exponent

P0 | Negative | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 0; -1; abc; 1e3 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Refuse each with a useful amount error; no registration or wallet request.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-003 — Eighth decimal place

P0 | Negative | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 1.12345678 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Refuse rather than round or truncate.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-004 — Maximum classic int64 amount

P0 | Boundary | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 922337203685.4775807 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Pure validation accepts the exact maximum. Do not attempt funding this boundary fixture.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-005 — Amount one stroop above int64

P0 | Negative | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 922337203685.4775808 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Pure validation rejects overflow before envelope creation.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-006 — Exact aggregate and persistence precision

P0 | Boundary | Testnet release | Not Run

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 20;15;10;5;5;0.0000001 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Decimal/stroop total is 55.0000001; DB round trip retains all seven decimal places.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-EXP-001 — Relative expiry buttons

P1 | Boundary | Testnet release | Not Run

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Select 1 hour, 24 hours, 7 days and 30 days from a fixed clock; inspect local and UTC summary for each.

**Expected:** Each deadline is rounded to minute precision without shortening the selected interval; rerenders do not extend it.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-002 — Custom date and time entry

P1 | Boundary | Testnet release | Not Run

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Choose Custom; type a future complete date/time; tab through fields and inspect the review summary.

**Expected:** Typed date/time works without calendar dragging; visible timezone and UTC conversion agree with submitted expiry.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-003 — Invalid or past deadline

P1 | Negative | Testnet release | Not Run

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Try empty, partial, impossible calendar date, current instant and past time; continue after each.

**Expected:** Refuse each invalid/past expiry with a useful inline message; no keys generated or funding prepared.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-004 — Timezone and DST boundaries

P1 | Boundary | Testnet release | Not Run

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Run browser fixtures in Asia/Manila and America/New_York; test DST skipped and repeated local times.

**Expected:** Skipped local times are refused; chosen offset on a repeated hour is preserved; server and reviewed predicate agree.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-005 — Expiry while review stays open

P1 | Negative | Testnet release | Not Run

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Hold a saved draft until its expiry, then try prepare/sign without changing the reviewed deadline.

**Expected:** Reject stale expiry; never silently extend a previously reviewed balance predicate.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-KEY-001 — Private export is a funding gate

P0 | Security | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Generate keys; try sign before saving export. Save it privately and retry.

**Expected:** Funding stays blocked before export acknowledgment; save unlocks review/sign; no secret reaches the server.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-002 — Recovery phrase normalization

P0 | Security | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Privately generate a disposable phrase, then paste it as words and as a numbered list in a new draft; compare public key derivation.

**Expected:** Valid supported BIP39 phrase normalizes deterministically; invalid checksum refuses. Never use a Freighter wallet phrase as test data.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-003 — Lost export recovery from saved phrase

P0 | Security | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** In a clean tab restore the campaign phrase and original derivation index/count; compare public keys offline.

**Expected:** Same phrase/index recreates the same keys; wrong phrase/index does not. Kleym cannot recover missing private material.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-004 — Fragment removal and data minimization

P0 | Security | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Open a disposable private claim locally; inspect address bar and sanitized request body after initialization.

**Expected:** Fragment is cleared from visible history; only public key and signatures/intended public fields leave the browser; no full bearer URL in evidence.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-MAT-001 — USDC lifecycle: literal-zero-XLM sponsored sender; absent account

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and absent account; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-002 — USDC lifecycle: literal-zero-XLM sponsored sender; existing zero-XLM account without USDC trustline

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and existing zero-XLM account without USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-003 — USDC lifecycle: literal-zero-XLM sponsored sender; existing zero-XLM account with USDC trustline

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and existing zero-XLM account with USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-004 — USDC lifecycle: funded sender with nonzero XLM; absent account

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and absent account; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-005 — USDC lifecycle: funded sender with nonzero XLM; existing zero-XLM account without USDC trustline

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and existing zero-XLM account without USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-006 — USDC lifecycle: funded sender with nonzero XLM; existing zero-XLM account with USDC trustline

P0 | Positive | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and existing zero-XLM account with USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-FUN-001 — Funding envelope ownership

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Prepare a fresh 3-link USDC campaign; decode operations, source accounts, signers, asset and predicates before approving.

**Expected:** Classic source is operational sponsor; sender supplies principal in createClaimableBalance ops; sponsoring brackets wrap funding; no fee bump substitutes for reserve sponsorship.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-002 — Funding signer rejection

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Remove sender signature, then sponsor signature from disposable prepared fixture; submit to isolated API.

**Expected:** Missing/wrong required signature is refused before network submission; pending journal cannot mark funding confirmed.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-003 — Balance ID derivation and reserve units

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Fund 3 links once; compare stored IDs against createClaimableBalance operation order and Horizon.

**Expected:** Three exact asset/amount/claimant predicates and balance IDs match; sponsor adds 6 reserve units for two claimants per balance.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-004 — 200 links across batches

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** With approved Testnet budget, create 200 one-USDC links; prepare and sign sequentially using configured batch size; wait for every batch confirmation.

**Expected:** All 200 IDs unique and confirmed exactly once. Number/signature count follows effective per-envelope operation cap; no invalid >100-op envelope; campaign active only after all required confirmations.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-005 — Principal shortage

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use sender with 2 USDC and request three 1-USDC links; try funding.

**Expected:** Fresh preflight refuses insufficient USDC before wallet signature; no link marked funded or active.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-006 — Sponsor shortage / liabilities

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use isolated sponsor fixtures with low spendable XLM and native selling liabilities; prepare full remaining campaign.

**Expected:** Spendable uses fresh base reserve, entries, sponsorship and selling liabilities; insufficient full remaining capacity refuses before signing.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-007 — Account clone and sequence stability

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Prepare twice from shared account fixture and compare originals; then perform actual sequential confirmed batches in isolated harness.

**Expected:** SDK builder does not mutate cached sender/sponsor account records; each accepted envelope uses coordinated correct source sequence.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-008 — Legacy native-XLM compatibility

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create a small XLM campaign using explicitly approved test identity with spendable XLM; fund, claim and reclaim unused balance.

**Expected:** Legacy native funding path remains compatible; exact native principal, fees and reserves reconcile; sponsor policy follows reviewed envelope.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-SET-001 — Claim exactly once

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** For a funded link, connect recipient; record no mutation on connect; claim once and reload/click again.

**Expected:** Only explicit claim moves funds; exact amount credited once; claimed screen shows confirmed hash; repeated claim cannot pay again.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-002 — One-stroop custom claim

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Fund a custom 0.0000001-USDC link after approval; claim to trusted recipient.

**Expected:** Recipient gets exactly 0.0000001; totals and receipt preserve seven decimals; no zero rounding.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-003 — Frozen / unauthorized / full trustline

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use disposable issuer fixture with unauthorized or full receiving trustline; try prepare and claim.

**Expected:** Refuse unusable destination without losing balance or misreporting success; Circle USDC must not be altered for this test.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-004 — Claim before / at / after expiry

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Using controlled ledger close-time fixture, test T-1,T,T+1. In approved live boundary run, compare actual Horizon predicate seconds and ledger close time.

**Expected:** Ephemeral claimant eligible only abs_before T; sender reclaim eligible at/after T. Host clock and millisecond UI cannot redefine predicate.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-005 — Temporary reserve release

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Record sponsor before materialisation, after materialisation and after claim. Independently check temporary account absence and removed balance.

**Expected:** Temporary account 2 plus trustline 1 reserve units released; claimable-balance 2 units released; permanent recipient sponsored entries remain and are separately explained.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-006 — Sender-authorized reclaim after expiry

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Keep third link unused. Wait for on-chain expiry; select sender; review single reclaim amount/signers; approve once.

**Expected:** Unused 1 USDC returns only to original sender; balance disappears; 2 claimant reserve units released; sponsor pays actual fee; recipient state unchanged.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-007 — Pre-expiry reclaim / wrong sender

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Try reclaim one second before deadline and with another sender identity in controlled API/ledger fixtures.

**Expected:** Refuse both; no sender refund, no removed balance and no journal settlement from a rejection.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-008 — Partial reclaim and duplicate reconciliation

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use 3 expired links with one already claimed; reclaim remaining links; replay worker/event and refresh campaign.

**Expected:** Only reclaimable amounts are returned; sum/receipt count matches exact settled links; duplicate processing cannot credit twice.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-009 — Renewal uses verified refunded budget

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Expire an equal-amount campaign, reclaim remaining links, wait for confirmed accounting, then renew from original campaign.

**Expected:** Original lineage retained; renewed link count and principal equal verified refund only; claimed links are excluded; renewed funding still requires sender review.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-010 — Renewal refuses unsafe terms

P0 | Negative | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Try renewal before expiry, before refund settles, with changed sender/asset/count, after second renewal, and on custom-amount campaign.

**Expected:** Refuse invalid terms; variable-amount renewal is currently unsupported and clearly refused; no second principal distribution hidden as renewal.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D1-SET-011 — Ledger-derived receipt time

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Claim, stop UI before DB settles, and run reconciliation; compare direct and recovered receipt timestamps with confirmed operation created_at.

**Expected:** Both paths use ledger settlement time consistently. Current issue #110 remains a known gap until verified/fixed; app wall-clock time is insufficient.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual + independent Horizon

### KLM-D2-SIG-001 — Network/provider mismatch

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Configure Testnet passphrase with public Horizon or vice versa; attempt every write preparation.

**Expected:** Refuse mismatched network identity before wallet or network write; read-only Mainnet checks cannot submit.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-002 — Wrong asset issuer

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Alter prepared or requested USDC issuer while keeping display code USDC.

**Expected:** Match full asset code+issuer+network; refuse unauthorized issuer, never silently map by ticker.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-003 — Reviewed XDR tampering

P0 | Security | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Alter amount, destination, source, operation order, predicates, timebounds and fee separately in signing fixtures.

**Expected:** Every altered reviewed transaction hash is refused; no mutation accepted because a wallet signed it.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-004 — Signed envelope preservation

P0 | Security | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Return signed fixtures missing sponsor/local signatures or containing a signature for another passphrase/account.

**Expected:** Require exact reviewed hash and all required valid signatures; do not reconstruct or drop prior signatures.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-005 — Wallet account/network changes mid-review

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Connect sender, prepare; switch selected wallet or network before sign. Retry only after fresh review.

**Expected:** Refuse changed identity; reconnect/review clearly; no automatic retry with different account/network.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-006 — Cancel / timeout / lock wallet

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Cancel connection and signing separately; lock wallet; let acknowledgment/review timeout; retry from saved draft.

**Expected:** Useful bounded error; no funding or claim on cancel; cleanup permits safe retry; no leaked wallet error contents.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-007 — Unknown submission outcome

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Drop response after provider accepts exact signed hash; refresh/retry and run reconciliation.

**Expected:** Exact signed bytes/hash retained durably; lookup same hash before any retry; no replacement payment or duplicate funding.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-008 — Process crash at durable boundaries

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Kill isolated worker before send, after send, after confirm and during settlement; restart for each journal fixture.

**Expected:** Recover prepared/submitted/confirmed/settled state deterministically; exactly one final accounting mutation per hash.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-009 — Real source concurrency across processes

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Run two processes sharing sponsor and separate web/worker instances against fresh PostgreSQL; prepare claims/funding/reclaim simultaneously.

**Expected:** PostgreSQL advisory source lock serializes all spenders; fresh sequence/headroom under lock; no stale capacity double admission.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-010 — Unresolved legacy attempt

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Seed old submitted row with missing signed XDR and ambiguous hash; attempt new prepare and recovery.

**Expected:** Do not discard unresolved financial liability by guessing; refuse/reconcile explicitly; no duplicate operation.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-011 — Strictly later ledger enforcement

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Hold TX1 confirmed ledger N; provide provider latest ledger N for TX2 then N+1; attempt claim preparation both times.

**Expected:** Refuse N; permit after verified N+1. Fixed sleep or browser time alone is insufficient.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-012 — Queue/DB unavailable

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Interrupt Redis/PG before and after financial write; restore and replay pending jobs.

**Expected:** No false success; durable attempts survive lost queue notification; recover accounting after reconnection without duplicate payout.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-013 — Source rejection classification

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Inject tx_bad_seq, insufficient balance, expired timebound and operation failure into isolated submission/reconcile harness.

**Expected:** Distinguish explicit rejection from unknown outcome; settle nothing on rejection; preserve useful safe correlation metadata.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-014 — SDK sequential multi-batch handling

P0 | Negative | Testnet release | Not Run

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Use published SDK/API client for >one batch; introduce delayed confirmation and exercise resume.

**Expected:** SDK waits/queries confirmation or surfaces actionable resumable state before next preparation; SUBMITTED is not CONFIRMED. Issue #105 remains open.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SEC-001 — Cross-organisation and role controls

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Create two disposable orgs; try reading/registering/funding/reclaiming other org campaign with session and API key; try read-only role.

**Expected:** Resource/role denial without secret/object leakage; no rows or chain submissions created for unauthorized request.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-002 — Idempotency scope and request mismatch

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Reuse same key with same request, changed body and different user/org; run concurrently.

**Expected:** Same authorized request replays one result; changed body refuses; key never returns another org response.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-003 — API key underscores and secret at rest

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Use deterministic full API-key fixtures with underscores in suffix; verify authentication, revoke/wrong-key denial and database representation.

**Expected:** Parser/hash covers whole token; no probabilistic generation assumption or partial split token check; no cleartext key at rest. Issue #112 harness gap must be fixed.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-004 — Claim proof and body guard

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Submit malformed/oversize body, planted secret field, wrong preparation proof, replayed nonce and altered recipient.

**Expected:** Refuse at API boundary; no logs reflect bearer material; only valid matching proof advances intended claim.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-005 — Frame-origin and message spoofing

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Send bridge replies from wrong origin/window with wrong ID; trusted parent attempts changed XDR.

**Expected:** Ignore untrusted replies and refuse tampered trusted replies; no wildcard origins, no broad frame access.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-006 — Session cookie and CSRF boundaries

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Enable exact Lantern origin; login in trusted partition; issue cookie mutation from foreign/originless browser; log out.

**Expected:** HttpOnly/Secure/Partitioned cookie matches deployment; unsafe browser mutations require exact Kleym origin; logout revokes/clears matching partition.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-007 — Outbound URL canonicalization and redirects

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Configure webhook/screening/OIDC/federation URL fixtures with local/private/reserved hosts, credentials, alternative numeric IPs, backslashes and 3xx.

**Expected:** Public HTTPS guard rejects unsafe forms and redirects; permitted loopback only in explicit development; network errors are safe and bounded.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-008 — DNS rebinding and deployment egress

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** In controlled deployment resolve a public-looking allowed hostname to private IP; test socket egress policy with security owner.

**Expected:** No connection to private/internal address; DNS/socket or platform egress enforcement must prove this. Current URL-only guards do not satisfy this case.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-009 — Audit seed emitted log and future key guard

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Run secret-classification focused tests and guard using planted root/nested fields; add unclassified seed fixture; verify fixed public signature.

**Expected:** Audit/sponsor/encryption/provider fields censored; future seed name fails classification; safe public IDs observable; signature bytes/verification format unchanged.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-010 — Client bundle and evidence leak scan

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Scan candidate source/build and proposed report text for seeds, mnemonic fixtures, bearer URLs, tokens and credentials; inspect all intended screenshots.

**Expected:** No real secret or complete claim fragment is published; public IDs/hashes permitted; scan scope/limitations recorded, not called security assurance.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-011 — Bearer-email exclusion for pilot

P0 | Security | Testnet release | Not Run

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Enable campaign/self-delivery mode; invoke legacy email/reminder queue path and inspect sanitized message metadata.

**Expected:** Pilot cannot enqueue/send full bearer links via built-in email; server never receives browser link key. Legacy behavior requires explicit gated product decision.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D3-FRE-001 — Desktop Freighter sender connection

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Cold-open approved HTTPS sender page with unlocked desktop Freighter/Testnet. Connect intended public sender and prepare one funding batch.

**Expected:** Desktop extension control only; no Android app button; exact address/network visible; connection alone moves no funds.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-002 — Desktop Freighter funding approval

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Save private export; sign intended batch; inspect popup and submit; wait for campaign ledger confirmation.

**Expected:** Popup appears; correct official issuer/principal/signers; sender XLM warning, if wallet displays it, does not substitute for sponsor-paid ledger proof.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-003 — Desktop recipient claim

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Open link A privately in recipient browser; connect intended recipient; click Claim; review signatures and wait for settlement.

**Expected:** Exact one USDC credited once; confirmed transaction link uses Testnet; cleanup/reserves satisfy D1 accounting.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-004 — Stale extension tab recovery

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Keep saved draft, invalidate/restart extension bridge, compare original/fresh tabs, reopen only after private backup.

**Expected:** No endless spinner or false funded state; helpful reconnect guidance; new tab can recover public draft and keys only from user-held backup.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-005 — Android Chrome phone controls

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Open link B privately in Android Chrome without desktop extension. Inspect wallet controls and press phone connect.

**Expected:** No desktop-specific Connect wallet button. Freighter phone open/pair action is clear; connection is distinct from claim; installed/uninstalled fallback is truthful.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-006 — Android Freighter connection return

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Approve connection in installed Android Freighter, return to original Chrome tab and inspect account/network.

**Expected:** Tab reaches explicit Claim control with intended public account; connection alone cannot transfer; return guidance explains next step.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-007 — Android Freighter full claim signing

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** From connected link B in Chrome press Claim; open wallet review, explicitly approve, return and confirm independently.

**Expected:** Actual v1.25.28 or recorded installed-version mobile signatures work for required operations; exact one USDC; no manual raw-XDR or key entry.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-008 — Android reconnect/background lifecycle

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Background Chrome/Freighter during connection, review and submission; resume; test expiry and user rejection separately.

**Expected:** No duplicate submission on resume; usable safe recovery; stale wallet context cannot sign a changed transaction; keys remain private.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-009 — App not installed / pairing expiry

P0 | UAT | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Use Android without installed app or expired WalletConnect pairing; press connect and cancel/retry.

**Expected:** Usable fallback/help and bounded timeout; no claim or phantom connected state; no promise that app opening equals approval.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-LAN-001 — Curated directory entry and package identity

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Hash senior-provided Lantern APK/extension; inspect Apps directory for exact approved Kleym HTTPS origin/session=true; compare effective installed extension origin.

**Expected:** Kleym is explicitly curated; Android directory metadata generated; exact approved frame origins. Current 0.6.2 without Kleym cannot pass this prerequisite.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-002 — Android public sender handoff

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** From public Kleym sender/login in Chrome select Open in Lantern; inspect opened page and browser fallback with app absent.

**Expected:** Only public path handed off; query/fragment removed; app opens curated Kleym, fallback is intended public page; no private claim fragment copied into intent.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-003 — Lantern sender authenticated session

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Inside curated trusted Lantern frame login, connect wallet, create draft, leave/reopen Apps and log out.

**Expected:** Authenticated sender experience works in correct cookie partition; desktop browser session is separate; logout terminates partition session.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-004 — Lantern desktop funding and management

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** In rebuilt extension open Apps > Kleym. Create saved 3-link campaign; approve funding; inspect campaign and reclaim unused link after expiry.

**Expected:** Lantern receives exact sign-only XDR; no external Freighter phone control; API submits and confirms exactly once; auth/organization management remains intact.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-005 — Lantern Android funding and management

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Repeat saved 3-link campaign creation/funding in rebuilt APK; inspect scrolling, approve review and confirmed dashboard.

**Expected:** Full creator journey works on physical phone, not only mocked bridge; exact hash/account/network preserved; no overflow or inaccessible signing action.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-006 — Recipient claim already in trusted Lantern frame

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Open disposable link inside curated trusted frame using owner-approved private-link route; connect Lantern and explicitly claim.

**Expected:** Connect Lantern selected; no Freighter pairing control; exact claim review inside wallet; confirmed asset reaches selected recipient; public launcher is not claimed to move private links.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-007 — Uncurated generic URL sandbox

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Open Kleym via Lantern generic URL bar instead of approved Apps directory; attempt login/connect safely.

**Expected:** Opaque sandbox is not treated as trusted authenticated integration; honest guidance; no fallback widening origins or copying private fragments.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-008 — Lantern delayed idless connection reply

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Delay getPublicKey reply past timeout, retry without reopening, then deliver old response in bridge fixture.

**Expected:** Late response cannot complete a different connection; reopen requirement visible; signing still correlates exact request ID/source/origin.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-009 — Lantern wrong network / account / permissions

P0 | UAT | Deferred Lantern | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Switch network/account or revoke app grant before sign; return wrong identity or tampered signature via fixture.

**Expected:** Fresh grant/account/network checks refuse; never signAndSubmit behind Kleym journal; original reviewed transaction unchanged.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-UX-001 — Keyboard and focus order

P1 | UAT | Testnet release | Not Run

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Use Tab/Shift-Tab/Enter/Space from login through amount editor, expiry picker, review, export and wallet controls.

**Expected:** All interactive elements reachable with visible focus; logical order; no keyboard trap.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-002 — TalkBack / NVDA status announcements

P1 | UAT | Testnet release | Not Run

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Use Android TalkBack and desktop NVDA for invalid amount, funding pending and claim result.

**Expected:** Errors and new states announced meaningfully; controls labelled; no reliance on colour alone.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-003 — Phone viewport and 200% zoom

P1 | UAT | Testnet release | Not Run

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Test 360px/393px portrait, landscape, keyboard-open state and desktop 200% zoom across creation/review/claim.

**Expected:** No sideways scrolling or clipped primary controls; amount/date input and signing return usable.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-004 — Cold recipient without team help

P1 | UAT | Testnet release | Not Run

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Give independent reviewer only their private test link and minimal Testnet warning; time connection/claim and record hesitation.

**Expected:** Reviewer identifies asset/network, connection versus claim and result without keys/raw-XDR instruction; friction recorded as UAT findings, not fabricated passes.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D4-OPS-001 — Candidate freeze and deployed parity

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Record feature commit, dependency lock hash, migrations, runtime/package-manager versions, effective public URL and server build identity; compare release manifest; run dependency audit with supported package manager.

**Expected:** Tested source, built bytes and deployed candidate match; unknown identity blocks qualification. Unresolved critical/high dependency advisories block release until remediated or explicitly assessed by the security owner.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-002 — Migration and rollback on populated copy

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Backup isolated seeded DB with campaigns/attempts/receipts; apply candidate migration; exercise old/new states; rehearse documented rollback from copy.

**Expected:** No precision/history/lineage loss; safe recovery of pending attempts; rollback decision tested and source/deploy artifact preserved.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-003 — Real DB/Redis CI qualification

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Run full isolated PostgreSQL/Redis suites from candidate in CI; include keys, receipts, batches, claims, source coordination, backup and recovery.

**Expected:** Green evidence for candidate includes meaningful assertions; unavailable Docker/local services mean Blocked for execution, not pass from mocks.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-004 — Public HTTPS cold sender and recipient

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** After owner-approved deployment, cold-open public URL on desktop and Android outside team network; execute 3-link tutorial.

**Expected:** HTTPS reachable, Testnet clearly labelled; no localhost dependency; account/claim links work without team browser profile.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-005 — 200-link cost/capacity budget

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Record fresh base reserve, fees, sponsor liabilities and configured campaign/recipient caps; quote 200 one-USDC links then enforce limiting budgets.

**Expected:** Principal separate from operational XLM; fee bid versus charged fee distinguished; persistent recipient reserves included in lifecycle budget; configured limits enforced before spend.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-006 — Performance latency/provider-read budget

P0 | Load | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Measure 30 representative prepare/resolve requests at agreed concurrency with recorded network and fixture dataset; report median/p95, provider calls and errors.

**Expected:** Baseline and candidate measured comparably; no invented speedup; static 10-to-5 provider call reduction is not latency evidence. Owner sets SLO before sign-off.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-007 — API throttling / provider rate limits

P0 | Load | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Use bounded local load within agreed test budget; return 429/503/timeouts from isolated provider; observe recovery and queues.

**Expected:** Useful bounded response/backoff; no storm, duplicate spend or false active state; rate limit shown honestly and financial journal retained.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-008 — Sponsor failover / shortage / refill

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Exhaust primary fixture below working threshold; select secondary; test total pool shortage and alert routing; rehearse refill procedure without cold signing.

**Expected:** Fresh sponsor choice respects outstanding liability and pinned campaign sponsor; alerts actionable; no unauthorized automatic cold refill; approved owners recorded.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-009 — Worker pause and drain

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Pause creation with pending submitted attempts; drain/reconcile workers before planned shutdown, then restart isolated services.

**Expected:** User-facing pause clear; accepted attempts remain durable and settle; no stranded state hidden by queue deletion.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-010 — Backup restore and disaster recovery

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Restore encrypted DB backup to isolated environment; restore matching configuration via secret store; reconcile exact pending hashes before unpausing.

**Expected:** Audit/history and financial journals preserved; no key in reports; measured recovery time/loss against owner-approved RTO/RPO.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-011 — Monitoring and signed evidence cadence

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Trigger stale pending attempt, low spendable reserve, queue delay and mismatch fixture; inspect dashboards/alerts and generate verified export.

**Expected:** Owner can trace safe correlation ID/hash; alerts reach approved operator; signed receipts verify; production cadence/gates documented and actually wired.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-012 — Mainnet read-only config and issuer

P0 | UAT | Mainnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Inspect public passphrase/official USDC issuer and exact public Horizon identity; verify release checklist without signing or submission.

**Expected:** Public issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN matches configured asset; no Testnet address/passphrase/issuer crossover. No live movement authorized by this plan.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-013 — Owner-approved Mainnet pilot and operational controls

P0 | UAT | Mainnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** After mandatory Testnet and operations cases pass, record approved deployment, sponsor capital, incident/refill owners and rollback criteria. Obtain explicit approval for a small real-asset pilot.

**Expected:** No arbitrary global campaign-USDC cap is introduced. Creator wallet capacity and protocol bounds remain enforced. Mainnet stays disabled until all mandatory gates and explicit real-asset approval are satisfied.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-014 — Issue closure and evidence consistency

P0 | UAT | Testnet release | Not Run

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** For each proposed closure map every criterion to candidate source and executed case log; verify tracker totals/evidence/defect references.

**Expected:** Close only satisfied criteria; keep missing device/DB/ledger/deployment proof open; roadmap reflects qualified scope rather than promised launch date.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D1-POL-001 — Bearer policy versus named recipient

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** Share a disposable bearer link with a different controlled recipient; compare with an explicitly configured strict-policy fixture.

**Expected:** Bearer policy is not email/address binding; strict policy follows its documented authorization. Never describe sender labels as claimant enforcement.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

### KLM-D1-POL-002 — Receive-as quote and slippage floor

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** In an approved disposable asset pair, quote an allowlisted receive-as asset; change quote liquidity and try below-minimum destination before submission.

**Expected:** Delivered asset and minimum are explicitly reviewed; failed conversion preserves claimable principal; no silent ticker/issuer substitution.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

### KLM-D1-POL-003 — Exchange deposit memo boundaries

P0 | Regression | Testnet release | Not Run

**Preconditions:** Current v2 G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** Use controlled exchange-style account fixture; test required ID/text memo, missing/wrong-type/overflow memo and disabled exchange-deposit campaign.

**Expected:** Only permitted reviewed destination/memo is accepted; no recipient account merge; missing or altered memo is refused before transfer; actual delivered asset appears on receipt.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

### KLM-D2-AUTH-001 — Fresh-auth and MFA protected operations

P0 | Security | Testnet release | Not Run

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** With disposable sender/admin, exercise protected operations with missing/expired fresh auth; complete TOTP/WebAuthn, revoke session and retry.

**Expected:** Required second factor and fresh-auth gate cannot be bypassed; no protected mutation with revoked session; recovery material never enters evidence.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

### KLM-D2-AUTH-002 — Approval / screening hold and outage

P0 | Security | Testnet release | Not Run

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** Create approval-required and screened campaign fixtures; attempt funding before approval, on explicit hold and while screening dependency is unreachable.

**Expected:** Authorization and hold gates enforced; unavailable screening fails closed with safe actionable result; only authorized approved campaign can advance.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

### KLM-D2-AUTH-003 — Signed export tampering and key history

P0 | Security | Testnet release | Not Run

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** Generate receipts/audit export with disposable signing configuration; verify publicly; alter row/amount/signature and verify again; verify archived public-key fixture.

**Expected:** Valid evidence verifies without a signing seed; tamper fails; canonical/version/key history preserved; private credentials and bearer metadata absent.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

### KLM-D3-ADM-001 — Campaign list, filters and per-link history

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Create mixed-status equal/custom campaigns in two orgs; filter/search/page dashboard and campaign details; refresh after settlement.

**Expected:** No cross-org data; stable paging/counts; exact per-link amount and confirmed lifecycle status; no stale active totals from submitted-only attempts.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

### KLM-D3-ADM-002 — Templates and historical funding compatibility

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Create draft from existing template and inspect funding mode; compare with new sponsored API campaign and historical sender-paid campaign.

**Expected:** Template/historical mode remains explicit and supported; no silent migration to sponsored version; funding signatures/costs match actual reviewed protocol.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

### KLM-D3-ADM-003 — Claimed / expired / invalid link copy

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Open safe local fixtures for already claimed, expired-unclaimed, invalid/missing fragment and provider outage.

**Expected:** Correct distinct states and actionable messages; no false funds-in-wallet message before confirmation; no spinner stuck or secret-bearing error.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

### KLM-D4-DOC-001 — Privacy deletion and organization isolation

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** With disposable org/test user, export personal data, request allowed erasure, and verify financial audit retention and unrelated org isolation.

**Expected:** Only permitted personal data returned/erased; immutable financial proof preserved under documented retention; keys/bearer URLs absent.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:privacy; verify:observability; source/docs review

### KLM-D4-DOC-002 — Telemetry and error observability minimization

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** Trigger bounded funding/claim failures; inspect emitted logs and tracing attributes using planted secret/bearer fixtures.

**Expected:** Safe correlation IDs/hash/state observable; no mnemonic, seed, complete bearer URL, signed-body dump or private token retained in logs/traces.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:privacy; verify:observability; source/docs review

### KLM-D4-DOC-003 — API documentation and support limits

P1 | Regression | Testnet release | Not Run

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** Compare public write API/SDK examples, wallet support matrix, funding versions and recovery help with executed candidate cases.

**Expected:** Docs describe only proved support, explicit async confirmation and custom-amount renewal limitation; unsupported Android/Lantern/Mainnet claims withheld.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Source/harness:** SPEC.md; AGENT.md; original v1 case; verify:privacy; verify:observability; source/docs review

### KLM-V2-AUTH-001 — Empty and incorrect login

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Submit empty username/password; then disposable unknown username and wrong password.

**Expected:** Required-field feedback; indistinguishable invalid-credentials responses; no authenticated session.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-002 — Login retries and account lock

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated accounts/IPs; exercise attempts at 4/5/6 per IP and 9/10/11 per account; retry a valid credential during lock.

**Expected:** Limits and Retry-After match auth policy; locking cannot be bypassed by another IP; other accounts retain their own budget.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-003 — Logout and browser history

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Log in, log out, press Back and reload a protected route in a second tab.

**Expected:** Logout ends the server session; protected data is unavailable after revalidation; no browser-close logout promise.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-004 — Session expiry during funding

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Prepare but do not submit a batch; expire the disposable session; attempt prepare/submit, reauthenticate and resume.

**Expected:** Expired session cannot mutate; draft/key backup preserved; resumed submission reconciles an existing attempt before another transfer.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-005 — Password validation and rotation

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** On disposable account test missing/wrong current password, short new value and valid rotation; replay old sessions.

**Expected:** No change for invalid input; valid change rotates current session and revokes others. Do not alter the real operator credential.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-006 — Organisation switch isolation

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use an owner in two disposable orgs; switch with a detail page and draft open in another tab.

**Expected:** Every request uses current permitted organisation; foreign IDs reveal no data; old draft cannot bypass ownership.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-007 — Invitation invalid, reused and expired

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open nonexistent token, expired token, used token and valid invitation; try mismatched user.

**Expected:** Invalid tokens produce safe refusal; valid single-use acceptance grants only intended membership; no elevation by replay.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-008 — MFA recovery and step-up expiry

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use fixture TOTP/passkey; cancel authenticator, replay recovery code, exhaust guesses and age the five-minute step-up.

**Expected:** Fail closed; one recovery use only; protected signing/reclaim/key creation needs fresh factor. No factors captured in evidence.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-AUTH-009 — SSO state, issuer and deprovision

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated IdP; alter state/nonce/issuer, test email collision and deactivate via SCIM.

**Expected:** Reject altered handshake; bind stable subject rather than email; deprovision immediately revokes live access.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-001 — Sender address malformed and secret-shaped

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Paste empty text, invalid checksum, a fixture secret seed, absent account and valid G-address into Funding account.

**Expected:** Reject malformed/secret inputs safely before lookup; absent-account state actionable; valid manual address only checks balance, never grants signing authority.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-002 — Wallet owner differs from typed sender

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Type controlled sender A; connect wallet B; attempt funding approval.

**Expected:** Clear mismatch refusal before submission; no silent sender replacement or transfer from B.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-003 — Name and labels boundaries

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Test empty name, whitespace-only, exact schema maximum and maximum+1; labels with quotes, comma, newline, Unicode and HTML.

**Expected:** Validation at both UI/API; safe text rendering; CSV round-trips labels without column displacement or script execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-004 — Asset authenticity and available balance

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Select XLM then official Testnet USDC; enter same ticker with another issuer fixture; exhaust balance with pending liabilities.

**Expected:** Correct issuer/network displayed; ticker alone is insufficient; spending capacity is fresh and conservative.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-005 — Every prize amount boundary

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Try blank, 0, -1, 0.0000001, 0.00000001, 1e3, NaN, comma separator, seven/eight decimal places and int64 extremes in isolated fixtures.

**Expected:** Only exact supported positive string amounts within ledger range accepted; no Number rounding; field-specific error blocks advancing.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-006 — Count and custom-prize lifecycle

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Test 0,1, max,max+1,fraction/text; edit prizes over multiple pages, shrink/grow count, reset one/all and change default.

**Expected:** Current count/order/labels/overrides remain aligned; exact sum; no invisible funded rows or stale values.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-007 — Policy switch resets incompatible recipients

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Import wallet CSV, switch EMAIL then OPEN then CODE; move Back/Next and review.

**Expected:** Old wallet/email assignments do not leak into another policy; incompatible fields reset visibly; registration matches selected policy.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-008 — All expiry presets and custom entry

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Choose each preset, type custom date/time, set past/invalid date, near-now and future; keep Review open past deadline.

**Expected:** Human-readable deadline matches UTC predicate to ledger seconds; expired terms cannot be signed; fresh validation on submission.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-009 — Vesting unlock boundaries

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Create disposable unlock schedule before/equal/after expiry and one valid future unlock; test claim just before/at/after unlock.

**Expected:** Impossible windows refused; on-chain predicate enforces unlock and expiry, not the browser clock.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-010 — Draft history and lost-navigation recovery

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Move through stages; browser Back/Forward; reload before and after export; navigate Go to campaign after confirmed funding.

**Expected:** No duplicate campaign or payment; loss of browser-only keys explained honestly; saved phrase/export recovers exact registered keys.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-011 — Review totals and batch-count consistency

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Review 3 equal prizes, 5 variable prizes and 90/91/200 boundaries under actual funding operation count.

**Expected:** Links shows exact integer, never dash; amount/reserve/fee-bid values match decoded transactions; sponsorship operations included in batch sizing.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-012 — Download cancelled or blocked

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Block download, cancel picker where applicable, click Generate again, attempt keyboard/programmatic Continue.

**Expected:** Cannot fund unexported/currently regenerated keys; download feedback actionable; no gate bypass.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-013 — Phrase import normalization and invalid checksum

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Privately enter numbered/space/newline phrase fixtures of supported lengths; test bad word/checksum, missing word and wrong renewal phrase.

**Expected:** Supported normalization succeeds; invalid phrase refuses without logging; mismatched renewal cannot replace registered keys.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-014 — Funding rejection and repeated click

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Cancel Freighter, lock wallet, double-tap Sign, approve then background browser and return.

**Expected:** No duplicate send; pending status reconciles; successful submission clears stale in-progress error; rejected signature leaves retryable draft.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-015 — Offline and unknown funding outcome

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Disconnect after wallet signs and after server broadcasts; reload and retry same intent.

**Expected:** Journal and hash lookup resolve before retry; one on-chain funding transaction; no false failure or extra debit.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CREATE-016 — Mainnet selector currently disabled

P0 | Positive + Negative + Boundary | Mainnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Inspect network selector and try direct public-network payload on Testnet deployment.

**Expected:** Unavailable Mainnet has explanation; server rejects network mismatch; no secret, queue or sponsor crossover.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-001 — One consistent template across policies

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Download OPEN, CODE, EMAIL and WALLET templates; compare common header order and additional required columns.

**Expected:** Shared core columns consistent; policy-specific Claim Code / Email Address / Wallet Address correctly appended; no secret in recipient-only template.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-002 — Wallet CSV ordered amount binding

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Import five controlled G-addresses with 20,15,10,5,5 and labels; review row order and funded claimants.

**Expected:** Top-to-bottom order preserved; total55; each balance bound to the correct wallet; recipient owner signature mandatory.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-003 — Wallet CSV wrong and duplicate recipients

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Test malformed/checksum-invalid, secret-shaped, funding address, duplicated valid address, blank middle row and mixed-network assumptions.

**Expected:** Unsafe/invalid rows refuse with row guidance; duplicate-address behavior explicitly shown without merging amounts or reordering; no invalid row silently skipped.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-004 — Email CSV parsing and normalization

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Import valid owned test mailbox aliases, mixed case, whitespace, invalid format, blank row and duplicate mailbox.

**Expected:** One valid assigned email per link; canonical binding consistent; duplicates do not mix links or remove mailbox throttling.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-005 — CSV syntax and encoding

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Upload quoted commas/newlines, escaped quotes, UTF-8 BOM, CRLF/LF, empty file, broken quote, duplicate/missing/unknown headers.

**Expected:** Documented formats parse consistently; malformed ambiguity refuses with row/header error; no shifted recipient/prize binding.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-006 — Wrong type and oversized file

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Upload XLSX renamed CSV, PDF, executable, huge byte/row file and max allowed rows+1; cancel chooser and upload again.

**Expected:** CSV-only accepted by content/parser checks as well as UI; bounded error without freeze, unsafe preview or partial registration.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-007 — Formula injection and HTML

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use labels beginning =,+,-,@ and markup in cells; export receipts/template and inspect safely as text.

**Expected:** Spreadsheet formula execution prevented for untrusted text; legitimate negative money still invalid; UI escapes markup.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-008 — Reimport and stale asynchronous parse

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Import A then immediately B, edit count/default and switch policies while parsing.

**Expected:** Only latest valid file drives review; no stale async result overwrites the chosen mapping.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-CSV-009 — Immutable recipient assignment

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Register email/wallet bindings; replay identical payload then same public keys with different assignment/order.

**Expected:** Identical retry idempotent; changed binding refuses atomically; no partial registrations or leaked recipient lists across orgs.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-001 — OPEN link happy path and bearer risk

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Claim controlled OPEN link in wallet A; try the same link in B after confirmation.

**Expected:** First authorized bearer claim pays once; second refuses. UI does not imply OPEN is address or email bound.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-002 — Claim code correct, wrong and replay

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use exported code with its matching link; try blank/wrong code, another link code and token replay.

**Expected:** Only matching verification advances; bounded guessing; token scoped to link; no code or token in logs/URL.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-003 — Code export and phrase recovery

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Regenerate CODE secrets export from original phrase/index and compare privately.

**Expected:** Codes, public keys and corresponding links recover exactly in stable order; no code is submitted during registration.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-004 — Wallet-bound wrong owner and tampering

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open bound link with wrong wallet; bypass UI with changed destination and altered reviewed XDR; cancel signer.

**Expected:** Assigned wallet signature and claimant checked at ledger level; wrong owner cannot redirect funds even if link/export leaks.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-005 — Bound wallet compatibility restrictions

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Enable wallet binding then try receive-as conversion or exchange memo deposit.

**Expected:** Unsupported combinations unavailable/refused; original asset and assigned address remain invariant.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-006 — Passkey registration, cancel and recovery

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use disposable browser profiles; enroll claim passkey, cancel prompt, replay challenge, try another origin/browser.

**Expected:** No bypass on cancellation or replay; challenge RP/origin scoped; recovery/unsupported-browser behavior accurate rather than silent OPEN downgrade.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-007 — Policy gate cannot be downgraded

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Alter claim-policy fields in registration, request body and persisted-cache fixture; remove mail credential mid-flow.

**Expected:** Enforced policy stays authoritative; configuration outage refuses securely; no upgrade/downgrade from client assertions.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-POLICY-008 — Security boundaries explained honestly

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Review help for OPEN/CODE/EMAIL/WALLET/PASSKEY; compare builders and off-app key possession.

**Expected:** OTP and claim code are Kleym application gates, not additional on-chain inbox/code signatures. Only wallet-bound policy enforces assigned owner on-chain.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-001 — Owned-inbox OTP desktop lifecycle

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Create/fund one EMAIL link for owned inbox; request OTP, enter privately, connect intended Freighter desktop wallet and claim.

**Expected:** Exactly reviewed USDC delivered once; no XLM top-up; safe receipt and independent ledger cleanup; queued mail not labelled delivered.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-002 — Owned-inbox OTP Android lifecycle

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Repeat EMAIL campaign creation/export/funding and receiving in Android Chrome and Freighter; switch sender to receiver.

**Expected:** Correct wallet after reconnect; no leave-page warning during intentional handoff; claim success resumes original tab; independent before/after balances.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-003 — OTP malformed, wrong, expired and replaced

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Try empty, letters, five/seven digits, five wrong guesses, expired10min code and old code after resend; then valid fresh code.

**Expected:** Validation precise; five guesses invalidate challenge; old/expired codes fail; newest valid code consumed once.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-004 — OTP verification token scope and TTL

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Obtain test token, use with another link and after30min, race two correct verifications and replay consumed code.

**Expected:** No cross-link authorization; expiry requires new challenge; exactly one successful consumption under concurrency.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-005 — OTP mailbox enumeration and settled links

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Request unknown, expired, suspended, claimed, redacted and valid bindings; compare public response and provider sends.

**Expected:** Uniform safe response; no assigned address or provider error disclosed; only eligible valid binding sends.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-006 — Shared Wi-Fi and individual rate limits

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use four distinct links/mailboxes on one IP, then one mailbox across four links and one link repeated eleven verifies; test aggregate300/301 and600/601 in fixtures.

**Expected:** Independent recipients retain budgets; three sends per link/mailbox, ten verifies per link, five guesses per challenge; aggregate bounds and Retry-After enforced.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-007 — Zender 429, 5xx, network timeout and 4xx

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Inject provider429/Retry-After,5xx,timeout,403,409,malformed202,suppressed response; inspect bounded retries.

**Expected:** Same body/key on transient retries; at most3within15s; honor budget; permanent errors not retried; no false delivered result or OTP body logged.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-008 — Queued status and dead monitor job

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Simulate accepted/queued/sent/delivered/bounced/failed; stop/restart worker and exhaust status polls.

**Expected:** Identifier-only job survives; sent/opened alone not delivery; terminal/exhausted observable; polling never resends OTP; retention bounded.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-009 — Web crash during email send

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Terminate isolated web after challenge creation/provider acceptance; restart and request new code.

**Expected:** No durable plaintext OTP retry payload; user can request replacement; earlier challenge invalidated; no automatic duplicate email on restart.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-010 — Email design across mail clients

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Inspect sanitized HTML/plaintext on Gmail desktop/Android, Outlook and dark mode; increase font size and select code.

**Expected:** Readable contiguous6digits,10min guidance, no subject OTP, no external assets/scripts or clipped code; no claim URL in email.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-011 — Provider absence and insufficient scope

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Remove Zender config in isolated env, use403 credential, missing emails:read and disabled application.

**Expected:** Creation option unavailable when unconfigured; existing EMAIL links remain gated; actionable operator error; browser never receives API key.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-012 — OTP reminders and template exclusion

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Attempt reusable EMAIL template and invitation/reminder sends for new OTP-only bindings; inspect legacy queued bearer jobs.

**Expected:** EMAIL recipient templates refused; no unsolicited invitation/claim URL; no unusable reminder controls; legacy bearer jobs held, not silently sent/deleted.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-EMAIL-013 — Sender authentication and tracking qualification

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Provider owner confirms SPF/DKIM/DMARC alignment and disabled open/click tracking; send to fresh owned mailbox.

**Expected:** Record authentication verdicts and placement, not private headers/code. Previous Not spam action and zero events alone do not prove general deliverability.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-001 — Campaign IDs and funding receipts visible

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open funded/partial/draft campaigns; refresh funding status and copy public IDs/hashes.

**Expected:** Campaign ID and each batch hash visible; explorer points to correct network; only ledger-confirmed funding marked confirmed.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-002 — List filters, paging and empty states

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use mixed statuses/assets, date range, search, page size and no-match; Back/Forward and reset.

**Expected:** Stable order/counts within org; no repeated/missing entries or zero-match crash; filter URL/history stays consistent.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-003 — Link table and safe export

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Page large mixed-status campaign; inspect custom amount/bound recipient/code-policy metadata and download receipts.

**Expected:** Stable per-row mapping; no server-generated bearer URL or recovery material; receipt totals match ledger and exact decimal values.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-004 — Suspend and resume boundaries

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** On disposable campaign/link pause before claim, during preparation and after submitted transaction; retry unauthorized role.

**Expected:** Suspension blocks future app admission but cannot reverse a confirmed ledger transfer or pretend to revoke a leaked key on-chain.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-005 — Expiry is eligibility, not automatic payout

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Leave unused link past chain deadline; observe status and connect sender for reclaim.

**Expected:** Deadline enables sender-signed reclaim; no guaranteed automatic transfer at expiry; worker cannot forge sender signature.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-006 — Refund and renewal exact accounting

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Claim two of three equal links; expire/reclaim third; renew once and race two renewal requests.

**Expected:** Exactly1refund and1renewal budget; original history retained; no additional unfunded promise or second independent spend; repeated request reuses same renewal.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-007 — Unsafe renewal refused

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Renew unexpired, partially reclaimed, missing receipt, zero returned or custom-amount campaign; alter sender/network/amount.

**Expected:** Clear documented refusal; no wallet debit or new campaign; variable prizes currently require separately reviewed new distribution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-008 — Templates CRUD and schedule boundaries

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Create non-email template; run now, enable/disable cadence, modify schedule/day/hour, remove while draft run exists; invalid cadence/time.

**Expected:** Owner-scoped changes; disabled schedule no new runs; each scheduled run is an unsigned draft requiring export and wallet approval.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-009 — Approvals self-approval and revoked member

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Create threshold case with two approvers; self-approve, approve twice, revoke membership, change campaign terms.

**Expected:** Required distinct authorized approvals; stale approvals cannot authorize changed payload; creator cannot bypass dual control.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-MANAGE-010 — History, receipts and valuation provenance

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Compare claim/refund hashes, ledger timestamps, unknown fees, v1/v2 archived signatures and current v3 receipts.

**Expected:** No invented timestamp/zero fee; historical signatures unchanged; correct actual asset and delivered amount; tampering fails verification.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-001 — Password field mobile geometry

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** At320/360/412px open Settings, focus both password fields, show keyboard, rotate, use200%text.

**Expected:** Inputs and submit usable with readable labels; no page-wide overflow, hidden focus or clipped controls.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-002 — API key create/read/write/revoke

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use disposable org key; issue minimal scope, copy one-time key, refresh, revoke and retry requests; test blank/max+1name.

**Expected:** Secret shown once, only hash retained; scope/rate/ownership enforced; immediate revocation; fresh factor gate honored.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-003 — Org membership and last owner

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Add existing/new user; change role/remove last owner/self; attempt forbidden viewer/operator operations.

**Expected:** Explicit allowed role matrix; cannot orphan org or elevate oneself; invitation not privileged until accepted; safe error.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-004 — Organisation form invalid values

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Try whitespace name, invalid approval threshold, approvals0/11, unsupported currency and non-HTTPS screening URL.

**Expected:** Boundary validation; no partial policy update; valid values persist after reload and apply server-side.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-005 — SSO and SCIM secret minimization

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Save disposable connection, edit without secret, rotate/revoke SCIM key and inspect page after reload.

**Expected:** Existing secret retained when blank by design; no recoverable secret in read API/HTML; changes require owner scope.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-SETTINGS-006 — Webhook URL and delivery failures

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Create scoped endpoint; test private/IP/redirect/DNS-change targets, bad signature,429/5xx,replay and revocation.

**Expected:** Egress guards fail closed; signed timestamped bounded delivery and retries; no claim secrets; disabled endpoint stops new sends.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-001 — Admin read and role isolation

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open all six admin routes as admin then sender/viewer with directURL/API; inspect tenant-scoped exports.

**Expected:** Admin only; unauthorized gets safe refusal; no cross-org secrets or sponsor credentials exposed.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-002 — User invitation and suspension

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use disposable user; cancel invitation dialog, invalid username, create/revoke, deactivate active session and try last-admin lockout.

**Expected:** Validation and confirmation correct; deactivation revokes sessions; no unintended real-account change.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-003 — Reconciliation dry run and resync

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Plant DB drift in isolated ledger fixture, run scoped resync, pause worker and restore; repeat same pass.

**Expected:** Chain wins; no duplicate journal/receipt; pending transactions not misclassified from temporary404; unauthorized resync refused.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-004 — Audit filters, paging and signed export

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Filter action/actor/campaign/date with invalid ranges and no-match; export and verify chain, tamper middle entry.

**Expected:** Scoped stable results; valid checkpoint signature; tampering detected; no credential, code or bearer payload.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-005 — Privacy erasure and retention

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use disposable EMAIL binding; redact, attempt OTP afterward, run retention twice, compare immutable receipt/audit.

**Expected:** PII erased only under documented scope; gate not downgraded; financial evidence preserved; unrelated org untouched.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-ADMIN-006 — Sponsor pool and stranded accounts

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Inject shortage, stale RPC, depleted sponsor and abandoned materialization; inspect status then recovery runbook.

**Expected:** Admission prevents unfunded obligations; chosen sponsor/sequence coordinated; persistent recipient reserves distinguished from temporary leaks; no unauthorized seedless recovery promise.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-001 — Mobile header navigation and history

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** At320,360,412px and landscape visit every menu using top navigation, close with Escape/Back/outside tap and switch routes.

**Expected:** Header/menu accessible; active route correct; focus restored; no bottom-nav overlap, jumping viewport or horizontal document overflow.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-002 — Keyboard, screen reader and motion

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Complete form navigation by keyboard and TalkBack/NVDA; test validation announcements, modal traps and prefers-reduced-motion.

**Expected:** Meaningful labels/focus/status; no keyboard trap; animation does not hide essential content; reduced motion respected.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-003 — Native Android input behavior

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In emulator Chrome enter decimal amounts/date, paste G-address, upload/download CSV and rotate with keyboard open.

**Expected:** Correct keyboards, caret/value preserved; input controls reachable; Downloads accessible; browser Back does not silently lose protected keys.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-004 — Desktop browser compatibility

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Run critical creation/export/claim/logout in Brave/Chrome, Firefox and WebKit/Safari with exact versions.

**Expected:** Supported flows meet same invariants; unsupported wallet provider has explicit fallback, not hanging button.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-005 — Freighter unavailable and connection cancel

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open mobile with app absent, expired pairing and denied connection; desktop without extension; choose manual address.

**Expected:** Correct platform-specific button only; actionable install/reconnect fallback; manual destination never substitutes for required sender/bound-wallet signature.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-006 — Chrome-to-Freighter return lifecycle

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Connect/sign on emulator and physical Android; background Chrome, switch account/network, cancel, return by Back and app switcher.

**Expected:** One pending operation; correct address/network revalidated; no leave-warning on deliberate handoff; no stale connected account or duplicate signing.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-007 — Empty, error, loading and unavailable states

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated responses for every page: empty200,401,403/404,409,429,500,timeout and offline then recover.

**Expected:** No endless spinner/raw stack; appropriate retry/read-only state; retained safe user input; no success until confirmed.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-UX-008 — Static website to app boundary

P1 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Open marketing root and all anchors/FAQ/Open App at desktop/mobile; follow login and Back to home in trusted frame fixture.

**Expected:** Correct separate HTTPSapp/login; no sponsor/database secrets or auth middleware on static site; no open redirect; frame origin remains allowlisted only.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-001 — Exact deployed version and runtime

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Compare GitSHA/tree/lock/runtime and web/worker/landing deployment IDs; query health/readiness and worker heartbeat.

**Expected:** All identify approved candidate; Node24.22.1; health not mistaken for worker/ledger readiness; no mismatch hidden by old deployment.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-002 — Dependency/runtime regression gates

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Run frozen install, production audit, typecheck, lint, tests, build and secret guards on exact candidate.

**Expected:** No failing gate or suppressed advisory; dependency/runtime fixes persist across Docker deployment, not only local machine.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-003 — Backup, restore and populated migration

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Restore encrypted backup into isolated env; migrate populated old data, validate receipts and queues, rehearse rollback.

**Expected:** Measured RPO/RTO recorded; no duplicate send from restored jobs; additive schema rollback preserves signed historical bytes; encryption keys restored privately.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-004 — Concurrent load and provider budgets

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Measure1/10/100concurrent claims and200/10000link source fixtures; inject rate limits and shared source contention without public abuse.

**Expected:** Exact once-only accounting; bounded queues/memory; agreed p95/p99 and error SLO measured before claiming capacity; no fabricated throughput from rate-limit constants.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-005 — External alerts and incident ownership

P0 | Positive + Negative + Boundary | Mainnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Trigger controlled queue failure, sponsor shortage, reconciliation drift, provider outage; deliver alert to approved operator.

**Expected:** Observed notification and acknowledged owner/escalation; logs-only state not called monitored; OTLPunset is recorded as unmet operational gate.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-006 — Network deployment separation

P0 | Positive + Negative + Boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated public-mode config test missing MainnetURL, wrong passphrase/issuer, mixed sponsor/queue/database namespace and Testnet link on public host.

**Expected:** Startup/admission refuses invalid identities; no chain crossover or shared real/test signing material.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-007 — Mainnet read-only rehearsal

P0 | Positive + Negative + Boundary | Mainnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Verify public Horizon identity, official issuer and unsigned review using no real secret or broadcast.

**Expected:** Zero asset writes; read-only rehearsal explicitly cannot qualify funded public transactions.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-OPS-008 — Mainnet controlled release gate

P0 | Positive + Negative + Boundary | Mainnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Require all mandatory Testnet cases, no unresolved critical/high findings, restore/alert/treasury ownership, approved domain and explicit live pilot decision.

**Expected:** Keep Mainnet disabled until sign-off; no arbitrary totalUSDCcap added; real transactions separately authorized and independently reconciled.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app; src/lib; AGENT.md; current feature docs; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-001 — Page contract: /admin/audit

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin/audit with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/audit/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-002 — Page contract: /admin/campaigns

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin/campaigns with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/campaigns/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-003 — Page contract: /admin

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-004 — Page contract: /admin/privacy

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin/privacy with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/privacy/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-005 — Page contract: /admin/reconciliation

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin/reconciliation with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/reconciliation/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-006 — Page contract: /admin/users

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /admin/users with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(admin)/admin/users/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-007 — Page contract: /settings/security

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /settings/security with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(mfa)/settings/security/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-008 — Page contract: /claim

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /claim with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/claim/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-009 — Page contract: /invite/[token]

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /invite/[token] with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/invite/[token]/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-010 — Page contract: /login/mfa

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /login/mfa with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/login/mfa/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-011 — Page contract: /login

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /login with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/login/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-012 — Page contract: /login/sso

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /login/sso with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/login/sso/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-013 — Page contract: /

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open / with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-014 — Page contract: /status

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /status with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(public)/status/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-015 — Page contract: /approvals

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /approvals with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/approvals/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-016 — Page contract: /campaigns/new

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /campaigns/new with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/campaigns/new/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-017 — Page contract: /campaigns

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /campaigns with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/campaigns/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-018 — Page contract: /campaigns/[id]/links

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /campaigns/[id]/links with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/campaigns/[id]/links/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-019 — Page contract: /campaigns/[id]

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /campaigns/[id] with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/campaigns/[id]/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-020 — Page contract: /dashboard

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /dashboard with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/dashboard/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-021 — Page contract: /history

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /history with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/history/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-022 — Page contract: /settings

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /settings with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/settings/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-023 — Page contract: /templates

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /templates with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/templates/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-PAGE-024 — Page contract: /templates/[id]

P1 | Negative | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** 1. Open /templates/[id] with correct role and valid fixture ID. 2. Exercise each visible control against the Controls sheet, including Cancel/Back/empty search. 3. Reload, navigate away/back, repeat at360px and200%text. 4. Use missing/foreign ID and wrong role. Do not submit live administrative or financial mutations.

**Expected:** Correct heading, route, role and state; no broken navigation, unhandled error, hidden essential controls or foreign data. Each conditional control requires its own recorded actual/evidence row.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/(sender)/templates/[id]/page.tsx; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-001 — GET /api/admin/audit/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/audit/export/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-002 — GET /api/admin/audit/verify

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/audit/verify/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-003 — POST /api/admin/privacy/erase

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/privacy/erase/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-004 — POST /api/admin/reconcile

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/reconcile/route.ts:21; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-005 — POST /api/admin/users

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/users/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-006 — DELETE /api/admin/users/[id]/invitation

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/users/[id]/invitation/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-007 — PATCH /api/admin/users/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/admin/users/[id]/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-008 — POST /api/auth/login

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/login/route.ts:26; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-009 — POST /api/auth/logout

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/logout/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-010 — POST /api/auth/mfa/passkey/authenticate/options

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/passkey/authenticate/options/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-011 — POST /api/auth/mfa/passkey/authenticate

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/passkey/authenticate/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-012 — POST /api/auth/mfa/passkey/register/options

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/passkey/register/options/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-013 — POST /api/auth/mfa/passkey/register

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/passkey/register/route.ts:15; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-014 — DELETE /api/auth/mfa/passkey/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/passkey/[id]/route.ts:13; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-015 — GET /api/auth/mfa/status

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/status/route.ts:9; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-016 — POST /api/auth/mfa/totp/confirm

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/totp/confirm/route.ts:15; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-017 — POST /api/auth/mfa/totp/enrol

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/totp/enrol/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-018 — POST /api/auth/mfa/totp/remove

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/totp/remove/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-019 — POST /api/auth/mfa/verify

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/mfa/verify/route.ts:23; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-020 — POST /api/auth/password

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/password/route.ts:35; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-021 — GET /api/auth/session

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/session/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-022 — GET /api/auth/sso/callback

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/sso/callback/route.ts:26; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-023 — GET /api/auth/sso/start

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/auth/sso/start/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-024 — GET /api/campaigns

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/route.ts:31; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-025 — POST /api/campaigns

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/route.ts:72; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-026 — GET /api/campaigns/[id]/approvals

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/approvals/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-027 — POST /api/campaigns/[id]/approvals

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/approvals/route.ts:27; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-028 — POST /api/campaigns/[id]/batches/prepare

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/batches/prepare/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-029 — POST /api/campaigns/[id]/batches/retry

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/batches/retry/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-030 — GET /api/campaigns/[id]/batches

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/batches/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-031 — POST /api/campaigns/[id]/batches/submit

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/batches/submit/route.ts:28; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-032 — POST /api/campaigns/[id]/deliver

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/deliver/route.ts:65; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-033 — POST /api/campaigns/[id]/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/export/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-034 — GET /api/campaigns/[id]/links

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/links/route.ts:29; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-035 — POST /api/campaigns/[id]/links

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/links/route.ts:67; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-036 — GET /api/campaigns/[id]/links/[linkId]/receipt

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/links/[linkId]/receipt/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-037 — PATCH /api/campaigns/[id]/links/[linkId]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/links/[linkId]/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-038 — POST /api/campaigns/[id]/links/[linkId]/suspend

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/links/[linkId]/suspend/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-039 — GET /api/campaigns/[id]/outstanding

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/outstanding/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-040 — GET /api/campaigns/[id]/receipts

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/receipts/route.ts:24; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-041 — POST /api/campaigns/[id]/reclaim/prepare

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/reclaim/prepare/route.ts:25; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-042 — POST /api/campaigns/[id]/reclaim/submit

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/reclaim/submit/route.ts:26; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-043 — GET /api/campaigns/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-044 — PATCH /api/campaigns/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/route.ts:59; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-045 — POST /api/campaigns/[id]/suspend

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/suspend/route.ts:21; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-046 — GET /api/campaigns/[id]/template

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/campaigns/[id]/template/route.ts:11; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-047 — POST /api/claims/code/verify

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/code/verify/route.ts:27; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-048 — POST /api/claims/federation

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/federation/route.ts:92; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-049 — POST /api/claims/otp/request

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/otp/request/route.ts:35; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-050 — POST /api/claims/otp/verify

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/otp/verify/route.ts:34; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-051 — POST /api/claims/passkey/authenticate/options

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/passkey/authenticate/options/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-052 — POST /api/claims/passkey/authenticate

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/passkey/authenticate/route.ts:23; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-053 — POST /api/claims/passkey/register/options

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/passkey/register/options/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-054 — POST /api/claims/passkey/register

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/passkey/register/route.ts:26; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-055 — POST /api/claims/prepare/claim

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/prepare/claim/route.ts:34; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-056 — POST /api/claims/prepare/materialise

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/prepare/materialise/route.ts:33; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-057 — POST /api/claims/quote

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/quote/route.ts:33; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-058 — GET /api/claims/resolve

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/resolve/route.ts:24; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-059 — POST /api/claims/submit

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/claims/submit/route.ts:28; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-060 — GET /api/health

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/health/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-061 — POST /api/invite/redeem

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/invite/redeem/route.ts:30; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-062 — GET /api/org/accounting/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/accounting/export/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-063 — GET /api/org/audit/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/audit/export/route.ts:12; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-064 — GET /api/org/compliance/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/compliance/export/route.ts:16; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-065 — GET /api/org/members

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/members/route.ts:16; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-066 — POST /api/org/members

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/members/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-067 — PATCH /api/org/members/[userId]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/members/[userId]/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-068 — DELETE /api/org/members/[userId]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/members/[userId]/route.ts:36; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-069 — GET /api/org/receipts

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/receipts/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-070 — GET /api/org

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-071 — PATCH /api/org

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/route.ts:28; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-072 — GET /api/org/sso

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/sso/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-073 — PUT /api/org/sso

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PUT with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/sso/route.ts:27; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-074 — DELETE /api/org/sso

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/sso/route.ts:44; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-075 — POST /api/org/sso/scim-tokens

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/sso/scim-tokens/route.ts:15; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-076 — DELETE /api/org/sso/scim-tokens/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/sso/scim-tokens/[id]/route.ts:11; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-077 — POST /api/org/switch

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/switch/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-078 — GET /api/org/webhooks

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/webhooks/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-079 — POST /api/org/webhooks

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/webhooks/route.ts:24; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-080 — GET /api/org/webhooks/[id]/deliveries

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/webhooks/[id]/deliveries/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-081 — DELETE /api/org/webhooks/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/webhooks/[id]/route.ts:15; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-082 — PATCH /api/org/webhooks/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/org/webhooks/[id]/route.ts:23; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-083 — GET /api/ready

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/ready/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-084 — GET /api/scim/v2/Groups

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-085 — POST /api/scim/v2/Groups

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/route.ts:21; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-086 — GET /api/scim/v2/Groups/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/[id]/route.ts:12; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-087 — PUT /api/scim/v2/Groups/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PUT with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/[id]/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-088 — PATCH /api/scim/v2/Groups/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/[id]/route.ts:30; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-089 — DELETE /api/scim/v2/Groups/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Groups/[id]/route.ts:41; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-090 — GET /api/scim/v2/ServiceProviderConfig

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/ServiceProviderConfig/route.ts:7; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-091 — GET /api/scim/v2/Users

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-092 — POST /api/scim/v2/Users

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-093 — GET /api/scim/v2/Users/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/[id]/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-094 — PUT /api/scim/v2/Users/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PUT with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/[id]/route.ts:30; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-095 — PATCH /api/scim/v2/Users/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/[id]/route.ts:42; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-096 — DELETE /api/scim/v2/Users/[id]

P0 | API contract / authorization / boundary | Configured feature | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/scim/v2/Users/[id]/route.ts:66; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-097 — GET /api/settings/api-keys

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/settings/api-keys/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-098 — POST /api/settings/api-keys

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/settings/api-keys/route.ts:34; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-099 — DELETE /api/settings/api-keys/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/settings/api-keys/[id]/route.ts:19; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-100 — GET /api/status

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/status/route.ts:10; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-101 — GET /api/stellar/account

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/stellar/account/route.ts:22; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-102 — GET /api/stellar/network

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with intended public proof/schema. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/stellar/network/route.ts:8; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-103 — GET /api/stellar/reserve

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/stellar/reserve/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-104 — GET /api/templates

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-105 — POST /api/templates

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/route.ts:29; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-106 — GET /api/templates/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/[id]/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-107 — PATCH /api/templates/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PATCH with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/[id]/route.ts:29; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-108 — DELETE /api/templates/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid DELETE with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/[id]/route.ts:55; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-109 — POST /api/templates/[id]/run

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/[id]/run/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-110 — GET /api/templates/[id]/runs

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/templates/[id]/runs/route.ts:11; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-111 — GET /api/v1/campaigns

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/route.ts:31; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-112 — POST /api/v1/campaigns

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/route.ts:72; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-113 — POST /api/v1/campaigns/[id]/batches/prepare

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/batches/prepare/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-114 — POST /api/v1/campaigns/[id]/batches/submit

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/batches/submit/route.ts:20; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-115 — POST /api/v1/campaigns/[id]/export

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/export/route.ts:17; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-116 — GET /api/v1/campaigns/[id]/links

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/links/route.ts:34; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-117 — POST /api/v1/campaigns/[id]/links

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/links/route.ts:76; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-118 — GET /api/v1/campaigns/[id]

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/campaigns/[id]/route.ts:15; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-119 — GET /api/v1/templates

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid GET with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/templates/route.ts:11; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-120 — PUT /api/v1/templates/[id]/recipients

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid PUT with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/templates/[id]/recipients/route.ts:47; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-API-121 — POST /api/v1/templates/[id]/run

P0 | API contract / authorization / boundary | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** In isolated fixture server: 1. Send valid POST with required session/key/SCIM credential and least-privileged role. 2. Repeat missing/expired/wrong-scope credential, foreign object ID and unknown ID. 3. For bodies test malformed JSON, extra fields, secret-shaped fixture, wrong types and schema boundaries. 4. For mutation replay identical idempotency key, changed-body key and concurrent calls; for reads test stable pagination/query bounds. 5. Compare durable state before/after every rejected request.

**Expected:** Valid request follows its handler contract; expected4xx uses safe problem details and leaves state unchanged; no authorization/seed bypass, duplicate asset action or private data. Public routes are not incorrectly expected to require an admin session. Record exact code from applicable handler before execution.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/app/api/v1/templates/[id]/run/route.ts:18; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-001 — Claim screen: loading

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach loading; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-002 — Claim screen: invalid

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach invalid; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-003 — Claim screen: ready

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach ready; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-004 — Claim screen: otp_required

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach otp_required; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-005 — Claim screen: code_required

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach code_required; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-006 — Claim screen: passkey_required

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach passkey_required; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-007 — Claim screen: email_only

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach email_only; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-008 — Claim screen: wallet_connecting

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach wallet_connecting; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-009 — Claim screen: preparing

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach preparing; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-010 — Claim screen: materialising

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach materialising; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-011 — Claim screen: awaiting_ledger

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach awaiting_ledger; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-012 — Claim screen: awaiting_signature

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach awaiting_signature; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-013 — Claim screen: submitting

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach submitting; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-014 — Claim screen: claimed_success

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach claimed_success; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-015 — Claim screen: already_claimed

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach already_claimed; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-016 — Claim screen: expired

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach expired; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

### KLM-V2-STATE-017 — Claim screen: failed

P0 | State transition | Testnet release | Not Run

**Preconditions:** Frozen candidate; isolated migrated DB/Redis and disposable fixtures for mutations. Live browser reads may use the team Testnet host. Wallet signs remain deliberate and private.

**Steps:** Use isolated claim-page/API fixture to reach failed; check copy, visible actions, busy/disabled states, screen-reader announcement, retry/cancel and reload at desktop and360px. If a transaction is pending, preserve its exact hash and materialisation state.

**Expected:** Designed state is reachable under intended conditions; no premature success, duplicate materialisation, secret display or incorrect retry target. Terminal states cannot pay again; transient failures allow safe recovery.

**Evidence:** Exact candidate, input fixture ID, expected/actual result, safe screenshot or response, and durable-state/ledger checks where relevant. No OTP, token, phrase, private CSV or full claim URL.

**Source/harness:** src/lib/claim/machine.ts; e2e/claim-page.spec.ts; Current source tests + isolated API fixture; real UI/device/ledger when named

