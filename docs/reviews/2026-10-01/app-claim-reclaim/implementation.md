# Actual-app claim and sponsored expiry reclaim

Date: 2026-10-01. Checkout: `D:\kleym\.worktrees\app-sending-pilot`.
Branch: `codex/app-sending-pilot`, following funding commit `9958712`.

## Delivered

- Sponsored USDC expiry reclaim now uses the campaign sponsor's sequence and
  XLM fee. Sender signs its own claim operations and receives the exact refund.
- Claim preparation preserves the proven two-transaction design, checks a
  later closed ledger and adds the minimum ledger bound to TX2.
- Persisted exact prepared claim bodies and every required signature are
  checked before submission. Temporary account cleanup and conditional
  recipient signatures are preserved across the three recipient states.
- Added public-envelope attempt journal before network submission. Original
  hashes and signed bytes support request retry, worker restart and maintenance
  recovery without transmitting recipient/sender spending keys.
- Refund replay works after balances disappear, and accounting records a
  successful refund once. Partial refund progress stays visible in the app.
- Expiry and suspension prevent fresh claims and resubmission of pending
  claims; confirmed earlier transactions can still be recorded. Pending bodies
  cannot be replaced until their original outcome or expired bound is proved.
- Private CSV distribution is the current wizard flow. Email-only policy is
  unavailable here; existing email-policy templates are refused rather than
  weakened. No treasury custody/refill runtime was added.
- Added migration `20261001010000_claim_reclaim_attempts`, applied to both
  isolated local databases. Updated app guide, README and specification note.

## Executed proof

| Gate | Result | Evidence |
| --- | --- | --- |
| Full app service lifecycle, real database/queue/signatures, simulated Horizon | 94 passed | `lifecycle.log`, `scripts/verify-app-lifecycle.ts` |
| Claim, funding and wizard unit tests | 117 passed, 4 files | `unit.log` |
| Existing claim service checks | 30 passed | `claims.log` |
| Existing reclaim compatibility/race checks | 57 passed | `reclaim.log` |
| Production Chromium wizard and claim-page checks | 25 passed, including authentication setup | `browser.log` |
| Final Next webpack build with TypeScript | Passed | final build executed locally; existing dependency/deprecation warnings retained |
| Changed-file ESLint and whitespace | Passed | local command result |
| Official Testnet identity, sender/recipient and sponsor balances | Passed, read only | `testnet-readiness.json` |

The 94 lifecycle checks execute funding and its worker confirmation, then
TX1/TX2 and expiry refund in each recipient mode: absent, existing without
trustline, existing with trustline. They assert zero sender/recipient XLM,
exact principal, conditional signatures, ledger bounds, cleanup, separate
claimed/refunded accounting, original-envelope persistence, lost-response
retry, worker recovery, explicit rejection, expiry and suspension behavior.
Horizon is simulated. Minimal simulated claim/refund result vectors carry the
fee; operation effects are asserted by the fixture. This is no new live-ledger
or real-wallet certification.

Browser checks run against the production build with the real CSP and traces
disabled. Network responses are mocked where those checks focus on privacy,
page states and CSV/policy behavior. A separate real-app preview uses read-only
account lookups without generating a phrase, signing, or creating a campaign.

## Ready next

Local app and worker are available on <http://127.0.0.1:3220>; isolated pilot DB
`kleym_app_pilot`, Redis DB1. Runtime PIDs are in `runtime.json`, mutable runtime
logs under `.runtime/app-sending-pilot/`. Health and readiness must be rechecked before
starting a later session; process IDs are not permanent.

The next user step is a reviewed **2 test-USDC** campaign: claim one 1-USDC link,
leave one for sponsored expiry reclaim. Follow [the app test guide](../../../app-sending.md).
Current preflight found sender17/recipient1 official USDC and zero XLM each;
the configured sponsor has9999 spendable XLM. No new chain transaction was
submitted by this development turn. No GitHub push, issue update, deployment,
or real/public USDC movement occurred. October 7 public readiness remains
unqualified until the actual-app wallet cycle and deployment gates pass.

Shared Classic sponsor sequence contention across simultaneous campaigns is
not qualified by the serial pilot fixture. Pending attempts recover their
original hash instead of silently creating replacement payments; a high-volume
public distribution still needs a demonstrated sequence-ownership strategy.
