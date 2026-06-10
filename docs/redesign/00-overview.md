# Ebookly — Product Redesign Program

> Mission: **Turn YouTube audience intelligence into profitable books.**
> Not "an AI ebook writer." The product's value is the *intelligence* — discovering
> what an audience will pay to read — and the writing is the payoff.

This folder is the design spec for the redesign. One surface (the **Dashboard /
command center**) is **built in code** as the flagship reference implementation;
the rest are **specified build-ready** here, inheriting the same system.

---

## 1. Design principles

1. **Intelligence first, generation second.** Every screen leads with what we
   learned about the audience, then offers to act on it. The channel input is
   framed as "analyze," never "generate."
2. **Show the work.** AI progress is a narrated checklist of meaningful steps
   ("Audience comments analyzed"), never an opaque spinner. Perceived
   intelligence comes from visible reasoning.
3. **Calm, premium surfaces.** Deep canvas, one violet→cyan accent, hairline
   borders, generous spacing. No gradient soup, no glassmorphism for its own
   sake. Color is reserved for meaning (status, score, demand).
4. **Content is the hero.** Typography and hierarchy carry the UI. Chrome
   recedes; the user's book and audience data dominate.
5. **Honest data.** Where a number is illustrative until the backend exposes it,
   it is visibly tagged `Sample`. Trust is the conversion lever — never fake it.

---

## 2. Information architecture

```
Ebookly
├─ Dashboard            ← command center (BUILT)
├─ Projects             ← list + create + live pipeline (exists; restyle next)
├─ Audience Intelligence← the differentiator (SPEC: 03)
├─ Book Studio          ← flagship editor (SPEC: 04)
├─ Templates            ← book/chapter starting points (SPEC: 05)
├─ Exports              ← professional export center (SPEC: 05)
└─ Settings             ← account, channel connections, billing
```

Navigation is deliberately short (6 primary + Settings). Unbuilt destinations
render in the sidebar with a `Soon` tag and are non-navigable, so the nav never
links to a 404.

### Canonical user flow

```
Connect channel → AI analysis (live) → Audience Intelligence →
Book Opportunities → Pick/confirm → Outline → 100+ page draft →
Book Studio (edit + AI copilot) → Export (PDF/EPUB/DOCX/KDP)
```

---

## 3. Build status

| Surface | Status | Where |
|---|---|---|
| Design system (tokens, primitives) | **Built** | `tailwind.config.ts`, `app/globals.css`, `components/ui/*` |
| App shell (sidebar, topbar, ⌘K command bar, mobile nav) | **Built** | `components/app/*` |
| Dashboard / command center | **Built** | `app/dashboard/page.tsx`, `components/dashboard/*` |
| Projects list + pipeline | Exists (legacy inline styles) | `app/projects/*` — restyle to system next |
| Audience Intelligence | Spec | `03-audience-intelligence.md` |
| Book Studio | Spec | `04-book-studio.md` |
| Exports · Templates · Mobile · Conversion | Spec | `05-exports-mobile-conversion.md` |

## 4. Backend reality (important)

Today the only frontend data contract is `GET /api/projects` →
`{ id, channelUrl, status, createdAt }`, plus a rich live status stream
(`/api/projects/:id/events`). The pipeline *computes* comment analysis, a
channel knowledge base, and a book strategy internally, but does **not** expose
audience metrics, insights, or opportunity scores over an API yet.

The redesign types these as a first-class `DashboardData` contract
(`components/dashboard/data.ts`) and renders them with `Sample` tags. **The
defined backend next step** is to surface aggregates from `CommentInsights`,
`ChannelKnowledgeBase`, and `BookStrategy` on the project read model and drop the
sample constants. See each page spec's "Data contract" section.
