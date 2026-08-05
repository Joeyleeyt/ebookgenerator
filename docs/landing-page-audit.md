# Landing Page Generation — Full Pipeline Audit

> **Status: diagnosis, not the plan of record.** This audit measures the *generative*
> pipeline (Claude authors a layout from screenshots + a pruned DOM). That approach is
> being replaced by template cloning — see
> [`landing-page-architecture-v2.md`](landing-page-architecture-v2.md). The measurements
> below remain accurate and are the evidence base for that decision; §11's refactoring
> plan is superseded. v2 §11.1 maps every recommendation here to its status
> (obsolete / repurposed / survives).

**Date:** 2026-08-05
**Scope:** every stage from “user clicks Generate” to “HTML row written to `landing_pages`”.
**Method:** static trace of every call in the path, plus a live probe of the client’s own default
template (`https://themechanicbible.com/`) run through the production `digest()` / `pruneMarkup()` /
style-detection code. Measured numbers below are from that probe, not estimates.

---

## 1. Architecture

### 1.1 Execution flow

```
UI: LandingPageCard.tsx
  └─ POST /api/projects/:id/landing-page[?publish=true][&rebuildLayout=true]
       apps/web/app/api/projects/[id]/landing-page/route.ts:79
       · authorize (owner check)
       · require project.status === COMPLETED
       · require checkout links if publishing (missingCheckoutPositions)
       · reject if a generation is already GENERATING (<10 min old)
       └─ queue.enqueue('landing-page', { projectId, mode:'generate', publish, rebuildLayout })

BullMQ worker: workers/processors/index.ts:373
  └─ useCases.generateLandingPage.execute({ projectId, force:true, rebuildLayout })
       packages/core/src/application/use-cases/GenerateLandingPageUseCase.ts:402
       └─ (optional) useCases.publishLandingPage → NetlifyDeployer
```

### 1.2 Inside `GenerateLandingPageUseCase.execute()`

```
 417  load Project            ProjectRepository
 425  landingConfigError()    fail fast on bad multi-book config
 431  load Book SUMMARY       BookRepository.findSummaryByProject   (title, chapters, outline, coverPath)
 433  load BookStrategy       KnowledgeRepository.getBookStrategy
 449  inputHash               Hasher — idempotency key
 469  early return if unchanged and !force
 473  page.markGenerating → pages.saveState

 481  referenceUrl        = referenceUrlFor(mode, project.options.landingTemplateUrl)
                            LandingTemplate.ts:28  (triple defaults to themechanicbible.com)

 ── TEMPLATE INGEST (always runs, even on a cache hit) ──
 493  references.fetch(url)   HttpReferencePageFetcher   → ReferencePage {headings,text,markup,styleCss,style}
 500  screenshots.capture(url) PuppeteerReferenceScreenshotter → up to 4 PNG slices

 ── COLOUR ──
 506  loadCover()             ObjectStorage.getBytes → SharpColorSampler.dominantColor  (1 RGB)
                              + ImageProcessor.downscaleToDataUri (720px WebP q72)
 511  referenceAccent         parseHexColor(reference.style.accent)   ← FALLBACK ONLY
 512  palette                 Palette.fromSeed(cover.seed)            Palette.ts:62

 ── BRAND ──
 519  channels.getChannel     YouTube channel title / subs / avatar URL
 520  artifacts.listByProject pageCount
 528  loadLogo()              RemoteImageFetcher → 240px data URI

 ── LAYOUT (cached per template) ──
 535  ensureLayout()          :745
        · inputHash = {url, mode, productCount, hasPhoto, hasLogo}
        · layouts.find(url, mode) → return if inputHash matches   ← 99% of runs stop here
        · deriveLayout()      :819   loop x3:
              LandingLayoutPrompt.build({reference, shots, productCount, hasPhoto, hasLogo, repairErrors})
              ai.generate(claude-opus-4-8, maxTokens 30_000)
              parseJsonCompletion(LayoutSchema{css, bodyHtml, slots})
              validateGeneratedPage(..., expectSlots:true)         pageContract.ts:167
              reviewRendered() :905 → assemble with filler → captureHtml → LayoutReviewPrompt
                                    → ai.generate(claude-sonnet-4-6) → {ok, problems[]}
        · embedFonts()        :950   HttpWebFontFetcher → @font-face data: URIs, prepended to css
        · layouts.save()      SupabaseLandingLayoutRepository (GLOBAL, keyed reference_url+mode)

 558  loadSiblingProduct() x N  (multi-book pages; ownership-checked; fatal on failure)

 ── COPY ──
 569  layout ? writeSlotCopy() :957  LandingSlotCopyPrompt → claude-sonnet-4-6, 16k → {slotKey: text}
       :        writeFixedCopy() :1032 LandingPagePrompt   → claude-opus-4-8,  8k  → CopySchema

 615  typography override from reference (fontFamily / bodyFontFamily / display+body stacks)

 ── RENDER ──
 665  pageModel  {copy, palette, currency, guarantee, author, channel, products, stats, logo, photo, …}
 717  layout ? assembler.assemble({page:{css, bodyHtml:fillCopySlots(...)}, model})
       :        renderer.render(pageModel)          ← BUILT-IN TEMPLATE, unrelated to the reference
 724  page.setDraft({copy, palette, html, inputHash}) → pages.save()
```

### 1.3 Component inventory

