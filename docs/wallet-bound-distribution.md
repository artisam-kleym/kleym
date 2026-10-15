# Wallet-bound prize distribution

1. In **Recipients & expiry**, select **Only the assigned wallet address** under **Who may claim**.
2. Download the CSV template. Its first nine columns match Kleym's existing export; the final column is **Wallet Address**.
3. Fill one Stellar **G-address** per recipient. Optional `label`, `reference`, `category`, `note` and `amount` cells describe the same row. Leave `public_key`, `secret`, `claim_url` and `claim_code` empty: these are generated later. Save as CSV, not XLSX.
4. Click **Insert attachment**. Entirely empty rows do not count. Every other row needs a valid address. Invalid rows stop import; rows are never sorted or deduplicated.
5. Review the imported count, wallets and prizes, from top to bottom. A blank amount uses the campaign default; individual prize edits keep the same wallet assignment.
6. Continue to **Review & create**. Check every address and amount, confirm your recovery phrase, generate the links, download the private export and acknowledge its backup before signing.
7. Sign the funding batch using the funding wallet. Check ledger confirmation in the campaign before sharing each recipient's own link.
8. The recipient opens their link, connects its assigned wallet and approves the claim. A different wallet is refused. Missing recipient accounts and trustlines can be sponsored in that recipient-approved transaction. No temporary account is created or merged.
9. After expiry, the sender retains the existing reclaim flow. A scheduled deadline is not itself a sender signature or completed refund.

The final export appends **Wallet Address** and keeps each label, link, amount and wallet on the same row. Phrase-based regeneration restores assignments from the registered public rows. Never import a secrets export as a new recipient list. Keep the complete export private.

## Enforcement and compatibility

For new WALLET campaigns, `ClaimLink.recipientPublicKey` is immutable at registration. Funding names this address, rather than the exported link key, as the on-chain claimant before expiry. The sender is the alternate claimant after expiry. Stellar requires the claimant account's authorization; a leaked link key cannot authorize another wallet. See [Stellar claimable balance rules](https://developers.stellar.org/docs/build/guides/transactions/claimable-balances).

The browser keeps its generated link key and recovery phrase private. Only public registration terms reach Kleym. The link key authenticates API preparation but is not a signer on the asset transaction. The recipient and sponsor sign that transaction. There is no payment forwarding or account merge. Conversion and exchange-deposit destinations are unavailable for this policy. Wallet permissions, including delegated signers controlled by its owner, remain Stellar's authority.

Existing OPEN, CODE, EMAIL and PASSKEY balances keep their original rules; WALLET does not retrofit funded links. OPEN/CODE exports keep their existing nine-column layout. Repeated recipient addresses are allowed as separate prize rows with separate balance IDs. The creator's funding address cannot also be a bound recipient.

## Rollout and rollback

The additive migration adds WALLET to ClaimPolicy and a nullable recipientPublicKey column. Existing rows retain NULL. Funding and claim preparation refuse inconsistent policy/binding data. Deploy matching web and worker versions together. Older workers may defer the new balance shape until updated; keep retries enabled.

Do not remove recipient assignments, enum values or the new servicing handlers after WALLET campaigns are funded. A rollback must stop new campaign creation while retaining servicing for existing wallet-bound balances. Preserve PostgreSQL/Redis volumes and all existing campaigns. Mainnet remains subject to its existing separate deployment and release gates.

## Acceptance requiring a wallet owner

Automated construction, browser and database simulations do not prove live wallet or Stellar execution. Before Mainnet release, fund a Testnet campaign, try a wrong wallet, claim with the assigned wallet on desktop and Android, verify exact asset/amount and sponsor fees/reserves from Horizon, then reclaim an unused expired link. Include recipients with an existing trustline, no trustline and no funded account. Keep phrases, exports and private claim URLs out of evidence.
