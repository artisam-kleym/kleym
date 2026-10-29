<div align="center">

# Kleym

### A prize for everyone. A link for each.

Distribute USDC prizes and community rewards on Stellar through individual claim links.

[Explore Kleym](https://kleym-home-testnet.up.railway.app/) · [Open the Testnet app](https://kleym-testnet.up.railway.app/login) · [Documentation](docs/README.md)

**An Artisam Labs product · Working MVP · Stellar Testnet**

</div>

---

## Make rewards easier to distribute

Running a competition or rewarding a community should not require collecting every
wallet address and sending payments one at a time. Kleym lets an organiser fund
one campaign, create a link for each recipient and distribute those links through
the channels they already use.

Recipients open their link, connect a wallet and claim. Kleym sponsors the required
Stellar fees and reserves, so recipients do not need an XLM top-up.

## From campaign to claim

1. **Create a campaign.** Choose the asset, recipient count, amounts and expiry.
2. **Choose who may claim.** Use an open link, add a claim code or email verification,
   or restrict each link to an assigned wallet address.
3. **Save the private export and fund.** Generate links in the browser, download the
   recovery material and approve the funding batch in your wallet.
4. **Share each person's link.** Keep the complete export private and give each
   recipient only their own link.
5. **Track the outcome.** Review claims and reclaim expired, unclaimed funds with
   the sender's authorisation.

## Built for real distribution workflows

| For organisers | For recipients |
| --- | --- |
| Equal or individual prize amounts | A personal claim link |
| CSV recipient import and private link export | Desktop and Android browser flows |
| Expiry settings and sender-authorised reclaim | Freighter wallet connection |
| Claim codes, email verification and assigned-wallet claims | No XLM top-up required for supported sponsored claims |
| Campaign status and transaction history | A transaction receipt after a successful claim |

An assigned-wallet claim restricts the destination on-chain. Email verification and
claim codes add application checks; they do not replace that wallet restriction.

## Try the MVP

- **Website:** [kleym-home-testnet.up.railway.app](https://kleym-home-testnet.up.railway.app/)
- **Application:** [kleym-testnet.up.railway.app/login](https://kleym-testnet.up.railway.app/login)

Campaign creation requires a Kleym account. For an evaluation, request a guided
Testnet demonstration from the Artisam Labs team. Login credentials are not
published in this repository.

**The current deployment uses Stellar Testnet, not real funds. Mainnet is disabled.**
Kleym is undergoing internal validation and has not yet onboarded external users.
Desktop and physical Android Freighter flows have been demonstrated; the complete
release test matrix and operational readiness work are still in progress. Lantern
integration is being prepared and is not advertised as a completed live integration.

## How Kleym handles funds and keys

Claim keys and recovery phrases are generated on the sender's device. The current
local-link flow keeps them out of Kleym's backend; the backend works with public
keys and signed transactions. Email verification sends an OTP, never a private
claim link. Organisers must keep their phrase and private export safe.

The sender supplies the campaign asset. Kleym's operational accounts sponsor XLM
fees and required reserves. Settlement is verified against Stellar rather than
accepted from a browser's success message.

Read the [data-handling boundaries](docs/data-handling.md) and
[release requirements](docs/mainnet-pilot.md) for the technical scope and remaining
qualification. Earlier development evidence is retained separately and is not a
blanket Mainnet assurance.

## Explore the repository

| Start here | What you will find |
| --- | --- |
| [Documentation](docs/README.md) | Product guides, architecture and testing |
| [Developer setup](docs/development.md) | Local environment, commands and contribution workflow |
| [Technical specification](SPEC.md) | Claim protocol, data model and application requirements |
| [Website and app architecture](docs/website-app-architecture.md) | Separate public website, application and worker |
| [QA plan and results](qa/plans/kleym-comprehensive-v2-2026-10-26/README.md) | Detailed test cases, scoped results and evidence |
| [Issues](https://github.com/webnxt-2030/kleym/issues) | Remaining implementation and release work |

The application uses Next.js and TypeScript, Stellar SDK, PostgreSQL and Prisma,
and BullMQ with Redis. Deployments run on Railway. Runtime and dependency versions
are pinned in the repository; see the [developer guide](docs/development.md).

**Branches:** `develop` is the integration and Railway release branch.
`develop-ade` preserves the pre-cleanup development backup. Development archives
live under [`docs/archive`](docs/archive/README.md).