| Component | Path | Role |
|---|---|---|
| `GenerateLandingPageUseCase` | `packages/core/src/application/use-cases/GenerateLandingPageUseCase.ts` | Orchestrator (1220 lines) |
| `HttpReferencePageFetcher` | `packages/infrastructure/src/net/HttpReferencePageFetcher.ts` | Fetch + SSRF guard + `digest()` |
| `PuppeteerReferenceScreenshotter` | `packages/infrastructure/src/net/PuppeteerReferenceScreenshotter.ts` | `capture(url)` / `captureHtml(html)` |
| `HttpWebFontFetcher` | `packages/infrastructure/src/net/HttpWebFontFetcher.ts` | Licence-gated `@font-face` inlining |
| `SharpColorSampler` | `packages/infrastructure/src/image/SharpColorSampler.ts` | 1 dominant RGB from the cover |
| `Palette` | `packages/core/src/domain/landing/Palette.ts` | Hue → full WCAG-checked scheme |
| `LandingLayoutPrompt` | `packages/core/src/application/prompts/LandingLayoutPrompt.ts` | The template-copy prompt (470 lines) |
| `LandingSlotCopyPrompt` / `LandingPagePrompt` | `.../prompts/LandingPagePrompt.ts` | Per-book copy |
| `LayoutReviewPrompt` | `.../prompts/LayoutReviewPrompt.ts` | Visual defect check |
| `pageContract` | `.../application/landing/pageContract.ts` | Mechanical validation + placeholder/slot substitution |
| `GeneratedPageAssembler` | `packages/infrastructure/src/landing/GeneratedPageAssembler.ts` | Document shell, palette vars, component CSS, placeholder markup |
| `LandingPageHtmlRenderer` | `packages/infrastructure/src/landing/LandingPageHtmlRenderer.ts` | Built-in fallback page (813 lines) |
| `SupabaseLandingLayoutRepository` | `packages/infrastructure/src/persistence/supabase/…` | Global layout cache |
| `ClaudeTextGenerator` | `packages/infrastructure/src/ai/anthropic/ClaudeTextGenerator.ts` | The only Claude adapter |

---

## 2. Data Flow — what actually reaches the model

### 2.1 Template URL

`referenceUrlFor(mode, override)` — `LandingTemplate.ts:28`. Per-project `landingTemplateUrl` wins;
otherwise `triple` → `https://themechanicbible.com/`, `single` → `null` (built-in template).
Included in the page `inputHash` (`:460`) so changing it forces a rebuild.

### 2.2 HTML extraction

`HttpReferencePageFetcher.fetch()` — plain `fetch`, `redirect: 'manual'`, every hop DNS-resolved and
checked against private ranges (`assertPublicUrl`, `:120`). 3 MB cap, 15 s timeout, 3 redirects.
**No JavaScript execution.** The default template happens to be prerendered, so this works — a
client-side-rendered template (plain Vite/CRA) would yield an empty app shell with **no warning**.

`digest()` (`:188`) reduces the page to:

| Field | Cap | Measured on the default template |
|---|---|---|
| `headings` | 60 | **23** (8 at h1/h2) |
| `text` | 12,000 chars | 7,164 |
| `markup` | **36,000 chars** | **33,758 (94 % of cap)** |
| `styleCss` | 200,000 chars | 86,267 |
| `style.*` | 9 scalars | see §5 |

`pruneMarkup()` (`:240`) drops scripts, styles, `<link>`, SVG innards, data URIs, and **all
`data-*` attributes**; keeps the element tree and `class` (correct — on a utility-CSS site the
classes *are* the design). Body 51,314 → 33,758 chars, i.e. **65.8 % of the body survives** for this
template purely because of whitespace/attribute stripping.

### 2.3 CSS extraction

Inline `<style>` blocks + **at most 3** linked stylesheets (`:71` `.slice(0, 3)`). Measured here: 2
links (the 81 KB Tailwind bundle and a Google Fonts sheet) — both retrieved. A Next.js app that
emits 5–10 CSS chunks would silently lose the rest.

### 2.4 Screenshots

`PuppeteerReferenceScreenshotter.capture()` — headless Chromium, 1280×900 viewport, `networkidle2`,
then `slice()` (`:79`):

```
slices = min(4, ceil(height / 900))
step   = floor((height - 900) / (slices - 1))
```

For a 10-screen sales page (~9,000 px) that is 4 **non-contiguous** 900 px bands at y = 0, 2700,
5400, 8100 → **3,600 of 9,000 px captured ≈ 40 % of the page**. The prompt tells the model these
images “are the ground truth for how it LOOKS … Match them” (`LandingLayoutPrompt.ts:456`). Roughly
60 % of the reference is never seen.

### 2.5 Colour extraction

See §5. One `sharp.stats().dominant` bin from the cover; the reference’s own accent is detected and
discarded.

### 2.6 Cover analysis

`loadCover()` (`:1205`) — one storage read, two uses: `dominantColor()` on the original bytes and
`downscaleToDataUri({maxWidth:720, quality:72})` for embedding. No vision model ever looks at the
cover; no palette beyond the single dominant colour; no subject/composition analysis.

### 2.7 Prompt construction

See §3.

### 2.8 Claude calls

| Stage | Model | maxTokens | Cache | Frequency |
|---|---|---|---|---|
| `landing-layout` | `claude-opus-4-8` | 30,000 | system prefix | once per template (cached) |
| `landing-layout-review` | `claude-sonnet-4-6` | 1,500 | system prefix | once per layout attempt |
| `landing-page` (slot copy) | `claude-sonnet-4-6` | 16,000 | system prefix | every generation |
| `landing-page` (fixed copy) | `claude-opus-4-8` | 8,000 | system prefix | fallback path only |

`ClaudeTextGenerator` (`:31`) sends only `model`, `max_tokens`, `system`, `messages`, and cache
control. **No `thinking`, no `output_config.effort`.** On Opus 4.8 an omitted `thinking` field means
the model runs *without* extended thinking — so the hardest call in the system (translate a 34 KB
DOM + 4 screenshots into a reusable template under ~30 constraints) runs with reasoning off.
`ClaudeModel` (`AiTextGenerator.ts:3`) is also pinned to the 4.x family; Opus 5 / Sonnet 5 are not
selectable.

### 2.9 Final assembly

`GeneratedPageAssembler.assemble()` — builds the `<head>`, injects `palette.toCssVariables()` into
`:root`, then concatenates **COMPONENT_CSS → model CSS → STRUCTURAL_CSS → REVEAL_CSS**, so the model
can restyle system components but cannot break their geometry. Placeholders are substituted with
system-rendered markup (`ctaMarkup`, `priceMarkup`, `offerGridMarkup`, …). The checkout URL is
written verbatim (`:305`, `:312`), never composed.

