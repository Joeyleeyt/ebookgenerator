import {
  PLACEHOLDERS,
  fillPlaceholders,
  type GeneratedPage,
  type LandingPageAssembler,
  type LandingPageModel,
  type LandingProduct,
} from '@yeg/core';
import { ARMING_SCRIPT, OBSERVER_SCRIPT, REVEAL_CSS, esc, money, truncate } from './shared.js';

/**
 * Turns a validated, model-generated layout into the finished page.
 *
 * The model supplied only `css` and `bodyHtml`. Everything with consequences is
 * added here: the document shell, the cover-derived palette variables, the
 * reveal and countdown scripts, and the real markup behind each placeholder —
 * so the checkout link, the price, the cover and the legal footer are ours no
 * matter what the model wrote.
 */
export class GeneratedPageAssembler implements LandingPageAssembler {
  assemble({ page, model }: { page: GeneratedPage; model: LandingPageModel }): string {
    const primary = model.products.find((p) => p.featured) ?? model.products[0];
    const title = primary?.title ?? model.siteName;

    // The cover is a base64 data URI; embedding it once per {{COVER}} would
    // multiply page weight by the occurrence count. The first slot carries the
    // real image; later slots are lightweight copies the page's own script
    // fills from the first (see OBSERVER_SCRIPT).
    const bodyWithCovers = page.bodyHtml
      .split(PLACEHOLDERS.cover)
      .map((part, i) => (i === 0 ? part : `${i === 1 ? coverMarkup(primary) : coverCopyMarkup(primary)}${part}`))
      .join('');

    const body = fillPlaceholders(bodyWithCovers, {
      cta: ctaMarkup(primary, model),
      price: priceMarkup(primary, model),
      cover: '',
      contents: contentsMarkup(primary),
      guarantee: guaranteeMarkup(model),
      paymentMarks: paymentMarkup(model),
      testimonials: testimonialsMarkup(model),
      legal: legalMarkup(model),
    });

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(truncate(model.copy.subheadline, 300))}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(truncate(model.copy.subheadline, 300))}">
<meta property="og:type" content="website">
${primary?.coverDataUri ? `<meta property="og:image" content="${esc(primary.coverDataUri)}">` : ''}
<style>
  /* Palette derived from this book's cover; the generated CSS may only
     reference these, which is what makes its contrast provable. */
  :root {
    ${model.palette.toCssVariables()};
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; height: auto; }
  /* A generated layout must never scroll the page sideways. This must be
     \`clip\`, not \`hidden\`: an element with overflow-x hidden gets overflow-y
     computed to auto, turning body into its own scroll container — which is a
     second vertical scrollbar next to the viewport's. clip clips the axis
     without creating a scroll container at all. */
  body, main { overflow-x: clip; }
  table { max-width: 100%; }

/* ── system components ────────────────────────────────────────────────────
   Baseline styling for the markup substituted into the placeholders. The
   model's layout CSS comes AFTER this block, so it can restyle any of these
   selectors and win — but a layout that never mentions them still renders
   buttons as buttons rather than as bare inline text. */
