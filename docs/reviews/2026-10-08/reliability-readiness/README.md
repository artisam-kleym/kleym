# Kleym reliability and test readiness — October 8, 2026

## Candidate and scope

Source access: `D:/kleym/.worktrees/app-sending-pilot`, branch
`codex/app-sending-pilot`, base commit
`4163d7954bff9c1582c0c405174cddbe6951da33`, with preserved uncommitted work.
`verification.json` records hashes of the files qualified by this slice. These
results apply to the local candidate, not the paused Railway deployment or a
published Lantern package.

This slice reduces redundant financial-provider requests, corrects outbound
destination enforcement and SSO JWKS transport, and removes BullMQ bundling
warnings. No deployment, wallet signature, ledger submission, dependency
installation or GitHub mutation was performed.

## Changes and observable acceptance

| Check | Expected and observed result | Evidence |
| --- | --- | --- |
| Request-local funding observations | Sender/sponsor account records and live base reserve are reused during preparation; SDK builders receive separate Account instances, preserving observed sequences | `tests/lib/stellar/source-admission.test.ts` and `tests/lib/api/prize-funding.test.ts` |
| Fresh locked admission | A separate account/reserve pair is loaded after the source lock; changed sequence, reserve, liabilities, newly committed reserves or provider outage refuse admission before persistence | `tests/lib/stellar/source-admission.test.ts` |
| Provider call budget | Actual preparation plus source guard use three account reads and two ledger-reserve reads. Previous source call graph required ten reads; baseline is source analysis, not a timed benchmark. Network identity probes remain separate | `unit-qualified.log`; source-admission combined-path test |
| Private HTTPS destinations | URL normalization catches IPv4 alternate spellings and reserved/private IPv4/IPv6/local hosts before transport; credentials, ambiguous backslashes/control characters and unsupported schemes are refused | `tests/lib/validation/outbound-url.test.ts` |
| Consumer enforcement | Stored webhook/screening URLs are revalidated; private destinations send no payload; public integrations retain their flow and redirect responses are refused | `tests/lib/api/outbound-consumers.test.ts` |
| Native redirect enforcement | Local HTTP fixture returns a redirect; actual fetch fails and the target receives zero requests. Both fixture endpoints are local and disposable | `tests/lib/validation/outbound-url.test.ts` |
| SSO JWKS transport | Installed jose export replaces the ineffective `Symbol.for` key. A locally signed synthetic ID token completes through the supplied discovery/token/JWKS/userinfo transport, with zero fallback global-fetch calls | `tests/lib/api/outbound-consumers.test.ts` |
| Environment compatibility | Test-only loopback fixtures work; production rejects loopback before discovery, including after a non-production cache entry | `tests/lib/api/outbound-consumers.test.ts` |
| Production queue import | Next loads BullMQ using native Node resolution; build no longer emits optional Valkey/dynamic-worker bundling warnings; native Queue/Worker exports load without opening connections | `build-qualified.log`, `queue-native-import.log` |
| Lantern browser regression | Five production Chromium checks pass: desktop/mobile entry controls, trusted-frame connect-only behavior, fragment consumption, CSP/referrer policy and mutation-origin refusal | `lantern-browser.log`, `evidences/lantern-browser/` |

No production latency/throughput improvement was measured. Observations are
request-local, not cross-request financial caches. Source journals, locks,
prepared-body/signature checks and permanent campaign sponsor binding remain in
place. PostgreSQL locking itself is not proved by the new mocked-DB tests.

## Qualified checks

- **734 unit tests / 58 files passed**: `unit-qualified.log`.
- **5 production Chromium Lantern fixture checks passed**: `lantern-browser.log`.
- Production build passed: `build-qualified.log`.
- TypeScript and focused ESLint passed: `typecheck-qualified.log`, `lint-qualified.log`.
- Native BullMQ import passed: `queue-native-import.log`.

The first focused run caught an ambiguous-backslash URL policy gap; the policy
now explicitly refuses it. `focused-first.log` remains historical. The initial
build caught a new fixture's Account/Horizon TypeScript intersection; the fixture
cast was corrected without changing financial guards. `build-final.log` retains
that failed attempt. Next's pre-existing middleware-to-proxy deprecation notice
remains; it is not a failed build. Earlier passing logs/results are preserved.

## GitHub issue reconciliation

Read-only open-issue snapshot: `github-open-issues.json`. No issue was closed or
marked complete; progress descriptions below are local drafts for later review.

