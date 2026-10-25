# Homepage motion

13 October 2026 — Asia/Manila

## Design and tool choice

Owner requested elegant transitions/animations and suggested a library catalog
including React Bits, GSAP, Animate on Scroll and Framer Motion. No GSAP,
Framer Motion or React Bits dependency was installed in Kleym. Reviewed the
official [Motion accessibility guide](https://motion.dev/docs/react-accessibility)
and [GSAP matchMedia guidance](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()).

For this limited public-page scope, existing CSS plus
[Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
provides the required motion without a new package or runtime inline styles.
Kleym's existing nonce CSP and self-hosted assets remain intact. No UI kit,
SPA rewrite, notification system or financial idempotency behavior was added.

The existing navy/mint/yellow/pink palette, Inter/JetBrains typography and
compact left-aligned hero are retained. Motion follows the prize-to-wallet
story: one coordinated entrance, one illustration gesture, then restrained
section transitions and interaction feedback. Avoid repeated hidden card
reveals, perpetual floating, split text and scroll hijacking.

## Implemented

- Hero copy, actions and allocation preview enter in a short staggered sequence.
- Original trophy/card/wallet SVG lifts and settles once over 4.2 seconds.
- Four lower content regions enter once when at least 5% intersects the viewport.
- Native homepage anchors scroll smoothly in normal-motion mode.
- Fine-pointer button hover lifts slightly; action arrows shift, feature cards
  lift, prize-use icons tilt, and native FAQ answers/icons transition.
- No delay or animation gate on navigation, wallet access or content rendering.
- Default content remains visible. Opacity during entrances stays at least 0.9;
  scroll entrances start at 0.92. No zero-opacity reveal state.
- [Reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  disables decorative animations, transitions and smooth scrolling, including
  when the preference changes while the page is open.
- The small null-rendering client controller observes classes only; the page
  remains server-rendered. Observer/listener cleanup runs on unmount, and the
  smooth-scroll selector stops applying when the homepage is removed.

All CSS is scoped to the public homepage. No campaign, claim, wallet, database,
queue, network configuration, dependency or lockfile change. No funds moved.

## Executed proof

- Final production build/TypeScript and scoped ESLint passed.
- [Responsive profiles](evidences/responsive-local-v1/results.json): 10/10
  passed, including phones/tablets/desktops, compact desktop, reflow and no JS.
- [Motion/fallback profiles](evidences/motion-local-v2/results.json): 4/4
  passed: desktop, Android simulation, Intersection Observer unavailable,
  and JavaScript disabled.
- Hero/SVG animation styles active; SVG iteration count one; animations settle.
- Scroll region re-entry retains its completed animation rather than replaying.
- Live reduced-motion change stops all homepage animations; scroll behavior
  becomes auto. Leaving for login removes the homepage scroll behavior.
- Zero inline styles introduced or browser/CSP errors in motion checks.
- Navigation/FAQ/keyboard/44px targets/overflow and login entry pass in the
  responsive harness; no third-party homepage requests.
- Screenshots and WebM clips retained, with profile-to-video mapping in JSON.

The first motion run had a no-JS **harness** timeout: Playwright's in-page RAF
poller did not run with JavaScript disabled. A separate read-only inspection
showed every animation finished and heading/section opacity 1. Polling was
changed to the Node test runner; final 4/4 passed. Earlier output is preserved
locally for traceability. No production fix was needed for that timeout.

Limits: Chromium viewport simulations are not new native Android approvals or
a financial lifecycle acceptance run. No speed or bundle-size improvement is
claimed. Mainnet and native Lantern gates remain; intended custom-domain setup
is separate. Hosted release proof is added after qualified deployment.
