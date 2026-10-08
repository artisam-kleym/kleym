# Campaign networks and wallet-sized prizes

Current decision, October 8, 2026 (Asia/Manila): creators choose amounts from
their wallet's available asset balance. There is no product USDC amount cap.
Stellar's amount precision/range, campaign link count, transaction operation
limits and actual sender/sponsor capacity still apply. Individual prize amounts
and the manual G-address balance lookup remain supported alongside connected
Freighter/Lantern wallets. A balance lookup is not signing authority.

The account read returns gross `balance` and `availableBalance` separately.
Credit assets subtract selling liabilities; native XLM also subtracts current
minimum reserve. The wizard uses available values, refuses overfunding, never
sends invalid addresses to the lookup and offers retry for provider failure.
Preparation/submission independently recheck the ledger; the displayed read is
not a reservation or guarantee that balances have remained unchanged.

## Network selector

Campaign creation shows **Testnet · test funds** or **Mainnet · real assets**.
The other network is unavailable until its separate public HTTPS origin is
configured. There is currently no Mainnet deployment address; leave
`MAINNET_APP_URL` empty and `MAINNET_DISTRIBUTION_ENABLED=false`.

`TESTNET_APP_URL` and `MAINNET_APP_URL` accept origins only: no credentials,
paths, query strings, fragments or private hosts. Configuration cannot map two
networks to one active origin. The optional other workspace opens a fresh
`/campaigns/new` tab. Drafts, wallet address, campaign IDs, private keys,
recovery phrases, CSVs and sessions are not transferred. Sign in/connect on
the target network and create fresh links. The current tab is preserved.

Use independently configured databases, Redis queues, sponsors, passphrases,
providers, APP_URL, allowed wallet origins and Lantern directory entries for
the two deployments. Existing campaign/provider/wallet/passphrase guards stay
authoritative; selecting a link cannot change an existing campaign's network
or enable Mainnet funding. Review and device/ledger qualification must precede
deployment activation. No Railway restart or deployment accompanies this work.

This delivers visible network selection and an isolated future Mainnet entry;
it does not complete #83's per-organisation sandbox, Friendbot provisioning or
rehearse/promote workflow, and does not qualify Mainnet payments.

## Operations and limits

The earlier 3-USDC campaign proposal is superseded by the owner's no-cap
decision. The proposed 10-USDC organisation/total limits were not approved or
activated either. Separate sponsor fee/reserve admission and continuing
recipient commitments still need atomic capacity controls (#103). Unlimited
principal choice does not authorise unlimited operational XLM sponsorship,
automatic treasury refill or new Mainnet funding. Designated operators and
actual available capital remain release prerequisites.