---

## 3. Prompt Construction

| Prompt | File | Consumer | Variables injected |
|---|---|---|---|
| `LandingLayoutPrompt` | `LandingLayoutPrompt.ts:21` | `deriveLayout` | `reference.{url,title,headings,markup,text,style.*}`, `productCount`, `hasAuthorPhoto`, `hasLogo`, `referenceShots[]`, `repairErrors[]`, `edition` |
| `LandingSlotCopyPrompt` | `LandingPagePrompt.ts:16` | `writeSlotCopy` | book title/subtitle/author/channel/pageCount, `strategy.toText()`, chapter titles, sibling books + their chapters, `slots[]` |
| `LandingPagePrompt` | `LandingPagePrompt.ts:109` | `writeFixedCopy` | same minus slots; **`referenceSections` / `referenceTitle` are never passed** |
| `LayoutReviewPrompt` | `LayoutReviewPrompt.ts:21` | `reviewRendered` | 4 screenshots of the rendered candidate |

### 3.1 What the layout prompt does *not* receive

- Any spacing measurement. Not one padding, margin, gap, or line-height from the reference.
- Any type scale. No font sizes, weights, letter-spacings, or heading ratios.
- Any breakpoint. No media queries, no responsive column counts.
- Any radius, border width, shadow, or transition.
- Any per-section background mapping (only a *count*: `distinct section grounds: 4`).
- Any image inventory (only a 3-bucket density label).
- Any icon set, any animation.
- The reference’s own colours — deliberately, but see §5.

### 3.2 What the prompt asserts *instead*

Because the measurements are absent, the prompt substitutes a hard-coded house style that **overrides
the template**:

- `~90px section padding; … content column 680-1080px` (`:404`)
- top bar `padding-block 10-12px`, brand `~0.8rem, letter-spacing .12-.18em`, byline `~0.62rem,
  letter-spacing .2em` (`:233`)
- `BALANCE THE SPLIT … the text takes the larger share (about 3:2)` (`:285`)
- drop caps, outlined secondary buttons, `◆` benefit markers, `INSTANT DELIVERY · MONEY BACK · ANY
  DEVICE` trust rows (`:245`, `:392`)
- `USE EXACTLY THIS for headings: font-family: <systemStackFor(...)>` (`:330`)

This is the mechanism behind “spacing differs”, “visual hierarchy is different”, and “feels
AI-generated”: the model is told to copy the template *and* told a specific different set of numbers,
and the explicit numbers win.

Note one partial mitigation already present: when `reference.markup` exists, the `COMPONENT FIDELITY`
and `CRAFT BLUEPRINT` blocks are suppressed (`:374`) — but the top-bar spec, `DETAIL WORK`, `BALANCE
THE SPLIT`, `ONE COLUMN PER SECTION` and the font-stack mandate are **not** suppressed and apply in
every case.

---

## 4. Template Analysis — what is extracted, what is lost

| Signal | Extracted? | How | Verdict on the client’s own template |
|---|---|---|---|
| DOM structure | ✅ | `pruneMarkup`, 36 k cap | 33,758 chars — **94 % of the cap**, no headroom |
| Class names | ✅ | preserved | good (utility classes carry the design) |
| Section order | ✅ | markup + `headings[]` | good |
| CSS rules | ⚠️ | 3 sheets max, used only for 9 scalars | the 81 KB Tailwind bundle is fetched then almost entirely ignored |
| Layout hierarchy | ❌ | — | inferred by the model from markup only |
| Spacing | ❌ | — | **totally lost** |
| Type scale | ❌ | — | **totally lost** |
| Typography (serif/sans, family) | ⚠️ | regex on `font-family:` | **wrong** — see §4.1 |
| Colours | ⚠️ | `pickAccent`, `uniqueColors` | accent correct, grounds garbage, **all discarded** |
| Content measure | ⚠️ | `max-width: NNNpx` regex | **null** — the site uses `rem` |
| Responsive behaviour | ❌ | — | no media queries read; no mobile screenshot |
| Images | ⚠️ | count only → 3-bucket label | mislabelled “image-led” |
| Icons | ❌ | SVG innards stripped | slot survives, shape does not |
| Animations | ❌ | — | replaced with the system’s own reveal CSS |

### 4.1 The single most damaging defect: CSS variables are never resolved

Measured, running the production detectors against the live stylesheet:

```
serifHeadings : false      ← actual: h1,h2,h3,h4{font-family:var(--font-display)}
                                     --font-display:"DM Serif Display", Georgia, serif
serifBody     : false      ← actual: Fira Sans (correct by luck)
headingFont   : "Fira Sans"  ← that is the BODY face; the display face is DM Serif Display
bodyFont      : null
grounds       : ['#0000', 'rgba(255, 255, 255, 0.04)', '#0d0c0b', '#000c']
accent        : '#da5e25'   ← correct, and thrown away
measurePx     : null        ← actual: max-w-7xl = 80rem = 1280px
```

Mechanism:

- `serifFor()` (`:299`) **does** find the rule `h1,h2,h3,h4{font-family:var(--font-display)}`, but
  `isSerifDeclaration()` (`:280`) tests the literal string `font-family:var(--font-display)`, which
  contains no `serif` token → returns `false`. Because it returns `false` rather than `null`, the
  page-wide fallback at `:310` never runs.
- `fontNameFor()` (`:324`) explicitly skips any value starting with `var(` → returns `null` →
  `pickHeadingFont()` returns the most-*mentioned* named family, which on a Tailwind build is the
  body font.
- `uniqueColors()` (`:358`) only matches literal hex/rgb after `background:` — on a token-based
  stylesheet almost every background is `var(--primary)`, so it returns Tailwind’s transparent
  literal `#0000` as the top “ground”.
- `readMeasure()` (`:383`) only matches `max-width: NNNpx` — `rem`, `ch`, `%`, and `max-w-*`
  utilities are invisible.

