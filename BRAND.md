# Kleym — Brand & Design System

Derived from the provided mock HTML (landing page, sender dashboard, campaign wizard, recipient claim page). Where this document and the mocks disagree, **the mocks win** — except in §9, which records intentional corrections.

---

## 1. Design direction

Neo-vintage fintech. A muted slate-navy foundation carrying three warm, slightly retro accents — butter yellow, dusty pink, mint green — against near-white surfaces. It reads as trustworthy infrastructure that isn't cold, which is the right register for a product whose whole pitch is *this is safe and it is not complicated*.

**Three rules that carry the identity:**

1. **Tight radii.** The base radius is 2px and the largest token is 12px. Nothing is pill-shaped except status chips and nav items. This is what keeps it from looking like every other crypto dashboard.
2. **Mono for interface, sans for prose.** JetBrains Mono carries every label, button, and data cell. Inter carries headings and body copy. The mono is not decorative — it marks the machine-readable layer.
3. **Ambient colour, opaque surfaces.** Large blurred accent orbs sit behind content at 10% opacity. Cards themselves are solid or near-solid. Colour lives in the atmosphere, not in the panels.

---

## 2. Colour

### 2.1 Core palette

| Token | Hex | Use |
|---|---|---|
| `primary` | `#354f6e` | Headings, primary text on light surfaces |
| `primary-container` | `#4d6787` | Sidebar background, secondary text on claim page |
| `on-primary` | `#ffffff` | Text on primary surfaces |
| `primary-fixed-dim` | `#aec9ed` | Inactive sidebar links |
| `on-primary-container` | `#d3e5ff` | Text on primary-container |
| `secondary` | `#126b51` | Success text, positive deltas |
| `secondary-container` | `#a2f3d2` | Success chip backgrounds |
| `on-secondary-container` | `#1c7157` | Text on success chips |
| `navy-text` | `#1A2B3E` | Claim page body text — deeper than `primary` |
| `error` | `#ba1a1a` | Destructive text and icons |
| `error-container` | `#ffdad6` | Warning panel backgrounds |

### 2.2 Accents

| Token | Hex | Use |
|---|---|---|
| `accent-yellow` | `#AC8D00` | Claim page top border, step markers, "Fund" icon, ambient orbs |
| `accent-pink` | `#EF57A1` | Batch progress bar, "Share" icon, ambient orbs |
| **Action green** | `#3FA07A` | **Every primary button.** Hover `#3A9470`. Text on it: `#002116` |

These three were darkened from the pastels this section originally specified
(`#FFEA88`, `#F599C6`, `#7DCCAD`), because §10 asked for the check and they failed
it — 1.15, 1.95 and 1.80 against the page surface, where 1.4.11 wants 3:1. Hue and
saturation are held; only lightness moved, and only as far as 3:1 required. See
`globals.css` for the measured before/after of every dependent pairing.

Note: the mocks carry `#7DCCAD` as a literal throughout rather than as a named token. It is now the `action` token, at the corrected value.

### 2.3 Surfaces

| Token | Hex |
|---|---|
| `background` / `surface` | `#faf9fc` |
| `surface-base` | `#F8FAFB` — claim page only |
| `surface-container-lowest` | `#ffffff` |
| `surface-container-low` | `#f4f3f6` |
| `surface-container` | `#efedf0` |
| `surface-container-high` | `#e9e8ea` |
| `surface-container-highest` / `surface-variant` | `#e3e2e5` |
| `outline` | `#74777e` |
| `outline-variant` | `#c3c6ce` |
| `on-surface` | `#1a1c1e` |
| `on-surface-variant` | `#43474d` |

### 2.4 Semantic mapping

| Meaning | Treatment |
|---|---|
| Active campaign | `bg-action/20`, `border-action/30`, text `#00513c`, 6px dot `secondary` |
| Expired | `bg-surface-variant`, `border-outline-variant/50`, text `on-surface-variant`, dot `outline` |
| Claimed | `secondary-container` background, `on-secondary-container` text |
| Failed | `error-container` background, `on-error-container` text |
| Pending | `surface-container-high`, `on-surface-variant` |

Every status chip pairs a colour with a **text label and a dot**. Colour alone never carries state.

---

## 3. Typography

**Inter** — display, headings, body. **JetBrains Mono** — labels, buttons, data, addresses.

