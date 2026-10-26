# Open-issue closure review — 26 October 2026

Reviewed the 11 open issues against their current scope and acceptance criteria, the merged implementation, current CI, public ledger proof and QA package. No unresolved feature or release gate is declared complete by a plan, a compiler result or a narrower historical pass. This review changes no issue's acceptance criteria.

| Issue | Disposition | Decisive remaining work |
|---|---|---|
| #100 — sponsored reclaim | Keep open | Sponsor-paid sender-authorized reclaim is implemented and demonstrated. However, the requested consented sponsored restoration when the sender removed its USDC trustline is not implemented by the current reclaim builder: `buildReclaimTransaction` emits only claim operations and its verifier permits only those operations. Historical refund proof does not complete that missing scope. |
| #103 — sponsorship capacity | Keep open | Current balance/reserve/source checks exist, but whole-lifecycle atomic reservations and continuing obligations need complete accounting proof; operational XLM capital and decision ownership remain unset. The owner's no-arbitrary-global-USDC-cap decision is retained. |
| #104 — interrupted settlement recovery | Keep open | Durable attempts, lost-response recovery, missing-job repair and reconciliation are implemented and tested. A complete current acceptance map for every specified database-persistence/enqueue interruption boundary and resulting durable mapping/receipt recovery is not yet qualified. This is an evidence gap, not a claim that the implemented recovery is broken. |
| #106 — sender/empty-wallet browser journey | Keep open | Desktop and physical Android successes, native emulator UI and source tests exist. The full production-like empty-account/sender funding-and-reclaim/wallet-recovery matrix and all applicable state/accessibility/network-isolation checks still lack complete current case-by-case evidence. |
| #113 — operated sponsorship/recovery | Keep open | Queue/status mechanisms and runbooks exist. Real alert delivery/escalation ownership, threshold/capital decisions and the full operated exhaustion/restart/restore rehearsal remain unqualified. |
| #114 — release QA | Keep open | The v2 plan contains 373 cases. The 943 unit assertions, 34 scoped UI observations and seven standalone protocol checks cannot substitute for every mandatory official-USDC/supported-wallet/operational matrix row. |
| #115 — live pilot/rollback | Keep open | Mainnet remains disabled. Approved live deployment, operational limits and treasury/incident owners, measured rollback/restore/alerts and explicit real-asset pilot approval remain release gates. |
| #116 — asset expansion | Keep open | Basic native/custom-token protocol proof passes. Full conversion/omnibus-memo behavior, expanded-asset compatibility and the prerequisite USDC release gate are not all qualified. |
| #76 — multi-tranche vesting | Keep open | The requested four-balances-per-link schedule and complete tranche lifetime, stranded-monitor, partial reclaim and wallet-cost acceptance are not delivered/qualified. A simple claim predicate or an expiry picker is not this feature. |
| #83 — rehearsal/promotion | Keep open | Separate network workspaces and a disabled Mainnet selector do not complete per-organisation rehearsal, fresh-key promotion, Friendbot admission and finance/export exclusion acceptance. |
| #95 — parent roadmap | Keep open | Its remaining children and live-release gates are incomplete. Synchronize its stale child checkboxes with actual closed child issues; preserve dated historical notes. |

## Positive evidence retained

- PR #142 / develop `733d5e14faa3b03742f3942208d790ece1486dc3`; all four checks passed in GitHub run `40331044466` after the browser runner's package-download retry.
- `qa/plans/kleym-comprehensive-v2-2026-10-26` — current source inventory, detailed cases, workbook and scoped results.
- `qa/plans/kleym-comprehensive-v2-2026-10-26/evidences/runs/release-733d5e1/protocol-matrix.json` — seven successful standalone Testnet checks and 22 public successful transaction hashes; custom issuer/Node signers explicitly identified.
- `scripts/verify-app-lifecycle.ts`, `scripts/verify-sponsored-funding.ts`, `scripts/verify-reclaim.ts`, `src/lib/stellar/attempts.ts`, `src/lib/queue/batch-confirm.ts` and `src/workers/ledger-attempts.ts` — implemented recovery and current fixture proof; no broader production guarantee inferred.
- `src/lib/stellar/reclaim.ts` — narrow source anchor for the missing trustline-restoration scope.

No open issue is closed by this review. Previously completed child issues remain closed, and the roadmap checklist is reconciled to GitHub's actual states. Further implementation and fresh evidence can close the remaining issues individually without weakening their requirements.
