# Renewal and deliberate claim — 2026-10-01

## Requirements and decision

Renew unused campaign principal without creating a simultaneous additional payout. Preserve sender authority, browser-only recovery material, immutable funded predicates, ledger settlement and historical receipts. Keep the same code path usable with official USDC on both Stellar networks.

Stellar claimable balances are immutable ([CAP-0035](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0035.md)). A funded balance's expiry cannot be edited. This implementation uses an expired, fully reclaimed original round and a linked successor; old balance IDs and claim URLs remain historical. Reuse live URLs from the private CSV when merely resending. Renewal requires fresh keys and a fresh private CSV.

## Implementation

- `Campaign.renewalOfId` is a unique, nullable self-reference; `renewalBudget` records the returned principal. Additive migration leaves historical rows unchanged.
- Server eligibility requires expiry, RECLAIMED settlement, final funded links, positive returned principal, matching refund receipts/link amounts/counts/principal owner, and no original balances left in the sender's live Horizon stream. A missing balance alone is insufficient.
- Creation binds the same sender, network, exact asset, uniform amount and returned link count. Claimed links are excluded. The unique constraint prevents two successors under concurrent requests. Registration refuses variable amounts on a renewal, so per-link overrides cannot inflate its budget.
- `?renew=` and old `?reissue=` URLs share this gate. A refusal no longer silently opens an ordinary new campaign. Unexpired rounds provide instructions to wait/reclaim or resend the saved link, without an extra-funding action.
- Original detail links to the successor and successor links back. An unfinished DRAFT resumes its same ID, stored public fingerprint/path and registered keys; terms are locked and a different phrase is refused. Active successors use their original campaign/CSV recovery tools.
- Renewal chooses its expiry explicitly. `datetime-local` now receives local clock fields rather than a truncated UTC instant; the review displays local timezone and the UTC instant.
- Connecting Freighter on the claim surface only requests access and displays the destination. Separate Claim commits. The wallet account/network are rechecked before materialisation; a changed destination returns to review before spending.
- Read-only `scripts/check-stellar-network.ts` verifies official provider identity, issuer existence and current ledger parameters on either network, without reading secrets or offering a submission operation.

## Bounds and rollout

Equal-amount campaigns are supported for renewal. Variable-amount renewal is refused with an explanation. This does not reverse the earlier separately funded user reissue. It does not extend a live balance or make a reclaimed old URL reusable. Refund and renewal funding remain two deliberate wallet steps; arbitrary partial refund budgets do not unlock renewal.

The migration has been applied to the local populated pilot and separate verification databases. Historical pilot rows retain null renewal fields. Deploy migration before new code; leave fields in place when rolling back application code. Old reissue application versions can still create independent distributions, so do not restore their UI as a renewal flow.

The runtime remains Testnet. Public configuration is supported, with Circle's public issuer rechecked against its [official directory](https://developers.circle.com/stablecoins/usdc-contract-addresses). No Mainnet wallet signing, asset movement, deployment, treasury refill or multisig activation has been performed. Shared sponsor sequence/capacity concurrency, operational caps/capital/owners and a separately authorised small public validation remain release gaps.

## Verification

- 224 unit checks across 10 relevant test files passed: renewal eligibility/terms, timezone round-trip, campaign schema, network identity, wallet signing, phrase/key derivation, batch, claim, reclaim and claim state machine.
- 104 complete local app lifecycle checks passed using the real verification database/Redis and simulated Horizon. They include exact refunded-budget renewal funding, sender zero XLM, original status preservation, duplicate successor creation, registration override refusal, lost-response/worker recovery, and all three recipient account modes. `lifecycle.json` preserves each assertion. No Stellar network writes occurred.
- 16 Chromium claim checks and 10 existing wizard/CSV checks passed against the production build. Wallet commitment tests use the installed Freighter message protocol with a bridge fixture; they do not establish a fresh actual-extension transaction after this change.
- Real authenticated browser/HTTP checks cover expired-unrefunded and unexpired refusals, no fallback funding wizard, an eligible returned-budget form before the history repair, and the existing-successor refusal after repair. `browser-before-history-link.json` preserves the earlier form checks; `browser.json` records final behaviour.
- `refund.json` independently verifies the user's already-submitted refund and current accounting. `mainnet-identity.json` verifies public provider/issuer identity and ledger parameters through read-only official-provider requests.
- TypeScript and changed-file ESLint passed. Final webpack build/running service state is recorded in `verification.json`. Existing Next middleware and optional BullMQ Valkey warnings remain.

## Existing user round repair

The original campaign `cmupcw5ey0004y8kjq7oryzzk` was already reclaimed on Testnet: `84874377481e48be0fdd11712f2adf949ea3af69f7a6425a4af3a369ac0cc141`, ledger 4965208, exactly 2 USDC returned, sponsor fee 200 stroops, both required signatures verified. Current sender 15 USDC/zero XLM; recipient 2 USDC/zero XLM. The earlier reissue `cmupd9xde0008y8kjuywfibzl` still contains 1 USDC until October 31 02:02 UTC.

That existing reissue was funded before the refund under the old flow. Reissuing the original again would duplicate its intended replacement budget. After checking organisation/sender/asset/amounts, confirmed funding signatures and operation-bound balance IDs, and the original settled refund budget, `link-existing-round.ts --apply` linked only these two local records. This is a historical exception to the new refund-before-funding gate. It updates lineage/budget metadata and appends an audit event; no ledger entry or funded predicate changes. The original now displays its existing replacement and refuses another successor.

Initial harness corrections: the database had already advanced to RECLAIMED, contrary to the previous checkpoint; Next adds another alert element, so selectors now target the visible alert paragraph; claim operations omit amounts, so exact refunded asset/amount verification uses the public transaction effects. These were harness assumptions, not app changes or extra refunds.

The second build caught the history-repair script's new audit action missing from the typed registry. The registry now includes that action; no audit event or financial record was deleted to satisfy the build.