| Token | Size / Line | Weight | Extra | Use |
|---|---|---|---|---|
| `display-lg` | 48 / 52 | 700 | `-0.02em` | Page titles, hero, metric values |
| `headline-lg` | 32 / 40 | 600 | `-0.01em` | Section heads |
| `headline-md` | 24 / 32 | 600 | — | Card titles, wordmark |
| `headline-lg-mobile` | 24 / 32 | 600 | — | `display-lg` on mobile |
| `body-lg` | 18 / 28 | 400 | — | Intros, subtitles |
| `body-md` | 16 / 24 | 400 | — | Body copy |
| `label-md` | 14 / 20 | 500 | `0.02em`, **mono** | Buttons, nav, form values, table data |
| `label-sm` | 12 / 16 | 500 | **mono** | Captions, chips, addresses, metadata |

**Rules**
- Table column headers: `label-sm`, uppercase, `tracking-wider`, `on-surface-variant`.
- Card metric labels: `label-md`, uppercase, `tracking-wider`.
- Any Stellar address, hash, or balance ID: mono, always truncated `GABC…3A9B`, always copyable.
- Amounts: `display-lg` for the number, `headline-md` or `body-lg` for the asset code, baseline-aligned with `gap-2`.
- Sentence case everywhere except the uppercase label cases above.

---

## 4. Spacing, radius, layout

**Spacing scale:** `xs` 4 · `sm` 8 · `md` 16 · `lg` 24 · `gutter` 24 · `xl` 40 · `margin-mobile` 16 · `container-max` 1280px

**Radius:** `DEFAULT` 2px · `lg` 4px · `xl` 8px · `full` 12px

This scale is unusual and it is the point. `rounded-xl` is 8px, not 12. `rounded-full` is 12px, **not a circle** — for actual circles use `rounded-[50%]` or fixed-size elements with `rounded-full` plus equal width and height.

**Layout**
- Sidebar: fixed, 256px, `lg:` and up, `primary-container` background. Below `lg`, a bottom bar or drawer.
- Content: `lg:ml-64`, max 1440px, `px-margin-mobile md:px-lg`, `py-xl`.
- Bento grids: `grid-cols-1 md:grid-cols-3 gap-md`.
- Claim page: single centred column, max 520px, vertically centred.

---

## 5. Components

### 5.1 Buttons

**Primary** — `action`, text `#002116`, `label-md` mono semibold, `rounded-lg`, `h-10` compact or `py-3 px-4` standard, `gap-sm`, 18px leading icon.

**Primary, claim page only** — adds a hard offset shadow `shadow-[0_4px_0_#4D6787]`, lifts `-translate-y-0.5` on hover, presses `translate-y-1 shadow-none` on active. This tactile press is the signature moment of the product and appears **only** on the claim button. Do not spread it.

**Secondary** — `bg-surface`, `border-outline-variant`, hover `border-primary/50`, text `primary`, `shadow-sm`.

**Tertiary** — transparent, `border-outline-variant`, text `on-surface`, hover `bg-surface-container-high`.

**Icon** — 40×40 (`w-10 h-10`) or 32×32 in tables, `rounded-lg` or `rounded-full`, hover `bg-surface-container-high`.

### 5.2 Cards

**Glass card** (dashboard):
```css
background: rgba(255,255,255,0.7);
backdrop-filter: blur(16px);
border: 1px solid rgba(0,0,0,0.05);
box-shadow: 0 4px 6px -1px rgba(0,0,0,.05), 0 2px 4px -1px rgba(0,0,0,.03);
```
Plus `rounded-xl` and a `from-primary/5` gradient that fades in on hover over 500ms.

**Solid card** (wizard): `#ffffff`, `1px solid #c3c6ce`, `rounded-xl`.

**Claim panel**: `#ffffff`, `2px solid #e3e2e5`, `shadow-[0_12px_32px_rgba(26,43,62,0.08)]`, `rounded-2xl`, with a 4px `accent-yellow` bar pinned to the top edge.

### 5.3 Metric card

Uppercase `label-md` heading top-left; a 40px circular tinted icon badge top-right; `mb-xl` gap; `display-lg` value with `body-lg` unit; optional delta row with a 16px trend icon in `secondary`.

Icon badge tints: yellow `bg-accent-yellow/20 border-accent-yellow/50 text-tertiary` · green `bg-secondary-container/30 border-secondary-container/50 text-secondary` · pink `bg-accent-pink/20 border-accent-pink/50 text-error`.

### 5.4 Inputs

`bg-surface-container-low`, `border-outline-variant`, `rounded-lg`, `py-3 px-4`, `label-md` mono.

