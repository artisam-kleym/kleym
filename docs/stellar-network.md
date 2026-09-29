# Stellar network and USDC identity

Issue [#96](https://github.com/webnxt-2030/kleym/issues/96); implementation started from develop `290d5894994f323e83103b29f8dec0a94a3ef12e` on 2026-09-29.

One deployment serves one Stellar network. `STELLAR_NETWORK` must agree with `NETWORK_PASSPHRASE`; known opposite-network Horizon URLs and public-network automated test configurations are refused at first runtime configuration access. Production/public providers require HTTPS. Non-production testnet fixtures may use loopback HTTP.

Before preparing an envelope or submitting new work, Kleym checks the campaign network, original sponsor binding and provider root's `network_passphrase`. Missing identity, an outage or a mismatch stops work before signing/submission. Concurrent identity probes share a request; success is not permanently cached. This checks a trusted configured provider's reported identity; it does not authenticate a malicious provider's ledger data. Recorded funding and exact claim replays return their stored result without a new provider probe, after the campaign/sponsor check.

`GET /api/stellar/network` exposes only configured public identity and asset metadata, with `Cache-Control: no-store`. It reports configuration, not provider availability or wallet/ledger settlement. `/api/ready` additionally checks the actual provider identity. No sponsor keys, operational secrets or Horizon URL are returned.

The server registry is `src/lib/stellar/network.ts`. Its Circle identities were verified against the [official USDC directory](https://developers.circle.com/stablecoins/usdc-contract-addresses) on 2026-09-29:

| Network | Code | Issuer | Value |
| --- | --- | --- | --- |
| Public | USDC | GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN | Real USDC |
| Testnet | USDC | GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 | No financial value; not backed by real USD |

New USDC campaigns require the issuer for their deployment network. Native XLM and other asset codes remain valid. Existing campaign terms are not rewritten; funded legacy issued assets retain their claim/reclaim terms. New copies/reissues named USDC must meet the official identity rule.

The browser receives metadata from its server shell, defaults to the configured USDC and locks network selection to the deployment. It excludes same-code impostors from the official USDC choices and shows USDC as unavailable when the account lacks it. The first-step Continue gate requires the exact selected asset in the account response; it does not silently switch to XLM. XLM remains selectable when held. The SDK exposes `getStellarMetadata()`; the CLI obtains its network/default asset from that endpoint and refuses conflicting `--network` overrides. Explicit `--asset XLM` remains supported.

This slice does not implement sponsor-paid sender funding/reclaim. Existing sender XLM affordability checks and envelopes remain until #97 proves the Freighter envelope and #98–#100 implement it. No public-network transfer, activation, mobile wallet compatibility or end-to-end no-XLM settlement is established here.

Database harnesses that inject ledger reads/submissions use a loopback identity fixture. The claim harness additionally opts into SDK-compatible absent-account responses for TX1 materialisation checks. All transaction requests, including POST `/transactions`, remain refused; this is not a Stellar ledger emulator. The WRITE API harness includes the same network identity in its existing Horizon stand-in. Browser CSV fixtures include official test USDC alongside XLM, with separate missing-USDC and wrong-issuer cases.
