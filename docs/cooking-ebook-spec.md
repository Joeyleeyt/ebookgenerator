# Cooking Ebook — Technical Spec

**Status:** Proposed · **Date:** 2026-07-08 · **Feature owner:** Joey

A new **"Cooking Ebook"** book type. The user adds a YouTube cooking channel and a book title, picks *Cooking* instead of *Normal*, and the system analyzes the channel's **top 10 videos** and generates a cookbook of **AI-suggested recipes** (default: 60), each with a real food photo, laid out in a recipe-card template matching the reference design.

---

## 1. Why this needs a dedicated mode

The existing generator turns a channel's transcripts into **flowing prose chapters** (2000-word narratives, and it explicitly *bans* lists). A cookbook is the opposite kind of document:

| | Normal ebook | Cooking ebook |
|---|---|---|
| **Content unit** | Prose chapter, ~2000 words | Recipe card: structured ingredients + numbered steps |
| **Formatting** | Lists **banned** ([`ChapterPrompt.ts:42-45`](../packages/core/src/application/prompts/ChapterPrompt.ts)) | Lists **required** |
| **Images** | 1 illustration / ~5 pages | 1 photorealistic food photo **per recipe** |
| **Layout** | Drop-caps, justified prose, dot-leader TOC | Photo header, 2-col ingredients/instructions, tips footer |
| **AI output** | Free text | Structured JSON (parsed into recipe fields) |

Everything **before** content generation is shared and unchanged: channel ingest → video metadata → transcripts → per-video summaries → comment analysis → knowledge base. The cookbook only **branches after the knowledge base is built**.

## 2. Scope confirmed with Joey (from chat)

- Analyze **top 10 videos** of the channel. ✅
- AI **suggests** recipes based on those videos (not transcribed 1:1). ✅
- Recipe count: **60 by default** (Joey: "50 or 60 is fine" if 100 is too much). Kept as a single config value — trivially changeable to 50/100. ✅
- Every recipe needs a **real photo of the dish**. ✅
- Backend **select option**: Normal ebook / Cooking ebook. ✅

### ⚠️ Two things to make explicit before build

1. **Cost & time per book.** 100 recipes ≈ **100 Claude generations + 100 image-generation jobs**. The image jobs (69labs, polled through residential proxies with an OpenAI fallback) are the slow, expensive part — a cookbook will take materially longer and cost more than a normal ebook. *Confirm the per-book budget/time is acceptable.*
2. **10 videos → 100 recipes = extrapolation.** You cannot extract 100 real recipes from 10 videos. The AI will **invent recipes in the style/cuisine of the channel**, seeded by what the top-10 videos are about. This matches Joey's "AI should suggest recipes," but the recipes are AI-authored, not lifted from the videos.

## 3. Top-10 video selection

Current default is 30 videos ([`GenerationOptions.ts:24`](../packages/core/src/domain/project/GenerationOptions.ts)). For cooking mode, cap ingestion at the channel's **top 10 by view count**. The `YouTubeDataApiProvider` already enumerates the uploads playlist with view stats, so "top 10" = sort by views, take 10. Implemented by setting `maxVideos: 10` when `bookType === 'cooking'` (and sorting by views in the video-data stage).

---

## 4. Data model

### `Recipe` (new domain value object)

```ts
interface Recipe {
  title: string;              // "Zesty Lemon Garlic Shrimp Pasta"
  description: string;        // one-line intro
  servings: number;           // 4
  prepTimeMinutes: number;    // 15
  cookTimeMinutes: number;    // 20
  ingredients: string[];      // ["8 oz linguine pasta", "2 tbsp olive oil", ...]
  instructions: {             // numbered, each with a bold label
    label: string;            // "Cook the pasta"
    text: string;             // "Bring a large pot of salted water to a boil..."
  }[];
  tips: string[];             // ["For an extra punch of flavor, add white wine.", ...]
  photoDataUri?: string;      // the AI-generated food photo (filled at assemble stage)
}
```

