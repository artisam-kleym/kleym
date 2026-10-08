# Actual app recipient claim confirmed — reissue campaign

User receipt aa495e65ac2d88c3d20c0433b20924364fc1414ae0ba831bd584e01e66a93bce
is successful in ledger4965095. It belongs to campaign
cmupd9xde0008y8kjuywfibzl, "Kleym Testnet Distribution (reissue)", funded by
51f03667ca967988ae514af5f85cd5bf82cfd82f72be9db6535298c299519e3d.
The prior confirmed campaign cmupcw5ey0004y8kjq7oryzzk is separate and still
has both balances unclaimed. Do not apply prior one-campaign expectations to
the actual two-campaign accounting or tell the user to refund only1USDC now.

Independent official Testnet proof at10:11:12Z verified sponsor and ephemeral
signatures, existing-trustline four-operation TX2, exactly1officialUSDC credited
to known recipient, literal zero XLM, zero-starting-balance materialisation,
later ledger than TX1 (4965092), removal of claimed balance and ephemeral account,
and preserved recipient sponsorship count3. Fees: TX1 600stroops, TX2 400stroops,
both paid by configured sponsor. Initial verifier used changeTrust.asset rather
than the installed SDK's line field; corrected the harness, then all checks passed.
App journal CLAIM/MATERIALISE both SETTLED and link CLAIMED match ledger.

Current totals: sender13USDC/0XLM; recipient2USDC/0XLM; unclaimed3USDC. Combined
18USDC equals the pre-test sender17 plus recipient1. Sponsor sponsoring6units,
two per remaining balance; temporary reserves released.

Next user wallet step is refund ORIGINAL campaign's two unused1-USDC balances,
whose immutable expiry10:07Z/18:07Manila October1 has passed. Connect Kleym Sender
on Testnet, review refund2USDC, sign/submit once and return public hash. Expected
sender15USDC, recipient2USDC, remaining1USDC in reissue and sponsor2reserveunits.
Reissue's unused1USDC has predicate expiry2026-10-31T02:02:00Z/10:02Manila October31:
it cannot be reclaimed today. Preserve its private CSV; do not silently shorten
funded predicates or infer early sender recovery. Future handling needs to match
user's intended test outcome. No agent signing/ledger writes or deployment.
