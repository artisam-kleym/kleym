# Wallet-sized campaigns, network UI and outbound transport

Owner decision: no product USDC campaign amount cap; retain manual G-address
lookup alongside connected-wallet funding. Mainnet has no separate HTTPS address
and stays unavailable. No deployed environment or Railway service changed.

## Changes

- Campaign network shows selected Testnet/test funds and disabled Mainnet.
  Optional operator-configured other-network origin opens a fresh tab without
  transferring drafts, keys, phrases, URLs, sessions or campaign identifiers.
  Every sender page displays its network/value notice.
- Manual balance lookup remains. Gross balance is preserved in the API;
  available credit principal subtracts selling liabilities, and native XLM
  also subtracts live minimum reserve. No USDC campaign/organisation caps from
  the earlier proposal were activated. Protocol precision/range and actual
  principal/sponsorship capacity checks remain.
- Invalid/checksum-failing public addresses are never queried. Failed provider
  reads remain unavailable rather than incorrectly shown as absent accounts;
  retry is explicit. Cancelled/stale reads cannot replace current balances.
- #107 default integration HTTPS transport validates all DNS answers at socket
  creation, passes checked results to that connector, rejects mixed/private
  sets and rechecks on each new connection. TLS hostname validation stays on;
  redirects, oversized responses and transport failures are safely refused.
  Isolated nonproduction loopback and trusted fixture transports remain.

## Executed local evidence

Root evidence: `D:/kleym/docs/reviews/2026-10-08/network-wallet-progress/`.

- 770 unit tests / 68 files passed; full TypeScript and lint passed.
- 39 configuration keys/12 secrets classified; mnemonic guard and Prisma
  schema validation passed. Two new workspace origins are public-only fields.
- Actual desktop/phone-sized CampaignWizard Chromium proof passed five existing
  scenario groups plus selected-network/unavailable-Mainnet/manual-address
  assertions. Screenshots inspected; no horizontal overflow or page exceptions.
  This uses fixture reads/router/wallet stubs, not physical signing or deployment.
- Read-only actual public Testnet Horizon GET returned HTTP200 through the
  default production DNS/TLS transport, with the exact Testnet passphrase.
  `public-https-read.json` records PASS and **zero chain writes**.
- DNS fixtures exercise public/private mixtures, mapped/reserved IPv6, empty
  answers, public-to-private rebind, failure/abort and actual HTTPS connector
  refusal: a listening private endpoint received zero request bytes.
- Consumer tests retain guarded webhook/screening/OIDC/JWKS/userinfo paths,
  real local redirect refusal and credential-free error categories.

Initial DNS failure test used a rejected mock resolver; its Vitest failure was
retained in `focused.log`. The final test injects an ordinary failing resolver
into the same socket connector rather than modifying built-in DNS behaviour;
actual connector, safe failure and abort tests pass. The liquidity-pool balance
union initially failed typechecking; exact type narrowing corrected it.
Historical reports/screenshots and previous CI runs remain preserved.

Hosted frozen-candidate results and merge identity will be recorded in this
root evidence folder, without changing the candidate while checks execute.

## Remaining gates

No Mainnet deployment/activation, asset transfer or wallet request occurred.
The selector is not #83's complete organisation sandbox/Friendbot/promote
workflow. Vesting #76, full physical/device/independent-ledger QA, atomic future
sponsor reserve capacity, operational ownership/rollback and the curated
Lantern directory/rebuild remain incomplete. Infrastructure egress, proxies,
custom CA and routing require deployment review; scoped #107 transport proof
is not blanket SSRF assurance. Merge into develop-ade is authorised; senior
develop remains untouched.
