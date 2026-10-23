# Design system

The visual language for BizMemory's interface. It changes how the product looks and feels
only: routes, navigation items, data and behaviour are untouched. Tokens live in
[`src/app/globals.css`](../src/app/globals.css) (Tailwind v4 `@theme`); fonts load in
[`src/app/layout.tsx`](../src/app/layout.tsx). Direction chosen with the `ui-ux-pro-max`
skill (Minimalism & Swiss, dense/dashboard, low motion; "Financial Trust" type pairing),
then adapted: one restrained accent, editorial page titles, flat surfaces.

## Principles

1. **Work surface, not a brochure.** Left-aligned, dense, scannable. No centred marketing
   layouts inside the app.
2. **One accent.** Verdigris marks *the thing you can act on* (primary button, link, current
   nav item, focus). Status colours (success / warn / danger / info) carry meaning only and
   always pair with a text label or icon, never colour alone.
3. **Flat by default.** Borders separate regions. Only floating layers (menus, popovers,
   modals) get a shadow. No gradients, glow, glass or decorative animation.
4. **No cards inside cards.** A page is regions separated by hairlines; a card is used for a
   self-contained object (a project, a person), never as a wrapper for another card.
5. **Numbers are first-class.** Tabular figures everywhere in tables and KPIs; amounts are
   right-aligned.

## Colour

Dark ("ink") is the default; light ("paper") overrides the same token names under
`:root[data-theme="light"]`. Components use tokens only (`bg-surface`, `text-muted`,
`border-border`), never raw hex.

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#0f1312` | `#f6f5f1` | App background |
| `surface` | `#161c1b` | `#ffffff` | Panels, tables, inputs |
| `surface-2` | `#1e2625` | `#efeee8` | Hover rows, table headers, inset areas |
| `border` | `#2c3634` | `#dedcd3` | Hairlines and dividers (decorative) |
| `border-strong` | `#667673` | `#7d8682` | Control boundaries (inputs, selects, checkboxes) |
| `text` | `#e8eeec` | `#17201e` | Body and headings |
| `text-2` | `#c3cdca` | `#3d4846` | Secondary body |
| `muted` | `#98a5a2` | `#5c6764` | Captions, helper text, placeholders |
| `brand` | `#4cc7aa` | `#0b6b5b` | Accent: links, primary fill, focus ring |
| `brand-strong` | `#6fd8bf` | `#07554a` | Hover on brand |
| `on-brand` | `#05201a` | `#ffffff` | Text on a brand fill |
| `success` | `#4ade9b` | `#14704a` | Paid, done, on track |
| `warn` | `#f0b34a` | `#93560a` | Sent, watch, due soon |
| `danger` | `#f48a80` | `#b42318` | Overdue, at risk, destructive |
| `info` | `#78b4ee` | `#1f5f99` | Neutral notices, in review |
| `*-soft` | 14% mix into `surface` | same | Badge and notice fills (`brand-soft`, `success-soft`, …) |

### Measured contrast (WCAG 2.x ratios, computed from the hex values above)

| Pair | Dark | Light | Requirement |
|---|---|---|---|
| `text` on `bg` | 15.93 | 15.26 | 4.5 |
| `text` on `surface` | 14.70 | 16.64 | 4.5 |
| `text-2` on `surface` | 10.61 | 9.49 | 4.5 |
| `muted` on `bg` | 7.34 | 5.38 | 4.5 |
| `muted` on `surface` | 6.78 | 5.87 | 4.5 |
| `muted` on `surface-2` | 6.06 | 5.05 | 4.5 |
| `brand` on `bg` (links) | 8.96 | 5.89 | 4.5 |
| `brand` on `surface` | 8.27 | 6.43 | 4.5 |
| `on-brand` on `brand` (primary button) | 8.19 | 6.43 | 4.5 |
| `on-brand` on `brand-strong` (hover) | 9.98 | 8.72 | 4.5 |
| `success` on `surface` / on its soft fill | 10.04 / 7.46 | 6.09 / 4.97 | 4.5 |
| `warn` on `surface` / on its soft fill | 9.25 / 6.97 | 5.87 / 4.80 | 4.5 |
| `danger` on `surface` / on its soft fill | 7.23 / 5.75 | 6.57 / 5.20 | 4.5 |
| `info` on `surface` / on its soft fill | 7.86 / 6.08 | 6.66 / 5.42 | 4.5 |
| `brand` on `brand-soft` | 6.34 | 5.20 | 4.5 |
| `border-strong` on `surface` / `bg` / `surface-2` | 3.62 / 3.92 / 3.24 | 3.75 / 3.43 / 3.22 | 3.0 (non-text, 1.4.11) |
| Focus ring `brand` on `surface` / `bg` / `surface-2` | 8.27 / 8.96 / 7.40 | 6.43 / 5.89 / 5.53 | 3.0 |

Before this redesign: white on the old primary blue was 3.68:1 (fail), the `brand-soft`
text colour was 1.87:1 (fail) and input borders sat near 1.3:1.

## Type

- **UI:** IBM Plex Sans 400 / 500 / 600 (`font-sans`). Supports tabular figures and
  renders ₹ cleanly.
- **Page titles (`h1`) and the greeting:** Source Serif 4 600 (`font-display`). One serif
  voice, used for titles only.
- **Identifiers, codes, keyboard hints:** IBM Plex Mono 400 / 500 (`font-mono`).
- Loaded with `next/font/google` (self-hosted at build time, `display: swap`, no runtime
  request to Google). Fallbacks: system UI stack, Georgia, ui-monospace.