Focus: `box-shadow: 0 0 0 2px rgba(77,103,135,0.2)`, `border-color: #4d6787`, `outline: none`. Because the native outline is removed, this focus ring is **mandatory** on every focusable element — never ship a control without it.

Labels: `label-sm`, uppercase, `tracking-wider`, `on-surface-variant`, above the field. Helper text below in `label-sm`; left is neutral, right is a computed total in `primary`.

### 5.5 Tables

Header row `bg-surface-container-low`, `border-b border-outline-variant/40`. Body rows `border-b border-outline-variant/20`, hover `bg-surface-container-low`. Cells `py-4 px-lg`. Wrap in `overflow-x-auto` with `min-w-[800px]`.

Custom scrollbar: 6px, track `surface-container-low` at 50%, thumb `outline-variant` at 50%, `rounded-[4px]`.

Primary cell pattern: 32px rounded icon tile, then name in `font-medium text-primary` with a mono `label-sm` identifier beneath.

Progress cell: `12 / 50 claimed` left, percentage right, above a 6px track (`bg-surface-container-high`, `rounded-full`) with an `action` fill — or `outline-variant` fill when the campaign is expired.

### 5.6 Stepper

Completed: `bg-accent-yellow`, `border-outline-variant`, filled check.
Active: `bg-primary`, `text-on-primary`, numeral.
Future: `bg-surface-variant`, `border-outline-variant`, `opacity-50`.

All 32px circles. Each row shows a `label-md` title and a `label-sm` summary of the value chosen. Completed and active steps carry a bottom border; the final step does not.

### 5.7 Warning panel

`bg-error-container/30`, `border-error-container`, `rounded-lg`, `p-md`. Filled `warning` icon in `error`, then a bold `body-md` heading and `body-md` body in `on-surface-variant`, with the irreversible clause in `font-semibold text-on-surface`.

Reserved for genuinely irreversible actions: the CSV gate, and reclaim confirmation. Overuse destroys it.

### 5.8 Ambient orbs

Blurred circles at 10% opacity behind content, `pointer-events-none`, `-z-10`. Dashboard: pink 600px top-right at `blur-[100px]`, yellow 400px bottom-left at `blur-[80px]`. Claim page adds a pink radial glow behind the panel.

Two per screen maximum.

---

## 6. Iconography

Material Symbols Outlined, variable weight. `font-variation-settings: 'FILL' 1` for emphasis or filled state; unfilled otherwise.

Sizes: 14px inline · 16px metadata · 18px buttons · 20px nav and table actions · 24px feature tiles · 32px claim badge · 48px claim brand mark.

| Concept | Icon |
|---|---|
| Brand | `toll` (sidebar) · `water_drop` (claim) · `lan` (wizard) |
| Campaigns | `campaign` |
| Dashboard | `dashboard` |
| History | `history` |
| Settings | `settings` |
| Claim / gift | `redeem` |
| Wallet | `account_balance_wallet` |
| Link | `link` |
| Success | `check_circle` |
| Pending | `pending_actions` |
| Reclaim | `refresh` |
| Export | `download` |
| Create | `add` |
| Security | `verified_user` |
| Warning | `warning` |
| Info | `info` |

**The brand mark is inconsistent across the mocks** — `toll`, `water_drop`, and `lan` all appear. Pick one before build. Recommendation: **`toll`**, which reads as linked tokens and matches the product. Use it everywhere.

---

## 7. Motion

- Colour and background: 200ms.
- Hover reveals on cards: 300–500ms.
- Active nav item: `scale-[0.98]`.
- Claim button press: `translate-y-1`, shadow removed.
- Pulse ring on the claim badge: 2s infinite, `cubic-bezier(0.66,0,0,1)`, expanding to a 20px transparent ring.
- Processing spinner: `animate-spin` on `refresh`.

All decorative motion — pulse ring, orbs, hover gradients — must be disabled under `prefers-reduced-motion: reduce`. State transitions may remain, shortened.

---

## 8. Voice

Plain, specific, calm. The product handles other people's money; confidence comes from precision, not enthusiasm.

**Do**
- Name what happens: "Download secrets and continue," not "Submit."
- Keep an action's name constant through its flow: "Reclaim" → "Reclaiming" → "Reclaimed."
- Be exact about consequences: "We cannot recover them for you if lost."
- Sentence case in prose, uppercase only for structural labels.

**Don't**
- Exclaim. No "Success!" — use "Claimed."
- Apologise in errors. Say what happened and what to do.
- Say "crypto," "web3," or "dApp" on the claim page. Recipients may have no context.
- Use "protocol" or "non-custodial" in recipient-facing copy without explaining them.