### Reusing the pipeline's fan-out

The pipeline fans out **per chapter** (research → generate → polish, with a barrier counter). We map **one recipe = one "chapter"** so the existing fan-out, barrier, and progress tracking work unchanged. The structured `Recipe` fields are carried on the chapter/section payload (or a parallel `recipes` array on the project). No new pipeline stages, no orchestrator changes.

### Persistence

**No migration needed.** `bookType` rides in the existing schema-less `options` JSONB column ([`0001_init.sql:22`](../supabase/migrations/0001_init.sql)). Recipe content is stored the same way chapter content is today.

---

## 5. The 7 touch points

### Touch point 1 — UI select (Normal / Cooking)
[`apps/web/app/projects/page.tsx`](../apps/web/app/projects/page.tsx)

Add a small `<select>` in the create form (near the title/URL inputs, ~line 128–151) and include it in the POST body (`options.bookType`, ~line 81–87). Follows the same pattern as the existing (hidden) option controls.

```tsx
<select value={bookType} onChange={(e) => setBookType(e.target.value)}>
  <option value="normal">Normal ebook</option>
  <option value="cooking">Cooking ebook</option>
</select>
```

### Touch point 2 — DTO
[`packages/core/src/application/dto/SubmitChannel.dto.ts`](../packages/core/src/application/dto/SubmitChannel.dto.ts)

```ts
bookType: z.enum(['normal', 'cooking']).default('normal'),
```

### Touch point 3 — Domain option
[`packages/core/src/domain/project/GenerationOptions.ts`](../packages/core/src/domain/project/GenerationOptions.ts)

Add `bookType: BookType` to props, default `'normal'` in `create()`, and a getter — mirroring exactly how `tone` is done. When `bookType === 'cooking'`, `create()` also forces `maxVideos: 10`.

```ts
export type BookType = 'normal' | 'cooking';
```

### Touch point 4 — Persistence pass-through
[`SupabaseProjectRepository.ts`](../packages/infrastructure/src/persistence/supabase/SupabaseProjectRepository.ts) (~line 19–25 interface, ~line 51–59 save)

Add `bookType` to the options interface and the saved JSONB object. No SQL migration.

> **Touch points 1–4 = "Slice A".** After these, a `bookType` option flows end-to-end and persists with **no behavior change**. Small, safe, independently verifiable.

### Touch point 5 — Recipe suggestion (replaces outline)
New `RecipeOutlinePrompt`; branch in `GenerateOutlineUseCase`.

For `bookType === 'cooking'`, instead of a chapter outline, ask the model for **N recipe ideas** grounded in the channel's cuisine/style (derived from the top-10 knowledge base):

```
System: You are a cookbook author. From this cooking channel's knowledge base,
suggest {N} distinct recipes that fit the channel's cuisine, skill level, and
signature style. Cover a range (mains, sides, appetizers, desserts) unless the
channel is specialized. Return ONLY JSON:
{ "recipes": [{ "title": string, "description": string, "cuisine": string }] }
Titles must be appetizing and specific (e.g. "Zesty Lemon Garlic Shrimp Pasta").
```

Generating 100 ideas: request in **batches** (e.g. 4×25) with a dedup pass so titles don't collide. Each recipe becomes a "chapter" entry, fanning out to generation.

### Touch point 6 — Recipe generation (replaces chapter writing)
New `RecipePrompt`; branch in `GenerateChapterUseCase`.

Outputs **structured JSON** (not prose), parsed into the `Recipe` model:

```
System: You are a professional recipe developer. Write ONE complete, tested-sounding
recipe. Return ONLY JSON:
{
  "title": string, "description": string,
  "servings": number, "prepTimeMinutes": number, "cookTimeMinutes": number,
  "ingredients": string[],           // each with quantity + unit, e.g. "2 tbsp olive oil"
  "instructions": [{ "label": string, "text": string }],  // 4–8 numbered steps
  "tips": string[]                   // 2–4 "Tips and Variations"
}
Ingredients must be realistic and measured. Steps must be clear and ordered.
Match the style/cuisine of {channel}. Recipe: "{title}" — {description}.
```

