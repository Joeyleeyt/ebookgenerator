# Audience Intelligence — the Differentiator (SPEC, build-ready)

Route: `/intelligence` (and `/intelligence/[projectId]`). This is what makes
Ebookly *not* a generic AI writer. Design it like Perplexity meets a research
platform: source-backed, scannable, confident.

### 1. UX analysis
This page answers "what does my audience actually want, and how do I know?"
Every claim is traceable to evidence (videos, comments). It must feel like
*discovered intelligence*, not invented content — so source counts, sample
quotes, and confidence are always visible. This is the page that converts a
skeptic into a believer and a trial into a subscription.

### 2. Information architecture
```
Header: channel identity + "analyzed N videos · M comments" + refresh
Tabs / anchored sections:
  ① Topic Demand        ② Audience Questions   ③ Content Gaps
  ④ Viewer Pain Points  ⑤ Trending Themes      ⑥ Comment Sentiment
Each section = visual summary + ranked list + "→ Turn into chapter/book" action
```

### 3. Wireframe
```
┌ @channel · Audience Intelligence ········· [Re-analyze] ┐
│ analyzed 48 videos · 12,940 comments · updated 2h ago    │
├──────────────────────────────────────────────────────────┤
│ TOPIC DEMAND                          SENTIMENT            │
│ ▣ treemap / ranked bars               ◔ donut + trend      │
│  pricing ███████ 92                   pos 71% neu 22% neg 7%│
│  clients ██████ 86                                         │
├───────────────────────────────┬──────────────────────────┤
│ AUDIENCE QUESTIONS            │ CONTENT GAPS               │
│ "How do I find my first…" 88  │ ▲ retainer contracts  81  │
│  └ 214 comments · 6 videos    │ ▲ cold outreach       69  │
│  [ Answer in a chapter → ]    │  [ Fill this gap → ]       │
├──────────────────────────────┴──────────────────────────┤
│ VIEWER PAIN POINTS · TRENDING THEMES (cards)              │
└──────────────────────────────────────────────────────────┘
```

### 4. Component hierarchy
```
AppShell
└ IntelligencePage
  ├ IntelligenceHeader (sources, freshness, Re-analyze)
  ├ DemandTreemap | DemandBars         (Topic Demand)
  ├ SentimentDonut + SentimentTrend
  ├ InsightList (variant="question"|"gap"|"pain")  ← reuses AudienceInsights row
  │   └ InsightRow: text · weight meter · source chips · action button
  ├ ThemeCard grid (Trending Themes)
  └ SourceDrawer (Sheet): quotes + linked videos for any insight
```
New primitives: `Tabs`, `Tooltip`, `Sheet`, a tiny `Treemap`/`Donut` (SVG, same
approach as `Sparkline` — no chart lib needed for v1; add `recharts` only if
interactions grow).

### 5. Tailwind strategy
Two-column masonry-ish grid `lg:grid-cols-2` with feature sections spanning
full width. Demand meters reuse the `bg-brand-vivid` bar pattern. Source chips =
`Badge variant="outline"`. Confidence shown as a 0–100 weight + tooltip
("based on N comments across M videos").

### 6. Responsive
Desktop 2-col → tablet stacked sections → mobile: section tabs become a
horizontal scroll selector; each section a full-width card; SourceDrawer becomes
a bottom Sheet.

### 7. Interaction
- Click any insight → SourceDrawer slides in with representative comment quotes
  + the videos they came from (evidence-first).
- "Turn into chapter" / "Fill this gap" → creates a Studio section pre-seeded
  with the insight + sources.
- Re-analyze → triggers the pipeline's comment-analysis stage; live progress
  reuses `AIAnalysisPanel`.

### 8. Animation
Bars/treemap grow from 0 on first paint (stagger by rank). Donut sweeps in.
Drawer uses spring slide. Numbers count up (`tabular-nums`) once, then settle.

### 9. Empty states
Pre-analysis: "We haven't analyzed this audience yet" + Re-analyze CTA and a
skeleton preview of the sections so value is legible before data exists.

### 10. Loading
Per-section skeletons (bars, donut, list rows) — sections resolve independently
as the pipeline emits them, so partial intelligence shows immediately.

### 11. Error
If comment analysis failed/partial, show an inline notice per section with a
"Retry analysis" action; never hide the sections that *did* resolve.

---

### Data contract
```ts
GET /api/projects/:id/intelligence →
{
  sources: { videos: number; comments: number; updatedAt: string },
  topicDemand:   { topic: string; demand: number; sources: SourceRef[] }[],
  questions:     { text: string; demand: number; sources: SourceRef[] }[],
  gaps:          { topic: string; weight: number; rationale: string }[],
  painPoints:    { text: string; weight: number; sources: SourceRef[] }[],
  themes:        { theme: string; momentum: number }[],
  sentiment:     { positive: number; neutral: number; negative: number; trend: number[] },
}
type SourceRef = { videoId: string; title: string; quote?: string }
```
Backed by existing `CommentInsights`, `ChannelKnowledgeBase`, and
`BookStrategy` — this endpoint is an aggregation/read-model over data the
pipeline already produces.