${COMPONENT_CSS}
/* ── generated layout ─────────────────────────────────────────────────── */
${page.css}
/* ── system behaviour ─────────────────────────────────────────────────── */
${REVEAL_CSS}
</style>
<script>${ARMING_SCRIPT}</script>
</head>
<body>
${body}
<script>${OBSERVER_SCRIPT}</script>
</body>
</html>`;
  }
}

/**
 * Default look of every substituted component, on the palette variables. This
 * is what was missing when the first real generation shipped buy buttons as
 * bare inline text: the injected markup carries classes the model has never
 * heard of, so unless WE style them, nobody does.
 */
const COMPONENT_CSS = `
  .cta {
    display: inline-block; background: var(--accent); color: var(--accent-contrast);
    font-weight: 700; font-size: 1.02rem; text-decoration: none; text-align: center;
    padding: 15px 34px; border-radius: 8px; cursor: pointer; max-width: 100%;
    white-space: nowrap; transition: filter .12s ease;
  }
  .cta:hover { filter: brightness(1.08); }
  .cta:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  /* Not-yet-active keeps the REAL button's look, slightly dimmed — the preview
     should show the page as it will publish, and a dashed ghost reads as a
     different design rather than a pending link. The note below explains why
     it is inert. */
  .cta[aria-disabled="true"] {
    filter: saturate(.7) brightness(.82); cursor: not-allowed; pointer-events: none;
  }
  /* Keeps the explanatory note UNDER its button wherever the button lands —
     in a sticky bar it otherwise wraps beside it as loose text. */
  .cta-wrap { display: inline-flex; flex-direction: column; align-items: center; gap: 6px; max-width: 100%; }
  .cta-note { display: block; font-size: .74rem; color: var(--muted); margin: 0; }

  .price-row { display: inline-flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 14px 0; }
  .price { font-size: 2.2rem; font-weight: 700; color: var(--heading); line-height: 1; }
  .price-was { font-size: 1.1rem; color: var(--muted); text-decoration: line-through; }
  .save {
    background: var(--accent); color: var(--accent-contrast); font-size: .68rem; font-weight: 700;
    letter-spacing: .07em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px;
  }

  .pay { display: inline-flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .pay span { font-size: .72rem; color: var(--muted); border: 1px solid var(--border);
              border-radius: 4px; padding: 4px 9px; }

  .guarantee { border: 2px solid var(--accent); border-radius: 12px; padding: 22px 24px; margin: 10px 0; }

  .contents { display: grid; gap: 20px; }
  .contents-item h3 { margin: 0 0 .2em; color: var(--heading); }
  .contents-count { font-size: .74rem; letter-spacing: .1em; text-transform: uppercase;
                    color: var(--accent); margin: 0 0 6px; }
  .contents-item ul { list-style: none; padding: 0; margin: 0; }
  .contents-item li { padding: 5px 0 5px 18px; position: relative; color: var(--muted); font-size: .94rem; }
  .contents-item li::before { content: "·"; position: absolute; left: 4px; color: var(--accent); }

  .testimonials { display: grid; gap: 16px; }
  .testimonials blockquote { margin: 0; padding: 18px 20px; border-left: 3px solid var(--accent);
                             background: var(--surface); border-radius: 0 10px 10px 0; }
  .testimonials cite { font-style: normal; font-size: .84rem; color: var(--muted); }

  .cover-fallback { display: grid; place-items: center; aspect-ratio: 2/3; width: min(230px, 60vw);
                    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
                    padding: 22px; text-align: center; font-weight: 700; color: var(--heading); }

  .legal p { font-size: .76rem; color: var(--muted); margin: 0 0 .6em; }
  .legal .edition { letter-spacing: .2em; text-transform: uppercase; font-size: .72rem; }
`;

// ── placeholder markup ───────────────────────────────────────────────────────

/**
 * The checkout URL is written in verbatim and never composed, rewritten or
 * generated — a mangled link is the one defect on this page that costs real
 * money. With no link the button renders inert, which is what makes a preview
 * possible before the product exists on the store.
 */
function ctaMarkup(p: LandingProduct | undefined, model: LandingPageModel): string {
  const price = p && p.priceCents !== null ? ` — ${money(p.priceCents, model.currency)}` : '';
  const text = esc(model.copy.ctaLabel) + price;
  if (!p?.checkoutUrl) {
    return `<span class="cta-wrap"><span class="cta" aria-disabled="true">${text}</span><span class="cta-note">Checkout link not set yet</span></span>`;
  }
  return `<a class="cta" href="${esc(p.checkoutUrl)}" rel="noopener nofollow">${text}</a>`;
}

function priceMarkup(p: LandingProduct | undefined, model: LandingPageModel): string {
  if (!p || p.priceCents === null) return '';
  const discounted = p.compareAtCents !== null && p.compareAtCents > p.priceCents;
  return (
    `<span class="price-row"><span class="price">${money(p.priceCents, model.currency)}</span>` +
    (discounted ? `<span class="price-was">${money(p.compareAtCents!, model.currency)}</span>` : '') +
    (discounted
      ? `<span class="save">Save ${money(p.compareAtCents! - p.priceCents, model.currency)}</span>`
      : '') +
    '</span>'
  );
}

/** A later cover slot: no data URI of its own; the page script fills it. */
function coverCopyMarkup(p: LandingProduct | undefined): string {
  if (!p) return '';
  if (p.coverDataUri) return `<img class="cover" data-cover-copy alt="${esc(p.title)} cover">`;
  return `<span class="cover cover-fallback">${esc(p.title)}</span>`;
}

function coverMarkup(p: LandingProduct | undefined): string {
  if (!p) return '';
  if (p.coverDataUri) return `<img class="cover" src="${esc(p.coverDataUri)}" alt="${esc(p.title)} cover">`;
  return `<span class="cover cover-fallback">${esc(p.title)}</span>`;
}

function contentsMarkup(p: LandingProduct | undefined): string {
  const sections = p?.sections ?? [];
  if (sections.length === 0) return '';
  return `<div class="contents stagger">${sections
    .map(
      (s) =>
        `<div class="contents-item"><h3>${esc(s.title)}</h3>` +
        (s.items.length > 0
          ? `<p class="contents-count">${s.items.length} ${s.items.length === 1 ? 'method' : 'methods'}</p>` +
            `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
          : '') +
        '</div>',
    )
    .join('')}</div>`;
}

function guaranteeMarkup(model: LandingPageModel): string {
  if (model.guaranteeDays <= 0) return '';
  return (
    `<div class="guarantee"><strong>${model.guaranteeDays}-day money-back guarantee.</strong> ` +
    `Read it. If it doesn't deliver, email for a full refund within ${model.guaranteeDays} days — no questions asked.</div>`
  );
}

function paymentMarks(model: LandingPageModel): string[] {
  return model.paymentMethods;
}

function paymentMarkup(model: LandingPageModel): string {
  const marks = paymentMarks(model);
  if (marks.length === 0) return '';
  return `<span class="pay">${marks.map((m) => `<span>${esc(m)}</span>`).join('')}</span>`;
}

/** Only ever real quotes the seller supplied; never generated. */
function testimonialsMarkup(model: LandingPageModel): string {
  if (model.testimonials.length === 0) return '';
  return `<div class="testimonials stagger">${model.testimonials
    .map(
      (t) =>
        `<blockquote><p>&ldquo;${esc(t.quote)}&rdquo;</p><cite>&mdash; ${esc(t.author)}</cite></blockquote>`,
    )
    .join('')}</div>`;
}

/**
 * The disclaimer is substituted rather than written by the model, so it is
 * present and correct on every generated page regardless of what layout came
 * back.
 */
function legalMarkup(model: LandingPageModel): string {
  return (
    `<div class="legal">` +
    (model.edition ? `<p class="edition">${esc(model.edition)}</p>` : '') +
    `<p>© ${new Date().getFullYear()} ${esc(model.siteName)}. All rights reserved.</p>` +
    `<p>This is a digital product delivered as a downloadable file; nothing is shipped. ` +
    `Any figures shown are illustrative and not a guarantee — individual results vary.</p>` +
    `</div>`
  );
}

export { PLACEHOLDERS };