| Step | Size / line | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Captions, badges, table column headers (sentence case, 500) |
| `text-sm` | 14 / 20 | Default UI and table text (body size) |
| `text-base` | 16 / 24 | Prose, form fields on mobile |
| `text-lg` | 18 / 24 | Panel and section titles |
| `text-xl` | 22 / 28 | Page title on mobile |
| `text-2xl` | 28 / 34 | Page title on desktop |
| `text-3xl` | 36 / 40 | Marketing display, large KPI |

Nothing below 12px. The old 9 / 10 / 11px labels and all-caps tracked mono "eyebrows" are
replaced by 12px sentence-case labels. Body line-height is 1.4–1.5; prose measure ≤ 70ch.

## Spacing, shape, elevation

- **Spacing:** 4px base. Allowed steps: 4, 8, 12, 16, 20, 24, 32, 48. Page gutter 16px
  (mobile) / 24px (≥ 640px) / 32px (≥ 1024px). Table cells 12px × 10px; panels 16–20px.
- **Radii:** controls 6px (`--radius-control`), panels / tables / modals 8px
  (`--radius-card`), badges 4px, avatars and toggles full.
- **Elevation:** 0 = flat bordered region (default). 1 = `shadow-pop` for menus, popovers,
  the command palette. 2 = `shadow-modal` for dialogs. Both are neutral black/ink with a
  1px border ring, with no colour and no glow.
- **Motion:** 120ms (`--duration-fast`) for hover / press, 180ms (`--duration-base`) for
  disclosure, `cubic-bezier(0.2, 0, 0, 1)`. Colour / opacity / transform only; no layout
  animation, no looping animation. `prefers-reduced-motion` collapses all durations.

## Icons

One family: the in-repo stroke set in `src/components/kit-icons.tsx` (24px grid, 1.75px
stroke, round caps and joins, `currentColor`, `aria-hidden` unless it is the only label).
Sizes 16px inline, 20px in navigation. No emoji or glyph characters as icons; the single
remaining `✓` in the pricing list is replaced by the `check` icon. Icon-only buttons always
have an `aria-label` and a 44px hit area on touch.

## Control states

Every interactive control implements all of these. Checked in review for each shared
component.

| State | Treatment |
|---|---|
| Rest | Token fill and `border-strong` boundary; label always visible (placeholder is never the label) |
| Hover | One step: `surface-2` fill (secondary / ghost) or `brand-strong` (primary); 120ms; never hover-only information |
| Focus-visible | 2px `brand` outline, 2px offset, on every focusable element; never removed |
| Active / pressed | Fill one step darker, no movement; toggles use `aria-pressed` / `aria-selected` |
| Disabled | `surface-2` fill, `muted` text, `not-allowed` cursor, `disabled` attribute (not just opacity); a primary stays recognisably a button |
| Loading | Label stays, spinner (SVG, `aria-busy`) replaces the leading icon, width does not change, repeat submits blocked |
| Error | `danger` border + inline message directly under the field linked by `aria-describedby`, plus an icon; an error summary on long forms |
| Empty | Table / list area keeps its header; one sentence saying what belongs here and the primary action; no illustration |
| Touch | ≥ 44×44px target (inputs, buttons, tabs, nav rows) with ≥ 8px between targets; inputs 16px text on mobile to prevent zoom |

## Components (shared, in `src/components`)

- **Button:** primary (brand fill), secondary (surface + strong border), ghost, danger.
  36px high on desktop, 44px on touch. One primary per view region.
- **Inputs / selects / textareas:** 36px (44px touch), `border-strong`, visible label above,
  helper text below, error state as above. Native select with one shared chevron.
- **Table:** sticky header on `surface-2`, 12px sentence-case column headers, tabular
  figures, amounts right-aligned, row hover `surface-2`, sort/filter above, actions in a
  fixed-width right column, totals row pinned. At < 768px wide tables become stacked
  records (primary cell on the first line, amount and status beneath).
- **Badge:** 4px radius, 12px, `*-soft` fill with matching text and a leading dot or icon.
- **Panel:** `surface`, 1px `border`, 8px radius; header row (title left, actions right).
- **Modal / drawer:** `shadow-modal`, focus trap, Esc closes, returns focus, scrim at 50%.
- **Toast:** `shadow-pop`, bottom-left on desktop, full-width on mobile, `role="status"`.
- **Navigation:** icon rail + section list stay at ≥ 1024px. Below that the rail collapses
  to a top bar with a menu button opening the same items in a drawer (same routes, same
  labels).

## How this answers the audit

| # | Audit point | Where it is addressed |
|---|---|---|
| 1 | Mobile rail eats width, sub-nav unreachable | Navigation rule above; implemented in the shell commit |
| 2 | Mobile tables clip | Table rule (stacked records < 768px); per-module commits |
| 3 | Tap targets under 44px | Global touch rule in `globals.css` + component sizes |
| 4 | 10–11px mono all-caps labels | Type scale (min 12px, sentence case); swept per module |
| 5 | Contrast failures | New tokens (table above) |
| 6 | Generic card grids | Principles 1 and 4; module pages re-laid out as regions and tables |
| 7 | Accent used for everything; floating AI button collides | Principle 2; AI button becomes a nav-integrated entry, no overlay on content |
| 8 | Sidebar overload | Shell commit: credits and focus timer move out of the always-on column |
| 9 | Inconsistent controls | One Button / Input / Tabs component set |
| 10 | Table readability | Table rule; tabular figures are global |
| 11 | Generic landing page | Marketing layout reworked, left-aligned, product-led |
| 12 | No loaded font / no scale | Type section; fonts via `next/font` |
| 13 | Raw colours break the light theme | Token-only rule; sweep removes raw hex / slate / gray classes |
| 14 | Next.js dev badge | Dev-only overlay, not product UI (hidden in screenshots) |
