# Landing Page Generation v2 — Template Cloning Architecture

**Date:** 2026-08-05
**Status:** Implemented (Phases 1–4 in code, unverified against a live template — see §16).
Supersedes the generative approach described in [`landing-page-audit.md`](landing-page-audit.md).
**Principle:** the template website is the source of truth. The system copies it and swaps content. It does not ask a model to design anything.

---

## 0. What changes, in one line

| | v1 (today) | v2 (this design) |
|---|---|---|
| Where the HTML comes from | Claude Opus writes it from screenshots + a pruned DOM | The template's own rendered DOM, cleaned |
| Where the CSS comes from | Claude Opus writes it under a house-style spec | The template's own stylesheets, verbatim |
| What Claude produces | `{css, bodyHtml, slots}` — a whole page | `[{nodeId, placeholder, kind}]` — a mapping, plus prose |
| Can Claude break the layout | Yes — it authors the layout | **No — it never emits markup or CSS** |
| Fidelity ceiling | "a similar page" | pixel-identical minus swapped content |
| Deploy | 1 file, images as data URIs | `index.html` + `assets/*` (already supported) |

The v1 pipeline is not being tuned. Stage A (layout derivation) is being **deleted**.

---

## 1. Architecture

### 1.1 The new pipeline

```
                          ┌─────────── ONCE PER TEMPLATE ───────────┐

  Template URL
       │
       ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ STAGE 1 · CAPTURE            (deterministic · no AI)          │
 │   Puppeteer → real browser, JS executed, lazy content forced  │
 │   ├─ rendered DOM       document.documentElement.outerHTML    │
 │   ├─ CSS bundle         every sheet in document.styleSheets   │
 │   ├─ computed baseline  per-section geometry + type scale     │
 │   ├─ asset inventory    images, fonts, url() refs             │
 │   └─ visual baseline    full-page shots @ 390 / 768 / 1280    │
 └──────────────────────────────────────────────────────────────┘
       │
       ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ STAGE 2 · CLEAN              (deterministic · no AI)          │
 │   strip scripts, forms, iframes, trackers, consent widgets    │
 │   strip source SEO/JSON-LD/analytics identity                 │
 │   re-host assets → content-hashed objects in storage          │
 │   rewrite url() / src / srcset to local paths                 │
 │   stamp data-tpl="n<N>" on every element                      │
 └──────────────────────────────────────────────────────────────┘
       │
       ├────────────────────────────┐
       ▼                            ▼
 ┌──────────────────┐   ┌──────────────────────────────────────┐
 │ STAGE 3a         │   │ STAGE 3b · ANNOTATE  (Claude)        │
 │ REPEATER DETECT  │   │  IN : node inventory (JSON outline)  │
 │ (deterministic)  │   │  OUT: [{nodeId, placeholder, kind}]  │
 │ structural       │   │  ⚠ NEVER emits HTML or CSS           │
 │ signature match  │   └──────────────────────────────────────┘
 └──────────────────┘                │
       │                             ▼
       │             ┌──────────────────────────────────────┐
       │             │ DETERMINISTIC GUARDS                 │
       │             │  checkout anchors by href/domain     │
       │             │  brand-token scan (source name)      │
       │             │  hero image by geometry              │
       │             └──────────────────────────────────────┘
       └────────────────────────────┬─────────────────────────┘
                                    ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ STAGE 4 · PARAMETERISE       (deterministic · no AI)          │
 │   resolve nodeId → node, substitute {{TOKEN}}                 │
 │   convert repeater containers to <template data-repeat>       │
 │   extract theme tokens (accent identified via the CTA node)   │
 │   → EDITABLE TEMPLATE + placeholder manifest                  │
 └──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        landing_templates  (stored, versioned, owner-scoped)

                          └──────────────────────────────────────────┘

                          ┌────────── ONCE PER EBOOK ──────────┐
       ebook content ─┐
   YouTube channel ───┤
 video descriptions ──┼──▶ ┌────────────────────────────────────┐
  comment analysis ───┤    │ STAGE 5 · COPY   (Claude)          │
  audience pains ─────┘    │  IN : slot manifest + the ORIGINAL │
                           │       text of each slot as brief   │
                           │  OUT: {slotKey: string}            │
                           │  ⚠ prose only, length-bounded      │
                           └────────────────────────────────────┘
                                    │
       cover art ──┐                ▼
  checkout links ──┼──▶ ┌────────────────────────────────────────┐
  price / author ──┘    │ STAGE 6 · BIND   (deterministic)       │
                        │  escape + substitute placeholders      │
                        │  expand repeaters to content count     │
                        │  controlled theme override (accent)    │
                        │  rewrite every CTA href → checkout URL │
                        └────────────────────────────────────────┘
                                    │
                                    ▼
                        ┌────────────────────────────────────────┐
                        │ STAGE 7 · VERIFY  (deterministic)      │
                        │  structural diff vs. captured baseline │
                        │  visual diff @ 390 / 768 / 1280        │
                        │  link + overflow + a11y assertions     │
                        │  → fidelity report (blocks publish)    │
                        └────────────────────────────────────────┘
                                    │
                                    ▼
                     index.html + assets/*  →  Netlify
                          └────────────────────────────────────┘
```

### 1.2 The one rule that makes this work

**Claude is given an inventory and returns a mapping. It never sees markup and never writes markup.**

```
Stage 3b input  (an outline, not HTML)
  { "n17": { tag:"h1", path:"section.hero > div > h1", text:"The Ultimate Car Repair Guide", chars:29 },
    "n34": { tag:"img", path:"section.hero > figure > img", alt:"Book cover", w:420, h:600 },
    "n41": { tag:"a",   path:"section.hero > div > a", text:"Buy Now", href:"/buy" } }

Stage 3b output (a mapping, not HTML)
  [ { nodeId:"n17", placeholder:"HERO_TITLE",   kind:"text" },
    { nodeId:"n34", placeholder:"BOOK_COVER",   kind:"src"  },
    { nodeId:"n41", placeholder:"CHECKOUT_URL", kind:"href" },
    { nodeId:"n41", placeholder:"CTA_TEXT",     kind:"text" } ]
```

A hallucinated `nodeId` resolves to nothing and is dropped with a warning. A malformed
response fails schema validation. **Neither can corrupt the template**, because the
transformation itself is a deterministic tree walk. This is the structural guarantee that
`LandingLayoutPrompt`'s 470 lines of instructions were trying — and failing — to enforce
socially.

---

## 2. Updated workflow

### 2.1 Template lifecycle (new, explicit, user-visible)

