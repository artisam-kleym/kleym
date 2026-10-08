# Kleym app sending

## Latest: October 6 expiry controls

Campaign creation offers **1 hour, 24 hours, 7 days, 30 days, or Custom** in Recipients & expiry. Custom supports typing separate date and time fields. The displayed local timezone and UTC instant identify the exact deadline. Presets freeze the deadline at selection; navigating the wizard does not extend it. Incomplete or past dates are refused before review and rechecked before key generation/signing. Prepared campaign terms remain locked; funded links cannot be extended by changing the UI.

Public Testnet deployment and verification are recorded in [the October 6 report](reviews/2026-10-06/expiry-ui/implementation.md). Phone behavior is documented in [Mobile claims](mobile-claims.md). Mainnet qualification remains pending. The October 1 local notes below are historical.

## October 1 local sending milestone

The active product checkout is `D:\kleym\.worktrees\app-sending-pilot`, branch
`codex/app-sending-pilot`. Product sending takes priority; GitHub Issues are
deferred under the user's latest instruction. The local app runs at
<http://127.0.0.1:3220>. This is readiness for a small Testnet wallet test.
Actual Freighter Testnet funding, existing-trustline claim and expiry refund
have now been independently verified. Public deployment and the October 7 pilot
still require the remaining release evidence in [Mainnet preparation](mainnet-pilot.md).

The desktop pilot connects directly through the wallet kit's **Freighter
adapter**. Its general wallet modal injects styles blocked by Kleym's strict CSP;
the pilot does not offer that modal or claim support for other wallets/mobile.
Connection and signing check Freighter's selected network. The CSP is unchanged.

Existing campaign phrases accept space/newline-separated words or a complete
numbered list in original order. Copy formatting is normalized locally; invalid
word counts, unknown words and failed recovery checks remain blocked. The wizard
shows the detected count and reason without uploading the phrase.

Mutable local process logs are in `.runtime/app-sending-pilot/`, outside Next's
build output. Current PIDs are recorded in the implementation evidence.

## Working flow

### Source and reserve coordination

Funding, temporary account creation, recipient claims and expiry refunds now
share a PostgreSQL guard per deployment network and transaction source. The
existing `Batch` and `LedgerAttempt` public-envelope journals reserve the source
while an unsigned envelope is valid or an exact submitted hash is unresolved.
Another operation waits instead of receiving the same sequence. Different hot
accounts remain independent. The guard rechecks current sequence and spendable
XLM both before preparation and before recording submission.

Spendable XLM subtracts ledger reserves and native selling liabilities. Admission
budgets the envelope's fee bid, native source payments, claimant reserves and
new sponsored accounts/trustlines using the live base reserve. It does not rely
on reserves that later cleanup operations might release. These checks bound the
next admitted envelope; they do not establish treasury capital or guarantee all
future campaign claims can be financed.

Unsigned envelopes expire after their existing 180-second claim or 600-second
funding/refund signing window. A submitted envelope keeps the source reserved
until its hash is confirmed/failed, or recovery proves absence after a closed
ledger beyond its time bound. Recovery resends only the original signed bytes.
Historical submitted funding is also considered when admitting new work.
Unprepared legacy refund tabs must prepare again; historical settled receipts
still replay without another payment.

Public claim preparation additionally requires a short-lived signature from the
link key, made locally by the browser. It binds deployment origin, network,
phase, link key and (for TX2) destination, conversion floor and memo. Public-key
knowledge alone cannot reserve a sponsor source. Policy checks and transaction
signature checks still apply. Reopen the saved private claim URL after updating
an old browser tab; its secret is never sent with the proof.

This is serialized operation per hot source, not a throughput qualification or
automatic cold-to-hot refill. The verification package is
[source coordination evidence](reviews/2026-10-01/source-coordination/implementation.md).

### Distribution lifecycle

1. Sender creates an official USDC campaign, generates keys in the browser,
   and privately saves the recovery phrase and CSV. Only public link keys and
   the export acknowledgement reach Kleym.
2. For new API-created USDC campaigns, `fundingMode=SPONSORED`: a Classic
   transaction uses the campaign sponsor's sequence and fee, brackets balance
   creation with reserve sponsorship, and sources principal from the sender.
   Sender and sponsor sign. Sender USDC stays in claimable balances until claim
   or expiry. No sender XLM top-up is required.
3. Sender distributes each claim URL from their local CSV. Email-only policy
   is disabled in this wizard because built-in delivery is deferred. Existing
   policies and server email APIs are retained; an email-policy template is
   refused before generating a new distribution instead of changing its policy.
4. Recipient opens a URL, connects a wallet, reviews its destination, then
   presses **Claim**. Opening/connecting submits nothing. TX1 materialises a sponsored
   zero-XLM temporary account and its trustline. TX2 is prepared after a later
   closed ledger, with a minimum ledger bound, then claims, pays, removes the
   temporary trustline and merges the temporary account.
