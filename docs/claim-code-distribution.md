# Distributing links with claim codes

Select **Anyone with the link AND a claim code** under **Who may claim** when creating a campaign. Each link receives its own 13-character code, generated in the browser beside its key. Review & create explains the protection before generation and confirms the number of codes ready for export.

The existing secrets CSV remains compatible with Excel and other spreadsheet applications. Import `claim_code` as Text to preserve any leading zeros. Its columns stay:

```text
label,public_key,secret,claim_url,reference,category,note,amount,claim_code
```

Each code-protected row contains its own `claim_url` and matching `claim_code`. Open-link campaigns retain the same format with empty code cells. The code is not appended to the claim URL. Code-protected exports refuse missing, malformed or duplicate codes before a file is downloaded; the same check applies when regenerating the CSV from the campaign recovery phrase.

## Creator steps

1. Configure the campaign, recipients, individual amounts and expiry as usual.
2. Select the claim-code policy and continue to Review & create.
3. Privately save the recovery phrase, generate the keys and download the secrets CSV.
4. Find the downloaded file on your device and confirm that it is saved before signing.
5. Approve funding and wait for the campaign to show funded links.
6. Send each recipient only their own `claim_url`. Send the matching `claim_code` through a separate channel, for example a call or an independently controlled messaging account. Keep the complete spreadsheet private.

## Recipient steps

Open the link, enter its claim code, then connect the destination wallet and deliberately claim. Code entry does not itself transfer assets. Wrong codes are refused; five wrong attempts temporarily lock that caller for fifteen minutes. A token earned for one link cannot authorize another link. The policy is checked on materialisation, claim preparation and submission.

The server stores a hash of the claim code; recovery phrases and Stellar link seeds remain browser-only. Codes derived from the recovery phrase can be regenerated with the same campaign derivation index. No server endpoint can reproduce the secrets CSV.

Kleym refuses its claim flow until the code is verified. Anyone holding both the link and the code can claim; the policy does not bind a specific person or wallet. Sending both in the same message or sharing the whole spreadsheet loses that separation. OPEN links already funded stay OPEN: selecting CODE applies to the new campaign, not retroactively to existing links.

## Security boundary

The current claim URL contains the actual Stellar claimant signing key. CODE is enforced by Kleym's APIs and is not an additional on-chain signing requirement. A holder who extracts that key could create/fund the claimant account and submit a direct claim with their own fees/reserves, bypassing Kleym's code check. The current `claimantsFor` builder in `src/lib/stellar/batch.ts` uses claimant identity and expiry predicates; it does not encode the code. See [Stellar's claimable-balance rules](https://developers.stellar.org/docs/build/guides/transactions/claimable-balances).

Do not describe this release as cryptographic protection against an intercepted link. Keep links private. Preventing a URL alone from revealing the usable signing key requires a versioned encrypted-link/key-derivation design, with recovery-phrase regeneration, old-link compatibility and independent ledger acceptance. That protocol change is not implemented in this CSV/UI update.
