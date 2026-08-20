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
