# Kleym comprehensive Testnet test plan v1

Prepared 2026-10-08. 118 cases. All new cases: **Not Run**. Owner review and candidate freeze required before execution.

## 0. Scope and qualification boundary

This is a detailed plan for the current Kleym source candidate, not a completed full-wallet or Mainnet test report. Classic Stellar claimable balances, sponsor-funded XLM fees/reserves and sender-owned USDC are under test. Lantern plans provide test discipline, not their contract IDs, scanner risk rules or registry assumptions. Source access is available for Kleym; Lantern artifacts remain packaged builds.
Freeze the final feature commit and deployment identity before execution. Initial cases are Not Run. Local development proof is listed separately; it cannot qualify a different deployed build. Railway remains paused. No service restart, wallet approval, asset movement or Lantern rebuild is authorized by generating this plan.

## 1. Entry gates and exact environment

G0: record feature commit, clean/dirty source state, lockfile hash, build mode, generated client version, runtime versions and manifest. Halt on unknown candidate.
G1: use disposable isolated migrated PostgreSQL and Redis, restorable fixtures, safe credential injection and reachable approved Horizon. Current local Docker/DB environment is unavailable; infrastructure execution is gated.
G2: owner approves small Testnet balances and signs privately; official Testnet USDC issuer is GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5; passphrase Test SDF Network ; September 2015; Horizon https://horizon-testnet.stellar.org. Verify live provider identity before each write. Testnet resets require new snapshots, not recycled historical passes.
G3: approved public HTTPS candidate, exact browser/device/wallet versions and WalletConnect origin configured. Public host previously used: https://kleym-web-testnet.up.railway.app, currently paused; this plan does not assert availability.
G3-Lantern: senior supplies rebuilt curated Apps entry with session=true for exact Kleym origin, verified installed extension ID and Android https://android.golantern.xyz origin. Packaged 0.6.2 does not list Kleym. Generic URL sandbox is not a substitute.

## 2. Fixtures, budgets and lifecycle matrix

Provision two separate sender modes: literal zero XLM with sponsored account+official USDC trustline, and funded/nonzero XLM. Each must own enough test USDC. Use three recipient modes: absent account, existing zero XLM without USDC trustline, existing zero XLM with official USDC trustline. Use six independent small campaigns to cover all sender/recipient combinations; do not mutate a shared wallet while another case depends on its before state.
Primary tutorial fixture: three links x 1 USDC; A desktop claim, B Android claim, C unused until expiry reclaim. Final net sender debit 2 USDC, two distinct recipients gain 1 each, third balance removed only after sender reclaim; sponsor pays charged fees and reserves. Keep A/B separate recipients for clear snapshots.
Custom prizes fixture: 20,15,10,5,5 = 55 USDC. Capacity fixture: 200 x 1 = 200 USDC, only after operator approves operational budget. Pure int64 extreme amounts never go on-chain. Frozen trustlines use a disposable custom issuer fixture, never tamper with Circle USDC.
Always record base reserve from ledger. Claimable balance with two claimants costs 2 reserve units. Temporary claim account costs 2 plus trustline 1; recipient persistent additions: absent account 3, existing no-trustline 1, already-trusting 0. Sponsor numSponsoring includes unrelated liabilities; use differences and explain retained entries. Fee bid is an upper offer, actual charged fee comes from Horizon. Account spendable = native minus minimum reserve and native selling liabilities.

## 3. First guided run: three links, three outcomes

1. Pass G0-G3, privately select the intended Testnet sender and record public before balances. Set count 3/amount 1 and a near-future custom expiry that allows both claims.
2. Review exact total, official asset, sponsor reserve/fee bid and expiry UTC. Generate locally and privately save phrase/export. Give no keys, full CSV or claim URLs to logs/chat.
3. Sign exactly the reviewed funding batch; wait for all three funded balances and independent ledger confirmation before sharing. Save public hash/IDs only.
4. Open A privately on desktop, connect recipient then deliberately claim. Record materialisation ledger and strictly later claim ledger, exact USDC credit, zero-XLM state and temporary account removal.
5. Open B privately on Android Chrome/Freighter. Connection does not claim. Explicitly review and approve Claim in wallet; return for confirmed receipt. Lantern repeats require curated rebuilt package first.
6. Leave C unused. After actual on-chain expiry, sender approves reclaim returning exactly 1 USDC. Independently verify recipient balances unchanged and two claimant reserve units released.
7. Refresh campaign, verify statuses and signed receipts. Retry only exact unresolved transaction hashes; never repeat successful funding/claim to obtain a screenshot. Preserve private backups before closing tabs.

## 4. Execution order and evidence discipline

Run G0 identity and secret-handling checks first; then pure D1/D2 fixtures; real isolated DB/concurrency/recovery; small wallet D1/D3 lifecycle; custom-prize and 200-link performance/capacity; D4 operational qualification. Re-run affected lifecycle and fault cases after code changes. Split source fixture proof from physical device and independently confirmed ledger proof.
Case IDs KLM-D1..D4-AREA-NNN are stable. Status: Not Run -> Ongoing -> Passed/Failed/Blocked; Failed -> For Re-test -> Passed/Failed. Blocked means a named missing prerequisite/proof; record whether infrastructure, dependency, product gap or tester access. N/A requires owner-approved scope reason, never a substitute for missing proof.
For every execution record candidate, UTC time, tester, expected, observed, evidence and defect when Failed. Store files under evidences/runs/<run-id>/<case-id>/; filenames <case-id>_<UTC>_<sequence>. Capture before/after JSON, exact public transaction hashes/ledgers, decoded operations and database journal states. Screenshot explorer/UI with private address bar/phrases/keys excluded. HAR/traces may contain bearer request data: use allowlisted metadata capture or sanitize offline before sharing.
Defect report must name reproducible steps, concrete impact, exact candidate/environment, expected versus actual, severity and priority, source/evidence location and known dependencies. Do not label an unreachable environment a product failure. A negative test passes only when it refuses for the intended reason with no unauthorized financial/state effects.

## 5. Stop conditions and release criteria