| Issue | Local progress | Remaining acceptance |
| --- | --- | --- |
| [#107](https://github.com/webnxt-2030/kleym/issues/107) | Canonical address policy, runtime webhook/screening/OIDC/federation guard, redirect proof, guarded actual JWKS hook and fixed error categories | DNS private answers/rebinding still require socket-level validation or enforced egress. Actual deployment enforcement has not been proved; issue remains open |
| [#102](https://github.com/webnxt-2030/kleym/issues/102) | Fewer reads under source lock with fresh sequence/capacity checks; no reuse of preparation observations for admission | Rerun current candidate's real PostgreSQL multi-process recovery/concurrency harness and measure deployed contention/throughput |
| [#103](https://github.com/webnxt-2030/kleym/issues/103) | Exact spendable calculation reused consistently with the reserve observed in each stage, retaining liabilities and current reserve obligations | Campaign/organization caps, whole-lifecycle capital/reservations, alert/refill ownership and operational limits remain open |
| [#111](https://github.com/webnxt-2030/kleym/issues/111) | Production build packaging corrected for native BullMQ | Hosted CI persistence wiring/evidence cadence still need qualification; local build is not hosted CI proof |
| [#114](https://github.com/webnxt-2030/kleym/issues/114), [#115](https://github.com/webnxt-2030/kleym/issues/115) | Current local verification and readiness boundaries recorded | Fresh complete wallet/ledger/device matrix, backup/restore and separately approved capped release |

Two additional release gaps were inspected but not changed in this slice:

- #105: SDK default nullable labels now match the server schema, but the high-level
  SDK funding loop prepares the next batch immediately after SUBMITTED, while the
  server requires confirmation. Current multi-batch SDK/CLI qualification remains
  open (`packages/sdk/src/flow.ts`, `src/lib/api/batches.ts`).
- #110: direct claim settlement still assigns `claimedAt = new Date()` while
  reconciliation reads ledger operation `created_at`. Clock/receipt compatibility
  needs its own change and evidence (`src/lib/api/claims.ts`, `src/lib/api/reconcile.ts`).

## Test-plan readiness

**Ready to draft the structured Testnet test plan now. Full execution and Mainnet
activation are not ready yet.**

| Scope | Readiness | Required preconditions |
| --- | --- | --- |
| Local pure/API fixture and production-browser checks | PASS for the checks above | Frozen candidate and supplied reusable harnesses |
| Real PostgreSQL/Redis application, worker, interruption and concurrency checks | BLOCKED by local runtime | Docker engine remains unavailable; restore it without resetting existing volumes/data, then run the isolated harnesses |
| Public HTTPS desktop and Freighter-phone Testnet lifecycle | NOT RUN on this candidate | Separately approved deployment/resume of web/worker/DB/Redis, configured WalletConnect origin, actual device/wallet and disposable test budget |
| Actual Lantern extension/Android campaign and recipient flow | BLOCKED by integration prerequisites | Add curated Kleym session-enabled directory entry, rebuild Lantern packages, confirm exact extension/Android origins, then enable tested Kleym configuration |
| Mainnet real-USDC pilot | NOT QUALIFIED | Fresh Testnet lifecycle, actual wallet/device signing, DNS/egress proof, treasury limits/headroom/owners, reliable settlement timestamps, backups and compatible rollback |

Recommended first plan scope: campaign creation with fixed/custom amounts; private
CSV export/recovery; multiple funding batches; desktop/Android claims for absent,
untrusted and trusted recipients; explicit connect-versus-claim actions; expiry
refund; duplicate/retry/lost-response recovery; depleted sponsor/stale sequence;
organization permissions; and Lantern session/wallet/network/cancel behavior.
Use separately recorded expected principal, fees, reserve units and transaction
hashes for every money case. Mark missing environments BLOCKED/NOT RUN rather
than product failure or inferred success.

Railway services remain paused. Current Lantern 0.6.2 does not list Kleym; the
browser harness simulates its parent, not a wallet/device. Current private claim
Chrome-to-Lantern handoff is not implemented. Existing Testnet obligations and
private exports must be preserved; new tests must not replay previously claimed
links or repeat old funding. See [Lantern prerequisites](../../../lantern-integration.md)
and [Mainnet gates](../../../mainnet-pilot.md).

## External references

Canonical range policy reviewed against the [IANA IPv4 registry](https://www.iana.org/assignments/iana-ipv4-special-registry/)
and [IANA IPv6 registry](https://www.iana.org/assignments/iana-ipv6-special-registry/).
The JWKS hook is verified against installed jose source/types and its
[customFetch documentation](https://github.com/panva/jose/blob/main/docs/jwks/remote/variables/customFetch.md).
These references support the implementation policy, not a claim that DNS/egress
or the production deployment is qualified.
