# Actual app Testnet funding confirmed

User signed through desktop Freighter, reported an insufficient-XLM fee warning,
and reached the submitted-batch screen. Independently verified against official
Horizon on the Testnet passphrase at 2026-10-01T09:57:59Z:

- Campaign cmupcw5ey0004y8kjq7oryzzk is ACTIVE; batch1 CONFIRMED.
- Hash36edf24fbfb993423690fe9709e6d19d06b17e67d16cf3337c09c627d71aa0ae,
  successful, ledger4964955. Source and fee account are the configured sponsor.
- Actual fee400stroops/0.00004XLM; sender debit exactly2officialTestnetUSDC,
  proven from transaction effects. Both sender and sponsor signatures verified.
- Sender15USDC/0XLM; existing recipient1USDC/0XLM before claim.
- Two1-USDC balances, correct official issuer, sponsor and recorded ephemeral
  claimants; sender owns complementary expiry reclaim at10:07Z/18:07Manila.
- Sponsor numSponsoring4: two claimants per balance. No sender XLM top-up.

The warning's exact internal Freighter logic was not established. It did not
prevent this confirmed transaction, and the ledger establishes who paid. Do not
generalize this as permission to ignore other warnings. Initial verifier assumed
database display order equalled operation order; corrected the harness to bind
each stored balance ID to its actual operation, without relaxing owner/predicate
checks. Public full transaction and verified proof are retained alongside.

Next user action: Go to campaign, keep the latest CSV private, switch Freighter
to the known Kleym Recipient (GCUFES42...KSXGH3I) on Testnet, open only the first
private CSV link and use Connect wallet to claim. Existing correct trustline
means no recipient transaction signature is required. Return with public claim
receipt/hash; leave second link unused for expiry refund. Expected recipient2
USDC/0XLM and sender15USDC/0XLM, if no other activity. No new ledger write by agent.
