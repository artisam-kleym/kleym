# App design and logout qualification

Date: 2026-10-13. Base: `749f381` on `develop-ade`.

## Changes

Extended the accepted homepage identity across public/account, sender, administrator
and recipient pages, through shared shells, page headings, cards, filters, tables,
fields and the campaign stepper. Added server-backed Log out to desktop/mobile
navigation and account security pages. Preserved money, key generation, export
gates, wallet callbacks, network notices and role/organisation boundaries.

## Local evidence

- Production build: passed on Next 16.3.8, with isolated QA-only component routes.
- TypeScript and source lint: passed. An old fixture's impure expiry timestamp was
  replaced with a fixed fixture date; the released source had no lint failure.
- `evidences/local-v3/results.json`: 155 checks passed at 320, 393, 768, 1024 and
  1440px. Covers login, SSO, invitation, invalid claim, not-found, dashboard and
  Settings; three-step campaign review; all 17 claim states; separate connection
  and explicit claim actions; menu Escape/focus and logout availability.
- Password fields retain at least 200px usable width and 44px height in profiles.
- `evidences/homepage-local/results.json`: all 10 existing homepage profiles passed.
- Visual review: desktop login/dashboard/review and phone login/Settings/claim.
  Forms remain readable, the desktop stepper shows the active review step, and
  claim actions remain distinct from decorative content.

## Harness corrections retained for traceability

`local-v1` rejected framework-generated route-announcer style attributes. The
authored content has no inline styles; the assertion was scoped to that content.
`local-v2` caught server/client phone detection disagreement in the synthetic
claim fixture. It now uses the application's existing hydration-safe subscription.
`local-v3` passed after these fixture corrections. Neither failure required
weakening production CSP or changing the application claim lifecycle.

## Release checks

CI, deployment identity, live authenticated routes and real logout revocation
will be recorded in `RELEASE.md` after qualification and deployment.

## Limits

Responsive Chromium is simulated phone layout evidence. No new physical Android
wallet approval, campaign funding, recovery phrase generation or asset transfer
was performed. Native Lantern and Mainnet remain separate qualification gates.
