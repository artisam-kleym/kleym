# Sponsored Testnet lifecycle: positive sequence passed

Independent verification at **2026-09-29T10:05:46.672Z** confirms the user completed Freighter sender funding, recipient claim and sender expiry reclaim with Kleym's existing wallet helper and claim builders. The verification scripts performed public reads only. Testnet network passphrase, confirmed bodies, exact signature sets and final state were checked. Runtime source matched the preparation manifest at execution; the proof guide was updated afterwards to reflect completion.

| Stage | Hash | Ledger | Actual fee (stroops) |
| --- | --- | --- | --- |
| Funding | f5a830008f420adeeb05e6f405663931c6c6d2a2d2d0a4ec39b7f129661a608b | 4930393 | 400 |
| Temporary-account TX1 | 743e98bab7aacabac41ae4eac23a5be6aa4d97e99b2cd9310f2e76e669b6187c | 4930414 | 600 |
| Recipient claim TX2 | 90e0315c19778d20b36608529a55520079c23d43a59a484dbc234014623253af | 4930421 | 1,000 |
| Expiry reclaim | af76a551510c6ed122d3729562650f4f0a974f0de4cbebe36fcc87df28a03a56 | 4930516 | 100 |

The asset is exclusively `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Sender-owned principal changed **20 → 18 → 19 USDC**; the recipient received **one USDC**. Final balances conserve the original 20 USDC and both wallets hold literal zero XLM. Funding's two sender-sourced operations produced the exact SDK-derived balance identifiers. The recipient was absent through funding/TX1, and TX2 created its sponsored account and trustline. TX2 ledger 4930421 is strictly later than TX1 ledger 4930414. Temporary account and both claimable balances now return HTTP 404.

Reclaim settled at **2026-09-29T10:02:47Z**, after the on-chain predicate expiry **09:58:00Z**. Its only operation claims the exact second balance from the sender. The confirmed envelope contains exactly valid sender and lifecycle-sponsor signatures, and its source/fee payer is the lifecycle sponsor. Receipt and live state agree on the one-USDC credit, **100-stroop / 0.0000100-XLM** fee debit, and **two released reserve units / 1.0000000 XLM**.

Lifecycle sponsor `GA5BFMCDCFO2YONX6GCJEBIN3W5KHG7QJ7JVBLHVL4AL2YM2MVB2QTZZ` reserve units changed **0 → 4 → 7 → 5 → 3**. Three persistent units / 1.5 XLM now back the recipient. It paid **2,100 stroops / 0.0002100 XLM** across the four transactions; final native balance is **9999.9997900**. Bootstrap sponsor `GAHWMILWJ7JW2PKMQNR3TNCD5MZPKAWP3ON5VVYFJVNXWXRY2C6DND7M` separately retains the sender's three units / 1.5 XLM and paid 400 bootstrap fee stroops. No XLM top-up went to either user wallet.

Evidence:

- `independent-claim-proof-2026-09-29T09-58-46-188Z.json`: raw confirmed funding/TX1/TX2 records, operations, exact signature verification, pre-reclaim balance predicate and post-claim account state.
- `independent-reclaim-proof-2026-09-29T10-05-46-672Z.json`: raw reclaim record/operation, exact signature verification, all four saved receipts, final account states, balance/account 404 results, fee totals and reserve accounting.
- Root development-resume `lifecycle-2026-09-29T09-41-59-708Z-*-attempt/receipt.json`: original public attempts and receipts, preserved unchanged.
- `source-manifest.json` and `verification-results.json`: preparation source hashes, 53 focused tests / four files, typecheck, targeted lint and real Chromium request/backup/chooser checks. They remain historical preparation evidence; no tests were rerun for documentation updates.

The successful sequence proves the sponsor-sourced proposal works for these isolated default wallet accounts. It does not establish compatibility for arbitrary signer thresholds or all account states. #97 remains incomplete: nonzero native balance without spendable XLM, existing-recipient trustline combinations, ledger rejection before/after expiry, duplicate/retry/cancel and recovery scenarios, and relevant native-XLM regressions still require their scoped evidence. Unit predicate/signature tests do not replace those ledger scenarios. No production envelope was selected, issue closed, code deployed, or public-network transaction submitted.

Preserve running Windows PIDs **26432** and **20772**: their memory-only keys own persistent sender/recipient reserves. The user can close the completed browser tab; no further signature is needed for this sequence. Retain the private test CSV locally; no link seed or wallet recovery material is included in evidence. Source remains local and uncommitted. Next development gate is the remaining #97 matrix before #98–#100 integration.
