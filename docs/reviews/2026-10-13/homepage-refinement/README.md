# Homepage color and spacing refinement

13 October 2026 — Asia/Manila

## Request and design

The owner rejected the large unused area above the headline and requested a
more colorful, illustrated homepage using [HeyPay](https://heypayfi.xyz) as a
reference. The supplied Brave screenshot shows the tall panel vertically
centering the headline, compounded by the hero's large top padding.

HeyPay was inspected again in isolated Chromium at desktop and Android sizes.
Its artwork was not copied. Kleym's prize-specific illustration is original,
static SVG with a trophy, claim card and wallet; no remote assets or new
dependencies. The page retains self-hosted Inter, JetBrains Mono and the toll
mark. Core colors: navy `#354f6e`, deep ink `#1a2b3e`, mint `#bcebd7`, warm
yellow `#fff0bb`, dusty pink `#fbe0ed`, surface `#faf9fc`.

The revised composition starts with the left-aligned headline just below the
header. A compact allocation panel and illustration sit alongside it. Three
prize-use examples fill the creator column meaningfully. Feature and process
panels have distinct color treatments, while the recipient guide uses a deeper
navy background with yellow, pink and mint icons. Broad section gaps are
reduced. On phones, the top navigation and content remain stacked.

Visual critique: the first iteration passed ten browser profiles, but feature
and recipient glyphs overflowed their colored frames because the Icon itself
received padding. Final markup uses separate icon frames. A final screenshot
review confirmed proper alignment, readable examples and contained artwork.
No scroll-reveal animation or decorative interaction was added.

## Changes and measurable result

| 1440px desktop measure | Before | Final |
|---|---:|---:|
| Header bottom to headline top | 259.98px | 36px |
| Hero section height | 812.23px | 685.23px |
| Full page height | 3385px | 3048px |

The headline gap is about 86% smaller. The primary campaign action ends at
422px on the 1440px profile and 411px on the compact 1280×576 profile. On the
393px Android simulation, the headline gap is 28px.

The requested **Testnet preview** badge and footer phrase were removed. The
footer identifies the actual Stellar Testnet deployment and states that test
assets have no monetary value. App-level network and financial warnings remain
unchanged. No domain, wallet, campaign, signing, queue or database behavior was
changed; no funds moved.

## Executed verification

- Production build (including TypeScript) and scoped ESLint passed.
- First iteration: 10/10 browser profiles passed; retained locally for history.
- [Final production-browser results](evidences/local-v2/results.json): 10/10
  passed at 320, 393, 640, 768, 852, 1024, 1280, 1440 and 1920 widths,
  including landscape, compact desktop, narrow reflow and JavaScript disabled.
- Navigation, all FAQ toggles, keyboard focus and skip link, 44px interactive
  target heights, and create-to-login entry passed.
- Headline gap ≤48px and desktop primary action above the fold are now checked
  by the existing `scripts/verify-homepage.mjs` harness.
- Zero overflow, browser errors or third-party requests.
- [Before measurement](evidences/before/layout.json) and screenshots retained;
  final screenshots are in `evidences/local-v2/`.

Limits: simulated Chromium viewports do not prove native Android wallet
approvals or actual operating-system zoom. This release verifies the public
homepage; it is not a fresh end-to-end financial acceptance run. Mainnet and
native Lantern gates remain in force. Hosted release proof is retained
separately after deployment.
