# Dashboard — Command Center (BUILT)

`app/dashboard/page.tsx` + `components/dashboard/*`. This is the flagship
reference implementation; the rest of the program inherits its patterns.

### 1. UX analysis
The old dashboard was a create-form + project grid + decorative chart — an admin
panel. The redesign reframes it as a **command center**: the first thing a
creator sees is (a) the single high-value action — paste a channel, and (b) the
*intelligence* the product produces — analytics, audience demand, and ranked
book opportunities. The mental model shifts from "manage my generations" to
"here's what your audience will buy, act on it."

### 2. Information architecture
Welcome/action → Channel analytics → Book opportunities (+ Recent projects) →
Live AI analysis (+ Audience insights). Highest intent at top-left, ambient
status at right.

### 3. Wireframe
```
┌───────────────────────────────────────────────────────────┐
│ WELCOME  "Welcome back, {name}. N books are being written." │
│ [▶ Paste a YouTube channel URL…              ] [ Analyze → ]│
├───────────────────────────────────────────────────────────┤
│ CHANNEL ANALYTICS (Sample)                                  │
│ [Subscribers] [28-day views] [Engagement] [Audience growth] │
├──────────────────────────────────┬────────────────────────┤
│ BOOK OPPORTUNITIES (Sample)       │  AI ANALYSIS (live)     │
│ [Op card] [Op card] [Op card]     │  Analyzing @channel 62% │
│                                   │  ✓ Videos indexed       │
│ RECENT PROJECTS                   │  ✓ Comments analyzed    │
│ • @channel  …  [status]           │  ◴ Opportunities…       │
│ • @channel  …  [status]           │  ─────────────────────  │
│                                   │  AUDIENCE INSIGHTS      │
│                                   │  ↑ topics / ? / gaps    │
└──────────────────────────────────┴────────────────────────┘
```

### 4. Component hierarchy
```
AppShell
└ DashboardPage (client; fetches /api/projects)
  ├ WelcomeBanner            (real: POST /api/projects)
  ├ StatCard ×4 + Sparkline  (sample → ChannelMetric[])
  ├ OpportunityCard ×3       (sample → BookOpportunity[])
  ├ RecentProjects           (real: ProjectItem[])
  ├ AIAnalysisPanel          (real: resolvePipeline(status) + Progress)
  └ AudienceInsights         (sample → AudienceInsight[])
```

### 5. Tailwind strategy
12-col intent via `lg:grid-cols-3` (main `col-span-2`, rail `col-span-1`).
Stat/opportunity rows are auto-responsive grids
(`grid-cols-1 sm:grid-cols-2 xl:grid-cols-{3,4}`). Page capped `max-w-7xl`,
centered. All color/space/radius via tokens — zero hard-coded hex.

### 6. Responsive behavior
- **≥1024px:** sidebar + two-column body.
- **640–1024px:** sidebar hidden (topbar brand returns), body single column,
  stat/opportunity grids reflow to 2-up.
- **<640px:** single column, bottom `MobileNav`, content `pb-24` to clear it.

### 7. Interaction details
- `⌘K` opens the global command bar from anywhere.
- Channel input: focus ring → primary border; submit → inline "Starting…" then
  route to live pipeline. Error renders inline, border turns error.
- Cards lift on hover; opportunity cards reveal an arrow affordance.
- Status badges pulse a dot while a project is in-flight.

### 8. Animation
Sections `fade-up` on mount; AI checklist steps stagger in (`delay i*0.05`); the
active step carries `pulse-ring`; progress bar width eases over 500ms; skeletons
shimmer. Reduced-motion collapses to opacity-only.

### 9. Empty states
- No projects → Recent Projects shows a one-line prompt; the AI panel becomes a
  "No analysis running — paste a channel above" card with a Browse CTA.
- First-run target: lead the eye to the WelcomeBanner input (the only required
  action).

### 10. Loading states
Skeletons for the 4 stat cards, 3 opportunity cards, recent list, and AI panel —
matched to final dimensions to prevent layout shift. No spinner-as-content.

### 11. Error states
Project load failure → inline error Card (icon + message), rest of page still
renders sample sections so the screen is never blank. 401 → redirect to
`/login?next=/dashboard`.

---

### Data contract → make it live
`components/dashboard/data.ts` defines `ChannelMetric`, `AudienceInsight`,
`BookOpportunity`. Replace `SAMPLE_*` by exposing on the project read model:
- **metrics** ← `YouTubeMetadataProvider` channel stats + view aggregates.
- **insights** ← `CommentInsights` (top questions, pain points) + knowledge-base
  topic clusters + outline-vs-coverage gaps.
- **opportunities** ← `BookStrategy` candidates with demand/opportunity scores.

Suggested endpoint: `GET /api/projects/:id/intelligence` returning the above;
or fold a `summary` block into `GET /api/projects`. Once returned, delete the
sample constants and the `SampleTag` usages.
