# Kleym homepage redesign

Date: 13 October 2026 (Asia/Manila)

## Brief and reference

Present Kleym as an Artisam Labs product for the intended `app.kleym.xyz` host.
Reference: [HeyPay](https://heypayfi.xyz), inspected in isolated Chromium at
1440px desktop and 393px Android viewports. The public site returned HTTP 200.
Scrolling revealed its product explanation, process walkthrough, merchant
section and footer. No wallet connection or reference-site account was used.

Useful reference ideas: compact navigation, an explanatory product preview,
clear sequence of actions, distinct creator/recipient sections and a considered
footer. Kleym uses its own text, UI and brand tokens; no HeyPay artwork, logos,
trust claims, contact details or third-party integrations were copied.

## Design direction and critique

- Palette: slate navy `#354f6e`, deep navy `#1a2b3e`, surface `#faf9fc`,
  mint action `#3fa07a`, light mint `#a2f3d2`, warm yellow `#fff0bb`.
  Dusty pink is a small prize-row accent from the existing brand family.
- Type: self-hosted Inter for explanations and headings; JetBrains Mono for
  money and actions. Existing subsetted icons; no new remote resources.
- Layout: left-aligned introduction beside an illustrative allocation sheet;
  stacked mobile content and top navigation; differentiated creator, process,
  recipient and FAQ sections.
- Distinctive element: a five-recipient prize allocation (20 / 15 / 10 / 5 / 5
  USDC, total 55) with an individual prize preview. Both are labelled examples.

Before implementation, the generic repeated-card landing layout was replaced
with the actual prize-allocation example and a quieter, divided feature layout.
Kleym's tight radii, typography and navy/mint identity remain intact. Screenshot
review confirmed the mobile preview stays within the viewport, amounts align,
and the three-step guide remains readable when stacked. No scroll-reveal
animations hide content. FAQs use native HTML details and work without JS.

## Changes

- Public homepage, scoped CSS module and page-specific title/description.
- Relative sign-in links work on Railway and a future custom host.
- Runtime network label: this release is explicitly a Testnet preview;
  test USDC has no financial value.
- Accurate creator and recipient guidance: custom amounts, private export,
  wallet approvals, individual links and public receipts.
- Expiry explanation requires an owner-approved reclaim transaction;
  no automatic-refund promise.
- Freighter desktop/Android guidance; Lantern described as being prepared.
- Skip link, semantic navigation/headings/table, visible keyboard focus,
  44px interactive targets and responsive layouts.
- Per-request rendering and existing nonce CSP preserved.

No campaign, wallet, signing, sponsor, queue, login or database behavior changed.
No financial transactions were submitted. No DNS, origin allowlist or
`APP_URL` change was made for the intended custom host.

## Executed proof

Production build, TypeScript and scoped ESLint passed. Reusable read-only
browser harness: `scripts/verify-homepage.mjs` (requires installed Chromium).

```powershell
node scripts/verify-homepage.mjs http://127.0.0.1:3226 PATH_TO_RESULTS
```

[Local results](evidences/local-v1/results.json): **9/9 passed**.

| Profile | Width | Result |
|---|---:|---|
| Small phone | 320 | Passed |
| Android Chrome simulation | 393 | Passed |
| Phone landscape | 852 | Passed |
| Tablet | 768 | Passed |
| Desktop | 1024 | Passed |
| Desktop | 1440 | Passed |
| Wide desktop | 1920 | Passed |
| Narrow reflow proxy for zoom | 640 | Passed |
| JavaScript disabled | 393 | Passed |

Each profile checked HTTP 200, nonce CSP, metadata, one H1, network notice,
overflow, navigation targets, touch-target heights, all five FAQ toggles,
keyboard activation, skip link and the create-to-login journey. Browser errors
and third-party requests: zero. Screenshot captures are under `evidences/`.

Limits: these are simulated Chromium viewports, not new native Android wallet
approval tests or a complete money-flow regression run. A 640px viewport is a
reflow proxy, not proof of actual operating-system zoom. Current Mainnet and
Lantern release gates remain in force. `app.kleym.xyz` requires approved DNS,
Railway custom-domain setup and runtime/origin configuration before use.

Release evidence is added after the qualified branch merge and hosted checks.
