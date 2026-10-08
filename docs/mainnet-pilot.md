# Kleym Mainnet pilot preparation

Updated 2026-10-08. Current development targets Testnet; Railway remains paused. This is a configuration and qualification guide, not a deployment or real-USDC transfer instruction.

## Prize distribution safeguards

Sponsored USDC funding now checks the complete registered list and all remaining pending/failed prize amounts before preparing each wallet signature. The bound sponsor must cover every remaining claimable-balance reserve and funding fee, including the two sponsorship operations per batch. USDC selling liabilities are excluded, and deauthorized sender trustlines are refused. Confirmed prizes are excluded from the remaining budget; submitted batches must resolve before more funding is prepared.

Amounts are limited to positive int64 stroops (`922337203685.4775807` asset units). Browser input, CSV import and API validation share this bound. Review totals use 40-digit Decimal precision to preserve the seventh decimal in large campaigns. Exact public-link registration retries return the existing rows; changes to amounts, labels, claim codes or recipient details are refused.

This is a fresh funding-capacity check, not a reservation of future claim capital. Account balances and issuer authorization can change during wallet approval. Source admission still checks each submitted envelope; claim materialisation, recipient account/trustline reserves, retained sponsorship obligations and fees need separately funded XLM headroom. Concurrent campaigns can compete for capital, and multi-batch funding can still become partial after a later rejection or interruption.

See [October 8 verification](reviews/2026-10-08/prize-funding/README.md). Local unit/build checks passed; the changed PostgreSQL/Redis integration harness awaits a working local Docker runtime. Mainnet deployment, real-wallet signing and operational release gates remain open.

## Public identity

Use the existing app, funding, claim, reclaim and recovery paths with a separate public deployment:

```dotenv
STELLAR_NETWORK=public
NETWORK_PASSPHRASE=Public Global Stellar Network ; September 2015
HORIZON_URL=https://horizon.stellar.org
NODE_ENV=production
APP_URL=https://YOUR_APPROVED_KLEYM_HOST
```

The server selects official USDC issuer `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, checked against [Circle's directory](https://developers.circle.com/stablecoins/usdc-contract-addresses) on 2026-10-01. Freighter must select Mainnet. The API rejects another deployment network or USDC issuer, and the signing paths verify the provider passphrase before new envelopes/submissions. The review explicitly shows real-USDC/public identity.

Use separate database, Redis namespace and public sponsor accounts/secrets through the existing approved configuration mechanism. Do not switch the current Testnet deployment or remove its sponsor keys while its funded links and reserve obligations remain. Cold treasury keys stay out of web/worker configuration. A pool of hot accounts does not implement multisig or automatic refill.

## Read-only proof

```powershell
node node_modules/tsx/dist/cli.mjs scripts/check-stellar-network.ts --network public
```

This script reads only the official provider root, latest ledger and public issuer account. It neither loads `.env` nor signs/submits a transaction. Its success establishes identity and reachability, not an operationally funded sender/sponsor or a working public claim.

## Remaining release evidence

| Requirement | Current evidence / remaining work |
| --- | --- |
| Exact USDC, sender authority, zero-XLM funding | Actual Freighter Testnet funding verified; public account signer/trustline/balance proof still needed |
| Recipient claim and cleanup | Actual Testnet existing-trustline claim and prior recipient matrix; current explicit connect/claim browser boundary uses a wallet bridge fixture |
| Expiry refund and renewal budget | Real Testnet harness receipts plus database/simulated-Horizon app lifecycle; actual app refund/renewal confirmation still needed |
| Lost-response recovery | Exact hash/envelope persisted; app lifecycle and worker recovery checks with simulated Horizon |
| Concurrent sponsor sources and reserve capacity | PostgreSQL admission plus durable envelope journals; independent-process, duplicate funding, expiry/lost-response, capacity and selling-liability fixture proof. Production throughput and whole-campaign treasury capital remain unqualified |
| Operational treasury | Bound sponsor pool exists; capital, campaign/link/retry/fee caps, refill/incident owners, backup and restore proof must be agreed |
| Public release | Exact candidate, migrations, real-wallet validation amount/accounts and rollout need concrete review and authorisation before deployment or transfers |
| Tenant outbound integrations | Canonical URL and execution-time redirect/literal-address guards have local proof. DNS resolution/rebinding and actual deployment egress remain unqualified; #107 stays open |

Mainnet support does not mean Mainnet readiness. Source coordination is implemented and tested locally. Next agree pilot total/recipient/per-recipient caps, XLM capital, refill and incident ownership; prove backup/restore and the remaining actual-wallet flow before separately authorised real-USDC validation. Existing Testnet funds and private claim exports must remain usable. Claim preparation now needs the browser's local link-key signature; reopen saved claim URLs after the app update.

## October 8 reliability and test readiness

Funding preparation now reuses its observed sender/sponsor records and one live
reserve value within the request. Source admission obtains a separate fresh
account/reserve pair under the PostgreSQL source lock. The fixture-qualified path
uses five account/ledger reads rather than the ten calls identified in the previous
source path; provider identity checks remain separate. No financial observation is
cached across admissions. This reduces duplicate provider calls; no production
latency or throughput improvement has been measured.

The current source is ready for drafting a structured Testnet plan. Full execution
requires a stable isolated PostgreSQL/Redis environment, a frozen candidate,
approved HTTPS deployment and actual wallet/device evidence. Lantern needs its
curated Kleym directory entry and rebuilt packages before integrated device QA.
See [readiness assessment](reviews/2026-10-08/reliability-readiness/README.md).