Consequence chain: the layout prompt is told `headings: sans-serif` and
`USE EXACTLY THIS for headings: "Segoe UI", "Gill Sans", …` for a template whose headings are a
high-contrast display serif; and `content column: unspecified`. Then at `:615-627` the use case
**overrides the copy model’s own font choice** with these wrong values. Every design-system site
built after ~2023 (Tailwind v4, shadcn, Lovable, Next themes, CSS Modules with tokens) hits this.

---

## 5. Colour Extraction

**Algorithm.** `SharpColorSampler.dominantColor()` (`:14`): resize to 160 px wide → `sharp().stats()`
→ `.dominant`, the most-populated bin of a 4096-colour histogram. **One colour. No secondary. No
accent. No k-means, no saliency, no area weighting.**

**Palette derivation.** `Palette.fromSeed()` (`Palette.ts:62`) keeps only the seed’s **hue and
saturation** plus a light/dark decision from its luminance; every actual value is synthesised at a
fixed lightness ladder (bg .085/.962, surface .135/.925, border .26/.84, deep .04/.11, tint .1/.935),
then each text/ground pair is walked through `ensureContrast(…, 4.5)`.

**Contrast / readability.** Genuinely solid. Heading, text, muted, on-deep, on-deep-muted and
accent-on-deep are all WCAG-AA-corrected; `accentContrast` is black-or-white by measured ratio. An
unreadable page is structurally impossible. This part of the system is not the problem.

**Is the palette passed into the prompt?** Not as values — and deliberately. The prompt lists only
the 14 variable *names* (`LandingLayoutPrompt.ts:184`) and the contract rejects any raw colour
(`pageContract.ts:320`). The concrete values are injected at assembly time
(`GeneratedPageAssembler.ts:65`). That design is correct and worth keeping.

**Why the colours still look wrong:**

1. **Single-colour input.** A navy cover with gold foil yields one navy bin. The gold is gone; the
   page renders monochrome-navy. The book’s *actual* accent never reaches the page.
2. **`accentSeed` is dead.** `Palette.fromSeed(seed, {accentSeed})` (`:62-63`) exists specifically to
   let the reference’s brand colour take the hue/saturation. **No caller ever passes it.** The
   correctly-detected `#da5e25` is used only when the cover is missing entirely (`:511-516`).
3. **Hue-only fidelity.** Because saturation is clamped to `[0.35, 0.8]` and lightness is fixed, two
   very different covers on the same hue produce identical pages.
4. **The reference’s light/dark polarity is ignored.** `themechanicbible.com` is a dark page
   (`--background: #0d0c0b`-ish). If the book’s cover is light, the generated page flips to light —
   the single largest perceived “this doesn’t look like the template” difference, and it is decided
   by a value nothing in the pipeline compares against the reference.

---

## 6. AI Input — the complete payload

### 6.1 Layout call (`claude-opus-4-8`, 30 k out)

**System** (~5,000 tokens, cached): output contract (`css`/`bodyHtml`/`slots`); copy-slot rules;
14 placeholder definitions; product-count branch; required `data-section` list; palette-variable
whitelist; hard limits (no script/iframe/form/external URL); section-order mandate; top-bar spec;
`DETAIL WORK`; scroll-animation classes; size budget; layout-discipline rules; responsive rules.

**User** (blocks, in this order):
1. text — “These N screenshots are the reference page … Match them.”
2. **image ×(0–4)** — PNG, 1280×900, ~1,540 vision tokens each
3. text —
   - `Source`, `Title`
   - `Observed treatment`: 9 scalars (serif flags, display typeface name, two mandated font stacks,
     numbered-sections bool, `content column`, `imagery` bucket, `distinct section grounds` count)
   - all headings with levels (23 here)
   - `=== THE TEMPLATE MARKUP (pruned) ===` + up to 36,000 chars
   - “what this template is for” (product count, no book named)
   - `repairErrors[]` on attempts 2–3

**Not in the payload:** the reference’s stylesheet, any spacing/type/breakpoint value, its accent
colour, the checkout URL, the cover, the book, any generated content, page height, a mobile
screenshot, or the previous rejected attempt’s own output (only the error list).

### 6.2 Slot-copy call (`claude-sonnet-4-6`, 16 k out)

Book title/subtitle/author/channel/length, `BookStrategy.toText()` (9 lines: audience, core promise,
transformation, voice, tone, USP, key principles), chapter titles, sibling books with their chapters,
and the slot manifest (`key (max N chars) — purpose`).

**Not in the payload:** the reference page at all (no headings, no excerpts, no screenshots), video
descriptions, video comments, audience-psychology output from the comment-analysis phase, the cover,
the palette, or the price.

### 6.3 Missing from the AI input, ranked by impact

1. Spacing / type-scale / breakpoint measurements (nothing, anywhere).
2. The reference’s stylesheet — fetched (81 KB), reduced to 9 scalars, then dropped.
3. The 60 % of the reference the screenshots never cover.
4. A mobile-width screenshot (responsive behaviour is asserted, never observed).
5. YouTube comments / audience psychology → the copy prompt sees only `strategy.toText()`.
6. `referenceSections` on the fallback copy path — the parameter exists and is never supplied.
7. Extended thinking / effort on the layout call.

---

## 7. Output Validation

### 7.1 What *is* checked — `validateGeneratedPage()` (`pageContract.ts:167`)

Runs on the **layout only**, before any copy or placeholder substitution. Checks: required
placeholders present; per-placeholder occurrence caps; `{{PRICE}}`/`{{CTA_BUTTON}}` not inside the
`{{OFFER_GRID}}` section; unknown `{{TOKEN}}`s; page-sized images kept out of the sticky bar; the
four required `data-section` values; no script/iframe/form/`on*`/`javascript:`; no external URLs, no
`@import`, no remote `url()`; CSS/HTML byte caps; raw colours and unknown CSS variables; no
`overflow-x/y: hidden`; balanced block tags; and the full slot manifest (declared ⇔ placed, ≥8 slots,
required keys, non-empty purpose, positive `maxChars`, no duplicates).

