# USDC identity and Freighter proof PR

The sender wizard and CLI previously defaulted to XLM, and monetary actions could use a campaign whose network disagreed with the deployment/provider. This change makes official network-specific USDC the default, rejects mismatched campaign/provider/sponsor bindings before new monetary work, and preserves explicit XLM and existing campaign terms. A missing official USDC balance blocks the wizard rather than advancing with an impostor asset.

The same branch includes standalone, Testnet-only Freighter proof tooling, separate from production funding/reclaim. Browser-generated link keys stay local and must be backed up before funding. The spike reuses existing claim predicates/builders and the application wallet helper. The observed sponsor-sourced positive sequence passes; production funding/reclaim remains sender-paid pending #97–#100.

## Verification

- Current complete unit suite: **446 tests / 36 files passed**, one worker; `pr-unit.log`.
- Current `tsc --noEmit`, full ESLint including e2e, and diff whitespace check: passed.
- Earlier matching production source: **23 authenticated Chromium checks**, including missing/impostor/official USDC, explicit XLM and CSV/recovery gates. Turbopack build passed with the recorded temporary shared-dependency filesystem-root override, restored exactly afterwards. Build was not rerun for the proof scripts/documentation; current TypeScript checks include those scripts.
- Isolated PostgreSQL/Redis: all 27 migrations; batches36, claims30, sponsors31, reclaim57 passed. WRITE API54 passed with one Windows POSIX-mode assertion failure. Separate Linux execution proves the unchanged CSV writer uses0600 and refuses overwrite; the full Windows WRITE run remains failed and Windows ACL guarantees are not established.
- Actual Freighter5.48.0 in Brave: bootstrap and sponsored two-USDC funding, absent-recipient one-USDC claim in a later ledger, and one-USDC expiry reclaim confirmed. Independent raw Horizon envelope signatures, operation sources, exact official asset/principal, fee debits, reserve counts and cleanup passed. Final sender19USDC/0XLM; recipient1USDC/0XLM. Lifecycle sponsor paid2100stroops and reclaim released1XLM of reserve. See [positive lifecycle report](freighter-lifecycle/positive-lifecycle-report.md) and raw independent proofs.

Historical reports/manifests retain their original run state, including earlier “wallet pending” entries. `pr-evidence-manifest.json` identifies copied artifacts and the current446-test run; the lifecycle completion report supersedes historical pending observations. Original local artifacts remain unchanged. Published text artifacts were checked for Stellar seed patterns before packaging; wallet seeds/private CSV are excluded.

## Issue decisions

| Issue | Result |
| --- | --- |
| #96 | Implementation acceptance complete: official issuer identity; all monetary entry points reject context mismatches; public/testnet distinction and public-test refusal; explicit XLM compatibility. Close with this reviewable PR; changes are not yet merged into develop. |
| #97 | Partial: absent-recipient, fully sponsored zero-XLM sender funding/reclaim and later-ledger cleanup pass. Existing-recipient/trustline variants, nonzero native/no-spendable-XLM case, ledger expiry-boundary rejection, duplicate/retry/cancel recovery and native-XLM ledger regressions remain; final envelope decision deferred. Keep open. |
| #105 | Metadata/CLI defaults advanced under #96; optional-label and production sponsored-funding contract remain outstanding. Keep open. |
| #111 | Node-only telemetry import guard fixes the observed production compilation path. Policy/receipt CI wiring and scheduled Testnet cadence remain outstanding. Keep open. |
| #95 and #98–#100 | Roadmap and production integration remain incomplete. The positive spike does not ship those contracts. |

No public-network transaction, deployment, merge or automatic service installation is part of this PR. Operational sponsor keys remain in the already running local proof processes; private key material is absent from the public artifacts. This proof covers isolated default wallet accounts, not organisation multisig or Freighter Mobile support.
