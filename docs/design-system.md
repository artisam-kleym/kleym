# Design system

Implements `BRAND.md`. Tokens live in `src/app/globals.css`; components in
`src/components/ui`.

## Tailwind 4 is CSS-first

`BRAND.md` §11 says to port the mock's inline config into `tailwind.config.ts`. **That
file does not exist in Tailwind 4.** Tokens are declared with `@theme` in `globals.css`
instead. The values are unchanged — only their location.

The §11 additions are all applied: the `action` token exists, `headline-sm` is defined,
the component classes moved into `globals.css`, and fonts are self-hosted.

## The radius scale is deliberately odd

`rounded-full` is **12px, not a circle**. For an actual circle use `rounded-[50%]`, or a
fixed-size element with equal width and height. This trips everyone once.

## Contrast audit

`BRAND.md` §10 warns that "the accents are light and several combinations will fail", and
asks for the pairings to be verified. They were. Five fell below the floor.

**Changed — genuine text/control failures:**

| Pairing | Before | After |
|---|---|---|
| Inactive nav text on `primary-container` | `#aec9ed` — 3.43:1 | `#d8e5f6` — 4.56:1 |
| Form field border on `surface-container-low` | `outline-variant` — 1.55:1 | `outline` — 4.06:1 |

The nav tint is the **only palette value altered for contrast**, lightened along the same
hue. A form field's border is what identifies the control, so WCAG 1.4.11 applies to it.

**Not changed — fills, not boundaries:**

| Pairing | Ratio |
|---|---|
| `accent-yellow` on white | 1.21:1 |
| `accent-pink` on white | 2.05:1 |
| `action` on white | 1.89:1 |
| `outline-variant` on surface (decorative card borders) | 1.63:1 |

These are background fills and decorative dividers, not boundaries a user must perceive to
operate a control. The `action` button carries `#002116` text at **9.04:1**, and every
status chip pairs its colour with a text label and a dot, so none of them conveys meaning
through colour alone.

**This is a judgement call, and it is the user's to overrule.** A strict reading of §10 as
"non-negotiable" would require repainting the accents, which would change the brand. The
measurements are recorded here so the decision is visible rather than implied.

## Rules that are load-bearing

- **The focus ring is mandatory.** The design removes native outlines (§5.4), so a control
  without the ring is a control a keyboard user cannot locate. It is applied globally in
  `globals.css` on `:focus-visible`.
- **Status is never colour alone** (§2.4, §10). `StatusChip` always renders a dot *and* a
  label.
- **The claim button's tactile press is unique to `/claim`** (§5.1). It exists as the
  `claim` variant and must not spread to other primaries.
- **The warning panel is for irreversible actions only** (§5.7) — the CSV gate and reclaim
  confirmation. Overuse destroys it.
- **Two ambient orbs per screen maximum** (§5.8).
- **No dark mode.** Decided in #4; do not add `dark:` variants.

## Icon font

Material Symbols, subsetted to the icons `BRAND.md` §6 names: **24K rather than 3.8MB**,
with the `FILL`, `GRAD`, `opsz` and `wght` axes preserved. Adding an icon means adding it
to `IconName` **and** regenerating the subset — the font does not contain glyphs that were
not requested.


## Pages that need client JS must not be prerendered

Every page that hydrates sets `export const dynamic = 'force-dynamic'`. This is a
**requirement of the CSP, not a performance choice.**

A prerendered route's HTML is generated at build time, and it contains React's inline RSC
flight payload:

```html
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
```

That inline script cannot carry a per-request nonce, and `'self'` has never covered inline
scripts — it covers `src=` chunks. So under a policy without `'unsafe-inline'`, which
`AGENT.md` §5.3 forbids outright, those scripts are **refused**: `self.__next_f` stays
empty, no fiber attaches, and React throws #412. The page still returns **200** and serves
correct-looking HTML while being completely inert.

Making the route dynamic lets the nonce reach every script tag. Verified: both inline
scripts and all chunk scripts carry the response's own nonce.

The cost is the static optimisation for those pages. There is no third option — the only
other lever is `'unsafe-inline'`, which is not available here.

CI enforces it, because a 200 response does not reveal the failure.


## No inline `style` attributes

Every value that would go in `style={{…}}` belongs in `globals.css` as a class instead.

This is the same CSP constraint as the section above, on the other half of the policy.
Inline style **attributes** are governed by `style-src-attr`, which accepts only
`'unsafe-inline'` or hashes — **a nonce cannot satisfy it**, because nonces apply to
`<style>` elements. So under `style-src 'self'` the attribute is parsed into the DOM and
then silently not applied:

```
icon:  style="font-size:24px"  ->  computed 16px   (inherited)
orb :  600x600 pink, blur(100px)  ->  0x0, no background, no filter
```

The markup looks correct in devtools, the element renders wrong, and nothing errors.

Three consequences for component work:

- **Icon sizes** are the closed `BRAND.md` §6 set, so each is a class: `.icon-14` … `.icon-48`.
- **Ambient orbs** are fixed shapes: `.orb-dashboard-a`, `.orb-dashboard-b`, `.orb-claim`.
- **Genuinely dynamic values** need bucketing. The campaign progress bar rounds to 5%
  (`.progress-0` … `.progress-100`); the exact figure stays in `aria-valuenow` and the
  label beside it, so nothing a reader or a screen reader perceives is lost.

A value that is truly per-render and must be exact needs a nonced `<style>` element, not
an attribute. Reach for bucketing first.

CI greps for `style={{` in `src/**/*.tsx`.