5. Existing recipient with trustline: no recipient transaction signature.
   Existing recipient without trustline: recipient signs for its sponsored
   trustline. Absent recipient: recipient signs for its sponsored account and
   trustline. Permanent recipient reserves stay sponsored; temporary reserves
   are released. All three cases receive USDC without an XLM top-up.
6. After expiry, sender uses **Reclaim unclaimed funds** on campaign detail.
   For sponsored campaigns the sponsor pays the fee, while each claim operation
   and its refund belong to the sender. Each batch is recomputed from live
   balances; already-claimed links are excluded. Historical `SENDER` campaigns
   retain their original fee model.
7. **Renew returned funds** creates one linked successor only after the expired
   round is fully reclaimed. It uses exactly the returned uniform link budget,
   excluding claimed links. Choose the new expiry explicitly, save a new CSV,
   and fund from the returned principal. Live links can be resent from their
   saved CSV without another funding transaction. Existing successors are
   displayed in the original campaign history and prevent another renewal.

The earlier user reissue was independently funded before the original refund.
After verifying that funding and the returned 2 USDC, its existing campaign was
linked to the original as the historical replacement round. This repair changed
only local history metadata, not ledger entries. Current balances: sender 15 USDC
and zero XLM, recipient 2 USDC and zero XLM, replacement 1 USDC unclaimed until
October 31 02:02 UTC / 10:02 Manila. Do not create another renewal of that original
budget. [Renewal proof and limits](reviews/2026-10-01/renewal/implementation.md).

## Ownership and recovery

| File/model | Responsibility |
| --- | --- |
| `src/lib/stellar/batch.ts`, `src/lib/api/batches.ts`, `Batch` | Funding body validation, sender principal, sponsor signing and original signed funding attempt |
| `src/workers/batch-confirm.ts`, `src/lib/queue/batch-confirm.ts` | Closed-ledger funding confirmation and recovery of missing queue jobs |
| `src/lib/stellar/claim.ts`, `src/lib/api/claims.ts` | Two-transaction claim, account-state-specific signers, minimum ledger bound and ledger-confirmed receipt |
| `src/lib/stellar/reclaim.ts`, `src/lib/api/reclaim.ts` | Sender-authorized refunds, sponsor-paid envelopes and settled refund accounting |
| `src/lib/stellar/attempts.ts`, `LedgerAttempt` | Exact prepared hash, public signed bytes, observed ledger result and retry lifecycle |
| `src/workers/ledger-attempts.ts`, worker startup and maintenance | Recover original claim/reclaim transactions without browser spending keys |
| `src/app/(public)/claim/claim-flow.tsx` | Browser-only fragment signing and in-memory retry of the original claim after a lost response |
| `src/app/(sender)/campaigns/[id]/reclaim-panel.tsx` | Wallet authorization, sequential refunds and visible receipts after partial progress |

`LedgerAttempt` contains public bodies and signed envelopes, never seeds or
phrases. Current scopes are one per link/phase and one per campaign reclaim.
States are PREPARED, SUBMITTED, CONFIRMED, SETTLED and FAILED. Preparation is
serialized per scope; unsigned preparations can be refreshed, but an uncertain
submitted transaction cannot be replaced by another sequence. The original
signed bytes are stored before Horizon and checked by their exact network hash.
Confirmed refunds remain in `ReclaimBatch` when the next reclaim replaces the
current attempt. Refund replay is checked before requiring balances to exist.

Claims require every prepared signer, including the sponsor and ephemeral key
and, only when needed, the recipient. A changed destination, fee or operation
body is refused. Expiry or suspension blocks a fresh claim submission; recovery
may still record an earlier confirmed transaction, but cannot resend it.
Unknown responses and spent-sequence errors stay pending. Explicit rejections
can be prepared again. An expired pending body is retired only after a closed
ledger past its time bound and a repeated lookup of its original hash.

Apply additive migration `20261001010000_claim_reclaim_attempts` before running
this app/worker version. Historical campaign and settled accounting rows are
preserved. The local pilot and verification databases have both been migrated.

The sponsor remains Kleym's operational XLM float. Proposed hot/cold treasury,
automatic refill and independent multisig recovery are separate designs; this
implementation does not create those services or place sender USDC in a treasury.

## Proof and remaining test

Evidence: [October 1 implementation report](reviews/2026-10-01/app-claim-reclaim/implementation.md).
The lifecycle fixture uses real app services, PostgreSQL, Redis and SDK
signatures with simulated Horizon. Its operation effects are fixture assertions;
they do not replace a live Stellar ledger result. Browser checks cover rendering,
privacy, CSV gating and policies, not a real Freighter signature.

### First actual-app Testnet cycle

Open <http://127.0.0.1:3220/campaigns/new> in Brave and use the existing private
local login. Keep the app tab open throughout the test.

1. Select **Kleym Sender** in Freighter on **Testnet**. Use sender
   `GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A`.
2. Create a campaign of **2 links × 1 official test USDC**, **Anyone with the
   link**, with expiry about **15 minutes ahead**. Privately save the phrase and
   CSV. Review the funding transaction before signing; the sender contributes
   exactly 2 USDC and Kleym pays XLM fees/reserves.