Stop immediately on seed/phrase/bearer disclosure, unintended signing/submission, wrong network/issuer, unexplained principal loss, double payout, missing required signature enforcement, invalid source admission, false ledger success or candidate identity mismatch. Capture only safe evidence and keep affected funds isolated.
P0 money, signing, authorization, journal/recovery and release-gate cases must pass on the frozen candidate with required DB/device/ledger evidence. Any Failed/Blocked/Not Run mandatory case prevents release sign-off. P1 usability findings require explicit owner disposition; excluded cases need reason and owner. Performance SLO, caps, capital, incident/refill ownership, RTO/RPO and rollback triggers must be decided and measured.
No blanket Mainnet-ready claim follows from this plan or local green tests. Mainnet is a separate capped pilot requiring verified Testnet coverage, populated migration/restore, egress enforcement, queue/incident rehearsal and explicit owner approval. Kleym operational treasury sponsors XLM; sender treasury controls USDC principal. Hot/cold split is a design guideline, not an implemented automated refill guarantee.

## 6. Reference adaptation and known gaps

Lantern D1: borrowed independent before/after money and state accounting, exact artifact identity, negative authorization and hard-stop gates. Kleym uses classic transactions; Lantern Soroban registry IDs, admin operations and fees do not apply.
Lantern D2: borrowed deterministic fixture expectations, malformed/tampered payloads, unavailable dependency handling and source/package separation. Kleym signature/hash/asset/network checks define acceptance; scanner verdict policy is not copied.
Lantern D3 build acceptance and extension plan: borrowed installed artifact hashes, supported-platform repeat, pre-sign review/cancel, actual-versus-spec deviation register and physical device proof. Mock parent tests are not actual Lantern signatures.
Lantern D4 v3: borrowed independent cold reviewer, public URL usability, offline/unavailable honesty, privacy/accessibility and row-by-row evidence/coverage. Kleym requires authenticated sender and wallet signatures; D4 demo no-wallet promises are not copied.
Known release gaps: local dependency audit reports 34 advisories including critical/high (qualify with supported pnpm; remediate/assess); unavailable current local PG/Redis qualification; actual curated Lantern rebuild; latest physical Android signing; SDK delayed multibatch behavior (#105); ledger receipt timestamp parity (#110); DNS/socket egress (#107); bearer-email gate (#108); lifecycle caps and runbooks (#103/#113); pilot approval (#115). Variable-amount renewal currently refuses and is not advertised as supported. GitHub issues are closed only against their full acceptance criteria.

## D1: Protocol, campaign terms and ledger accounting

### KLM-D1-TER-001 — Equal prizes: three 1-USDC links

**P1 | Positive | Not Run | #99,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create a campaign with count 3, amount 1 and a future custom expiry. Review; save export privately. Fund once after approval.

**Expected:** Declared total is exactly 3.0000000 USDC; three distinct public link keys; only funded links can be shared.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-TER-002 — Custom prizes: 20, 15, 10 and two default 5

**P0 | Positive | Not Run | #99,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create count 5/default 5. Set rows 1-3 to 20,15,10; leave rows 4-5 unchanged. Review, export and inspect public registration.

**Expected:** Row order is stable; amounts are 20,15,10,5,5; exact total 55.0000000; labels, CSV and ledger amounts match.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-TER-003 — Edit custom prizes across pages

**P1 | Positive | Not Run | #99,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create 25 rows/default 5. Override row 1 and row 21. Move next/back through all pages and return to review.

**Expected:** Overrides persist at their original indices; no duplicate rows or lost edits; displayed total equals exact decimal sum.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-TER-004 — Shrink and expand the recipient count

**P1 | Positive | Not Run | #99,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Set overrides on rows 1 and 12; shrink count to 10; inspect review. Expand back to 12 and inspect again.

**Expected:** Only current rows affect totals. Removed overrides never silently fund additional rows; new rows use displayed default.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-TER-005 — Change default with existing overrides

**P1 | Positive | Not Run | #99,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Override one row, change default 5 to 7, then review and export the current list.

**Expected:** Explicit override is preserved; remaining rows reflect current default; review is the exact list sent for registration.

**Evidence:** Review screenshot without phrase/keys; redacted CSV index/amount comparison; public registration and ledger JSON.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-AMT-001 — Minimum positive amount

**P0 | Boundary | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 0.0000001 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Accept exactly one stroop; no rounding to zero.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-002 — Zero / negative / text / exponent

**P0 | Negative | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 0; -1; abc; 1e3 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Refuse each with a useful amount error; no registration or wallet request.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-003 — Eighth decimal place

**P0 | Negative | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 1.12345678 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Refuse rather than round or truncate.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-004 — Maximum classic int64 amount

**P0 | Boundary | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 922337203685.4775807 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Pure validation accepts the exact maximum. Do not attempt funding this boundary fixture.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-005 — Amount one stroop above int64

**P0 | Negative | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 922337203685.4775808 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Pure validation rejects overflow before envelope creation.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-AMT-006 — Exact aggregate and persistence precision

**P0 | Boundary | Not Run | #99,#114**

**Preconditions:** Pure amount fixtures; isolated migrated PostgreSQL required only for DB precision assertion.

**Steps:** Validate 20;15;10;5;5;0.0000001 through client and API schemas; inspect exact normalized strings; attempt no chain write for extreme fixtures.

**Expected:** Decimal/stroop total is 55.0000001; DB round trip retains all seven decimal places.

**Evidence:** Validator output and API error; sanitized DB round-trip record when applicable.

**Harness / mode:** tests/lib/stellar/amount.test.ts; tests/lib/api/prize-registration.test.ts; isolated DB

### KLM-D1-EXP-001 — Relative expiry buttons

**P1 | Boundary | Not Run | #100,#114**

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Select 1 hour, 24 hours, 7 days and 30 days from a fixed clock; inspect local and UTC summary for each.

**Expected:** Each deadline is rounded to minute precision without shortening the selected interval; rerenders do not extend it.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Harness / mode:** tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-002 — Custom date and time entry

**P1 | Boundary | Not Run | #100,#114**

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Choose Custom; type a future complete date/time; tab through fields and inspect the review summary.

**Expected:** Typed date/time works without calendar dragging; visible timezone and UTC conversion agree with submitted expiry.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Harness / mode:** tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-003 — Invalid or past deadline

**P1 | Negative | Not Run | #100,#114**

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Try empty, partial, impossible calendar date, current instant and past time; continue after each.

**Expected:** Refuse each invalid/past expiry with a useful inline message; no keys generated or funding prepared.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Harness / mode:** tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-004 — Timezone and DST boundaries

**P1 | Boundary | Not Run | #100,#114**

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Run browser fixtures in Asia/Manila and America/New_York; test DST skipped and repeated local times.

**Expected:** Skipped local times are refused; chosen offset on a repeated hour is preserved; server and reviewed predicate agree.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Harness / mode:** tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-EXP-005 — Expiry while review stays open

**P1 | Negative | Not Run | #100,#114**

**Preconditions:** Isolated clock fixtures first; live stale-review case uses approved small Testnet campaign.

**Steps:** Hold a saved draft until its expiry, then try prepare/sign without changing the reviewed deadline.

**Expected:** Reject stale expiry; never silently extend a previously reviewed balance predicate.

**Evidence:** Local/UTC screenshots; fixed-clock output; submitted predicate timestamps.

**Harness / mode:** tests/lib/campaign/expiry.test.ts; manual browser

### KLM-D1-KEY-001 — Private export is a funding gate

**P0 | Security | Not Run | #108,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Generate keys; try sign before saving export. Save it privately and retry.

**Expected:** Funding stays blocked before export acknowledgment; save unlocks review/sign; no secret reaches the server.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Harness / mode:** e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-002 — Recovery phrase normalization

**P0 | Security | Not Run | #108,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Privately generate a disposable phrase, then paste it as words and as a numbered list in a new draft; compare public key derivation.

**Expected:** Valid supported BIP39 phrase normalizes deterministically; invalid checksum refuses. Never use a Freighter wallet phrase as test data.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Harness / mode:** e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-003 — Lost export recovery from saved phrase

**P0 | Security | Not Run | #108,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** In a clean tab restore the campaign phrase and original derivation index/count; compare public keys offline.

**Expected:** Same phrase/index recreates the same keys; wrong phrase/index does not. Kleym cannot recover missing private material.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Harness / mode:** e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-KEY-004 — Fragment removal and data minimization

**P0 | Security | Not Run | #108,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Open a disposable private claim locally; inspect address bar and sanitized request body after initialization.

**Expected:** Fragment is cleared from visible history; only public key and signatures/intended public fields leave the browser; no full bearer URL in evidence.

**Evidence:** Screenshots with private regions excluded; allowlisted request fields; offline public-key comparison.

**Harness / mode:** e2e/csv-gate.spec.ts; tests/lib/campaign/derive.test.ts; manual

### KLM-D1-MAT-001 — USDC lifecycle: literal-zero-XLM sponsored sender; absent account

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and absent account; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-002 — USDC lifecycle: literal-zero-XLM sponsored sender; existing zero-XLM account without USDC trustline

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and existing zero-XLM account without USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-003 — USDC lifecycle: literal-zero-XLM sponsored sender; existing zero-XLM account with USDC trustline

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision literal-zero-XLM sponsored sender and existing zero-XLM account with USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-004 — USDC lifecycle: funded sender with nonzero XLM; absent account

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and absent account; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-005 — USDC lifecycle: funded sender with nonzero XLM; existing zero-XLM account without USDC trustline

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and existing zero-XLM account without USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-MAT-006 — USDC lifecycle: funded sender with nonzero XLM; existing zero-XLM account with USDC trustline

**P0 | Positive | Not Run | #97,#98,#99,#100,#101**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Provision funded sender with nonzero XLM and existing zero-XLM account with USDC trustline; reserve/capacity snapshots recorded.

**Steps:** Create two distinct 1-USDC links: one claim and one expiry reclaim. Fund; inspect both balances. Materialise first link; wait for a strictly later ledger; explicitly claim. After the second expiry, sender approves reclaim.

**Expected:** Sender supplies exactly 2 USDC, receives exactly 1 back; recipient gains exactly 1. Sponsor pays actual fees/reserves. Zero-XLM actors remain zero. Temporary account/trustline removed, persistent recipient entries correctly sponsored.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Include materialisation hash and ledger, claim hash and later ledger, reclaim hash; IDs removed independently.

**Harness / mode:** scripts/verify-sponsored-funding.ts; scripts/verify-app-lifecycle.ts plus fresh supported-wallet approvals

### KLM-D1-FUN-001 — Funding envelope ownership

**P0 | Regression | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Prepare a fresh 3-link USDC campaign; decode operations, source accounts, signers, asset and predicates before approving.

**Expected:** Classic source is operational sponsor; sender supplies principal in createClaimableBalance ops; sponsoring brackets wrap funding; no fee bump substitutes for reserve sponsorship.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-002 — Funding signer rejection

**P0 | Negative | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Remove sender signature, then sponsor signature from disposable prepared fixture; submit to isolated API.

**Expected:** Missing/wrong required signature is refused before network submission; pending journal cannot mark funding confirmed.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-003 — Balance ID derivation and reserve units

**P0 | Regression | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Fund 3 links once; compare stored IDs against createClaimableBalance operation order and Horizon.

**Expected:** Three exact asset/amount/claimant predicates and balance IDs match; sponsor adds 6 reserve units for two claimants per balance.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-004 — 200 links across batches

**P0 | Regression | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** With approved Testnet budget, create 200 one-USDC links; prepare and sign sequentially using configured batch size; wait for every batch confirmation.

**Expected:** All 200 IDs unique and confirmed exactly once. Number/signature count follows effective per-envelope operation cap; no invalid >100-op envelope; campaign active only after all required confirmations.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-005 — Principal shortage

**P0 | Negative | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use sender with 2 USDC and request three 1-USDC links; try funding.

**Expected:** Fresh preflight refuses insufficient USDC before wallet signature; no link marked funded or active.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-006 — Sponsor shortage / liabilities

**P0 | Negative | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use isolated sponsor fixtures with low spendable XLM and native selling liabilities; prepare full remaining campaign.

**Expected:** Spendable uses fresh base reserve, entries, sponsorship and selling liabilities; insufficient full remaining capacity refuses before signing.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-007 — Account clone and sequence stability

**P0 | Regression | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Prepare twice from shared account fixture and compare originals; then perform actual sequential confirmed batches in isolated harness.

**Expected:** SDK builder does not mutate cached sender/sponsor account records; each accepted envelope uses coordinated correct source sequence.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-FUN-008 — Legacy native-XLM compatibility

**P0 | Regression | Not Run | #98,#99,#103,#105**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Create a small XLM campaign using explicitly approved test identity with spendable XLM; fund, claim and reclaim unused balance.

**Expected:** Legacy native funding path remains compatible; exact native principal, fees and reserves reconcile; sponsor policy follows reviewed envelope.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded.

**Harness / mode:** tests/lib/api/prize-funding.test.ts; verify-sponsored-funding; verify-batches; wallet

### KLM-D1-SET-001 — Claim exactly once

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** For a funded link, connect recipient; record no mutation on connect; claim once and reload/click again.

**Expected:** Only explicit claim moves funds; exact amount credited once; claimed screen shows confirmed hash; repeated claim cannot pay again.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-002 — One-stroop custom claim

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Fund a custom 0.0000001-USDC link after approval; claim to trusted recipient.

**Expected:** Recipient gets exactly 0.0000001; totals and receipt preserve seven decimals; no zero rounding.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-003 — Frozen / unauthorized / full trustline

**P0 | Negative | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use disposable issuer fixture with unauthorized or full receiving trustline; try prepare and claim.

**Expected:** Refuse unusable destination without losing balance or misreporting success; Circle USDC must not be altered for this test.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-004 — Claim before / at / after expiry

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Using controlled ledger close-time fixture, test T-1,T,T+1. In approved live boundary run, compare actual Horizon predicate seconds and ledger close time.

**Expected:** Ephemeral claimant eligible only abs_before T; sender reclaim eligible at/after T. Host clock and millisecond UI cannot redefine predicate.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-005 — Temporary reserve release

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Record sponsor before materialisation, after materialisation and after claim. Independently check temporary account absence and removed balance.

**Expected:** Temporary account 2 plus trustline 1 reserve units released; claimable-balance 2 units released; permanent recipient sponsored entries remain and are separately explained.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-006 — Sender-authorized reclaim after expiry

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Keep third link unused. Wait for on-chain expiry; select sender; review single reclaim amount/signers; approve once.

**Expected:** Unused 1 USDC returns only to original sender; balance disappears; 2 claimant reserve units released; sponsor pays actual fee; recipient state unchanged.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-007 — Pre-expiry reclaim / wrong sender

**P0 | Negative | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Try reclaim one second before deadline and with another sender identity in controlled API/ledger fixtures.

**Expected:** Refuse both; no sender refund, no removed balance and no journal settlement from a rejection.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-008 — Partial reclaim and duplicate reconciliation

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Use 3 expired links with one already claimed; reclaim remaining links; replay worker/event and refresh campaign.

**Expected:** Only reclaimable amounts are returned; sum/receipt count matches exact settled links; duplicate processing cannot credit twice.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-009 — Renewal uses verified refunded budget

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Expire an equal-amount campaign, reclaim remaining links, wait for confirmed accounting, then renew from original campaign.

**Expected:** Original lineage retained; renewed link count and principal equal verified refund only; claimed links are excluded; renewed funding still requires sender review.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-010 — Renewal refuses unsafe terms

**P0 | Negative | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Try renewal before expiry, before refund settles, with changed sender/asset/count, after second renewal, and on custom-amount campaign.

**Expected:** Refuse invalid terms; variable-amount renewal is currently unsupported and clearly refused; no second principal distribution hidden as renewal.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-SET-011 — Ledger-derived receipt time

**P0 | Regression | Not Run | #100,#101,#110,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys.

**Steps:** Claim, stop UI before DB settles, and run reconciliation; compare direct and recovered receipt timestamps with confirmed operation created_at.

**Expected:** Both paths use ledger settlement time consistently. Current issue #110 remains a known gap until verified/fixed; app wall-clock time is insufficient.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Sanitized receipt canonical bytes/signature/public verification key when relevant.

**Harness / mode:** Manual + independent Horizon

### KLM-D1-POL-001 — Bearer policy versus named recipient

**P0 | Regression | Not Run | #101,#114,#116**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** Share a disposable bearer link with a different controlled recipient; compare with an explicitly configured strict-policy fixture.

**Expected:** Bearer policy is not email/address binding; strict policy follows its documented authorization. Never describe sender labels as claimant enforcement.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Harness / mode:** verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

### KLM-D1-POL-002 — Receive-as quote and slippage floor

**P0 | Regression | Not Run | #101,#114,#116**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** In an approved disposable asset pair, quote an allowlisted receive-as asset; change quote liquidity and try below-minimum destination before submission.

**Expected:** Delivered asset and minimum are explicitly reviewed; failed conversion preserves claimable principal; no silent ticker/issuer substitution.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Harness / mode:** verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

### KLM-D1-POL-003 — Exchange deposit memo boundaries

**P0 | Regression | Not Run | #101,#114,#116**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Use isolated policy/conversion fixtures and disposable issuers; real exchange deposits are not authorized.

**Steps:** Use controlled exchange-style account fixture; test required ID/text memo, missing/wrong-type/overflow memo and disabled exchange-deposit campaign.

**Expected:** Only permitted reviewed destination/memo is accepted; no recipient account merge; missing or altered memo is refused before transfer; actual delivered asset appears on receipt.

**Evidence:** Public before/after Horizon account JSON, transaction and operation JSON, prepared-XDR hash, DB rows with bearer material excluded. Safe policy result, destination asset/minimum and memo type; no OTP/token capture.

**Harness / mode:** verify:claim-policies; verify:claims; tests/lib/api/receipts.test.ts; approved compatibility wallet cases

## D2: Signing, authorization and recovery under faults

### KLM-D2-SIG-001 — Network/provider mismatch

**P0 | Negative | Not Run | #96,#98**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Configure Testnet passphrase with public Horizon or vice versa; attempt every write preparation.

**Expected:** Refuse mismatched network identity before wallet or network write; read-only Mainnet checks cannot submit.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-002 — Wrong asset issuer

**P0 | Negative | Not Run | #98**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Alter prepared or requested USDC issuer while keeping display code USDC.

**Expected:** Match full asset code+issuer+network; refuse unauthorized issuer, never silently map by ticker.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-003 — Reviewed XDR tampering

**P0 | Security | Not Run | #98,#101**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Alter amount, destination, source, operation order, predicates, timebounds and fee separately in signing fixtures.

**Expected:** Every altered reviewed transaction hash is refused; no mutation accepted because a wallet signed it.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-004 — Signed envelope preservation

**P0 | Security | Not Run | #98,#101**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Return signed fixtures missing sponsor/local signatures or containing a signature for another passphrase/account.

**Expected:** Require exact reviewed hash and all required valid signatures; do not reconstruct or drop prior signatures.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-005 — Wallet account/network changes mid-review

**P0 | Negative | Not Run | #106**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Connect sender, prepare; switch selected wallet or network before sign. Retry only after fresh review.

**Expected:** Refuse changed identity; reconnect/review clearly; no automatic retry with different account/network.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-006 — Cancel / timeout / lock wallet

**P0 | Negative | Not Run | #106,#114**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Cancel connection and signing separately; lock wallet; let acknowledgment/review timeout; retry from saved draft.

**Expected:** Useful bounded error; no funding or claim on cancel; cleanup permits safe retry; no leaked wallet error contents.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-007 — Unknown submission outcome

**P0 | Negative | Not Run | #104**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Drop response after provider accepts exact signed hash; refresh/retry and run reconciliation.

**Expected:** Exact signed bytes/hash retained durably; lookup same hash before any retry; no replacement payment or duplicate funding.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-008 — Process crash at durable boundaries

**P0 | Negative | Not Run | #104**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Kill isolated worker before send, after send, after confirm and during settlement; restart for each journal fixture.

**Expected:** Recover prepared/submitted/confirmed/settled state deterministically; exactly one final accounting mutation per hash.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-009 — Real source concurrency across processes

**P0 | Negative | Not Run | #102,#103**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Run two processes sharing sponsor and separate web/worker instances against fresh PostgreSQL; prepare claims/funding/reclaim simultaneously.

**Expected:** PostgreSQL advisory source lock serializes all spenders; fresh sequence/headroom under lock; no stale capacity double admission.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-010 — Unresolved legacy attempt

**P0 | Negative | Not Run | #104**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Seed old submitted row with missing signed XDR and ambiguous hash; attempt new prepare and recovery.

**Expected:** Do not discard unresolved financial liability by guessing; refuse/reconcile explicitly; no duplicate operation.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-011 — Strictly later ledger enforcement

**P0 | Negative | Not Run | #101**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Hold TX1 confirmed ledger N; provide provider latest ledger N for TX2 then N+1; attempt claim preparation both times.

**Expected:** Refuse N; permit after verified N+1. Fixed sleep or browser time alone is insufficient.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-012 — Queue/DB unavailable

**P0 | Negative | Not Run | #104,#113**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Interrupt Redis/PG before and after financial write; restore and replay pending jobs.

**Expected:** No false success; durable attempts survive lost queue notification; recover accounting after reconnection without duplicate payout.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-013 — Source rejection classification

**P0 | Negative | Not Run | #104**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Inject tx_bad_seq, insufficient balance, expired timebound and operation failure into isolated submission/reconcile harness.

**Expected:** Distinguish explicit rejection from unknown outcome; settle nothing on rejection; preserve useful safe correlation metadata.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SIG-014 — SDK sequential multi-batch handling

**P0 | Negative | Not Run | #105**

**Preconditions:** Isolated source/DB/provider fixtures; network-fault injection is local only; no public denial-of-service.

**Steps:** Use published SDK/API client for >one batch; introduce delayed confirmation and exercise resume.

**Expected:** SDK waits/queries confirmation or surfaces actionable resumable state before next preparation; SUBMITTED is not CONFIRMED. Issue #105 remains open.

**Evidence:** Full sanitized harness output; exact hashes; journal/DB snapshots; process IDs and timestamps.

**Harness / mode:** tests/lib/wallet/signing.test.ts; tests/lib/stellar/source-admission.test.ts; verify-source-coordination; isolated recovery harness

### KLM-D2-SEC-001 — Cross-organisation and role controls

**P0 | Security | Not Run | #114**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Create two disposable orgs; try reading/registering/funding/reclaiming other org campaign with session and API key; try read-only role.

**Expected:** Resource/role denial without secret/object leakage; no rows or chain submissions created for unauthorized request.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-002 — Idempotency scope and request mismatch

**P0 | Security | Not Run | #102,#114**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Reuse same key with same request, changed body and different user/org; run concurrently.

**Expected:** Same authorized request replays one result; changed body refuses; key never returns another org response.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-003 — API key underscores and secret at rest

**P0 | Security | Not Run | #112**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Use deterministic full API-key fixtures with underscores in suffix; verify authentication, revoke/wrong-key denial and database representation.

**Expected:** Parser/hash covers whole token; no probabilistic generation assumption or partial split token check; no cleartext key at rest. Issue #112 harness gap must be fixed.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-004 — Claim proof and body guard

**P0 | Security | Not Run | #101,#114**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Submit malformed/oversize body, planted secret field, wrong preparation proof, replayed nonce and altered recipient.

**Expected:** Refuse at API boundary; no logs reflect bearer material; only valid matching proof advances intended claim.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-005 — Frame-origin and message spoofing

**P0 | Security | Not Run | #114**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Send bridge replies from wrong origin/window with wrong ID; trusted parent attempts changed XDR.

**Expected:** Ignore untrusted replies and refuse tampered trusted replies; no wildcard origins, no broad frame access.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-006 — Session cookie and CSRF boundaries

**P0 | Security | Not Run | #114**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Enable exact Lantern origin; login in trusted partition; issue cookie mutation from foreign/originless browser; log out.

**Expected:** HttpOnly/Secure/Partitioned cookie matches deployment; unsafe browser mutations require exact Kleym origin; logout revokes/clears matching partition.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-007 — Outbound URL canonicalization and redirects

**P0 | Security | Not Run | #107**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Configure webhook/screening/OIDC/federation URL fixtures with local/private/reserved hosts, credentials, alternative numeric IPs, backslashes and 3xx.

**Expected:** Public HTTPS guard rejects unsafe forms and redirects; permitted loopback only in explicit development; network errors are safe and bounded.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-008 — DNS rebinding and deployment egress

**P0 | Security | Not Run | #107**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** In controlled deployment resolve a public-looking allowed hostname to private IP; test socket egress policy with security owner.

**Expected:** No connection to private/internal address; DNS/socket or platform egress enforcement must prove this. Current URL-only guards do not satisfy this case.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-009 — Audit seed emitted log and future key guard

**P0 | Security | Not Run | #109**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Run secret-classification focused tests and guard using planted root/nested fields; add unclassified seed fixture; verify fixed public signature.

**Expected:** Audit/sponsor/encryption/provider fields censored; future seed name fails classification; safe public IDs observable; signature bytes/verification format unchanged.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-010 — Client bundle and evidence leak scan

**P0 | Security | Not Run | #108,#109**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Scan candidate source/build and proposed report text for seeds, mnemonic fixtures, bearer URLs, tokens and credentials; inspect all intended screenshots.

**Expected:** No real secret or complete claim fragment is published; public IDs/hashes permitted; scan scope/limitations recorded, not called security assurance.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-SEC-011 — Bearer-email exclusion for pilot

**P0 | Security | Not Run | #108**

**Preconditions:** Disposable accounts/fixtures only; local authorized fault injection; owner-approved egress test target for DNS case.

**Steps:** Enable campaign/self-delivery mode; invoke legacy email/reminder queue path and inspect sanitized message metadata.

**Expected:** Pilot cannot enqueue/send full bearer links via built-in email; server never receives browser link key. Legacy behavior requires explicit gated product decision.

**Evidence:** Sanitized request/response and DB evidence; guard test logs; no credential values or bearer URLs.

**Harness / mode:** Existing verify:concurrency, verify:api-keys, verify:privacy, verify:email, source tests; controlled egress check

### KLM-D2-AUTH-001 — Fresh-auth and MFA protected operations

**P0 | Security | Not Run | #109,#111,#114**

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** With disposable sender/admin, exercise protected operations with missing/expired fresh auth; complete TOTP/WebAuthn, revoke session and retry.

**Expected:** Required second factor and fresh-auth gate cannot be bypassed; no protected mutation with revoked session; recovery material never enters evidence.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Harness / mode:** verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

### KLM-D2-AUTH-002 — Approval / screening hold and outage

**P0 | Security | Not Run | #109,#111,#114**

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** Create approval-required and screened campaign fixtures; attempt funding before approval, on explicit hold and while screening dependency is unreachable.

**Expected:** Authorization and hold gates enforced; unavailable screening fails closed with safe actionable result; only authorized approved campaign can advance.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Harness / mode:** verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

### KLM-D2-AUTH-003 — Signed export tampering and key history

**P0 | Security | Not Run | #109,#111,#114**

**Preconditions:** Isolated migrated DB/Redis; disposable authentication configuration and public verification fixtures.

**Steps:** Generate receipts/audit export with disposable signing configuration; verify publicly; alter row/amount/signature and verify again; verify archived public-key fixture.

**Expected:** Valid evidence verifies without a signing seed; tamper fails; canonical/version/key history preserved; private credentials and bearer metadata absent.

**Evidence:** Sanitized authorization result, public export/signature and verifier output; no MFA codes/keys.

**Harness / mode:** verify:mfa; verify:sso; verify:approvals; verify:compliance; verify:receipts; verify:audit-chain

## D3: Desktop, Android and Lantern wallet journeys

### KLM-D3-FRE-001 — Desktop Freighter sender connection

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Cold-open approved HTTPS sender page with unlocked desktop Freighter/Testnet. Connect intended public sender and prepare one funding batch.

**Expected:** Desktop extension control only; no Android app button; exact address/network visible; connection alone moves no funds.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-002 — Desktop Freighter funding approval

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Save private export; sign intended batch; inspect popup and submit; wait for campaign ledger confirmation.

**Expected:** Popup appears; correct official issuer/principal/signers; sender XLM warning, if wallet displays it, does not substitute for sponsor-paid ledger proof.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-003 — Desktop recipient claim

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Open link A privately in recipient browser; connect intended recipient; click Claim; review signatures and wait for settlement.

**Expected:** Exact one USDC credited once; confirmed transaction link uses Testnet; cleanup/reserves satisfy D1 accounting.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-004 — Stale extension tab recovery

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Keep saved draft, invalidate/restart extension bridge, compare original/fresh tabs, reopen only after private backup.

**Expected:** No endless spinner or false funded state; helpful reconnect guidance; new tab can recover public draft and keys only from user-held backup.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-005 — Android Chrome phone controls

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Open link B privately in Android Chrome without desktop extension. Inspect wallet controls and press phone connect.

**Expected:** No desktop-specific Connect wallet button. Freighter phone open/pair action is clear; connection is distinct from claim; installed/uninstalled fallback is truthful.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-006 — Android Freighter connection return

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Approve connection in installed Android Freighter, return to original Chrome tab and inspect account/network.

**Expected:** Tab reaches explicit Claim control with intended public account; connection alone cannot transfer; return guidance explains next step.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-007 — Android Freighter full claim signing

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** From connected link B in Chrome press Claim; open wallet review, explicitly approve, return and confirm independently.

**Expected:** Actual v1.25.28 or recorded installed-version mobile signatures work for required operations; exact one USDC; no manual raw-XDR or key entry.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-008 — Android reconnect/background lifecycle

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Background Chrome/Freighter during connection, review and submission; resume; test expiry and user rejection separately.

**Expected:** No duplicate submission on resume; usable safe recovery; stale wallet context cannot sign a changed transaction; keys remain private.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-FRE-009 — App not installed / pairing expiry

**P0 | UAT | Not Run | #97,#106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. Exact browser, extension/APK, Android and Freighter versions recorded; approved public Testnet candidate.

**Steps:** Use Android without installed app or expired WalletConnect pairing; press connect and cancel/retry.

**Expected:** Usable fallback/help and bounded timeout; no claim or phantom connected state; no promise that app opening equals approval.

**Evidence:** Physical-device/desktop screenshots with private link hidden; recorded approvals, public hashes and independent balances.

**Harness / mode:** Manual actual desktop Freighter and Android Chrome + Freighter; screenshot automation cannot approve signatures

### KLM-D3-LAN-001 — Curated directory entry and package identity

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Hash senior-provided Lantern APK/extension; inspect Apps directory for exact approved Kleym HTTPS origin/session=true; compare effective installed extension origin.

**Expected:** Kleym is explicitly curated; Android directory metadata generated; exact approved frame origins. Current 0.6.2 without Kleym cannot pass this prerequisite.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-002 — Android public sender handoff

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** From public Kleym sender/login in Chrome select Open in Lantern; inspect opened page and browser fallback with app absent.

**Expected:** Only public path handed off; query/fragment removed; app opens curated Kleym, fallback is intended public page; no private claim fragment copied into intent.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-003 — Lantern sender authenticated session

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Inside curated trusted Lantern frame login, connect wallet, create draft, leave/reopen Apps and log out.

**Expected:** Authenticated sender experience works in correct cookie partition; desktop browser session is separate; logout terminates partition session.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-004 — Lantern desktop funding and management

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** In rebuilt extension open Apps > Kleym. Create saved 3-link campaign; approve funding; inspect campaign and reclaim unused link after expiry.

**Expected:** Lantern receives exact sign-only XDR; no external Freighter phone control; API submits and confirms exactly once; auth/organization management remains intact.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-005 — Lantern Android funding and management

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Repeat saved 3-link campaign creation/funding in rebuilt APK; inspect scrolling, approve review and confirmed dashboard.

**Expected:** Full creator journey works on physical phone, not only mocked bridge; exact hash/account/network preserved; no overflow or inaccessible signing action.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-006 — Recipient claim already in trusted Lantern frame

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Open disposable link inside curated trusted frame using owner-approved private-link route; connect Lantern and explicitly claim.

**Expected:** Connect Lantern selected; no Freighter pairing control; exact claim review inside wallet; confirmed asset reaches selected recipient; public launcher is not claimed to move private links.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-007 — Uncurated generic URL sandbox

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Open Kleym via Lantern generic URL bar instead of approved Apps directory; attempt login/connect safely.

**Expected:** Opaque sandbox is not treated as trusted authenticated integration; honest guidance; no fallback widening origins or copying private fragments.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-008 — Lantern delayed idless connection reply

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Delay getPublicKey reply past timeout, retry without reopening, then deliver old response in bridge fixture.

**Expected:** Late response cannot complete a different connection; reopen requirement visible; signing still correlates exact request ID/source/origin.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-LAN-009 — Lantern wrong network / account / permissions

**P0 | UAT | Not Run | #106,#114**

**Preconditions:** G0-G3 gates passed; disposable Testnet identities; fresh campaign; privately backed-up keys. G3-Lantern: rebuilt curated package, verified origins and HTTPS partition-cookie support required.

**Steps:** Switch network/account or revoke app grant before sign; return wrong identity or tampered signature via fixture.

**Expected:** Fresh grant/account/network checks refuse; never signAndSubmit behind Kleym journal; original reviewed transaction unchanged.

**Evidence:** Package SHA256, exact origin/config record, sanitized bridge type/ID trace, physical wallet review and public ledger proof.

**Harness / mode:** Manual rebuilt Lantern extension/APK; tests/lib/wallet/lantern*.test.ts and verify-lantern-browser are supplementary fixtures

### KLM-D3-UX-001 — Keyboard and focus order

**P1 | UAT | Not Run | #106,#114**

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Use Tab/Shift-Tab/Enter/Space from login through amount editor, expiry picker, review, export and wallet controls.

**Expected:** All interactive elements reachable with visible focus; logical order; no keyboard trap.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Harness / mode:** Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-002 — TalkBack / NVDA status announcements

**P1 | UAT | Not Run | #106,#114**

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Use Android TalkBack and desktop NVDA for invalid amount, funding pending and claim result.

**Expected:** Errors and new states announced meaningfully; controls labelled; no reliance on colour alone.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Harness / mode:** Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-003 — Phone viewport and 200% zoom

**P1 | UAT | Not Run | #106,#114**

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Test 360px/393px portrait, landscape, keyboard-open state and desktop 200% zoom across creation/review/claim.

**Expected:** No sideways scrolling or clipped primary controls; amount/date input and signing return usable.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Harness / mode:** Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-UX-004 — Cold recipient without team help

**P1 | UAT | Not Run | #106,#114**

**Preconditions:** Isolated UI candidate; disposable public snapshots; real assistive tools for accessibility assertions.

**Steps:** Give independent reviewer only their private test link and minimal Testnet warning; time connection/claim and record hesitation.

**Expected:** Reviewer identifies asset/network, connection versus claim and result without keys/raw-XDR instruction; friction recorded as UAT findings, not fabricated passes.

**Evidence:** Screenshots/notes with private areas excluded; tool/browser versions; elapsed journey and exact confusing text.

**Harness / mode:** Manual keyboard/NVDA/TalkBack; production Chromium layout fixtures supplementary

### KLM-D3-ADM-001 — Campaign list, filters and per-link history

**P1 | Regression | Not Run | #100,#106,#114**

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Create mixed-status equal/custom campaigns in two orgs; filter/search/page dashboard and campaign details; refresh after settlement.

**Expected:** No cross-org data; stable paging/counts; exact per-link amount and confirmed lifecycle status; no stale active totals from submitted-only attempts.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Harness / mode:** verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

### KLM-D3-ADM-002 — Templates and historical funding compatibility

**P1 | Regression | Not Run | #100,#106,#114**

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Create draft from existing template and inspect funding mode; compare with new sponsored API campaign and historical sender-paid campaign.

**Expected:** Template/historical mode remains explicit and supported; no silent migration to sponsored version; funding signatures/costs match actual reviewed protocol.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Harness / mode:** verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

### KLM-D3-ADM-003 — Claimed / expired / invalid link copy

**P1 | Regression | Not Run | #100,#106,#114**

**Preconditions:** Isolated UI/API fixtures or approved public candidate; private claim URL never captured.

**Steps:** Open safe local fixtures for already claimed, expired-unclaimed, invalid/missing fragment and provider outage.

**Expected:** Correct distinct states and actionable messages; no false funds-in-wallet message before confirmation; no spinner stuck or secret-bearing error.

**Evidence:** Scoped API snapshots, dashboard screenshots and safe state fixture output.

**Harness / mode:** verify:campaign-list; verify:campaign-detail; verify:templates; e2e/claim-page.spec.ts

## D4: Public candidate, operations and release qualification

### KLM-D4-OPS-001 — Candidate freeze and deployed parity

**P0 | UAT | Not Run | #111,#114**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Record feature commit, dependency lock hash, migrations, runtime/package-manager versions, effective public URL and server build identity; compare release manifest; run dependency audit with supported package manager.

**Expected:** Tested source, built bytes and deployed candidate match; unknown identity blocks qualification. Unresolved critical/high dependency advisories block release until remediated or explicitly assessed by the security owner.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-002 — Migration and rollback on populated copy

**P0 | UAT | Not Run | #98,#115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Backup isolated seeded DB with campaigns/attempts/receipts; apply candidate migration; exercise old/new states; rehearse documented rollback from copy.

**Expected:** No precision/history/lineage loss; safe recovery of pending attempts; rollback decision tested and source/deploy artifact preserved.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-003 — Real DB/Redis CI qualification

**P0 | UAT | Not Run | #111,#112,#114**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Run full isolated PostgreSQL/Redis suites from candidate in CI; include keys, receipts, batches, claims, source coordination, backup and recovery.

**Expected:** Green evidence for candidate includes meaningful assertions; unavailable Docker/local services mean Blocked for execution, not pass from mocks.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-004 — Public HTTPS cold sender and recipient

**P0 | UAT | Not Run | #114**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** After owner-approved deployment, cold-open public URL on desktop and Android outside team network; execute 3-link tutorial.

**Expected:** HTTPS reachable, Testnet clearly labelled; no localhost dependency; account/claim links work without team browser profile.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-005 — 200-link cost/capacity budget

**P0 | UAT | Not Run | #99,#103,#115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Record fresh base reserve, fees, sponsor liabilities and configured campaign/recipient caps; quote 200 one-USDC links then enforce limiting budgets.

**Expected:** Principal separate from operational XLM; fee bid versus charged fee distinguished; persistent recipient reserves included in lifecycle budget; configured limits enforced before spend.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-006 — Performance latency/provider-read budget

**P0 | Load | Not Run | #103,#114**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Measure 30 representative prepare/resolve requests at agreed concurrency with recorded network and fixture dataset; report median/p95, provider calls and errors.

**Expected:** Baseline and candidate measured comparably; no invented speedup; static 10-to-5 provider call reduction is not latency evidence. Owner sets SLO before sign-off.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-007 — API throttling / provider rate limits

**P0 | Load | Not Run | #104,#113**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Use bounded local load within agreed test budget; return 429/503/timeouts from isolated provider; observe recovery and queues.

**Expected:** Useful bounded response/backoff; no storm, duplicate spend or false active state; rate limit shown honestly and financial journal retained.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-008 — Sponsor failover / shortage / refill

**P0 | UAT | Not Run | #103,#113,#115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Exhaust primary fixture below working threshold; select secondary; test total pool shortage and alert routing; rehearse refill procedure without cold signing.

**Expected:** Fresh sponsor choice respects outstanding liability and pinned campaign sponsor; alerts actionable; no unauthorized automatic cold refill; approved owners recorded.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-009 — Worker pause and drain

**P0 | UAT | Not Run | #104,#113**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Pause creation with pending submitted attempts; drain/reconcile workers before planned shutdown, then restart isolated services.

**Expected:** User-facing pause clear; accepted attempts remain durable and settle; no stranded state hidden by queue deletion.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-010 — Backup restore and disaster recovery

**P0 | UAT | Not Run | #113,#115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Restore encrypted DB backup to isolated environment; restore matching configuration via secret store; reconcile exact pending hashes before unpausing.

**Expected:** Audit/history and financial journals preserved; no key in reports; measured recovery time/loss against owner-approved RTO/RPO.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-011 — Monitoring and signed evidence cadence

**P0 | UAT | Not Run | #111,#113**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Trigger stale pending attempt, low spendable reserve, queue delay and mismatch fixture; inspect dashboards/alerts and generate verified export.

**Expected:** Owner can trace safe correlation ID/hash; alerts reach approved operator; signed receipts verify; production cadence/gates documented and actually wired.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-012 — Mainnet read-only config and issuer

**P0 | UAT | Not Run | #115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** Inspect public passphrase/official USDC issuer and exact public Horizon identity; verify release checklist without signing or submission.

**Expected:** Public issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN matches configured asset; no Testnet address/passphrase/issuer crossover. No live movement authorized by this plan.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-013 — Capped Mainnet pilot approval

**P0 | UAT | Not Run | #115**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** After mandatory Testnet/operations cases pass, obtain recorded owner-approved limits, sponsor capital, incident/refill owners and rollback criteria.

**Expected:** Separate explicit approval required before any real-USDC transaction. Unresolved P0/financial evidence blocks live pilot regardless of local green suite.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-OPS-014 — Issue closure and evidence consistency

**P0 | UAT | Not Run | #95,#114**

**Preconditions:** G0 candidate recorded; isolated infrastructure available; deployment and Mainnet changes require separate approval.

**Steps:** For each proposed closure map every criterion to candidate source and executed case log; verify tracker totals/evidence/defect references.

**Expected:** Close only satisfied criteria; keep missing device/DB/ledger/deployment proof open; roadmap reflects qualified scope rather than promised launch date.

**Evidence:** Release manifest, sanitized logs/runbook observations, owner decisions, metrics/restore notes and independent public ledger data where authorized.

**Harness / mode:** Existing verification scripts and deployment/runbook procedures; no automatic production writes

### KLM-D4-DOC-001 — Privacy deletion and organization isolation

**P1 | Regression | Not Run | #105,#108,#111,#114**

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** With disposable org/test user, export personal data, request allowed erasure, and verify financial audit retention and unrelated org isolation.

**Expected:** Only permitted personal data returned/erased; immutable financial proof preserved under documented retention; keys/bearer URLs absent.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Harness / mode:** verify:privacy; verify:observability; source/docs review

### KLM-D4-DOC-002 — Telemetry and error observability minimization

**P1 | Regression | Not Run | #105,#108,#111,#114**

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** Trigger bounded funding/claim failures; inspect emitted logs and tracing attributes using planted secret/bearer fixtures.

**Expected:** Safe correlation IDs/hash/state observable; no mnemonic, seed, complete bearer URL, signed-body dump or private token retained in logs/traces.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Harness / mode:** verify:privacy; verify:observability; source/docs review

### KLM-D4-DOC-003 — API documentation and support limits

**P1 | Regression | Not Run | #105,#108,#111,#114**

**Preconditions:** Isolated data and telemetry sinks; source candidate and API docs frozen.

**Steps:** Compare public write API/SDK examples, wallet support matrix, funding versions and recovery help with executed candidate cases.

**Expected:** Docs describe only proved support, explicit async confirmation and custom-amount renewal limitation; unsupported Android/Lantern/Mainnet claims withheld.

**Evidence:** Sanitized export/schema/attributes output; docs-to-case mapping and reviewer notes.

**Harness / mode:** verify:privacy; verify:observability; source/docs review
