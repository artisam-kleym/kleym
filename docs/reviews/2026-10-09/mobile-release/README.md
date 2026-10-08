# Desktop/mobile release qualification

October9,2026, Asia/Manila. Target branch: `develop-ade`; senior `develop` is untouched. Mainnet distribution stays disabled.

## Changes

- Campaign signing requires an actual browser download plus a separate saved-file confirmation. Regenerating keys resets both gates. Copy now says download requested rather than claiming the operating system saved it.
- Mobile signing has a two-minute deadline. Timeout invalidates the session, removes the app-launch observer and refuses late results. Reconnect and review again before retrying.
- The existing responsive navigation fix keeps all six items inside320/393px viewports with44px targets. Manual funding-address lookup remains available; mobile uses Freighter pairing/signing and desktop uses the extension.
- Two opt-in disposable Testnet probes exercise the production funding/reclaim builders. Exact provider/network assertions run before Friendbot or submission; no public-network writes occur.

## Actual wallet/ledger proof

Public Testnet deployment source `488957b8f1d3b8aeb01666af1a11a12fc8693c77`, web deployment `5ed45659-f05a-4851-899e-22356e7ce6e6`.

Campaign `cmuzrnf7200020dnzr49itmq6` used three official Testnet USDC links,1USDC each. Funding debited the zero-native sender from11→8USDC. Desktop claim `6d77bdcb793301bdda588e88926d96c07bd2c912a9fcdc9c3c9d8113828796c5` increased its recipient4→5USDC. Physical Android Chrome with Freighter Mobile v1.26.29 connected and deliberately claimed the second link: `e7142b1f94e9c4e1a4a2eac79b44e80d7dbf757eea5adecfe81ed45a5c6e5c28`, ledger5091390. Phone balance3→4USDC, native remains0. T1 ledger5091388 precedes T2; both temporary account and claimable balance are absent afterward. Existing trustline required no recipient signature. This proves physical pairing and claim settlement, not a missing-trustline phone signature or mobile campaign funding approval.

The third link expires October9,01:39Manila. Reclaim evidence is added only after ledger confirmation. Wallet spending remains the user's action; no agent signature authorises their funds.

## Foundation issue qualification

The rows below identify scoped completion evidence. Closure follows fresh candidate CI and the final owner reclaim; they do not close the parent launch gate.

| Issue | Acceptance and decisive proof |
| --- | --- |
| #97 | Adopt sponsor-sourced funding/reclaim: sponsor sequence, fee and reserve; sender signature on principal operations; claim T1 materialisation then strictly later-ledger T2. September29/30 actual Freighter evidence covers absent/existing/no-trustline recipients and zero-native sender funding/reclaim. October9 actual desktop/mobile proof covers deployed official USDC. Today's seven-case `testnet-protocol-result.json` covers native/non-native legacy, signature discipline and both predicate directions. `large-sponsored-testnet.json` covers200allocations, early ledger refusal and exact confirmed replay. Reserve-only probe closes the nonzero-native/no-spendable-XLM matrix row. |
| #98 | `batch.ts`/`reclaim.ts` enforce expected sources, order, asset, amounts, predicates, network, fee, prepared hash and sender signature before sponsor signing. `sponsored-batch.test.ts`, `funding-rollout.test.ts`, `verify-sponsored-funding.ts`, `verify-batches.ts` cover tampering and legacy SENDER/SPONSORED separation. Additive migration preserves old rows as SENDER and binds SPONSORED rows to their original sponsor. Rollback means disabling new distribution with the current envelope-aware code, retaining sponsor keys and funded-version claim/reclaim support; reverting to a binary that predates SPONSORED is not a supported rollback. Current production-like backup restore verified all35table counts before additive migration. |
| #99 |200links using20/15/10/5USDC amounts total1030.0000000; exact production-builder operation counts90/90/26, three sender approvals; all200deterministic IDs independently resolve to intended claimant, amount, asset, sponsor and expiry.400balance reserve units release at reclaim. Quote reads the live base reserve and accounts for six bracket operations. Existing real-Postgres funding fixture verifies partial-batch resume, confirmed replay, complete-list/principal checks and sponsor headroom separately. Browser CSV remains unchanged across retries. |
| #100 | Ledger refuses early reclaim with `op_cannot_claim`; zero-native and reserve-only senders reclaim through production builders; replay of each confirmed envelope returns its original hash without extra principal. Real-Postgres `verify-reclaim.ts` covers stale/missing/claimed IDs, interrupted response, exact state reconciliation and sender signature requirements. An expired row alone is not a refund. Reclaim releases balance reserves to their recorded sponsor and does not claim abandoned ephemeral accounts were cleaned. Scheduled reclaim prepares work for sender approval. |
| #105 | `verify-write-api.ts` executes omitted/empty/partial/full labels through actual WRITE routes and browser-independent local export; fully sponsored zero-native USDC sender fixture signs and funds. Exact confirmed resume submits nothing twice. READ/WRITE and tenant isolation remain enforced. Requests, DB and public outputs contain public keys/signatures; the private SDK CSV is deliberately local to its caller, never sent to the server or included in this evidence package. |
| #111 | Required CI invokes claim-policy and receipt persistence scripts using real Postgres/Redis. The exact Testnet provider/network guard refuses Mainnet before actions. Cadence records real hashes/ledgers on PASS or explicit NOT_RUN when repository opt-in is disabled; a green NOT_RUN runner is not live protocol proof. Existing workflows retain evidence30days. Today's local7/7 protocol verdict is real Testnet, disposable custom issuer, separately identified from official-USDC UI proof. |

## Verification and limits

Local qualification: typecheck/lint pass;771tests in68files pass; audit has one low advisory and no moderate-or-higher findings;39environment fields classified,12secrets registered. Fresh PR CI must also pass real Postgres/Redis integrations, production build and real browser download gates before merge. Browser tests inspect private export content only in memory; reports contain no bearer URLs, phrases or seeds.

No arbitrary USDC campaign cap is introduced: wallet principal and liabilities determine affordability. Sponsor capital, admission reservations, release incident/refill ownership and Mainnet operational sign-off remain separate unfinished issues. Vesting and rehearsal are not fabricated as complete. Lantern0.6.2 directory integration and private-link handoff remain unqualified. Mobile campaign approval/export on physical Android is tracked separately from responsive emulation and recipient proof.

Shutdown is requested after this session's tests, merge and ledger accounting. Retain all Railway volumes, configuration and source images; stopping services does not freeze on-chain expiry or return funds automatically.