Plus `reviewRendered()` (`:905`) — renders the candidate with length-accurate filler, screenshots it,
and asks Sonnet for layout defects. Inconclusive → pass (correct: QA, not a gate).

### 7.2 What is **not** checked — every one of these is a live gap

| Gap | Consequence |
|---|---|
| **Nothing validates the FINAL page.** All checks run pre-substitution. | A page can ship with leaked `{{COPY:…}}`, empty slots, or broken markup introduced by substitution. |
| No check that every `.cta` href equals `landingCheckoutUrl` | Directly matches the “CTA doesn’t use the checkout URL” symptom. |
| No **minimum** CTA count | Contract requires ≥1, caps at 6. A template with 5 buy buttons can legally become a page with 1. |
| No comparison against the reference | Section count, section order, and heading count are never diffed. “Sections missing/rearranged” cannot be detected. |
| No responsive check | The layout prompt demands “must not scroll sideways at 360px”; nothing renders at 360px. `reviewRendered` uses 1280×900 only. |
| No accessibility check | No alt-text, heading-order, landmark, or focus-order validation. Contrast is guaranteed only for palette pairs, never for the composed page. |
| `fillCopySlots()` does **not** escape (`pageContract.ts:424`) | Model copy is injected raw into HTML. Every other string in the codebase goes through `esc()`; this is the one hole. An `&`, `<`, or `"` in a slot value corrupts markup or silently truncates a slot placed inside an attribute. |
| Fallback is invisible | `layout: 'builtin'` is logged (`workers/processors/index.ts:389`) but never surfaced in the API response or the UI. |
| Markup truncation is not reported | `referenceNote` covers fetch and screenshot failures only; a truncated DOM is silent. |

---

## 8. Failure Points — ranked by likelihood of causing the reported symptoms

| # | Failure | Symptom it produces | Confidence |
|---|---|---|---|
| **1** | **CSS custom properties are never resolved** (`HttpReferencePageFetcher.ts:280,318,358,383`) → wrong serif flag, wrong display face, null measure, garbage grounds | Typography differs; visual hierarchy differs; content width differs | **Measured — confirmed on the client’s own template** |
| **2** | **The prompt hard-codes spacing/type numbers** that override the template (`LandingLayoutPrompt.ts:233,245,285,404`) because no measurements exist | Spacing differs; “feels AI-generated” | **Very high** |
| **3** | **Screenshots cover ~40 % of the page** (`PuppeteerReferenceScreenshotter.ts:13`) | Sections missing; sections in the unseen 60 % rendered from imagination | **Very high** |
| **4** | **Layout is cached globally and forever** per `(reference_url, mode)`; the first successful derivation wins for every account, and prompt/contract fixes never reach it without an explicit `?rebuildLayout=true` | “I fixed the prompt and nothing changed”; every page on a template inherits one bad derivation | **Very high** |
| **5** | **All-or-nothing fallback to the built-in template** after 3 attempts (`:830`, `:722`) — a page with no structural relationship to the reference, and `templateSections` is always empty because `referenceSections` is never passed (`:1043`) | “Does not resemble the template at all”; missing sections | **High** |
| **6** | **36,000-char DOM budget, silently truncated at the tail** (`:231`) — measured 33,758 (94 %) for the default template | Order/offer/FAQ/footer sections missing on any richer template | **High (latent; will fire on the next template)** |
| **7** | **Palette derives from one histogram bin, hue only**; `accentSeed` never passed; reference light/dark polarity ignored | “Colours are sometimes incorrect” | **High** |
| **8** | **No minimum CTA count and the offer-grid exclusion rule removes CTAs** (`pageContract.ts:226`) | “Some CTA buttons are missing” | **Medium-high** |
| **9** | **No JS execution when fetching** — a CSR template yields an empty shell with no warning | Total loss of fidelity on some templates | **Medium** (default template is prerendered) |
| **10** | **Extended thinking is off** on the layout call (`ClaudeTextGenerator.ts:31`) | Lower fidelity on the hardest call in the system | **Medium** |
| **11** | **Visual reviewer is a hard gate** with no severity — any complaint burns one of 3 attempts | Good layouts rejected; fallback triggered | **Medium** |
| **12** | **Only 3 linked stylesheets read** (`:71`) | Style detection blind on multi-chunk builds | **Medium** |
| **13** | **`fillCopySlots` does not escape** (`pageContract.ts:424`) | Occasional broken markup / dropped copy | **Medium** |
| **14** | **Embedded webfonts are never referenced** — downloaded, base64’d into the stored CSS, then the prompt mandates system stacks | Typography differs *and* every page carries 100–300 KB of dead font data | **Confirmed by code inspection** |
| **15** | `imageDensity` mis-buckets (13 imgs / ~1,150 words → “image-led”) | Minor prompt noise | Low |

---

## 9. Code Quality

### 9.1 Dead code

| Item | Location | Status |
|---|---|---|
| `outlineOf()` — 32 lines with a 12-line docstring | `GenerateLandingPageUseCase.ts:113` | **Never called** |
| `LandingPagePrompt.referenceSections` / `referenceTitle` | `LandingPagePrompt.ts:126` | **Never supplied** (`:1043` spreads an input that lacks them) → `templateSections` is always `[]` |
| `templateSection()` rendering branch | `LandingPageHtmlRenderer.ts:65` | Unreachable, per the row above |
| `Palette.fromSeed(seed, {accentSeed})` | `Palette.ts:62-63` | **Never passed** |
| `ValidateOptions.requiredText` | `pageContract.ts:131,172` | Never passed |
| `ValidateOptions.minSlots` | `pageContract.ts:145` | Never passed (always defaults to 8) |
| `copy.displayFontStack` / `bodyFontStack` / `fontFamily` overrides | `GenerateLandingPageUseCase.ts:615-627` | Computed and stored, but `GeneratedPageAssembler` never reads them — live only on the fallback path |
| Embedded `@font-face` rules | `GenerateLandingPageUseCase.ts:799` → `stored.css` | Injected but never referenced by any selector |

### 9.2 Duplicated logic