**Empty states are invitations.** Not "No campaigns found" but "No campaigns yet. Create one to start distributing assets."

**Errors name the fix.** Not "Transaction failed" but "The network rejected this claim. Your funds are untouched — try again."

**Reference copy from the mocks**

| Context | Copy |
|---|---|
| Hero | Distribute Stellar assets with a link. / No wallet address required. |
| Claim, ready | You've received / 500.00 USDC / from *Sender* |
| Claim CTA | Connect Wallet to Claim |
| Claim, new user | New to Stellar? We'll sponsor your account and setup. No XLM required to claim these assets. |
| Claim footer | Non-custodial claim. / POWERED BY KLEYM ON STELLAR |
| CSV gate | Security Checkpoint Ahead — In the next step, you will be required to download a CSV containing the raw cryptographic secrets. **We cannot recover them for you if lost.** |
| Expiry helper | Unclaimed funds return to source. |

---

## 9. Corrections to the mocks

Fix these during implementation.

1. **"Deposit assets via smart contract"** (landing, step 1) is wrong. Kleym v1 uses native claimable balances, not a contract. Replace with **"Fund campaign — assets locked in claimable balances."** Shipping this line would misdescribe the security model.
2. **"Across 3 networks"** (dashboard) implies multi-chain. Kleym is Stellar-only. Replace with **"Across 3 assets."**
3. **`0x7F...3A9B`** addresses are Ethereum-formatted. Stellar addresses start with `G` and are 56 characters: **`GABC…3A9B`**.
4. **"Max: 10,000 per batch"** conflicts with the protocol. A *campaign* may reach 10,000 links; a *batch* is capped at 90 operations. Change to **"Max 10,000 per campaign · 90 links per signature."**
5. ~~**`#7DCCAD` is hardcoded** in many places. Promote to a named `action` token.~~ Done — `action`, and the value corrected for contrast (§2.2).
6. **Brand mark differs per page.** Standardise on `toll` (§6).
7. **Footer says © 2024.** Make it dynamic.
8. **Dark mode is configured** (`darkMode: "class"`) but no dark values exist. Either build the dark palette or remove the config — a half-wired dark mode will break on a system preference toggle.
9. **`text-headline-sm`** is used on the landing value props but is not defined in the type scale. Either add it or use `headline-md`.
10. **Fonts load from Google Fonts CDN.** On `/claim` this is a third-party request on a page that must have none (see SPEC §3.6). **Self-host Inter, JetBrains Mono, and Material Symbols** via `next/font/local` across the whole app.

---

## 10. Accessibility floor

Non-negotiable, and cheap if done from the start.

- Contrast: 4.5:1 body, 3:1 large text and UI boundaries. Verified, and the warning was right: `#7DCCAD`, `#FFEA88` and `#F599C6` measured 1.80, 1.15 and 1.95 against the page surface. All three are darkened in §2.2. `#7DCCAD` on `#002116` was never the problem — that pairing was 9.04; the failure was the button's *edge* against the page, which is what 1.4.11 governs. The `/50` borders on tinted metric cards are still below 3:1 and left alone: they frame non-interactive cards whose content is text.
- Visible focus on every interactive element (§5.4). The design removes native outlines, so this is load-bearing.
- Status is never colour-only — always a label and a dot.
- Full keyboard operation of the wizard, tables, and claim flow.
- Semantic landmarks: `<nav>`, `<main>`, `<header>`, `<footer>`. One `<h1>` per page.
- Icon-only buttons carry `aria-label`.
- `prefers-reduced-motion` respected (§7).
- Live regions announce claim state changes.
- Tables use `<th scope="col">`; progress bars use `role="progressbar"` with `aria-valuenow`.
- Touch targets 44×44 minimum on mobile. The 32px table icon buttons need padding to reach this.

---

## 11. Tailwind config

Port the mock's inline config into `tailwind.config.ts` verbatim, then:

- Add `action: { DEFAULT: '#3FA07A', hover: '#3A9470', on: '#002116' }`. Hover deepens rather than lightens — a lighter hover from this base falls to 2.62 against the surface.
- Add `headline-sm` to `fontSize`.
- Move `.glass-card`, `.glass-panel`, `.input-glow`, `.text-gradient`, `.ambient-glow`, and `.pulse-ring` into `globals.css` under `@layer components`.
- Replace font CDN links with `next/font/local`.
- Resolve dark mode (correction 8).
