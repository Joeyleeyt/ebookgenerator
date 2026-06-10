# Exports · Templates · Mobile · Conversion (SPEC)

## Exports — professional export center (`/exports`, `/exports/[projectId]`)

### UX & wireframe
A confident "your book is ready to ship" surface. Left: a live book preview
(cover + first spread). Right: format cards + quality readout.
```
┌ "The Solo Consultant Pricing Playbook"  ·  Ready to export ┐
├─────────────────────────┬──────────────────────────────────┤
│  [ book preview spread ] │ Word count   38,412              │
│                          │ Page count   124                 │
│                          │ Reading time ~3h 10m             │
│                          │ Quality      ●●●●○  Print-ready  │
│                          │ ┌ PDF   ┐ ┌ EPUB ┐               │
│                          │ ┌ DOCX  ┐ ┌ KDP  ┐ (print-ready) │
└─────────────────────────┴──────────────────────────────────┘
```
- **Formats:** PDF, EPUB, DOCX, **Amazon KDP** (trim-size + bleed presets),
  Print-Ready PDF. Each a `Card` with icon, blurb, and a primary export button.
- **Quality readout:** word/page count, reading time, and an export-readiness
  score (cover set? front/back matter? images embedded?).
- **States:** generating → progress card reusing `AIAnalysisPanel`; ready →
  download + "open in KDP" guidance; failed → retry the export stage only.

### Data contract
Existing `GET /api/exports?projectId=` returns `{ format, pageCount, url }[]`,
and `POST /api/exports` triggers an export (`ExportEbookUseCase`,
`PuppeteerPdfExporter`, `DocxExporter`). Add EPUB + KDP exporters behind the same
port; surface `wordCount`/`readingTime` from the assembled `Book`.

---

## Templates (`/templates`)
Gallery of book archetypes (Playbook, Field Guide, 30-Day Course, Q&A Compendium)
and chapter blueprints. Each card → starts a project/outline pre-shaped to that
structure, seeded by the channel's intelligence. Grid of `Card interactive` with
a preview thumbnail, structure summary, and "Use template."

---

## Mobile experience (reframed, not squeezed)
Built foundation: `MobileNav` bottom tabs (Home · Projects · Insights · Studio),
hidden desktop sidebar, `pb-24` content clearance, sticky blurred topbar.

Priorities per surface:
- **Quick insights** — Intelligence sections as swipeable full-width cards;
  demand bars and sentiment legible at a glance.
- **Project status** — dashboard AI panel and project pipeline are the mobile
  home; push-style status, not a data grid.
- **Book editing** — Studio editor is full-screen; structure & copilot are
  bottom Sheets; AI actions in a thumb-reachable sticky bar.
- **AI actions** — `⌘K` command bar adapts to a full-screen mobile sheet
  triggered from the topbar.

Targets: 44px min touch targets, single-column everything, drawers over
multi-pane, no hover-only affordances.

---

## Conversion optimization

1. **Lead with intelligence, gate the payoff.** Let trial users run analysis and
   *see* opportunities/insights for free; gate full 100-page generation + export
   behind upgrade. The value (intelligence) is proven before the ask.
2. **"Sample" honesty as trust.** Visible `Sample` tags and source-backed
   insights build the credibility that closes high-ticket creators.
3. **Time-to-wow < 60s.** Paste channel → first real insights stream in fast.
   The `AIAnalysisPanel` narration makes the wait feel like value, not latency.
4. **Opportunity score → revenue framing.** Show estimated demand/revenue on
   each opportunity; creators buy outcomes, not features.
5. **Single primary action per screen.** One CTA, unmistakable (brand gradient +
   glow). Secondary actions are ghost/outline.
6. **Empty states sell.** Every empty state previews the value and points to the
   one next action.
7. **Frictionless channel connect.** Accept any channel URL/handle; validate
   inline; never block on OAuth before showing value.

## Premium SaaS recommendations
- Keep one accent; let typography + spacing carry the premium feel (Linear/Vercel
  discipline) — resist adding colors.
- Real, source-cited data over decorative charts (Stripe/Perplexity credibility).
- Micro-interactions that confirm, never entertain; everything < 200ms to input.
- Consistent 20/14/24 radii, hairline borders, `tabular-nums` for all metrics.
- Dark mode is the hero; light mode is first-class (both shipped in tokens).
- Ship a component library, not pages — every surface above reuses `components/ui`
  and `components/app`, so velocity compounds.