- `romanYear()` — identical implementations at `GenerateLandingPageUseCase.ts:273` and `shared.ts:43`.
- `compactCount()` (`:96`) duplicates `formatCount()` (`shared.ts:36`) with slightly different
  behaviour below 1,000.
- `PLACEHOLDERS` re-exported from `GeneratedPageAssembler.ts:570` as well as `pageContract`.
- Two complete rendering engines (`GeneratedPageAssembler` 570 lines, `LandingPageHtmlRenderer` 813
  lines) with independently maintained component CSS.

### 9.3 Conflicting generators

The two render paths produce structurally unrelated documents from the same `LandingPageModel`, and
which one runs is decided silently by whether a layout derivation succeeded. Neither the API response
nor the UI distinguishes them.

### 9.4 Incorrect data transformations

- `isSerifDeclaration` / `fontNameFor` / `uniqueColors` / `readMeasure` — all four fail on
  `var(--token)` values (§4.1).
- `serifFor` returning `false` (rather than `null`) on a token-valued rule defeats its own fallback.
- `pickHeadingFont` returns the most *mentioned* family, which on a utility build is the body face.
- `imageDensity` divides by `text.split(/\s+/).length` where `text` is already capped at 12,000 chars
  — the ratio is unstable for long pages.
- `fillCopySlots` bypasses `esc()`.

### 9.5 Efficiency

`references.fetch()` **and** `screenshots.capture()` run at `:493` and `:500`, *before* `ensureLayout`
at `:535` consults the cache. On the ~99 % of generations that hit the cache, every job:

- makes a full HTTP fetch of the client’s live site plus up to 3 stylesheets,
- launches Chromium, navigates with `networkidle2` (up to 30 s), takes and base64-encodes 4 PNGs,
- then discards all of it (the only surviving use is the typography override at `:615`, which the
  assembler ignores).

That is several seconds of wall clock and a few hundred MB of RSS per book, plus unnecessary traffic
to the reference site on every single generation.

### 9.6 What is well built (do not regress it)

- SSRF defence: per-hop DNS resolution against private ranges, applied to the page, its stylesheets,
  the fonts, and the screenshot navigation.
- Placeholder architecture: money, links, per-product covers and the legal footer are system-rendered,
  so a mangled checkout URL is structurally impossible on the layout path.
- Contrast guarantees in `Palette`.
- The “no invented social proof” discipline — `stats`, `testimonials`, `rating`, `valueStack`,
  `paymentMethods` all render only from real data.
- `STRUCTURAL_CSS` re-asserting geometry after the model’s CSS.
- Ownership check on sibling projects (`:1082`).
- Image inlining discipline (`INLINE_WIDTHS`) driven by a real Postgres/gateway failure.

---

## 10. Recommendations

### Critical

**C1 — Resolve CSS custom properties before detecting anything.**
*Why:* measured wrong on the client’s own template — wrong serif flag, wrong display face, null
measure, garbage grounds; and those wrong values then override the model at `:615`.
*Fix:* parse `:root`/`[data-theme]` blocks into a token map, resolve `var(--x, fallback)`
recursively (depth-cap 5), and run the existing detectors on the resolved values. Extend
`uniqueColors` and `pickAccent` to `oklch()`/`hsl()`/`color-mix()`. Extend `readMeasure` to `rem`/`em`
(× root font-size) and to Tailwind `max-w-*` classes seen in the markup.
*Impact:* correct typeface class and content measure on essentially every modern template.
*Difficulty:* Medium (≈200 lines in `HttpReferencePageFetcher.ts` + tests). *Priority:* **Critical**

**C2 — Extract real computed style from the rendered page and pass it to the prompt.**
*Why:* spacing, type scale and breakpoints are the three things the user says are wrong, and none of
them is measured anywhere today.
*Fix:* the Puppeteer session is already open. Add a `page.evaluate` that walks `<section>`/`<header>`/
`<footer>` and returns, per section: `getBoundingClientRect()`, resolved `padding-block`,
`background-color`, child count and layout mode (`display`, `grid-template-columns`, `gap`), plus a
page-level type scale (computed `font-size`/`weight`/`family`/`letter-spacing`/`line-height` for h1,
h2, h3, p, small, button), the content measure (widest `.container`-like element), border-radius and
box-shadow modes. Re-run at 390 px for the mobile column counts. Feed this as a compact
`=== MEASURED STYLE ===` table.
*Impact:* the largest single fidelity gain available; also lets C3 delete the invented numbers.
*Difficulty:* Medium-high (~250 lines). *Priority:* **Critical**

**C3 — Delete the invented spacing/typography numbers from the prompt when measurements exist.**
*Why:* `~90px section padding`, `680-1080px`, `3:2`, `padding-block 10-12px`, `0.8rem/.12-.18em` are
a competing design spec that outranks the template. *Fix:* gate every hard-coded number behind
`!measuredStyle`, exactly as `COMPONENT FIDELITY` is already gated behind `!reference.markup`
(`LandingLayoutPrompt.ts:374`). *Impact:* removes the mechanism behind “feels AI-generated”.
*Difficulty:* Low. *Priority:* **Critical**

**C4 — Version the layout cache on prompt + contract.**
*Why:* every improvement above is invisible until the cache is invalidated, and today that requires a
manual `?rebuildLayout=true` per template. *Fix:* add `LAYOUT_PIPELINE_VERSION` (bump on any change
to `LandingLayoutPrompt`, `pageContract`, or the digest) into `ensureLayout`’s `inputHash` at `:759`.
*Impact:* fixes ship automatically. *Difficulty:* Low. *Priority:* **Critical**

**C5 — Scope the layout cache per owner, or make sharing explicit.**
*Why:* `landing_layouts` is keyed on `(reference_url, mode)` with no tenant column. If two accounts
point at the same URL they share one derivation, and either can overwrite it for the other with
`rebuildLayout=true`. *Fix:* add `owner_id` to the key, or keep sharing but make `rebuildLayout`
write a new row rather than upsert over the shared one. *Difficulty:* Low-medium (migration).
*Priority:* **Critical**

### High

