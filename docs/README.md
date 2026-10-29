# Kleym documentation

New to Kleym? Start with the [product overview](../README.md) or open the
[Testnet application](https://kleym-testnet.up.railway.app/login).

## Using Kleym

| Guide | Covers |
| --- | --- |
| [Campaign funding](app-sending.md) | Sponsor-paid USDC campaigns and recovery |
| [Claim codes](claim-code-distribution.md) | Additional verification and private exports |
| [Assigned wallets](wallet-bound-distribution.md) | Importing recipients and restricting claims |
| [Email verification](zender-email-verification.md) | OTP delivery through Zender |
| [Mobile claims](mobile-claims.md) | Phone wallet connection and app return |
| [Wallet support](mobile-wallet-support.md) | Supported flows and qualification limits |

## Building and operating

| Guide | Covers |
| --- | --- |
| [Developer setup](development.md) | Installation, commands and contribution workflow |
| [Specification](../SPEC.md) | Protocol, data model and acceptance requirements |
| [Website and application](website-app-architecture.md) | Public homepage, app and worker boundaries |
| [API and SDK](api.md) | Scoped API keys, public-key registration and webhooks |
| [Railway](railway.md) | Deployment configuration and service identities |
| [Data handling](data-handling.md) | Private keys, exports, email and retention boundaries |
| [Design system](design-system.md) | Components, tokens and accessibility |
| [Lantern integration](lantern-integration.md) | Bridge requirements and pending qualification |

## Testing and release

- [Comprehensive test plan v2](../qa/plans/kleym-comprehensive-v2-2026-10-26/README.md)
  — planned cases and scoped execution results, kept distinct.
- [Android Studio setup](android-qa.md) — reusable emulator and wallet-test limits.
- [Mainnet pilot requirements](mainnet-pilot.md) — remaining live-release gates.
- [Open-issue review](reviews/2026-10-26/issue-closure-review.md) — specific unfinished scope.
- [Development checkpoints](checkpoints/) — dated handoffs for continuing work.
- [Historical archive](archive/README.md) — early experiments and previous workflows.

Requirements and historical proof do not mean every feature is release-qualified.
The current application is an internally tested Testnet MVP; Mainnet is disabled.
