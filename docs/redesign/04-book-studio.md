# Book Studio — Flagship Editor (SPEC, build-ready)

Route: `/studio/[projectId]`. Think **Notion + Google Docs + an AI copilot**.
The existing `app/projects/[id]/editor` is the functional seed; this is its
premium, distraction-free successor.

### 1. UX analysis
The writer's job here is to *refine* a 100+ page draft, not start from blank.
So the editor must (a) make structure navigable, (b) keep the page calm and
content-forward, and (c) put AI actions one gesture away — always scoped to the
current selection/section and grounded in audience sources. Retention lives here:
the more a creator shapes their book, the more it's *theirs*.

### 2. Information architecture
Three-pane workspace with collapsible rails:
```
Left rail: Book structure (parts → chapters → sections), drag to reorder, progress
Center:    Rich text editor — one chapter at a time, focus mode
Right rail: AI Copilot · Audience insights for this chapter · Source videos · Refs
```

### 3. Wireframe
```
┌ Book title ▾  ·  124 pp · 38k words ·  [Preview] [Export ▸] ┐
├──────────┬───────────────────────────────┬─────────────────┤
│ STRUCTURE│  Chapter 3 — Pricing with…     │ AI COPILOT      │
│ 1 Intro ✓│                                │ ┌ Expand        │
│ 2 …    ✓ │  The first thing most solo…    │ │ Rewrite       │
│ 3 …   ●  │  [ selection ]──────────────┐  │ │ Add examples  │
│   3.1    │  ┌ Improve · Expand · Stats │  │ │ Add stats     │
│   3.2    │  └───────────────────────────┘ │ │ Change tone ▾ │
│ 4 …      │                                │ └ Generate sect.│
│ + Section│  …                             │ INSIGHTS (ch.3) │
│ ─────────│                                │ ? "what to charge"│
│ 62% done │                                │ SOURCES ▸ videos │
└──────────┴───────────────────────────────┴─────────────────┘
```

### 4. Component hierarchy
```
StudioLayout (3-pane, resizable)
├ StudioTopbar: title, word/page count, Preview, Export
├ StructureTree: Part/Chapter/Section nodes · drag-reorder · status dots · % bar
├ Editor: ProseMirror/TipTap surface
│   └ SelectionToolbar (floating): Improve · Expand · Add stats · Rewrite
├ CopilotPanel: action buttons → streamed diff preview (accept/reject)
├ ChapterInsights: audience questions/gaps relevant to this chapter
└ SourcePanel: source videos + references, click to cite
```
Editor: **TipTap** (ProseMirror) — collaborative-ready, clean schema, good DX.
AI edits render as an **inline diff** the user accepts/rejects (Cursor-style),
never silently overwriting.

### 5. Tailwind strategy
`grid grid-cols-[260px_1fr_320px]` desktop; rails collapse to icon strips.
Editor column `max-w-[720px]` centered for readable measure (~70ch). Focus mode
hides both rails (`⌘\`). Selection toolbar positioned via floating-ui.

### 6. Responsive
- Desktop: 3-pane.
- Tablet: structure as a toggle drawer, copilot as a right Sheet.
- Mobile: editor full-screen; structure + copilot as bottom Sheets; AI actions
  surface in a sticky action bar above the keyboard. Editing is first-class on
  mobile (brief requirement), not read-only.

### 7. Interaction
- Select text → floating toolbar with the brief's actions (Expand, Rewrite, Add
  examples, Add case studies, Improve clarity, Add statistics, Change tone).
- Copilot action → streamed suggestion with token-by-token reveal → diff →
  accept/reject. `⌘K` works here too, scoped to "this chapter."
- Structure tree: drag to reorder; "Generate chapter" on an empty node streams
  content with live progress.
- Autosave with a subtle "Saved" affordance; every AI action is undoable.

### 8. Animation
Streaming text reveal (caret + fade per chunk); diff add/remove highlight
(success/error tint, fades after accept); rail collapse springs; tree reorder
uses FLIP. All gated by reduced-motion.

### 9. Empty states
- Section with no content → "Generate this section from your audience insights"
  with the seeding insight shown.
- New book with only an outline → guided "Generate first chapter" flow.

### 10. Loading
Editor shell + structure skeleton load instantly; chapter body streams. Copilot
shows a thinking shimmer line, not a spinner.

### 11. Error
Generation failure → inline retry on the section, draft preserved. Save conflict
→ non-destructive banner with "review changes." Network loss → offline banner,
local buffer, auto-resync.

---

### Data contract (builds on existing APIs)
Existing: `PATCH /api/chapters/:id`, `POST /api/chapters/:id/regenerate`,
`POST /api/sections`, `POST /api/extras`, `GET /api/projects/:id/book`.
Add for the copilot: `POST /api/chapters/:id/transform`
`{ op: 'expand'|'rewrite'|'improve'|'add_stats'|'add_examples'|'tone', selection, tone? }`
→ streamed suggestion (SSE), applied only on accept. The AI prompts already
exist in `packages/core/.../prompts/*` (Chapter, Polish, ExtraContent).
