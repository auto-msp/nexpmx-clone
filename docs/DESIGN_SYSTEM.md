# DESIGN SYSTEM

Dark-first token system in `src/app/globals.css` via Tailwind v4 `@theme`.
Components consume tokens only — no raw hex in components.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#0b0d12` | Page background |
| `--color-surface` | `#12151d` | Cards |
| `--color-surface-2` | `#191d28` | Inputs, table heads |
| `--color-border` | `#262b38` | Borders/dividers |
| `--color-text` | `#e7eaf0` | Primary text |
| `--color-muted` | `#99a2b4` | Secondary text |
| `--color-brand` | `#6366f1` | Primary actions, links |
| `--color-brand-strong` | `#4f46e5` | Hover |
| success / warn / danger | `#34d399` / `#fbbf24` / `#f87171` | Status badges |
| `--radius-card` / `--radius-control` | 14px / 10px | Cards / buttons+inputs |

Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`).
Motion: reduced-motion media query collapses animations.

## Component inventory (`src/components/ui.tsx`)

| Component | Variants | Notes |
| --- | --- | --- |
| Button / ButtonLink | primary, secondary, ghost, danger | disabled states, focus-visible ring |
| Card | — | surface + radius + border |
| StatCard | — | dashboard KPI |
| Badge | neutral, success, warn, danger, brand | status pills |
| EmptyState | — | empty lists |
| Input / Select / Textarea / Field | — | consistent focus ring, labels |
| Table | — | sticky-styled header, horizontal scroll on mobile |

App chrome (`src/components/app-shell.tsx`): sidebar (hidden < md), top bar,
active-route highlighting with `aria-current`.

Marketing chrome (`src/components/site.tsx`): sticky header, responsive nav
(collapse < md), footer with legal links.

## Accessibility

- Landmarks: `header/nav/main/footer/aside`; one `h1` per page.
- `aria-current="page"` on active nav; `aria-hidden` decorative marks.
- Visible focus ring globally (`:focus-visible`).
- Color contrast: text `#e7eaf0` on `#0b0d12` ≈ 14.9:1; muted ≥ 5.4:1.
- Form controls are real `<label>` elements; destructive ghost buttons are
  forms with explicit submit buttons (no icon-only controls).

## Visual comparison status

No screenshot-diff against the target was performed (clean-room, original
branding; no browser tooling in this environment). The system is internally
consistent; treat visual parity with any external product as explicitly
out of scope — see KNOWN_LIMITATIONS.md.
