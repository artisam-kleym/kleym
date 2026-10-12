# Kleym Testnet: mobile and Lantern navigation release

October 9, 2026, Asia/Manila. Owner-authorized restart and deployment of the existing Railway Testnet project. This report supersedes the earlier OFF/local-only checkpoint; historical reports remain preserved.

## Result

Web, worker, Postgres and Redis are running. The public app is https://kleym-web-testnet.up.railway.app/login. Readiness returns 200/ready=true; public status reports every component operational. Original database volumes were reused. Mainnet remains disabled and GitHub remains signed out. No new PR, merge or issue closure was performed.

The missing `/templates`, `/approvals` and `/history` sender route families now permit exact configured Lantern ancestors. Boundary lookalikes, admin and API documents remain unframeable. The public Lantern configuration remains disabled because the supplied Lantern 0.6.2 packages do not contain Kleym's curated directory entry. A complete physical in-app experience is **not yet qualified**.

## Changes deployed

- Top-header phone navigation replaces bottom navigation; all six destinations fit narrow screens, close the menu on navigation and preserve a stable page width.
- Settings forms use explicit widths, readable 16px phone inputs and 44px minimum input height. Stacked rows and table-local scrolling prevent page overflow. Password changes recover after network failures.
- Phone signing/reclaim reuse a validated existing connection. App opening uses a separate browsing context, with a manual reopen link, preserving Review's unsaved keys and leaving guard. Native Android approval still requires a physical retest.
- Campaign pages follow expiry while open. The existing expiry scheduler now runs every minute under the same scheduler identity. Expiry permits **owner-approved Reclaim**; it does not schedule an automatic asset transfer.
- A live React hydration mismatch was found when cloud UTC rendered an expiry differently from a Manila browser. Expiry now has a stable UTC server snapshot before localizing on the client.

## Acceptance and evidence

| Gate | Result | Scope |
| --- | --- | --- |
| Full unit suite | 786/786, 70 files | Prepared release-compatible QA installation |
| TypeScript, ESLint, production webpack build | PASS | Local release installation; Railway v7 build/migration also passed |
| Production Lantern harness | 14 PASS | Exact enabled/disabled CSP boundaries, Android launcher and mocked trusted parent; not a physical Lantern wallet |
| Production mobile component browser checks | 35 PASS | Actual source components, mocked wallet/lookups; UTC server and Manila desktop browser default |
| Deployed authenticated browser checks | 27 PASS, zero page errors | Six navigation destinations at 320/393/768/1440px, Settings sizes, three-link Review, retained campaign and read-ledger reconciliation |
| Public readiness/status | PASS | Database, cache/queue, Horizon, workers, sponsorship and reconciliation operational |
| Secret classification and mnemonic scans | PASS | No private runtime files in source-only release |
| pnpm 10.6.4 audit | PASS at moderate threshold | One low advisory; no moderate/high/critical findings |
| Updated Android creator approval/export | NOT RUN | Requires owner's physical Freighter app |
| Complete Lantern sender navigation/signing | NOT RUN on hardware | Requires senior-owned directory rebuild and verified embedding origins |
| Isolated real-Postgres end-to-end suite | NOT RUN this turn | Local Docker Desktop cannot start; hosted authenticated checks do not replace this suite |

Evidence: `evidences/lantern-browser/`, `evidences/utc-server-ui/`, `evidences/public-browser/`, `public-browser.json`, `public-status.json`, `final-services.json`, `worker-runtime-v6.json` and `worker-runtime-v7.json`. The v6 live hydration failure is retained as `public-browser-v6-hydration-failure.json`. Its 27 functional assertions passed but its React error failed acceptance; v7 corrected it. A first v7 run then encountered a legitimately changed campaign state (already reclaimed), so the final check asserts the independently verified settled state rather than expecting another refund button.

Temporary local `/qa-mobile` component fixture source files were removed after verification. They were never included in the Railway export. No campaign keys, private CSV, passwords, session cookies or raw Railway variables are included in these artifacts.

## Deployment identity

Source: `D:/kleym/.worktrees/app-sending-pilot`, branch `codex/mobile-header-signing-fixes`, based on `2ec20e1`. Product changes and reports remain uncommitted; preserve the working tree. GitHub authentication is still intentionally absent.

Source-only release: `D:/kleym/.runtime/deploy-source/2026-10-09-lantern-navigation-v7`, 392 files; source digest `0a779b7311bfb266b2ff8156adc235479549c57ad0b6c86e9d735ff69930ad43`. Documentation updated after this export does not alter its deployed source identity.

| Service | Active deployment |
| --- | --- |
| Web v7 | `7febef41-3122-4136-8290-70c1cda57d32` |
| Worker v7 | `323f6286-5ad4-429a-8cf3-4773d31b2837` |
| Postgres | `8b8cd6a7-6aee-4b6f-9879-454150aaa59e` |
| Redis | `bdb39b02-cb8a-4b52-bf9e-904358d855c2` |

Both retained volume identities are recorded in `final-services.json`. Databases restarted using pinned prior image digests. No seed, reset, volume deletion or database major-version upgrade was performed. The v6 worker completed manual and scheduled reconciliation with zero critical findings before v7 promotion. The promoted v7 worker started at 02:57 UTC and completed the new manual reconciliation at 02:59:30 UTC with zero critical findings and zero corrections; see `worker-v7-queue-probe.json` and `worker-runtime-v7.json`.

## Retained campaign and refund

Campaign `cmuzrnf7200020dnzr49itmq6` is now settled: Desktop and Lantern-labelled links claimed, Unused link reclaimed. Horizon independently confirms the reclaim transaction `1f4e4ba8886bba22c35e638cc2a127b1f6a93b8a40de75afadfa911191635d4b`, ledger 5098099, October 9 at 02:48:02 UTC. It credited exactly 1 official Testnet USDC to the sender; the claimable balance is removed. The sender currently has 9 USDC and literal zero XLM. See `retained-campaign-refund-ledger.json`.

This verification did not create, sign or submit that transaction. Its presence supersedes the earlier deferred-refund note. Do not repeat funding, claims or reclaim for this campaign. Older campaign allocations are separate.

## Docker incident

Windows reports that Docker Desktop cannot access its `sailor-ingest.sock` listener. The engine remains unavailable. With Docker processes stopped, a reversible socket rename and a reparse-point query also failed with Windows error 1920; the file was unchanged. The underlying cause is unresolved. No factory reset, container/image/volume deletion or PC reboot was performed. Railway deploys/builds independently and is healthy.

Docker's [official troubleshooting guide](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/) documents Restart Docker Desktop and diagnostic collection. If it still cannot start after a convenient Windows restart, collect diagnostics before deciding on repairs. Uploading diagnostics or submitting a support request requires the owner's choice.

## Next gates before senior integration acceptance

1. Review the deployed Testnet site on desktop and Android. Physically verify Android campaign CSV saving, funding approval, app return, rejection/retry, backgrounding and reclaim using approved test funds.
2. Senior developer adds Kleym to Lantern's curated directory using `docs/lantern-integration.md`, regenerates Android directory asset statements and rebuilds the APK/extension. Confirm actual installed extension ID.
3. Enable only those verified Lantern origins, then test authenticated login, all six navigation routes, partitioned sessions, sign-only funding, recipient setup/claim, reclaim and network/account changes on actual packages. Private Chrome claim-to-Lantern transport remains a separate unimplemented dependency.
4. Reauthenticate an approved GitHub account when issue/PR work is requested. Retest required real-Postgres and CI gates before merge. Mainnet capital, operational ownership, recovery and device qualification remain release gates.

Railway is intentionally left running at the owner's request.
