# Freighter setup and issue #97 proof

Updated 2026-09-29. **The positive sponsored sender bootstrap → official-USDC funding → absent-recipient claim → expiry reclaim lifecycle passed with actual Freighter signing and independent Testnet verification.** Final sender balance is **19 USDC / zero XLM**, recipient balance **1 USDC / zero XLM**. Both account/trustline pairs remain sponsored. Temporary account and both claimable balances are removed. The broader #97 matrix is incomplete; no production envelope is selected.

| Stage | Confirmed ledger | Actual fee (stroops) |
| --- | --- | --- |
| Sender bootstrap | 4930040 | 400 |
| Two one-USDC balances funded | 4930393 | 400 |
| Temporary-account TX1 | 4930414 | 600 |
| Recipient claim TX2 | 4930421 | 1,000 |
| Expiry reclaim | 4930516 | 100 |

Funding/claim/reclaim fees total **2,100 stroops / 0.0002100 XLM**, paid by the lifecycle sponsor. Bootstrap separately cost 400 stroops. Reclaim released **two reserve units / 1.0000000 XLM** to the lifecycle sponsor; its remaining three sponsored units back the recipient. The different bootstrap sponsor retains the sender's three units. TX2 settled strictly after TX1. Exact sender/recipient/ephemeral/sponsor signature sets were verified from confirmed envelopes. Evidence: root `docs/reviews/2026-09-29/development-resume/freighter-lifecycle/positive-lifecycle-report.md` and `independent-reclaim-proof-2026-09-29T10-05-46-672Z.json`.

Recipient: `GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW`. Historical absence proof is root `docs/reviews/2026-09-29/development-resume/recipient-preflight.json`; the funding/TX1 receipts also confirmed absence. This address is now activated by the successful sponsored claim and cannot be reused as an absent-recipient fixture.

Sender: `GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A`. The earlier absent-account observation is root `docs/reviews/2026-09-29/development-resume/wallet-address-preflight.json`. Current setup receipt is `bootstrap-receipt-2026-09-29T09-17-54-131Z.json`; independent canonical ledger proof is `freighter-bootstrap-independent-ledger-proof.json` in the same root evidence directory. The initial receipt omitted the ledger number because SDK 16.2.0 exposes it as `ledger_attr` (while `ledger` is a follow-up method); the independent raw Horizon proof supplies canonical ledger 4930040 without altering the historical receipt. Preserve running Windows PID 26432 and its memory-only sponsor key; it now sponsors the sender's persistent reserves.

## Acquire sender-owned official test USDC

