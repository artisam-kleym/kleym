# Kleym app sending — October 1

The active product checkout is `D:\kleym\.worktrees\app-sending-pilot`, branch
`codex/app-sending-pilot`. Product sending takes priority; GitHub Issues are
deferred under the user's latest instruction. The local app runs at
<http://127.0.0.1:3220>. This is readiness for a small Testnet wallet test.
An end-to-end Freighter cycle through this app is still required before a
public deployment or the October 7 pilot can be qualified.

Mutable local process logs are in `.runtime/app-sending-pilot/`, outside Next's
build output. Current PIDs are recorded in the implementation evidence.

## Working flow

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
4. Recipient opens a URL and connects a wallet. TX1 materialises a sponsored
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
