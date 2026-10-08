# Proposed first Mainnet pilot limits

Status: recommendation requested by the owner, not approved or active settings.
Mainnet distribution remains disabled. Railway remains paused.

**Superseded October 8:** the owner declined a campaign USDC amount cap.
Creators choose prizes according to their available wallet balance. The USDC
campaign/organisation/initial-total rows below are historical proposals only;
none was activated. See `docs/network-workspaces.md`. Operational XLM capacity,
continuing reserve commitments and named owners remain separate release gates.

| Control | Proposed starting value | Meaning |
|---|---|---|
| USDC per campaign | 3 USDC | Three links of 1 USDC for the first live exercise |
| USDC per organisation | 10 USDC per rolling 24 hours | Includes pending/reserved principal; cancellation must not free uncertain transactions |
| Total first pilot | 10 USDC | Review ledger results and operator procedures before raising limits |
| Hot treasury | 100 spendable XLM | Operator-funded proposal, excluding its own minimum reserve and liabilities |
| Sponsorship per campaign | 25 XLM | Maximum admission commitment, including future claim reserves and fees |
| Sponsorship per organisation | 50 XLM | Continuing recipient sponsorship remains charged after claim |

These amounts are containment recommendations, not measured capacity requirements
or spending instructions. A three-link campaign should not normally consume the
whole ceiling. Admission must use the current network reserve, fee bid, existing
commitments and concurrent pending work. XLM reserves are locked capital, and
recipient account/trustline sponsorship can continue after temporary cleanup.

Before activation, name a treasury owner and an incident deputy. The owner
controls the hot wallet and approves replenishment; the deputy can stop new
funding, preserve transaction journals and reconcile unknown outcomes. Cold
treasury custody/signers remain separately controlled. Percentages are guidance,
not automatic refill authority. Increase limits only after a documented review.

This proposal supplies a starting point for #103, #113 and #115. It does not
close those issues: implemented accounting limits, designated operators,
rollback rehearsal, wallet acceptance and full Testnet evidence remain required.

Reserve/fee basis: [Stellar documentation](https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering).