After successful sponsored bootstrap, open [Circle's official faucet](https://faucet.circle.com/). Select **USDC**, select **Stellar Testnet**, and paste the sender G-address above in **Send to**. Request the offered test tokens and complete any human verification in the browser. No private key or wallet recovery phrase is required. Do not request XLM or fund the recipient. The sender's trustline limit is 100 USDC; keep its total faucet funding within that limit.

After the faucet reports success, independently inspect sender balances and payment history for the exact official test issuer and amount, its continuing literal zero-XLM balance, and recipient absence. Record the funding transaction hash and ledger. Faucet success alone is not proof of receipt. Actual sponsored sender-owned funding/claim/reclaim comes next and must reuse the existing claim protocol with local ephemeral signing. Circle currently lists one request per asset/network pairing per two hours; do not retry a confirmed request just to improve evidence.

## Interactive lifecycle continuation

The faucet receipt is independently verified: **20.0000000 official test USDC**, sender native balance **0.0000000**, three sponsored reserves, and recipient HTTP 404 at `2026-09-29T09:29:58.419Z`. Payment `bb4e6d3ab4f5b7b8ab060d3ff44ddce0377bcea852b5dde8fb45a474f43970b7` succeeded in ledger **4930100**. Root evidence: `docs/reviews/2026-09-29/development-resume/sender-test-usdc-faucet-proof.json`.

The completed lifecycle page runs at **http://127.0.0.1:3218**, Windows PID **20772**. Preserve bootstrap PID **26432** and its sender reserve sponsor key. Lifecycle sponsor `GA5BFMCDCFO2YONX6GCJEBIN3W5KHG7QJ7JVBLHVL4AL2YM2MVB2QTZZ` now owns the recipient's three persistent reserve units and holds **9999.9997900 Testnet XLM**. All four stages have passing receipts. Original preparation evidence is retained separately.

Executed sequence for this completed session:

1. Select **Kleym Sender / Testnet**, connect Freighter, generate two test keys, download `kleym-testnet-lifecycle-keys.csv`, and acknowledge that it is saved privately.
2. Prepare **2-USDC funding**, inspect the sender-owned principal and sponsor-paid fees/reserves, sign in Freighter, then separately submit. Two sponsored balances each hold one official test USDC; the recipient stays absent. Keep this tab open and return the public confirmation to Codex.
3. After funding evidence is verified, switch to **Kleym Recipient / Testnet** and connect again. Begin recipient claim deliberately submits locally signed temporary-account TX1. Wait for a later ledger, prepare TX2, approve the recipient signature in Freighter, and separately submit. Existing builders deliver one USDC, remove the temporary trustline/account and sponsor the recipient account/trustline.
4. Switch back to **Kleym Sender / Testnet**. After the second balance's five-minute expiry, prepare, sign and submit the one-USDC reclaim. The first balance expires after one hour. Review envelopes have five-minute timeouts; prepare again if an unsigned envelope expires.

The CSV contains private test-link keys; retain it on the user's computer. Do not attach it to conversation or evidence. Restore controls read it locally and validate the original addresses without uploading it. The `claim_url` column is blank: these fixtures exercise the protocol and are not distributable production links. Link seeds never enter server requests; only public keys and signed envelopes do. The operational sponsor key stays in server process memory.

Receipts verify exact principal, zero-XLM balances, required signatures, fee debits, reserve ownership/release, balance removal and strictly later-ledger cleanup. Confirmed assertion failures block continuation. Unknown submissions must resolve the recorded original hash before replacing work or restarting. If the first balance expires during a long pause, recovery needs a separately reviewed sender reclaim; the current positive-path controls do not automate it.

Launcher for a future session, after checking existing listener/attempts and ledger state:

```powershell
.\scripts\start-freighter-lifecycle.ps1 -Sender GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A -Recipient GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW -EvidenceDirectory D:\kleym\docs\reviews\2026-09-29\development-resume
```

**53 focused tests / four files**, typecheck, targeted lint and Chromium desktop/390px checks passed before user execution. Browser automation covered the local backup gate, no seed disclosure to DOM/storage/requests, request guards, no automatic submission and the Freighter-only chooser without CSP errors. Actual user Freighter signing and ledger settlement are separately established by the public receipts and independent proofs. Evidence: root `docs/reviews/2026-09-29/development-resume/freighter-lifecycle/`. Remaining #97 scenarios below require further proof; no production funding/reclaim envelope is selected.

## Historical interactive sender bootstrap

Run the isolated script from this checkout, using an existing evidence directory:

On Windows, use the hidden standalone-process launcher to keep the page independent of the terminal/tool session:

```powershell
.\scripts\start-freighter-bootstrap.ps1 -Sender GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A -Recipient GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW -EvidenceDirectory D:\kleym\docs\reviews\2026-09-29\development-resume
```

The launcher records the public process ID and refuses a second listener on port 3217. Check existing attempts/receipts and live account state before replacing any missing process; its sponsor key is lost when the process ends. This does not install a service or schedule an automatic restart. The direct foreground invocation remains available:

```powershell
node_modules\.bin\tsx.cmd scripts/spike-freighter-bootstrap.ts GBV6O3M2T6MEAC452TFCRJIQ7OUDD3GUZR3VXTVSME6WLQDXGFOQQY5A GAI3YINEC6REIMIUYBYV4FRE4MPUS3BA7KKXQTDPUVB7SKGNCG5LDHWW D:\kleym\docs\reviews\2026-09-29\development-resume
```

Open `http://127.0.0.1:3217` in Brave. Select Kleym Sender and Testnet in Freighter, then use Connect Freighter, Prepare sender setup, Sign in Freighter and Submit sender setup. Connect uses the existing Kleym wallet kit/helper with a Freighter-only selection and checks the actual selected adapter, address and passphrase. Existing application callers retain their default wallet choices. Opening/connecting submits nothing. Preparation Friendbot-funds only a separate disposable sponsor; it does not activate either user address. Sender creation requires the user's Freighter signature and a separate Submit click.

The reviewed sponsor-sourced transaction has four operations: begin sponsoring the sender, create it with `startingBalance: '0'`, create the official test-USDC trustline from the sender with limit `100`, and end sponsorship from the sender. This sets a maximum trustline holding, not a transfer of 100 USDC. The sponsor pays all four operation fees and three base reserves. The recipient is untouched. The server holds only its disposable sponsor key in process memory; restarting loses that key. This is a spike fixture, not production treasury handling. No sender key, recovery phrase or link seed is requested or received.

The initial preparation incorrectly treated the historical charged-fee p95 as a mandatory minimum, causing a false fixture-cap failure. The corrected Classic fee bid uses the validated `last_ledger_base_fee`, tenfold headroom, a minimum bid of 1,000 and the unchanged maximum of 10,000 stroops per operation. If the ledger base fee itself exceeds the cap, preparation still refuses. Fee validation occurs before Friendbot funding. The review exposes the live base fee, per-operation bid and cap; actual fee paid is checked from the ledger receipt, not inferred from the bid. At the follow-up preparation check (2026-09-29 09:13:02 UTC), the live base fee was 100, the bid was 1,000 per operation / 4,000 total, HTTP 200 returned and both user addresses remained absent. See root `docs/reviews/2026-09-29/development-resume/freighter-fee-fix-prepare-result.json`.

### Freighter zero-XLM advisory

The user observed `INSUFFICIENT FUNDS FOR FEE` in the Freighter popup and confirmed Sign/Approve remained available. Installed Freighter 5.48.0 public source (`src/popup/views/SignTransaction/index.tsx`, lines 371–401) tests the displayed balances against the fee and renders a dismissible warning. Its acknowledgment sets `hasAcceptedInsufficientFee`; `src/popup/components/WarningMessages/index.tsx` labels that action **Got it**. This is an advisory observation, not a Horizon rejection. Source excerpts/hash are in root `docs/reviews/2026-09-29/development-resume/freighter-fee-warning-source-evidence.json`.

For this exact sponsored Testnet setup, acknowledge **Got it**, review the four operations and confirm signing, then return to the local page and click **Submit sender setup**. Preserve the zero-XLM fixture; do not use Friendbot or Freighter's Send flow to top up the sender/recipient. This guidance applies to this inspected fee advisory only. Actual signature compatibility and ledger acceptance remain pending until the receipt passes. Preflight at 2026-09-29 09:21:01 UTC found both user accounts absent, all disposable sponsors holding 10,000 Testnet XLM with zero sponsored entries, and no saved submission attempt/receipt.

Submission checks the original body hash and exactly the required sponsor/sender Ed25519 signatures. Evidence names contain the session timestamp; attempts are saved before submission and retries resolve the original public transaction hash. Confirmed receipts inspect literal zero sender XLM, account/trustline sponsors, three sponsored reserves, exact sponsor fee debit and continued recipient absence. A failed assertion is retained and blocks continuation. This bootstrap does not prove principal funding, claim, reclaim or the full issue #97 acceptance matrix. Acquire official test USDC only after confirmed sponsored setup.

## Setup on the user's desktop browser

1. Install the browser extension from [Freighter's official site](https://freighter.app/).
2. Create a fresh development wallet in the extension and save its recovery phrase privately. Keep the phrase and signing keys in the wallet/local recovery material.
3. Select **Testnet** from the wallet's network selector, following [Stellar's official setup guide](https://developers.stellar.org/docs/build/guides/freighter/connect-testnet).
4. Prepare distinct sender and recipient addresses. Keep the initially absent recipient unactivated: skip its Friendbot funding prompt and do not add a trustline or send it XLM. Friendbot is for separate sponsor/bootstrap fixtures; topping up that recipient invalidates the absent-account proof.
5. Record only the extension version, browser version, selected network and public addresses. Recheck recipient absence against testnet Horizon before the first claim. Wallet setup alone does not prove supported signing.

The standard Stellar guide describes Friendbot funding. Step 4 is Kleym's acceptance-specific modification: an absent recipient must receive through Kleym sponsorship. The sender fixtures must already own enough official test USDC with appropriate account/trustline sponsorship. An unfunded address cannot own principal.

For installed Freighter 5.48.0, the public application source exposes **Wallets → Add wallet → Create a new wallet**. This creates another wallet from the existing locally held recovery phrase. Use a distinct public address for the sender, label it `Kleym Sender`, and keep Testnet selected. Keep the original recipient unfunded. Share only the sender public G-address for the next fixture preparation; do not fund either address until its role-specific setup is ready.

## Reuse and protocol gate

Reuse `src/lib/wallet/signing.ts`, the installed wallet kit, `scripts/spike-claim.ts`, `scripts/spike-diagnose.ts` and `SPIKE-FINDINGS.md`. The existing helper passes the selected address and network passphrase to the wallet kit. Historical Node keypair signatures establish neither current Freighter signing nor the sender sponsorship extension.

Prototype the proposed sponsor-sourced funding transaction with sender-sourced principal operations and a reserve-sponsorship bracket. Inspect the exact operations and required signer addresses before any testnet submission. Select the production envelope only after actual Freighter approval and independent ledger proof. A sender-sourced fee-bump alternative remains a comparison if the proposed envelope fails wallet compatibility; neither design is selected by this document.

## Required observations

| Scenario | Evidence to retain |
| --- | --- |
| Sender has official test USDC and no spendable XLM | Before/after exact USDC, native balance, minimum reserve and liabilities; Freighter signature; successful funding hash and balance sponsor |
| Fully sponsored sender holds USDC and literal zero native balance | Sender account/trustline sponsorship, required signatures and successful funding/reclaim; no hidden XLM top-up |
| Recipient absent from ledger | Pre-claim 404, actual required Freighter signature, exact received issuer/amount, sponsored account/trustline and post-claim ephemeral 404 |
| Existing recipient without spendable XLM, with/without the required trustline | Exact received USDC, conditional signer set and persistent reserve obligations |
| TX1 followed by TX2 | Confirmed ledger sequences showing TX2 strictly later, temporary trustline removal and account merge |
| Expiry and reclaim | Sender refused before expiry, recipient refused after expiry, sender-authorised exact reclaim and reserve release to the actual sponsor |
| Duplicate/retry/cancel | No second settlement; no submission from opening/connecting; recoverable cancellation and deliberate retry after TX1 |

Store public identifiers, transaction hashes, ledger sequences, exact amounts and reserve/fee deltas in dated evidence. Do not retain recovery phrases, link seeds, bearer URLs or wallet credentials. Keep public-network activation separately scoped.