The **polish stage is skipped** for recipes (prose-polish rules don't apply); the JSON is validated on parse, with a single retry on malformed JSON.

### Touch point 7 — Food photos + recipe-card template

**7a. Food photo per recipe** — new `RecipePhotoPrompt`, uses the existing `FallbackImageGenerator` (69labs → OpenAI). One photo per recipe (not "every N pages").

```
Professional food photography of "{title}": {description}. Appetizing, natural
soft lighting, shallow depth of field, styled on a clean plate, restaurant-quality
plating, top-down or 3/4 angle. Photorealistic, high detail. NO text, NO labels,
NO watermarks.
```

*(Kept under the 69labs ~1200-char prompt cap, same as `IllustrationPrompt`.)*

**7b. Recipe-card template** — new `renderCookbookHtml()` alongside [`html.ts`](../packages/infrastructure/src/export/html.ts); the exporter branches on `bookType`. Matches the reference closely:

- **Full-width dish photo** header (bleeds to the top of the recipe page)
- **Serif recipe title** below the photo
- **Meta row:** `SERVINGS: 4 · PREPPING TIME: 15 MIN · COOKING TIME: 20 MIN` with a hairline rule
- **Two-column body:** left = tinted "Ingredients" sidebar (the reference's soft-pink panel, single-column ingredient list); right = "Instructions" with **bold step labels** + text
- **"Tips and Variations"** italic footer
- Each recipe = one page (`page-break-before: always`), reusing the A4/Paged.js print setup already in `html.ts`

The recipe-card CSS is self-contained; the existing cover/TOC machinery is reused for the cookbook's front cover and contents.

---

## 6. Files touched (summary)

| # | Concern | File | New/Edit |
|---|---|---|---|
| 1 | UI select | `apps/web/app/projects/page.tsx` | Edit |
| 2 | DTO | `packages/core/.../dto/SubmitChannel.dto.ts` | Edit |
| 3 | Domain option | `packages/core/.../project/GenerationOptions.ts` | Edit |
| 4 | Persistence | `.../supabase/SupabaseProjectRepository.ts` | Edit |
| 5 | Recipe ideas | `packages/core/.../prompts/RecipeOutlinePrompt.ts` + `GenerateOutlineUseCase` | New + Edit |
| 6 | Recipe body | `packages/core/.../prompts/RecipePrompt.ts` + `GenerateChapterUseCase` | New + Edit |
| 6 | Recipe model | `packages/core/.../domain/.../Recipe.ts` | New |
| 7a | Food photo | `packages/core/.../prompts/RecipePhotoPrompt.ts` + illustration use case | New + Edit |
| 7b | Template | `packages/infrastructure/src/export/cookbookHtml.ts` + exporter branch | New + Edit |

No database migration. No orchestrator/pipeline-stage changes. No new external services (reuses Claude + 69labs/OpenAI).

## 7. Build slices

- **Slice A — plumbing (1–4):** `bookType` end-to-end + persisted, no behavior change. Mergeable on its own.
- **Slice B — the feature (5–7):** recipe suggestion → structured recipe generation → food photos → recipe-card template.

## 8. Open questions — resolved

1. ~~Per-book cost/time acceptable?~~ ✅ Confirmed OK (Joey, 7/8).
2. ~~Recipe count?~~ ✅ **60 default**, as a single config value (changeable to 50/100).
3. ~~AI-created vs. copied recipes?~~ ✅ AI creates its own, channel-style ("Yes exactly").
4. **Cuisine/dietary constraints** — default: fully channel-driven (no filter). Revisit only if requested.
5. **Recipe TOC / sectioning** — default: flat recipe list with a contents page. Revisit only if requested.
