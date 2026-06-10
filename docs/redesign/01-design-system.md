# Design System

Implemented in `tailwind.config.ts` + `app/globals.css`. Tokens are CSS custom
properties (HSL channels) so the active theme swaps via `<html data-theme>`
without touching component classes.

## Color

| Token | Tailwind | Dark value | Use |
|---|---|---|---|
| Background | `bg-canvas` | `#0A0B0F` | App canvas |
| Surface | `bg-surface` | `#12141B` | Cards, panels |
| Surface raised | `bg-surface-raised` | `#16181F` | Popover, nested |
| Surface hover | `bg-surface-hover` | `#1A1D26` | Hover, inputs, chips |
| Primary | `bg-primary` / `text-primary` | `#6D5EF7` | Brand, CTAs, active |
| Secondary | `text-secondary` | `#00D4FF` | Accent, data viz |
| Success | `text-success` | `#00C853` | Done, positive delta |
| Warning | `text-warning` | `#FFB300` | Sample, partial |
| Error | `text-error` | `#FF5252` | Failure, destructive |
| Foreground | `text-foreground` | `#FFFFFF` | Primary text |
| Muted fg | `text-muted-foreground` | `#A1A7B3` | Secondary text |
| Border | `border-border` | `#252A36` | Hairlines |

**Rules:** one accent (violet→cyan) reserved for brand + focus moments. Status
colors carry meaning only. Brand gradient (`bg-brand-vivid`) used sparingly:
logo mark, active-nav indicator, top sparkline, demand meters.

## Typography — Inter (`next/font`, variable `--font-inter`)

| Role | Class | Size / line | Weight |
|---|---|---|---|
| Display | `text-display` | 64 / 1.04 | 700 |
| H1 | `text-h1` | 48 / 1.08 | 700 |
| H2 | `text-h2` | 36 / 1.12 | 700 |
| H3 | `text-h3` | 28 / 1.2 | 600 |
| Body | `text-base` | 16 / 1.5 | 400–500 |
| Small | `text-sm` | 14 | 400–500 |
| Caption | `text-caption` / `text-xs` | 12 | 500–600 |

Tracking tightens as size grows (`-0.03em` at display). Numerals use
`tabular-nums` everywhere they animate or align (stats, scores, percentages).

## Spacing — 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96
Tailwind scale (`1=4px`). Page gutters `px-4` mobile → `px-8` desktop. Section
rhythm `gap-6` (24). Card padding `p-5`/`p-6`.

## Radius
`rounded-card` 20 · `rounded-button` / `rounded-input` 14 · `rounded-modal` 24.

## Elevation
`shadow-soft` (resting) · `shadow-card` (hover lift) · `shadow-lift` (modals) ·
`shadow-glow` (primary CTA). Elevation is subtle; borders do most of the
separation work on the dark canvas.

## Motion (Framer Motion + Tailwind keyframes)
- `animate-fade-up` — section/list entrance (cubic-bezier `0.22,1,0.36,1`, 400ms).
- `animate-shimmer` — skeleton sweep (no spinners for content loading).
- `animate-pulse-ring` — active AI step halo.
- Hover lifts: 150–200ms, `-translate-y-1`, border + shadow only.
- Buttons: `active:scale-[0.98]`. Respect `prefers-reduced-motion`.

**Avoid:** parallax, bounce, long/looping flourishes, anything that delays input.

---

## Component library (built)

`components/ui/` — shadcn "new-york" conventions, `cn()` from `lib/utils.ts`.

| Component | Variants | Notes |
|---|---|---|
| `Button` | primary, secondary, ghost, outline, destructive, link · sm/md/lg/icon | `asChild` via Radix Slot; primary uses brand gradient + glow |
| `Card` | `interactive` | 20px radius, hover-lift when interactive |
| `Badge` | default, primary, secondary, success, warning, error, outline | pill, icon-aware |
| `Skeleton` | — | shimmer-masked loading placeholder |
| `Progress` | — | determinate, brand-filled |

`components/app/` — `AppShell`, `AppSidebar`, `Topbar`, `CommandBar` (⌘K),
`MobileNav`, `ThemeToggle`.

`components/dashboard/` — `WelcomeBanner`, `StatCard`, `Sparkline`,
`OpportunityCard`, `AudienceInsights`, `AIAnalysisPanel`, `RecentProjects`,
`SampleTag`, plus `pipeline.ts` (status→premium-stage mapping), `data.ts`
(typed contract + sample), `format.ts`.

### Accessibility baseline
Focus-visible rings on all interactives; command bar is a Radix Dialog (focus
trap, Esc, labelled); icons in status are paired with text; contrast meets WCAG
AA on the dark palette; `aria-pressed` on toggles; reduced-motion honored.

### Next components to add (for the specced surfaces)
`Dialog`, `Tooltip`, `Tabs`, `Input`, `Textarea`, `DropdownMenu`, `Sheet`
(mobile drawers), `ScrollArea`, `Select`, `Toast` — all installable via
`npx shadcn@latest add …` against the included `components.json`.
