# Explicit funding rollout controls (#98, #115)

Both gates default off:

- `SPONSORED_FUNDING_ENABLED=false` refuses new sponsored USDC drafts and new
  batch preparation/submission. Native Testnet sender-paid compatibility is
  retained.
- `MAINNET_DISTRIBUTION_ENABLED=false` refuses new public-network drafts and
  new funding, including sender-paid assets. Enabling sponsored Testnet funding
  does not enable Mainnet distributions.

The shared schema protects session/WRITE API/local creation. Batch functions
repeat the check, so an existing unsigned tab cannot fund after a pause.
Recorded SUBMITTED/CONFIRMED funding returns its original hash before the
new-funding gate; workers can confirm/reconcile that hash. Claims and
sender-authorised expiry refunds for previously funded campaigns remain
available, bound to their original network/sponsor/intent. A pause does not
rewrite signed bytes, change fundingMode or release uncertain commitments.

Before resuming the paused Railway **Testnet** service with this candidate,
explicitly set sponsored funding true only after the qualified migration,
retained-campaign/worker checks and operator review. Keep Mainnet false.
The browser/database CI harnesses opt into sponsored **Testnet fixtures**;
they never opt into public distribution. No deployed environment was changed.

These controls implement explicit opt-in and stopping new funding. They are
not a Mainnet approval mechanism, enforced USDC/XLM budgets or operational
readiness proof. Proposed pilot caps remain unapproved/non-active in
`docs/reviews/2026-10-08/recommended-pilot-budgets.md`; capital accounting,
operators, populated migration/rollback and physical-wallet/ledger evidence
remain release requirements. #98/#103/#115 remain open until their full
criteria and dependencies are proved.
