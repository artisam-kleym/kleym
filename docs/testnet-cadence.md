# CI and intentional Testnet protocol cadence (#111)

PR CI runs local simulated-Horizon checks against disposable PostgreSQL/Redis:
policy/receipt persistence, sponsored funding, interrupted settlement and
independent-process source admission. These submit no chain transactions.
Missing checks have been wired into the existing job; failures no longer skip
the remaining independent verification steps after migrations succeed.

`testnet-protocol.yml` provides a separate weekly Tuesday cadence and manual
dispatch. It runs only after merging onto the repository default branch and
setting the explicit repository variable `TESTNET_PROTOCOL_ENABLED=true`.
That variable has not been enabled by this change. With no opt-in it emits
`NOT_RUN`, makes no network/signing/funding calls and records that verdict in
the run summary and JSON. A successful runner job with `NOT_RUN` is not a
passed protocol test and cannot qualify a release.

Before any Friendbot or transaction action, the script requires the exact
official Testnet Horizon/Friendbot URLs and Testnet passphrase, then reads
Horizon identity with redirects refused and a bounded timeout. Failed identity
or initial provider availability produces an explicit `NOT_RUN` and nonzero
exit. Failures after starting are recorded as `FAIL` with any captured hashes;
no retry of the whole financial scenario is automatic. Concurrent/cancelled
runs are avoided. There are no production keys, database or mail credentials
in this workflow: all Node signers are disposable, generated in process.

Results identify source commit, network/provider, disposable issuer, signer
kind, public transaction hashes/ledgers, timestamp and protocol assertions.
Artifacts are retained for 30 days by run id/attempt. The existing spike uses
a **custom disposable USDC issuer**, not official Circle USDC. It is a protocol
probe, not the sponsored principal app journey, wallet proof or complete #97
matrix. Do not relabel its green result as Mainnet readiness.

Local guarded reproduction: `pnpm spike` against the exact Testnet defaults;
optional `TESTNET_RESULT_FILE` writes public evidence. In CI, explicit opt-in
is required. `pnpm exec vitest run tests/lib/stellar/testnet-protocol-gate.test.ts`
proves settings/identity/outage refusal without external actions.

Workflow changes pushed successfully through the existing authenticated Git
transport. A future transport rejecting workflow uploads requires an approved
credential with workflow permission; do not print tokens or repeatedly retry.
The remaining #97 dependency and fresh supported-wallet/official-USDC evidence
keep #111 open until all acceptance and release context are reconciled.