3. After funding is confirmed, return with the public campaign ID or transaction
   hash for independent ledger review. Do not repeat funding.
4. After review, open only the first URL from the CSV, connect the existing
   recipient `GCUFES42LLEWVEAI6TZDQUO63ROTR2ILUMNP4K7XCTHFT5F6NKSXGH3I`,
   and claim. Keep the second URL unused for expiry reclaim. Share only the
   public claim receipt, not either URL or the CSV.
5. After expiry and claim review, reconnect Kleym Sender on Testnet and reclaim
   the unused 1 USDC from campaign detail. Return with its public hash.

Read-only preflight at 2026-10-01T07:49:52Z found sender **17 USDC / 0 XLM**,
recipient **1 USDC / 0 XLM**, and sponsor **9999 spendable XLM**. With no other
transactions, expected sender is **15 after funding, 16 after reclaim**;
recipient is **2 after claiming**. Both retain zero XLM. Re-read balances at the
actual test start; these are a timestamped preflight, not a permanent guarantee.

## Prize distribution reliability — October 8, 2026

Active source: D:/kleym/.worktrees/app-sending-pilot, codex/app-sending-pilot, base 4163d7954bff9c1582c0c405174cddbe6951da33; existing local work preserved. New changes refuse incomplete prize lists/plans, check all remaining sponsored USDC funding principal/reserves/fees, exclude confirmed batches and pause submitted ones. Amount limits use exact positive int64 stroops shared by CSV/API/browser; large review totals use 40-digit Decimal precision. Exact public registration retries are idempotent; changed prize terms/codes and duplicate keys are refused. See docs/reviews/2026-10-08/prize-funding/README.md and verification.json for final checks and source hashes.

Final full unit suite: 661 tests / 54 files passed. Focused money boundary/retry tests use mocked DB/Horizon; the extended real PostgreSQL/Redis funding harness has NOT run because Docker Desktop startup failed on an inaccessible sailor-ingest.sock. Limited stop/rename recovery failed; no Docker data/socket deletion or reset was performed. Restore local Docker and rerun funding/source-coordination/app lifecycle before qualifying this candidate. Read-only Mainnet root/issuer/latest-ledger proof passed at ledger 64835115, zero writes; this is not a Mainnet transfer qualification.

Whole remaining funding checks are fresh observations, not an atomic capital allocation or a future-claim reserve guarantee. Mainnet readiness remains unproven: real deployed wallet/device flows, Lantern directory-enabled rebuild, backup/restore, capital/caps/refill/incident ownership and approved release remain open. Railway remains paused; no deployments, wallet signatures, transfers or GitHub changes performed. Final static/build outcomes are in verification.json. Source changes remain local and uncommitted.

## Individual prize amounts — October 8, 2026

In the active app-sending-pilot checkout, the campaign UI now exposes existing per-link amount support directly: default amount per link, Prize amounts editor (10 rows/page), blank fields inherit the default, reset all, invalid-row errors, live exact total and read-only review breakdown. Example: five people at 20/15/10/default5/default5 =55 USDC. Row amounts align through browser keys/private CSV/public registration and sponsored SDK operations. Names preserve manual overrides; explicit CSV amount columns replace them, and manual edits synchronize imported CSV terms. Removed-link overrides are discarded when count shrinks. Public template snapshots preserve edited terms. Existing backend/ledger money guards and schema are reused.

Full suite667/55 files, six focused amount/export/SDK tests, five real-Chromium actual-wizard UI checks with fixture reads and wallet/router stubs, focused lint, serial final TypeScript and production build passed. Screenshots inspected. Read docs/reviews/2026-10-08/custom-prizes/README.md and verification.json. Initial generated-types race and editor-collapse test failure retained; final checks pass after fixes. This is local UI/SDK proof, not deployed wallet/ledger acceptance. Railway remains paused; no deployment, live signatures, transfers or GitHub changes. Mixed-amount campaigns retain expiry reclaim but the existing automatic renewal gate still only permits equal-amount campaigns. Mainnet qualification remains open.

## Reliability and test-plan preparation — October 8, 2026

Funding preparation now avoids duplicate sender/sponsor/ledger reads within each
request. Admission under the source lock still obtains fresh sequence, reserve and
liability observations. The current combined fixture path uses five provider reads;
the previous source required ten. No production throughput was measured.

Private/reserved literal outbound destinations and redirects are refused across
webhooks, screening, SSO and federation. SSO JWKS now uses the intended guarded
transport. DNS rebinding/deployment egress remains a Mainnet gate. Native BullMQ
loading removes queue bundling warnings without changing the configured backend.

734 unit tests and five production-browser Lantern fixture checks pass, alongside
TypeScript, lint and build. We can draft the Testnet plan; complete execution needs
stable isolated DB/Redis, approved HTTPS candidate and actual wallet/device access,
plus a directory-enabled Lantern rebuild. Railway remains paused and this source
is local. [Full readiness assessment](reviews/2026-10-08/reliability-readiness/README.md).
