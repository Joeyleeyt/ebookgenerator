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

    const body = fillPlaceholders(page.bodyHtml, {
      cta: ctaMarkup(primary, model),
      price: priceMarkup(primary, model),
      cover: coverMarkup(primary),
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
  /* A generated layout must never scroll the page sideways. */
  body, main { overflow-x: hidden; }
  table { max-width: 100%; }

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
    return `<span class="cta" aria-disabled="true">${text}</span><span class="cta-note">Checkout link not set yet.</span>`;
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