Extraction is no longer a hidden side-effect of generating a page. It becomes its own
step with its own UI, because it can fail for reasons only the user can fix (the site
blocks bots, the URL is an SPA route, they don't own the template).

```
User adds a template URL
      │
      ▼  POST /api/landing-templates          { sourceUrl, attestOwnership: true }
  queue 'landing-template' job
      │
      ▼  ExtractTemplateUseCase
  Stage 1 → 4
      │
      ├─ FAIL  → template row state=FAILED + specific reason shown in the UI
      │          ("themechanicbible.com served a challenge page — Cloudflare bot
      │            protection. Paste the page HTML instead, or allow-list our IP.")
      │
      └─ OK    → template state=READY
                 UI shows: the captured screenshot, the section list, every detected
                 placeholder with its original text, and the fidelity self-check
                 (clean template re-rendered vs. captured baseline)
      │
      ▼
User reviews and can correct the map:
   · re-label a placeholder        (HERO_SUBTITLE → BENEFIT_1_BODY)
   · mark a node "keep as-is"      (a legal line that must not be rewritten)
   · mark a node "remove"          (a section that doesn't apply)
   · adjust a repeater's item count
   → stored as `placeholder_overrides`; re-applied on every re-extraction
```

This review step is what makes the system trustworthy without a human reading HTML.

### 2.2 Page generation (per ebook)

```
POST /api/projects/:id/landing-page
      │
      ▼  GenerateLandingPageUseCase (rewritten)
  1. resolve template     project.landingTemplateId → landing_templates (READY)
                          ↳ none? → built-in renderer (unchanged fallback)
  2. load book summary, strategy, channel, cover, siblings   [unchanged]
  3. cover palette        k-means → {dominant, accent, isDark}
  4. STAGE 5  copy        one Sonnet call, slot manifest + original-text briefs
  5. STAGE 6  bind        deterministic
  6. STAGE 7  verify      deterministic; report attached to the row
  7. save draft           html → storage, pointer + manifest → landing_pages
      │
      ▼  PublishLandingPageUseCase   [mostly unchanged]
  gate: checkout links present  AND  fidelity report has no BLOCKER
  deploy index.html + assets/* via the existing digest flow
```

**No AI call touches layout at any point in this flow.** The only per-page model call is
Stage 5, which returns a flat `Record<string, string>` of prose.

### 2.3 What each stage costs

| Stage | Frequency | Model | Rough cost |
|---|---|---|---|
| 1–2 Capture + clean | once per template | — | ~15 s wall clock, no tokens |
| 3b Annotate | once per template | Sonnet 5 | ~30 k in / ~4 k out |
| 4 Parameterise | once per template | — | ms |
| 5 Copy | per ebook | Sonnet 5 | ~6 k in / ~8 k out |
| 6 Bind | per ebook | — | ms |
| 7 Verify | per ebook | — | ~10 s (3 screenshots + diff) |

Compare with v1: a 30 k-token **Opus** layout call plus a Sonnet review call per template,
and a full fetch + Chromium launch on *every* generation even when the layout was cached
(`GenerateLandingPageUseCase.ts:493-503`, audit §9.5).

---

## 3. Required services and classes

### 3.1 New ports — `packages/core/src/application/ports/services/`

```ts
// TemplateCapturer.ts — replaces ReferencePageFetcher + ReferenceScreenshotter
export interface CapturedTemplate {
  sourceUrl: string;
  finalUrl: string;                    // after redirects
  renderedHtml: string;                // outerHTML after JS + settle
  stylesheets: Array<{ href: string | null; css: string }>;  // document order
  assets: Array<{ url: string; kind: 'image' | 'font' | 'other'; bytes: Uint8Array; contentType: string }>;
  baseline: {
    shots: Array<{ width: 390 | 768 | 1280; dataBase64: string }>;
    sections: Array<{ tplId: string; tag: string; rect: Rect; paddingBlock: [number, number]; background: string }>;
    typeScale: Record<'h1'|'h2'|'h3'|'p'|'button'|'small', ComputedType>;
    rootTokens: Record<string, string>;   // resolved :root custom properties
    measurePx: number | null;
    isDark: boolean;
  };
  notes: string[];                     // "3 stylesheets were cross-origin and opaque"
}
export interface TemplateCapturer {
  capture(url: string): Promise<Result<CapturedTemplate>>;
  /** Renders our own HTML+assets for the verify stage. No navigation, no network. */
  render(files: SiteFile[], widths: number[]): Promise<Result<CapturedTemplate['baseline']['shots']>>;
}

// PageDiffer.ts
export interface DiffReport {
  visual: Array<{ width: number; mismatchRatio: number; regions: Rect[] }>;
  structure: { sectionsExpected: number; sectionsFound: number; orderMatches: boolean; missing: string[] };
  verdict: 'PASS' | 'WARN' | 'BLOCK';
}
export interface PageDiffer {
  compare(a: Shot[], b: Shot[]): Result<DiffReport['visual']>;
}
```

### 3.2 New domain — `packages/core/src/domain/landing/`

| Class / module | Responsibility |
|---|---|
| `PlaceholderVocabulary.ts` | The token set, their `kind` (`text`/`html`/`src`/`href`/`repeat`), which are required, which are system-rendered. See §5. |
| `TemplateManifest.ts` | Value object: placeholder map + repeater map + asset manifest + theme tokens. Immutable, hashed for the cache key. |
| `ThemeAdaptation.ts` | The controlled colour swap (§7). Pure function: `(templateTokens, coverPalette) → overrides`. |
| `LandingTemplate.ts` | *(exists, 32 lines)* Extend from "which URL per mode" into the template aggregate root with `state`, `revision`, `capturedAt`. |
| `Palette.ts` | *(exists)* Keep `ensureContrast` — it's the contrast gate for §7. Retire `fromSeed` on the clone path. |

### 3.3 New application layer — `packages/core/src/application/`

| Module | Replaces | Responsibility |
|---|---|---|
| `use-cases/ExtractTemplateUseCase.ts` | `ensureLayout` + `deriveLayout` | Orchestrates stages 1–4. |
| `use-cases/GenerateLandingPageUseCase.ts` | *(rewritten, ~1220 → ~400 lines)* | Stages 5–7 + product assembly. Keeps `loadSiblingProduct`, `buildBundle`, `loadCover`, `buildStats` verbatim — those are correct. |
| `landing/templateContract.ts` | `landing/pageContract.ts` | Validates a **parameterised template** (required placeholders present, checkout count preserved, no residual source brand, no scripts) rather than model-authored markup. |
| `landing/bindTemplate.ts` | `fillCopySlots` + `fillPlaceholders` | Context-aware substitution. **Escapes** — HTML-body vs. attribute context (closes audit H5). |
| `prompts/TemplateAnnotationPrompt.ts` | `LandingLayoutPrompt.ts` *(470 lines → ~90)* | Node inventory in, mapping out. |
| `prompts/TemplateCopyPrompt.ts` | `LandingPagePrompt.ts` | Slot manifest + original-text brief + audience psychology (closes audit M4, M5). |

### 3.4 New infrastructure — `packages/infrastructure/src/landing/`

| Class | Responsibility | Deterministic? |
|---|---|---|
| `PuppeteerTemplateCapturer.ts` | Stage 1. Reuses `assertPublicUrl` from `HttpReferencePageFetcher.ts:120`. | ✅ |
| `TemplateCleaner.ts` | Stage 2 removals (§4.2). cheerio. | ✅ |
| `CssBundler.ts` | Concatenate sheets, rewrite `url()`, conservative unused-rule prune. postcss. | ✅ |
| `AssetRehoster.ts` | Content-hash, store, rewrite refs. Reuses `ObjectStorage` + `ImageProcessor`. | ✅ |
| `RepeaterDetector.ts` | Stage 3a structural signature matching (§6). | ✅ |
| `PlaceholderApplier.ts` | Stage 4 tree walk. | ✅ |
| `ThemeAdapter.ts` | Stage 6 accent override emission. | ✅ |
| `TemplateBinder.ts` | Stage 6. Replaces `GeneratedPageAssembler.ts` on the clone path. | ✅ |
| `PixelmatchPageDiffer.ts` | Stage 7. pixelmatch + pngjs. | ✅ |
| `persistence/supabase/SupabaseLandingTemplateRepository.ts` | Rows + storage pointers. | ✅ |

Every one is deterministic. The only non-deterministic components in v2 are the two prompt
builders, and both are confined to producing JSON that a deterministic layer consumes.

### 3.5 Deleted

| Item | Lines | Why |
|---|---|---|
| `prompts/LandingLayoutPrompt.ts` | 470 | The house-style spec that overrode every template (audit §3.2). |
| `prompts/LayoutReviewPrompt.ts` | 70 | No generated layout to review; Stage 7 diffs against the real thing. |
| `GenerateLandingPageUseCase.deriveLayout` / `reviewRendered` / `ensureLayout` / `fillerFor` / `previewModel` | ~250 | Stage A. |
| `landing/GeneratedPageAssembler.ts` — placeholder markup | ~570 | Component markup + CSS is now the template's own. |
| `landing_layouts` table + `SupabaseLandingLayoutRepository` | — | Superseded by `landing_templates`. |
| `pageContract.ts` — colour/CSS-variable/raw-colour rules | ~120 | The template's CSS is the template's business. Keep the *safety* rules. |
| `outlineOf`, duplicate `romanYear`/`compactCount`, dead `accentSeed` path | ~80 | Audit §9.1 dead code, now unambiguously dead. |

**Kept:** `LandingPageHtmlRenderer.ts` (813 lines). It is the fallback when a project has
**no** template at all — and `single` mode defaults to `null`
(`LandingTemplate.ts:14-19`), so that is not a rare path. It is no longer a *silent*
fallback: `engine: 'builtin'` surfaces in the API response and the UI.

---

## 4. Template extraction, in detail

### 4.1 Capture (Stage 1)

Puppeteer, already a dependency (`packages/infrastructure/package.json`, `puppeteer ^23.4.0`,
and in the root `onlyBuiltDependencies` so the Docker image carries Chromium).

```
launch → newPage → setViewport(1280×900)
  assertPublicUrl(url)                       ← reuse HttpReferencePageFetcher.ts:120
  goto(url, waitUntil:'networkidle2')
  autoScroll to bottom, 250 ms dwell         ← forces lazy-loaded content and IO reveals
  scrollTo(0), settle
  waitForFunction(document.fonts.ready)
  ── extract ───────────────────────────────────────────────────────────────
  renderedHtml   = document.documentElement.outerHTML
  stylesheets    = [...document.styleSheets].map(sheet => {
                     try { return [...sheet.cssRules].map(r => r.cssText).join('\n') }
                     catch { return null }        // cross-origin → opaque
                   })
  rootTokens     = resolved :root custom properties via getComputedStyle
  baseline       = per-section rects/padding/background + type scale
  ── then ──────────────────────────────────────────────────────────────────
  opaque sheets  → fetch by href through the SSRF-guarded fetcher
  assets         → collect img[src], img[srcset], CSS url(), @font-face src
  screenshots    → fullPage at 1280, then re-setViewport(768) and (390), re-settle
```

Reading `document.styleSheets` rather than fetching `<link>` tags is what makes this work
on modern builds. It captures:

- **CSS-in-JS** (styled-components, emotion) — injected `<style>` elements are in
  `document.styleSheets`.
- **All Tailwind/Next chunks**, not the first three (audit failure #12,
  `HttpReferencePageFetcher.ts:71` `.slice(0, 3)`).
- **Resolved values are available** via `getComputedStyle`, so the entire `var(--token)`
  resolution problem (audit C1, failure #1 — "measured, confirmed on the client's own
  template") **disappears**. We don't need to detect that `--font-display` is
  `DM Serif Display`; we keep the declaration verbatim and the browser resolves it, exactly
  as it does on the original site.

Failure modes are explicit, not silent:

| Condition | Behaviour |
|---|---|
| Bot challenge / 403 | FAIL with the served title, e.g. "Just a moment… (Cloudflare)". Offer manual HTML paste. |
| < 3 sections found | FAIL "this looks like an app shell, not a rendered page". |
| Any opaque stylesheet unfetchable | WARN, recorded in `notes`, surfaced in the UI. |
| Page > 8 MB of assets | WARN with the breakdown; user can exclude assets. |

### 4.2 Clean (Stage 2)

Removed unconditionally:

| Category | Rule |
|---|---|
| Executable | `<script>` (all), `on*` attributes, `javascript:` hrefs |
| Embeds | `<iframe>`, `<object>`, `<embed>`, `<canvas>` |
| Forms | `<form>` unwrapped (children preserved), `<input>`/`<select>`/`<textarea>` removed |
| Trackers | 1×1 images, `<noscript>` pixels, known analytics hosts, `<link rel=preconnect>` to third parties |
| Source identity | `<title>`, all `og:*`/`twitter:*`, `<link rel=canonical>`, `application/ld+json` — **all regenerated** for the new product |
| Overlays | fixed-position elements with `z-index > 1000` matching consent/chat class patterns (most die with the scripts anyway) |
| Source legal text | Refund policy, terms, privacy, company address — **removed and replaced** by our own `{{FOOTER_LEGAL}}` |

That last row matters commercially: republishing the template owner's 30-day refund policy
as the seller's own is a contractual claim the seller never made. The existing
`legalMarkup()` (`GeneratedPageAssembler.ts:559`) already writes a correct one — keep it
as a system-rendered block.

Asset policy, three classes:

| Class | Detection | Action |
|---|---|---|
| **Structural** — textures, gradients, icons, dividers | referenced from CSS `url()`, or `<img>` under 96 px | Re-host to `assets/<sha1>.<ext>` |
| **Product / brand** — the book cover, author portrait, brand logo | annotated in Stage 3b + geometry guard (largest image in the hero) | Becomes `{{BOOK_COVER}}` / `{{AUTHOR_IMAGE}}` / `{{BRAND_LOGO}}` |
| **Third-party photography** — stock photos, photos of people | any remaining `<img>` over 96 px with no placeholder assigned | **Not republished.** Node collapsed and flagged in the extraction report for the user to supply a replacement. |

Fonts keep the existing licence gate (`HttpWebFontFetcher`). A font that cannot be legally
re-hosted stays named in the `font-family` stack and falls back — and the fidelity report
records `fontFidelity: 'degraded'` rather than the current silent behaviour where fonts are
downloaded, base64'd, and then never referenced at all (audit failure #14).

### 4.3 Node addressing (Stage 2, final step)

```html
<section data-tpl="n8" class="hero">
  <div data-tpl="n9" class="hero__copy">
    <h1 data-tpl="n10">The Ultimate Car Repair Guide</h1>
```

Monotonic in document order over the **cleaned** tree, so the id space is stable for a
given `(source_url, pipeline_version, revision)`. Stripped from the final bound output.

---

## 5. Placeholder mapping system

### 5.1 Vocabulary

**Core** — required, validated, system-bound (never model-authored where money is involved):

| Token | Kind | Bound from | Required |
|---|---|---|---|
| `{{HERO_TITLE}}` | text | Stage 5 copy | ✅ |
| `{{HERO_SUBTITLE}}` | text | Stage 5 copy | ✅ |
| `{{BOOK_COVER}}` | src | cover art, re-hosted | ✅ |
| `{{CHECKOUT_URL}}` | href | `project.options.landingCheckoutUrl` | ✅ |
| `{{CTA_TEXT}}` | text | Stage 5 copy | ✅ |
| `{{PRICE}}` | text | `landingPriceCents` + currency | ✅ |
| `{{COMPARE_AT_PRICE}}` | text | `landingCompareAtCents` | — |
| `{{AUTHOR_NAME}}` | text | `strategy.author` | — |
| `{{AUTHOR_IMAGE}}` | src | uploaded portrait | — |
| `{{AUTHOR_BIO}}` | text | Stage 5 copy | — |
| `{{BRAND_LOGO}}` | src | channel avatar | — |
| `{{BRAND_NAME}}` | text | channel title / book title | ✅ |
| `{{GUARANTEE_DAYS}}` | text | `landingGuaranteeDays` | — |
| `{{FOOTER_LEGAL}}` | html | system-rendered | ✅ |
| `{{BENEFITS}}` | repeat | Stage 5 copy | — |
| `{{FAQ_ITEMS}}` | repeat | Stage 5 copy | — |
| `{{OFFER_ITEMS}}` | repeat | products (multi-book) | conditional |

**Extended** — everything else the template contains:

```
{{SECTION:<tplId>.<field>}}     e.g. {{SECTION:n47.heading}}, {{SECTION:n52.body}}
```

The core vocabulary alone cannot describe an arbitrary template. A page with a "Where the
money goes" section or a "Choose your level" comparison has nowhere to put content, which
is precisely the gap `LandingCopy.templateSections` was invented to fill — and which never
worked, because `referenceSections` was never passed (audit §9.1). Extended slots are
generated mechanically from the annotation map, so no schema change is needed to support a
new template shape.

### 5.2 Substitution rules — the escaping contract

This is the one place v1 has a live correctness hole (`fillCopySlots`,
`pageContract.ts:424`, audit H5: model copy injected raw into HTML). v2 makes escaping a
property of the **kind**, not of the call site:

| Kind | Context | Escaping |
|---|---|---|
| `text` | text node | `& < >` |
| `html` | innerHTML | system-rendered only; never model output |
| `src` | attribute value | `& < > " '` + must resolve to `assets/…` or a `data:` URI |
| `href` | attribute value | `& < > " '` + scheme allow-list `https:` only + `rel="noopener nofollow"` forced |
| `repeat` | subtree clone | each field escapes by its own kind |

An unfilled `text`/`src` slot collapses its node; an unfilled `href` renders the anchor
inert (the existing `aria-disabled` treatment at `GeneratedPageAssembler.ts:303` is the
right behaviour — keep it).

### 5.3 Annotation prompt shape

```
SYSTEM
  You label nodes on an existing web page. You do not write HTML, CSS, or page
  structure — the page already exists and will not be modified except by the
  labels you return.
  Return JSON: { "map": [ { "nodeId", "placeholder", "kind", "maxChars" } ] }
  · nodeId MUST be one of the ids given. Invented ids are discarded.
  · maxChars = the ORIGINAL text length ×1.15, rounded. The template's CSS was
    tuned to the original length; new copy must fit the same box.
  · Label only nodes whose content is ABOUT THE PRODUCT. Navigation, legal
    boilerplate and section labels stay as they are.

USER
  { "n8":  { "tag":"section", "class":"hero" },
    "n10": { "tag":"h1", "path":"section.hero>div>h1", "text":"The Ultimate Car Repair Guide", "chars":29 },
    … }
```

`maxChars` derived from the **original** text length is the key detail: it is a measured
constraint, not a guess, and it is why cloned pages don't overflow. v1 had the model invent
its own `maxChars` per slot with nothing to anchor them to.

---

## 6. Repeaters

Detected deterministically — no model involvement.

```
for each element with ≥ 2 element children:
    signature(child) = tag + sorted(classList) + descendant tag skeleton   // text ignored
    if a signature covers ≥ 2 children AND ≥ 70% of the container's children:
        → repeater
        keep the FIRST matching child as <template data-repeat="KEY">
        remove the remaining matches
        record { key, originalCount, containerTplId, layoutMode }
```

At bind time each content item clones the `<template>` and fills its own nested slots.
Because every clone carries the original class list, the CSS applies identically — a
3-card grid stays a 3-card grid.

**Count policy.** Default to `originalCount`. Deviating is allowed only when the container
is a grid using `repeat(auto-fit|auto-fill, …)` — read from the captured computed style, so
this is a measurement, not an assumption. Otherwise the copy call is told "write exactly N",
and N comes from the template. A hand-tuned 3-across flex row given 5 items is a broken
page; a `auto-fit` grid given 5 items is fine. The system knows which it is.

---

## 7. Controlled colour adaptation

The requirement is: keep the template recognisable, move only the branding.

```
1. Identify the accent SOURCE, exactly — not heuristically:
     the CTA node is already known (it carries {{CHECKOUT_URL}}).
     accentValue = getComputedStyle(ctaNode).backgroundColor      // captured in Stage 1
     accentToken = the :root custom property whose resolved value equals accentValue
                   (matched against baseline.rootTokens)

2. Derive the NEW accent under constraint:
     coverAccent  = k-means(k=5) over the cover → most saturated cluster ≥3% area
     newAccent    = oklch( L: templateAccent.L,      ← template keeps its lightness
                           C: templateAccent.C,      ← template keeps its chroma
                           H: coverAccent.H )        ← book supplies only the hue

3. Verify:
     contrast(newAccent, templateOnAccentColor) ≥ 4.5   → apply
     otherwise                                          → keep the template accent, log it

4. Apply as an OVERRIDE, appended after the bundle. Nothing is rewritten:
     :root { --brand-primary: <newAccent>; --brand-primary-hover: <newAccent +8% L>; }

   Token-less template (literal hex on the CTA)?
     rewrite ONLY declarations whose value equals accentValue exactly.
     Never a family, never a range, never a page-wide substitution.
```

Taking **hue only** is what makes this controlled. A navy-covered book on a warm-orange
template gets a navy CTA at the *template's* lightness and saturation — not a dark navy
page. Nothing else moves: backgrounds, section grounds, text colours, borders and the
template's own light/dark polarity are untouched, because they are never written to.

This retires three v1 defects at once: the single-histogram-bin palette (audit §5.1), the
dead `accentSeed` parameter (§5.2), and the light/dark polarity flip (§5.4) — the largest
single "this doesn't look like the template" lever, now impossible by construction.

---

## 8. Checkout integration

```
DETECT   (deterministic, runs after and overrides annotation)
  every <a> where ANY holds:
    · href host ∈ {gumroad, stripe, lemonsqueezy, shopify, payhip, paddle, thrivecart, …}
    · href matches the modal href across all anchors (the template's own buy link)
    · href is an in-page anchor to a section carrying an OFFER_ITEMS repeater
  → assign {{CHECKOUT_URL}}, and {{CTA_TEXT}} to its text node

ASSERT AT EXTRACTION
  count({{CHECKOUT_URL}}) == count(buy anchors in the original)     ← BLOCKER if unequal

ASSERT AT BIND
  every {{CHECKOUT_URL}} resolved to project.landingCheckoutUrl     ← BLOCKER
  no <a href> anywhere points at the source domain                  ← BLOCKER
  no residual {{ in the output                                      ← BLOCKER
  every buy anchor is https + rel="noopener nofollow"               ← BLOCKER
```

The "count preserved" assertion is the direct answer to the v1 symptom *"some CTA buttons
are missing"*: v1 had no minimum CTA count at all and its offer-grid exclusion rule
actively stripped CTAs (`pageContract.ts:226`, audit §7.2). Here the count is not a policy
choice — it is whatever the template does, and any deviation is a blocker.

Multi-book pages keep the v1 discipline that works: the `{{OFFER_ITEMS}}` repeater binds
each card from **one** `LandingProduct` record in a single pass, so a link can never land
under the wrong cover (the reasoning at `pageContract.ts:47-67` is sound and carries over
unchanged).

---

## 9. Validation

Runs on the **finished, bound page** — closing the largest v1 gap, where every check ran
pre-substitution (audit §7.2: *"Nothing validates the FINAL page"*).

### 9.1 Structure

| Assertion | Threshold |
|---|---|
| Section count == captured baseline | exact — BLOCK |
| Section order (by `data-tpl` sequence) | exact — BLOCK |
| Every required placeholder resolved | exact — BLOCK |
| No residual `{{` | exact — BLOCK |
| DOM node count within ±(repeater delta) of baseline | ±5% — WARN |

Node-for-node diffing is possible here *because it is the same DOM*. In v1 the generated
page had no structural relationship to the reference, so "sections missing or rearranged"
was undetectable in principle.

### 9.2 Visual

Render the bound page at 390 / 768 / 1280 and diff against the Stage-1 baseline shots with
pixelmatch, **masking the regions that are supposed to differ** (every placeholder node's
bounding rect, from the captured geometry).

| Metric | Threshold |
|---|---|
| Mismatch outside masked regions | > 2% — BLOCK |
| Mismatch inside masked regions | ignored (that's the content swap) |
| `scrollWidth > clientWidth` at any width | BLOCK — sideways scroll |
| Any masked region overflowing its captured rect by > 15% | WARN — copy too long |

That last one is the copy-fit check, and it feeds back: an overflowing slot triggers one
re-ask of Stage 5 for that slot at a tighter `maxChars`. Cheap, targeted, and it cannot
touch layout.

### 9.3 Accessibility (new — v1 had none)

Single `<h1>`; no heading-level skips; every `<img>` has `alt`; every link has an
accessible name; the accent passes contrast against its own on-accent colour. All WARN
except contrast, which is BLOCK.

### 9.4 Report

Stored on the row, returned by `GET /landing-page`, rendered as a badge in
`LandingPageCard.tsx`. Publishing is gated on zero BLOCKERs. This replaces the current
situation where `layout: 'builtin'` is logged in the worker
(`workers/processors/index.ts:389`) and never surfaced to the user at all.

---

## 10. Database schema

### 10.1 New — `0013_landing_templates.sql`

```sql
create type landing_template_state as enum ('EXTRACTING','READY','FAILED');

create table landing_templates (
  id                    uuid primary key default gen_random_uuid(),
  -- Owner-scoped. A v1 layout was neutral markup with the text removed; a v2
  -- template is a COMPLETE COPY of a website. Sharing one across accounts is
  -- both an IP question and a leak of what a competitor is selling.
  owner_id              uuid not null references auth.users(id) on delete cascade,
  source_url            text not null,
  state                 landing_template_state not null default 'EXTRACTING',

  -- Large blobs live in the 'landing-assets' bucket; the row holds pointers, so
  -- a template row stays a few KB. (v1 wrote megabyte HTML into a text column
  -- and hit Postgres 57014 + Cloudflare 502 — see INLINE_WIDTHS' docstring.)
  original_html_path    text,          -- forensic: what we captured, verbatim
  clean_html_path       text,          -- parameterised, with {{TOKEN}}s
  css_bundle_path       text,

  placeholder_map       jsonb not null default '[]'::jsonb,  -- [{tplId,placeholder,kind,maxChars,originalText}]
  repeater_map          jsonb not null default '[]'::jsonb,  -- [{key,containerTplId,originalCount,layoutMode}]
  theme_tokens          jsonb not null default '{}'::jsonb,  -- {accentToken,accentValue,onAccent,isDark,rootTokens}
  responsive_rules      jsonb not null default '{}'::jsonb,  -- breakpoints + per-width section geometry
  baseline_shots        jsonb not null default '[]'::jsonb,  -- storage paths, per width

  -- User corrections to the map. Re-applied on every re-extraction, so review
  -- work is never lost when the template is refreshed.
  placeholder_overrides jsonb not null default '[]'::jsonb,

  extraction_report     jsonb,         -- notes, warnings, unreplaced assets, font fidelity
  failure_reason        text,

  -- Bumped in code on any change to capture/clean/annotate/parameterise. This is
  -- what makes pipeline fixes ship without a manual rebuild flag (audit C4).
  pipeline_version      int  not null,
  revision              int  not null default 1,
  captured_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (owner_id, source_url, pipeline_version, revision)
);

create index landing_templates_owner on landing_templates (owner_id, state);

alter table landing_templates enable row level security;
create policy landing_templates_owner on landing_templates for all
  using (owner_id = auth.uid());
```

```sql
create table landing_template_assets (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references landing_templates(id) on delete cascade,
  -- sha1 of the bytes. Separate rows (not a jsonb array) so the deploy can list
  -- them, a GC job can find orphans, and identical assets dedupe across templates.
  content_hash   text not null,
  -- Path inside the deployed site, e.g. 'assets/a1b2c3.woff2'.
  site_path      text not null,
  storage_path   text not null,        -- path in the 'landing-assets' bucket
  content_type   text not null,
  byte_size      int  not null,
  kind           text not null,        -- 'image' | 'font' | 'other'
  source_url     text,
  -- Fonts we may not redistribute are recorded but NOT re-hosted; the stack
  -- falls back and the fidelity report says so.
  rehosted       boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (template_id, site_path)
);
```

### 10.2 Altered — `landing_pages`

```sql
alter table landing_pages
  add column template_id  uuid references landing_templates(id) on delete set null,
  -- 'clone' | 'builtin'. Today this is decided silently by whether a layout
  -- derivation happened and is invisible to the user.
  add column engine       text not null default 'builtin',
  -- The bound slot values. Lets a page be re-bound without re-asking Claude,
  -- and lets the user hand-edit one headline without regenerating anything.
  add column binding      jsonb,
  -- Deploy manifest: which asset rows this page ships.
  add column assets       jsonb not null default '[]'::jsonb,
  -- The §9 report. Publishing is gated on this having no BLOCKERs.
  add column fidelity     jsonb,
  -- Pointer, replacing the inline text column once v2 is the default.
  add column html_path    text;
```

`landing_pages.html` stays through the migration and is dropped in Phase 5.

### 10.3 New bucket — `0014_landing_assets_bucket.sql`

```sql
insert into storage.buckets (id, name, public)
values ('landing-assets', 'landing-assets', false)
on conflict (id) do nothing;
```

Private, like `exports`; the worker reads it with the service-role key at deploy time and
uploads the bytes to Netlify. Nothing is served from Supabase to the public.

### 10.4 Dropped — Phase 5

```sql
drop table landing_layouts;   -- 0012
```

---

## 11. Migration plan

Both engines coexist. Nothing regenerates on its own — an existing published page keeps its
stored HTML until the user asks.

### Phase 0 — Instrument (½ day)

Surface `engine`, `templateId`, `fidelity`, `referenceNote` in `GET /landing-page` and in
`LandingPageCard.tsx`. Add a `landing-page-fidelity` structured log. **Nothing below is
verifiable without this**, and it is equally useful for the current pipeline.

### Phase 1 — Capture + clean, no AI (4–5 days)

`PuppeteerTemplateCapturer`, `TemplateCleaner`, `CssBundler`, `AssetRehoster`, the
`landing_templates`/`landing_template_assets` migrations, `ExtractTemplateUseCase`.

**Exit gate:** extract `themechanicbible.com`, deploy the *cleaned but unparameterised*
clone to a scratch Netlify site, and diff it against the capture baseline at three widths.
**Target: < 2% mismatch.** If the clone isn't pixel-faithful before any content swapping,
nothing downstream matters. This is a pure engineering milestone with no AI and no
judgement calls — it either matches or it doesn't.

### Phase 2 — Parameterise (4–5 days)

`RepeaterDetector`, `TemplateAnnotationPrompt`, `PlaceholderApplier`, `templateContract`,
the template-review UI.

**Exit gate:** the parameterised template, rendered with filler sized to each slot's
measured `maxChars`, still diffs < 2% against the baseline.

### Phase 3 — Bind + verify (3–4 days)

`TemplateCopyPrompt` (now fed the original text as the brief, plus the audience-psychology
output from the comment-analysis phase — audit M4/M5), `TemplateBinder`, `ThemeAdapter`,
`PixelmatchPageDiffer`, multi-file deploy in `PublishLandingPageUseCase`.

**Exit gate:** generate a real book's page on the clone engine, side by side with the same
book's v1 page. The comparison harness reports section delta, CTA delta, accent delta and
masked-region mismatch for both.

### Phase 4 — Default for new projects (1 day)

`engine: 'clone'` when the project has a READY template; `'builtin'` otherwise. Existing
projects unchanged. Old pages regenerate on the clone engine **only** when the user presses
Regenerate, and the UI says which engine will run.

### Phase 5 — Remove Stage A (1 day)

Once the clone engine has run ≥50 pages with a BLOCKER rate under 5%: delete
`LandingLayoutPrompt`, `LayoutReviewPrompt`, `deriveLayout`, `ensureLayout`,
`reviewRendered`, `GeneratedPageAssembler`, `SupabaseLandingLayoutRepository`; drop
`landing_layouts`; drop `landing_pages.html`. Keep `LandingPageHtmlRenderer` — it is the
no-template fallback and `single` mode still defaults to no template.

**Total: ~14–17 working days.** For comparison, the audit's plan for fixing the *generative*
pipeline (`landing-page-audit.md` §11, Steps 0–8) was 11–16 days and its stated ceiling was
still "a model reproducing a measured page" rather than the page itself.

### 11.1 Reconciliation with `landing-page-audit.md`

The audit was a correct diagnosis of the v1 pipeline. Under v2 most of its
recommendations either become unnecessary or change meaning:

| Audit item | Status under v2 |
|---|---|
| **C1** resolve CSS `var()` before detecting | **Obsolete.** CSS is kept verbatim; `getComputedStyle` resolves tokens in the browser. This was the #1 measured defect and it stops existing. |
| **C2** extract measured computed style for the prompt | **Repurposed.** Still measured — as the *validation baseline* (§9), not as prompt input. |
| **C3** delete the invented spacing/type numbers | **Superseded.** The entire prompt containing them is deleted. |
| **C4** version the layout cache on the pipeline | **Survives, mandatory.** `landing_templates.pipeline_version`. |
| **C5** scope the cache per owner | **Survives, upgraded to mandatory.** A full site copy must never be shared across accounts. |
| **H1** full-page contiguous screenshots | **Survives, repurposed.** Baseline for the visual diff, not model input. Coverage 40% → 100%. |
| **H2** raise the 36 k DOM budget | **Obsolete.** No DOM is sent to a model at any point. |
| **H3** adaptive thinking + effort on the layout call | **Narrowed.** No layout call exists. Widening `ClaudeModel` to Opus 5 / Sonnet 5 is still worth doing. |
| **H4** validate the finished page | **Survives, expanded** into §9. |
| **H5** escape copy slot values | **Survives, mandatory.** Same hole; §5.2 fixes it structurally by making escaping a property of the slot kind. |
| **H6** don't fetch/screenshot on a cache hit | **Survives, solved by construction.** Capture is its own explicitly-triggered step. |
| **H7** graceful degradation, 3-attempt loop | **Changes shape.** No retry loop. Extraction either succeeds or fails *before* the user generates, with a specific reason. |
| **M1** multi-colour cover extraction | **Survives** as the hue source for §7. |
| **M2** honour the reference's light/dark polarity | **Obsolete.** The template's polarity is never written to, so it cannot flip. |
| **M3** render the reference with JS | **Absorbed** — it is now the foundation of the whole design. |
| **M4** feed the reference outline into the copy call | **Survives, stronger.** The brief is the slot's *actual original text*, not a heading. |
| **M5** feed audience psychology into the copy call | **Survives unchanged.** Still worth doing, still not done. |
| **M6** raise the 3-stylesheet limit | **Absorbed.** All sheets via `document.styleSheets`. |
| **M7** reference the embedded fonts or stop downloading them | **Survives, resolved.** Fonts are re-hosted and referenced, or declared degraded. |
| **L1–L4** dead code, `imageDensity`, fidelity log, radius/shadow extraction | L1 absorbed (the dead code is deleted wholesale); L2/L4 obsolete; **L3 survives as Phase 0**. |

Preserved from v1 verbatim — these are good work and none of it is being touched:
SSRF defence (per-hop DNS validation), the "no invented social proof" discipline
(`buildStats`, empty `testimonials`/`rating`/`valueStack`/`paymentMethods`), sibling
ownership checks, the system-rendered offer grid's one-record-per-card rule, `INLINE_WIDTHS`
image discipline, and `Palette.ensureContrast`.

---

## 12. Implementation steps

Ordered so each step is independently verifiable.

```
1.  0013 + 0014 migrations; TemplateManifest domain type; landing-assets bucket
2.  PuppeteerTemplateCapturer — capture only, write the artifacts to storage,
    no cleaning. Verify: the raw capture re-renders identically offline.
3.  TemplateCleaner + CssBundler + AssetRehoster.
    Verify: cleaned clone diffs < 2% vs. baseline at 390/768/1280.        ← PHASE 1 GATE
4.  data-tpl stamping + node inventory builder + RepeaterDetector (unit-tested
    on fixtures saved from themechanicbible.com)
5.  TemplateAnnotationPrompt + the annotation call + deterministic guards
    (checkout domains, brand-token scan, hero-image geometry)
6.  PlaceholderApplier + templateContract.
    Verify: filler-bound template diffs < 2% vs. baseline.                ← PHASE 2 GATE
7.  ExtractTemplateUseCase + POST /api/landing-templates + the queue worker
8.  Template review UI: screenshot, section list, placeholder table with original
    text, override controls
9.  TemplateCopyPrompt (original-text briefs + audience psychology) + Stage 5
10. bindTemplate (kind-aware escaping) + TemplateBinder + ThemeAdapter
11. PixelmatchPageDiffer + the §9 assertion suite + the fidelity report
12. GenerateLandingPageUseCase rewrite: engine switch, keep loadCover /
    loadSiblingProduct / buildBundle / buildStats unchanged
13. Multi-file deploy in PublishLandingPageUseCase (NetlifyDeployer already
    handles it — SiteFile[] + the digest flow, packages/infrastructure/src/net)
14. Fidelity badge + engine indicator in LandingPageCard.tsx                ← PHASE 3 GATE
15. Flip the default for new projects                                      ← PHASE 4
16. Delete Stage A; drop landing_layouts and landing_pages.html            ← PHASE 5
```

**Fixture discipline.** Save `themechanicbible.com`'s captured HTML + CSS + assets into
`packages/infrastructure/src/landing/__fixtures__/` at step 2 and unit-test every
deterministic stage against it. Steps 3, 4, 6 and 11 are all testable with no network and
no model.

---

## 13. Risks and limitations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Copyright / IP.** v2 makes a complete copy of a website. Doing that to a third party's page is a different act from being "inspired by" it. | **High** | Ownership attestation required at `POST /landing-templates`, recorded with a timestamp. Photographic and stock imagery is never republished (§4.2). All source text becomes placeholders and is overwritten. Source legal text is removed, not copied. Consider restricting v2 to an allow-list of templates the client owns, with arbitrary URLs behind an explicit warning. **This needs a decision from the client before Phase 4.** |
| 2 | **Font licensing.** Re-hosting a webfont is redistribution. | Medium | Keep the existing `HttpWebFontFetcher` licence gate. Unlicensed → family stays in the stack, falls back, and the report says `fontFidelity: degraded`. Never silently. |
| 3 | **Anti-bot protection.** Cloudflare/Datadome serve a challenge to headless Chromium. | Medium | Explicit failure naming the challenge. Manual "paste the page HTML" path as a fallback, which skips Stage 1 and enters at Stage 2 (loses computed baselines and screenshots — recorded as degraded). |
| 4 | **Template drift.** The source changes; the stored clone doesn't. | Low | Deliberate — stability is the point. Show `captured_at` and offer Re-extract, which bumps `revision` and re-applies `placeholder_overrides`. |
| 5 | **Copy overflow.** New prose doesn't fit CSS tuned to the original. | Medium | `maxChars` measured from the original ×1.15; overflow detected in §9.2 and re-asked once at a tighter bound. |
| 6 | **Repeater misdetection.** A bespoke asymmetric layout read as a repeater. | Medium | 70% signature coverage threshold; count defaults to `originalCount`; the review UI shows every detected repeater for confirmation before first use. |
| 7 | **Hashed CSS-in-JS class names.** A re-extraction produces entirely different class names. | Low | Each extraction is internally self-consistent — HTML and CSS are captured together. Only cross-revision diffing is affected, and `placeholder_overrides` key on placeholder name, not class. |
| 8 | **SPA / route-gated content.** Content behind a click or a route. | Medium | Capture only the landing route. Fail loudly on "< 3 sections". Multi-route templates are out of scope for v1 of v2. |
| 9 | **Page weight.** A heavy template with fonts and hero imagery could exceed a reasonable deploy. | Low | Assets are content-hashed and deduped, images re-encoded through the existing `ImageProcessor`. Weight is reported at extraction; > 8 MB warns. Note this is *lighter* than v1, which base64'd every image into a single Postgres column. |
| 10 | **Inherited accessibility.** A template with bad contrast or heading order propagates. | Low | §9.3 reports it as WARN. We do not silently "fix" the template — that would be redesigning it, which is the thing this architecture exists to stop. |
| 11 | **Every page on one template looks identical.** | — | Intended. This is the client's requirement, stated plainly so nobody later reads it as a defect. |
| 12 | **Two engines during migration.** | Low | Time-boxed by Phase 5, with a numeric exit criterion (≥50 pages, < 5% BLOCKER rate). |

### Limitations, stated plainly

- The system can only be as good as the template. A broken template clones faithfully.
- Templates requiring JS for layout (a JS-driven carousel, an accordion that needs a
  click) lose that behaviour when scripts are stripped. Accordions and tabs can be
  reimplemented with a small system-owned `<details>`/CSS pattern; carousels degrade to a
  static first slide. This is a real, visible limitation and should be listed in the
  extraction report.
- Animations defined in CSS (`@keyframes`, transitions) survive. Animations driven by JS
  (GSAP, Framer Motion, AOS) do not. Most reveal-on-scroll libraries leave elements at
  `opacity: 0` until their script runs — the cleaner must detect and neutralise those
  initial states, or the cloned page renders blank. **This is the single most likely
  Phase 1 failure and should be tested first.**

---

## 14. Recommended technology

| Need | Choice | Why not the alternative |
|---|---|---|
| Browser rendering | **Puppeteer** (already at `^23.4.0`) | Playwright is better for cross-browser, which we don't need. Switching costs the SSRF hardening in `assertPublicUrl`, the Docker Chromium layer, and `onlyBuiltDependencies` config, and buys nothing. Chromium is the only engine that matters here. |
| DOM surgery | **The browser itself**, via `page.evaluate` | The original plan was cheerio. Doing it in the page is strictly better: node identity comes free, `getComputedStyle` resolves `var()` tokens for us, and the parameterise step re-opens the cleaned document with `setContent` rather than parsing a string. Zero dependencies. |
| CSS rewriting | **Lexical `url()` rewrite** (`CssBundler.ts`) | postcss was the plan. Every *semantic* CSS question was already answered by the browser during capture, so what remains is repointing URLs — a string operation. This is not the mistake v1 made: v1 used regexes to answer semantic questions (is this face a serif?) and got them measurably wrong. |
| Visual diff | **sharp** raw-pixel walk (`SharpPageDiffer.ts`) | pixelmatch was the plan. sharp is already a dependency and decodes PNG to raw RGBA; the diff is then a loop with a channel tolerance and mask rectangles. Adding a package for a loop is adding a package for a loop. |
| Fonts | **Existing `HttpWebFontFetcher`**, inlined as `data:` URIs | Re-hosting fonts as separate files was the plan. Inlining reuses the existing licence allowlist unchanged, and at ≤3 faces the weight lands in the CSS bundle rather than in six extra deploy files. `fontFidelity` still reports `degraded` when a face could not be embedded. |
| Object storage | **Existing Supabase Storage** via the `ObjectStorage` port | New `landing-assets` bucket; no new dependency. |
| Deploy | **Existing `NetlifyDeployer`** | Already multi-file: `SiteFile[]` + the sha1-digest deploy API. Only `PublishLandingPageUseCase` needed changing, to load the asset bytes. |
| Colour | **Existing `sharp`** sampler; **existing `Palette`** helpers for the contrast gate | No new colour library. `hsl()` was promoted from private to exported rather than duplicated. |
| Annotation + copy model | **Sonnet**, structured output | Neither task is design judgement any more; both are structured extraction. Opus was justified for a 30 k-token layout authoring call, and nothing in v2 is that call. Widening `ClaudeModel` in `AiTextGenerator.ts:3` to the 5 family is still worth doing and is not required by this design. |

**New dependencies: none.** Everything is built on `puppeteer` and `sharp`, both already
installed, so the Docker image is unchanged.

---

## 15. Summary

The v1 system asks a model to look at a page and write a similar one. No amount of prompt
work changes what that produces, because "reconstruct this from a description" and
"reproduce this" are different operations. The audit measured the consequences precisely —
wrong typeface class, wrong content measure, 40% screenshot coverage, and a prompt
supplying its own competing spacing spec — but every one of those is a symptom of the
architecture, not of the tuning.

v2 removes the reconstruction step. The browser renders the template, deterministic code
copies and cleans it, a model labels which nodes hold product content, deterministic code
substitutes new content into those nodes, and a diff proves nothing else moved.

The model's total authority over the output becomes: **which nodes are content, and what
words go in them.** Layout, CSS, spacing, typography, responsive behaviour, section order
and component hierarchy are copied, never authored — so they cannot drift, cannot be
"interpreted", and cannot come back looking AI-generated. They come back looking like the
template, because they *are* the template.

---

## 16. Implementation status

Built and typechecking across all five packages; 416 tests pass (295 core, 121
infrastructure), of which 57 are new and cover the deterministic layers.

### What exists

| Area | Files |
|---|---|
| Migrations | `supabase/migrations/0013_landing_templates.sql`, `0014_landing_assets_bucket.sql` |
| Vocabulary + manifest + theme | `domain/landing/PlaceholderVocabulary.ts`, `TemplateManifest.ts`, `ThemeAdaptation.ts` |
| Ports | `ports/services/TemplateCapturer.ts`, `TemplateArtifactStore.ts`, `PageDiffer.ts`, `LandingPageBinder.ts`, `ports/repositories/LandingTemplateRepository.ts` |
| Binding + contract | `application/landing/bindTemplate.ts`, `templateContract.ts` |
| Prompts | `prompts/TemplateAnnotationPrompt.ts`, `TemplateCopyPrompt.ts` |
| Use cases | `use-cases/ExtractTemplateUseCase.ts`, `GenerateClonedLandingPageUseCase.ts` |
| Browser work | `infrastructure/landing/browserScripts.ts` (autoscroll, unhide-reveals, clean, stamp, inventory, repeater detection, measure, collect CSS/images, apply map) |
| Infrastructure | `net/PuppeteerTemplateCapturer.ts`, `landing/CssBundler.ts`, `AssetRehoster.ts`, `TemplateBinder.ts`, `SharpPageDiffer.ts`, `SupabaseTemplateArtifactStore.ts`, `persistence/supabase/SupabaseLandingTemplateRepository.ts` |
| Wiring | `landing-template` queue + worker, `landingTemplateId` project option, `GET/POST /api/landing-templates`, `GET/PATCH/DELETE /api/landing-templates/:id`, `engine`/`fidelity` on the landing-page response, container registrations |

Tests: `bindTemplate.test.ts` (17), `templateContract.test.ts` (20),
`ThemeAdaptation.test.ts` (9), `CssBundler.test.ts` (11), `TemplateBinder.test.ts` (11).

### What is deliberately unchanged

The v1 path is untouched and still runs for any project with no
`landingTemplateId` — which is every existing project, and remains the default
for single-book pages. Phase 5 deletions have not been made: `LandingLayoutPrompt`,
`LayoutReviewPrompt`, `GeneratedPageAssembler`, `landing_layouts` and
`landing_pages.html` are all still in place, as the migration plan requires until
the clone engine has a track record.

### What has not been verified

**No live template has been through this.** Every deterministic layer is unit-tested
against fixtures, but the numbers this design turns on — the Phase 1 `< 2%` cleaning
gate and the `< 2%` bound-page drift gate — are targets, not measurements.

The first run should be `POST /api/landing-templates` against
`themechanicbible.com`, then reading `extraction_report.cleaningLoss` before
anything else. Three things are most likely to need adjustment after it:

1. **`UNHIDE_REVEALS` breadth.** It forces visible *anything* still invisible after a
   full scroll that contains text or an image, excluding elements whose ancestor is
   hidden. Too aggressive opens a closed mobile drawer; too narrow leaves the page
   blank. The ancestor check is the guard, and it is the part to watch first.
2. **Repeater detection thresholds.** The 70% signature coverage and the innermost-wins
   filter are reasoned, not tuned. The template-review endpoint exists so a wrong
   detection is visible before a page is built on it.
3. **Accent-token matching.** `MEASURE` resolves each `:root` custom property through a
   probe element and compares it to the CTA's computed background. A template that
   composes its accent (`color-mix`, an alpha layer) will not match, and
   `adaptTheme` then falls back to the literal path — which is correct behaviour,
   but means the override is scoped by class-name heuristics rather than by token.

Migrations `0013`/`0014` have not been applied to any database.