**H1 — Capture the full reference, not 4 bands.**
Use `fullPage: true` (Chromium caps at 16,384 px; stitch or cap beyond that), downscale to ≤1,568 px
wide, and slice into **contiguous** tiles. 8–10 contiguous tiles at 1,568 px cost roughly the same
vision tokens as 4 tiles at 1,280 px and cover 100 % instead of 40 %. Add one 390 px-wide mobile
capture. *Difficulty:* Low. *Priority:* **High**

**H2 — Raise the DOM budget and report truncation.**
33,758 chars is 94 % of the current cap. Raise `MAX_MARKUP_CHARS` to ~90,000 (~22 k tokens — Opus 4.8
has a 1 M window; 30 k *output* is the real constraint, not input), and when truncation does occur,
surface it in `referenceNote` and prefer dropping deeply-nested leaf text over cutting the tail.
*Priority:* **High**

**H3 — Enable adaptive thinking and effort on the layout call.**
Add `thinking?: {type:'adaptive'}` and `effort?: 'low'|'medium'|'high'|'xhigh'|'max'` to
`AiGenerateInput` and pass them through in `ClaudeTextGenerator`. Use `thinking: adaptive` +
`effort: 'xhigh'` for `landing-layout` (once per template — cost is negligible), `effort: 'low'` for
the review call. Also widen `ClaudeModel` to include `claude-opus-5` / `claude-sonnet-5`.
*Priority:* **High**

**H4 — Validate the finished page, not just the layout.**
New `validateAssembledPage(html, {checkoutUrl, expectedSections, expectedCtaCount})`: no residual
`{{`; every `a.cta[href]` equals the checkout URL (or is the deliberate inert `<span>`); CTA count ≥
the reference’s buy-button count; `data-section` count and order match the reference’s heading
skeleton; every `<img>` has `alt`; single `<h1>`; no heading-level skips. Screenshot at 390/768/1280
and assert `scrollWidth <= clientWidth`. Attach the result to the API response so the UI can show a
fidelity badge. *Priority:* **High**

**H5 — Escape copy slot values.**
`fillCopySlots` (`pageContract.ts:424`) must run values through `esc()` — or, better, take an
`escape` callback so `core` stays framework-free. One-line fix, closes the only unescaped path.
*Priority:* **High**

**H6 — Don’t fetch and screenshot on a cache hit.**
Move the `references.fetch` / `screenshots.capture` block (`:492-503`) *inside* `ensureLayout`, after
the cache lookup at `:783`. Saves a Chromium launch, ~30 s of worst-case latency and a few hundred MB
per generation, and stops hammering the client’s live site. *Difficulty:* Low. *Priority:* **High**

**H7 — Replace all-or-nothing fallback with graceful degradation.**
Today: 3 failures → a completely different page. Instead — (a) raise the attempt budget to 4 and give
the model its own previous `bodyHtml` on repair rounds, not just the error list; (b) treat visual
defects as advisory once the contract passes (retry, but accept the last contract-valid candidate
rather than falling back); (c) if the built-in renderer *is* used, pass `referenceSections`
(revive `outlineOf()`) so the fallback at least follows the template’s section list; (d) surface
`layout: 'builtin'` in the API response and the UI. *Priority:* **High**

### Medium

**M1 — Multi-colour cover extraction.** Replace `stats().dominant` with a small k-means (k=5) over a
downscaled cover, returning `{dominant, accent, isDark}` where `accent` is the most saturated cluster
with ≥3 % area. Pass it as `Palette.fromSeed(dominant, {accentSeed: coverAccent})` — the parameter
already exists. *Priority:* **Medium**

**M2 — Honour the reference’s light/dark polarity.** Detect it from the resolved `--background`
luminance (or the top screenshot’s mean brightness) and pass it to `Palette.fromSeed` as an explicit
`dark` override, instead of letting the cover decide alone. This is the largest single perceptual
“doesn’t look like the template” lever after typography. *Priority:* **Medium**

**M3 — Render the reference with JS.** Puppeteer is already loaded and already navigates the URL —
have it return `document.documentElement.outerHTML` and feed *that* to `digest()`, with the plain
`fetch` as fallback. Fixes CSR templates and makes markup and screenshots describe the same DOM.
*Priority:* **Medium**

**M4 — Feed the reference’s section outline into the copy call.** `LandingSlotCopyPrompt` sees no
reference at all; slot `purpose` strings are the only brief. Pass the matching section heading +
excerpt (this is what `outlineOf()` was written for) so copy covers the same ground as the template.
*Priority:* **Medium**

**M5 — Feed audience psychology into the copy call.** The pipeline already runs comment analysis
(phase 6); the landing copy sees only `BookStrategy.toText()`. Passing the audience pains/objections
would materially improve the prose. *Priority:* **Medium**

**M6 — Raise the linked-stylesheet limit** from 3 to ~8 with a total byte cap. *Priority:* **Medium**

**M7 — Reference the embedded fonts, or stop downloading them.** Either allow `preferredStackFor()`
(family-first) in the generated CSS and drop the `systemStackFor` mandate when a face was legally
embedded, or delete `embedFonts` and save 100–300 KB per page. Today it is pure dead weight.
*Priority:* **Medium**

### Low

- **L1** — Delete `outlineOf` or wire it up (M4); delete the duplicate `romanYear`/`compactCount`.
- **L2** — Fix `imageDensity` to use uncapped word count, or replace it with a measured
  image-area/viewport-area ratio from the render.
- **L3** — Add a `landing-page-fidelity` structured log (sections expected vs produced, CTA count,
  markup truncation, screenshot coverage %, layout cached/derived) so regressions are observable.
- **L4** — Extract the reference’s `border-radius` / `box-shadow` / `transition` modes; they are
  cheap to measure and highly visible.

---

## 11. Refactoring Plan

**Step 0 — Instrument (½ day).** Add the fidelity log (L3) and surface `layout`, `screenshots`,
`referenceNote`, `layoutFailure` in the `GET /landing-page` response and the UI. *You cannot verify
any of the following without this.*

