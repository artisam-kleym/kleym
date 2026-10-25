# Kleym product design

## Visual direction

Extend the accepted homepage identity to the working app. Prize links are the
subject: colored link cards, wallet symbols and a compact distribution illustration
provide recognition without occupying the space needed for forms and transactions.

| Role | Color |
| --- | --- |
| Navigation, headings, focus | Navy `#354f6e` |
| Main text | Ink `#1a2b3e` |
| Campaign creation and completion accents | Mint `#bcebd7` |
| Prizes and financial summaries | Yellow `#fff0bb` |
| Settings and reusable templates | Pink `#fbe0ed` |
| Page surface | Near-white `#faf9fc` |

Inter carries headings, prose and field labels. JetBrains Mono carries amounts,
addresses, transaction hashes and existing action labels. Inputs retain their
contrast-qualified borders; pale card borders are decoration, not control edges.

Authenticated layout:

```text
Desktop                            Phone
nav | network notice               top header / Menu
    | icon + page title / action    network notice
    | colored summaries            icon + page title
    | form or scrollable table     steps / form / table
Log out                            Menu → Log out
```

Avoid a large marketing hero on each operational screen. Align content to the
left, let the main action stay prominent, and use bounded sideways scrolling for
tables instead of compressing addresses and amounts into unreadable columns.

## Shared implementation

- `AppShell`: opaque navy navigation, top mobile menu, keyboard skip link, logout.
- `PageHeading`: one semantic H1 with a mint, yellow or pink icon frame.
- `AuthShell`: login, MFA, SSO and invitations; wider variant for security/status.
- Shared cards, filters, fields, metrics, tables and campaign stepper receive the
  product treatment from `src/app/product.css`, scoped away from the homepage.
- Claim screens retain the distinctive claim button and exact amount. A warm
  amount panel and mint page surface frame every state, including errors.
- Administration has a separate navigation group within the existing ADMIN gate.

Coverage: Dashboard, Campaigns, New campaign, campaign detail and links, Templates
and template detail, Approvals, History, Settings, second-factor management; Admin,
Users, all campaigns, audit, reconciliation and privacy; login, MFA login, SSO,
invitation, claim, public status and not-found.

## Interaction and privacy constraints

- Financial controls render immediately. No entrance animation hides a field,
  amount, warning, wallet action or export gate. Reduced motion is respected.
- Desktop and phone claim connections remain different controls. Connecting a
  wallet and deliberately claiming remain separate steps.
- No new dependency, external artwork, font service or inline style is required.
- Testnet notices remain on operational screens. This design does not enable
  Mainnet or qualify native Lantern integration.
- Recovery phrases, export files and claim fragments must never enter screenshots
  or reports. State fixtures contain synthetic public data only.

## Logout

Desktop: **Log out** at the bottom of the sidebar. Phone: **Menu → Log out**.
Second-factor pages also expose it in their account header.

The button POSTs to the existing logout endpoint, which deletes the database
session and expires the cookie. A document navigation to login discards cached
authenticated navigation state. Failure displays a retryable error rather than
claiming the session ended. Closing a browser is not the logout operation: a
persistent session cookie can survive it. Existing unsaved-export warnings remain.

Regression proof uses isolated desktop and phone sessions: simulate an unavailable
logout endpoint, retry, verify login redirection, then replay the old session cookie
and confirm it cannot open Dashboard. No wallet signing or asset transfer is part
of this design qualification.