**Step 1 — Stop the cache from hiding the work (½ day).** C4 (pipeline version in the layout hash) +
C5 (owner-scoped key + migration) + H6 (move fetch/screenshot behind the cache lookup).

**Step 2 — Fix the extractor (2–3 days).** C1 (`var()` resolution, `oklch`/`hsl`/`color-mix`, `rem`
measures) with unit tests fixtured on the saved `themechanicbible.com` HTML + CSS. Assert
`serifHeadings === true`, `headingFont === 'DM Serif Display'`, `measurePx === 1280`,
`accent === '#da5e25'`. Then M3 (render with JS) and M6 (more stylesheets).

**Step 3 — Add measurement (3–4 days).** C2 — extend `ReferenceScreenshotter` (or add a
`ReferenceMeasurer` port) to return `MeasuredStyle` alongside the shots; H1 — full-page contiguous
tiles + a mobile capture. Thread both into `LandingLayoutPrompt`.

**Step 4 — Rewrite the prompt around the measurements (1–2 days).** C3 — gate every invented number
behind `!measuredStyle`; add the `=== MEASURED STYLE ===` block; H2 — raise the DOM budget. H3 —
adaptive thinking + `xhigh` effort on the layout call.

**Step 5 — Close the validation gap (2 days).** H4 (`validateAssembledPage` + 3-width responsive
assertion + a11y basics) and H5 (escape slots). Wire the fidelity report into the response.

**Step 6 — Make failure graceful (1–2 days).** H7 — 4 attempts, previous output on repair, advisory
visual review, `referenceSections` on the fallback path, explicit `builtin` signalling in the UI.

**Step 7 — Colour (1–2 days).** M1 (k-means cover palette + `accentSeed`) and M2 (polarity from the
reference).

**Step 8 — Cleanup (½ day).** L1, L2, M7; delete `requiredText`/`minSlots` or start using them;
consider collapsing the two renderers once the fallback is rare.

**Verification harness (build during Step 0, use throughout):** a script that, for a given template
URL, renders both the reference and the generated page at 1280 px, and reports section count/order
delta, CTA count delta, dominant-colour delta, heading typeface class delta, and mean section padding
delta. That single number is how you tell whether any of this worked.

---

## 12. Final Summary

### Current architecture

A two-phase system. **Phase A** derives a *reusable template* from the reference once per
`(url, mode)` — Opus writes CSS + markup with `{{COPY:…}}` slots and system placeholders, validated
mechanically and then visually, and stored globally in `landing_layouts`. **Phase B** runs per book —
Sonnet fills the slots from the book’s strategy and chapters, a cover-derived palette supplies the
colours, and `GeneratedPageAssembler` substitutes real markup for money, links, covers and legal
text. If Phase A ever fails, the system silently renders a completely different hand-written page.

The *architecture* is sound. The security model, the placeholder discipline, the contrast guarantees
and the no-fabricated-claims rules are genuinely good work. The failure is entirely in **what the
system measures about the template before it starts writing.**

### Main bottlenecks

1. The template digest is nine scalar values and a 34 KB DOM string. Everything a designer would look
   at — spacing, type scale, breakpoints, radius, shadow, per-section grounds — is never captured.
2. Four of those nine scalars are computed by regexes that fail on `var(--token)` — i.e. they fail on
   the client’s own template, measurably.
3. The screenshots that are supposed to compensate cover ~40 % of the page.
4. A global, unversioned layout cache means one bad derivation is permanent and every fix is invisible.

### Root causes of the reported symptoms

| Symptom | Root cause |
|---|---|
| “Doesn’t closely resemble the template” | No spacing/type measurement (§4) + 40 % screenshot coverage (§2.4) + a prompt that supplies its own competing numbers (§3.2) |
| “Colours are sometimes incorrect” | One histogram bin, hue-only; `accentSeed` dead; reference light/dark polarity ignored (§5) |
| “Sections missing or rearranged” | The unseen 60 % of the page; a 36 k DOM cap at 94 % utilisation with silent tail truncation; the built-in fallback, which drops the template entirely and always ships `templateSections: []` (§8 #3, #5, #6) |
| “Typography differs” | `var(--font-display)` is unresolvable by the detector → “sans-serif” + “Fira Sans” for a DM Serif Display template; then that wrong answer overrides the model’s (§4.1) |
| “Spacing differs / hierarchy differs” | Zero spacing extraction; prompt asserts `~90px`, `680-1080px`, `3:2`, `10-12px` regardless of the template (§3.2) |
| “Some CTAs missing / not using the checkout URL” | No minimum CTA count; the offer-grid exclusion rule strips CTAs from that section; no post-assembly href validation (§7.2) |
| “Feels AI-generated” | The sum of the above — with no measurements, the model is filling in a plausible sales page rather than reproducing a specific one |

### Estimated impact of each fix

| Fix | Effort | Expected fidelity gain |
|---|---|---|
| C1 `var()` resolution | 1–2 d | **Large** — correct typeface class and measure on every modern template |
| C2 measured computed style | 3–4 d | **Largest single gain** — spacing, type scale, grounds, breakpoints |
| C3 drop invented numbers | 2 h | **Large** — removes the competing spec |
| C4 + C5 cache versioning/scoping | ½ d | **Enabling** — without it, nothing above ships |
| H1 full-page contiguous screenshots | ½ d | **Large** — 40 % → 100 % coverage |
| H2 raise DOM budget | 2 h | Medium (prevents a latent cliff) |
| H3 thinking + effort | 2 h | Medium |
| H4 assembled-page validation | 2 d | Medium — converts silent defects into reported ones |
| H7 graceful degradation | 1–2 d | Medium — removes the worst-case output |
| M1 + M2 colour | 1–2 d | Medium — fixes the palette complaints |
| H5 escape slots | 15 min | Small but eliminates a correctness hole |

**If only three things are done:** C1 + C2 + C3, behind C4. Those four together address every one of
the reported symptoms except the colour ones, and they are the difference between a model *inventing*
a sales page in the reference’s general spirit and a model *reproducing* a measured one.
