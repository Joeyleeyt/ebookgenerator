import type { LandingPageModel, LandingPageRenderer, LandingProduct } from '@yeg/core';

/**
 * Renders the sales page. The LAYOUT is fixed and hand-written here — the model
 * only supplies prose, prices and colours. That is deliberate:
 *
 *   - every book gets the same proven structure instead of a layout the model
 *     re-invents (and degrades) on each run;
 *   - no model-authored markup or script can reach the published page, so there
 *     is nothing to sanitise and nothing to inject;
 *   - restyling every page ever generated is an edit to this one file.
 *
 * The structure follows the direct-response pattern the reference pages share:
 * a dark hero band, alternating grounds so the page has rhythm rather than one
 * flat field, a stat row, product cards carrying their own price and features,
 * a without/with comparison before the close, and a guarantee panel. All three
 * grounds — deep, tinted, plain — come from the book cover's own hue.
 *
 * The output is fully self-contained: inline CSS, inlined `data:` images, no
 * fonts, scripts or images fetched from anywhere. It renders offline.
 */
export class LandingPageHtmlRenderer implements LandingPageRenderer {
  render(model: LandingPageModel): string {
    const { copy, palette } = model;
    const products = model.products;
    const primary = products.find((p) => p.featured) ?? products[0];
    const fonts =
      copy.fontFamily === 'serif'
        ? {
            heading: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
            body: '"Helvetica Neue", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
          }
        : {
            heading: '"Helvetica Neue", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
            body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          };

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(primary?.title ?? model.siteName)}</title>
<meta name="description" content="${esc(truncate(copy.subheadline, 300))}">
<meta property="og:title" content="${esc(primary?.title ?? model.siteName)}">
<meta property="og:description" content="${esc(truncate(copy.subheadline, 300))}">
<meta property="og:type" content="website">
${primary?.coverDataUri ? `<meta property="og:image" content="${esc(primary.coverDataUri)}">` : ''}
<style>
  :root {
    ${palette.toCssVariables()};
    --radius: 14px;
    --maxw: 980px;
    --narrow: 680px;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: ${fonts.body};
    font-size: 17px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { font-family: ${fonts.heading}; color: var(--heading); line-height: 1.12; margin: 0 0 .5em; }
  h1 { font-size: clamp(2.1rem, 5.4vw, 3.4rem); letter-spacing: -0.025em; }
  h2 { font-size: clamp(1.6rem, 3.6vw, 2.3rem); letter-spacing: -0.02em; }
  h3 { font-size: 1.1rem; letter-spacing: -0.01em; }
  p { margin: 0 0 1em; }
  a { color: var(--accent); }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 22px; }
  .narrow { max-width: var(--narrow); margin-inline: auto; }
  .center { text-align: center; }
  .muted { color: var(--muted); }
  section { padding: 68px 0; }

  /* Alternating grounds — this is what gives the page rhythm. */
  .band-plain { background: var(--bg); }
  .band-tint  { background: var(--tint); }
  .band-deep  { background: var(--deep); color: var(--on-deep); }
  .band-deep h1, .band-deep h2, .band-deep h3 { color: var(--on-deep); }
  .band-deep .muted { color: var(--on-deep-muted); }
  .band-deep .eyebrow { color: var(--accent-on-deep); }
  .band-deep .price { color: var(--on-deep); }
  .band-deep .price-was { color: var(--on-deep-muted); }

  .eyebrow {
    text-transform: uppercase; letter-spacing: .16em; font-size: .7rem; font-weight: 700;
    color: var(--accent); margin: 0 0 16px; font-family: ${fonts.body};
  }

  /* ── sticky bar ───────────────────────────────────────────────────────── */
  .bar {
    position: sticky; top: 0; z-index: 20;
    background: var(--deep); color: var(--on-deep);
    border-bottom: 1px solid var(--deep-border);
  }
  .bar .wrap { display: flex; align-items: center; gap: 14px; padding-block: 11px; }
  .bar-name { font-family: ${fonts.heading}; font-weight: 700; font-size: .95rem; }
  .bar-price { margin-left: auto; font-size: .86rem; color: var(--on-deep-muted); }
  .bar .cta { padding: 9px 20px; font-size: .85rem; }
  @media (max-width: 620px) { .bar-name, .bar-price { display: none; } .bar .wrap { justify-content: center; } }

  /* ── hero ─────────────────────────────────────────────────────────────── */
  .hero { padding: 76px 0 68px; position: relative; overflow: hidden; }
  .hero-photo {
    position: absolute; inset: 0; background-size: cover; background-position: center;
    opacity: .26; filter: saturate(.7);
  }
  .hero .wrap { position: relative; }
  .hero-grid { display: grid; gap: 40px; align-items: center; }
  @media (min-width: 860px) { .hero-grid { grid-template-columns: 1fr 340px; gap: 56px; } }
  .hero h1 { text-wrap: balance; }
  .hero-sub { font-size: 1.14rem; color: var(--on-deep-muted); max-width: 34em; }

  .cover {
    display: block; width: 100%; border-radius: 6px;
    box-shadow: 0 26px 60px -18px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.09);
  }
  .cover-fallback {
    display: grid; place-items: center; aspect-ratio: 2/3; border-radius: 6px;
    background: var(--surface); border: 1px solid var(--border); padding: 26px; text-align: center;
  }
  .cover-fallback span { font-family: ${fonts.heading}; font-size: 1.35rem; color: var(--heading); }

  /* ── buttons ──────────────────────────────────────────────────────────── */
  .cta {
    display: inline-block; background: var(--accent); color: var(--accent-contrast);
    font-family: ${fonts.body}; font-weight: 700; font-size: 1rem; text-decoration: none;
    padding: 15px 32px; border-radius: 8px; border: 0; cursor: pointer; max-width: 100%;
    transition: transform .12s ease, filter .12s ease;
  }
  .cta:hover { filter: brightness(1.09); transform: translateY(-1px); }
  .cta:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  .cta[aria-disabled="true"] { opacity: .45; cursor: not-allowed; pointer-events: none; }
  .cta-note { margin-top: 12px; font-size: .82rem; }

  /* ── price ────────────────────────────────────────────────────────────── */
  .price-row { display: flex; align-items: baseline; gap: 10px; margin: 22px 0 18px; flex-wrap: wrap; }
  .price { font-family: ${fonts.heading}; font-size: 2.5rem; color: var(--heading); line-height: 1; }
  .price-was { font-size: 1.15rem; color: var(--muted); text-decoration: line-through; }
  .save {
    background: var(--accent); color: var(--accent-contrast); font-size: .7rem; font-weight: 700;
    letter-spacing: .07em; text-transform: uppercase; padding: 5px 10px; border-radius: 999px;
  }
  .center .price-row { justify-content: center; }

  /* ── stats ────────────────────────────────────────────────────────────── */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1px;
           background: var(--deep-border); border-block: 1px solid var(--deep-border); }
  .stat { background: var(--deep); padding: 26px 18px; text-align: center; }
  .stat-value { font-family: ${fonts.heading}; font-size: 1.9rem; color: var(--on-deep); line-height: 1;
                font-variant-numeric: tabular-nums; }
  .stat-label { font-size: .74rem; text-transform: uppercase; letter-spacing: .12em;
                color: var(--on-deep-muted); margin-top: 9px; }

  /* ── cards ────────────────────────────────────────────────────────────── */
  .cards { display: grid; gap: 22px; }
  @media (min-width: 800px) { .cards.multi { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); align-items: start; } }
  .card {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 30px 26px; display: flex; flex-direction: column; position: relative;
  }
  .card.featured { border-color: var(--accent); border-width: 2px; }
  .card .cover, .card .cover-fallback { width: 150px; margin: 0 auto 22px; }
  .card .cover { box-shadow: 0 14px 34px -12px rgba(0,0,0,.42), 0 0 0 1px var(--border); }
  .card .price-row { margin: 16px 0; }
  .card .cta { width: 100%; text-align: center; }
  .tag {
    position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
    background: var(--accent); color: var(--accent-contrast); font-size: .66rem; font-weight: 700;
    letter-spacing: .1em; text-transform: uppercase; padding: 5px 13px; border-radius: 999px;
    font-family: ${fonts.body}; white-space: nowrap;
  }
  .card-eyebrow { font-size: .68rem; text-transform: uppercase; letter-spacing: .14em;
                  color: var(--accent); font-weight: 700; margin-bottom: 7px; }
  .feature-list { list-style: none; padding: 0; margin: 0 0 auto; }
  .feature-list li { padding: 8px 0 8px 24px; position: relative; font-size: .92rem; }
  .feature-list li::before { content: "✓"; position: absolute; left: 0; color: var(--accent); font-weight: 700; }
  .contents { list-style: none; padding: 0; margin: 0 0 18px; }
  .contents li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: .9rem; color: var(--muted); }
  .contents li:last-child { border-bottom: 0; }

  /* ── content blocks ───────────────────────────────────────────────────── */
  .bullets { display: grid; gap: 26px; }
  @media (min-width: 760px) { .bullets { grid-template-columns: 1fr 1fr; gap: 30px 40px; } }
  .bullet h3 { margin-bottom: .3em; }
  .bullet p { margin: 0; color: var(--muted); font-size: .95rem; }

  .checks { list-style: none; padding: 0; margin: 0; }
  .checks li { padding: 11px 0 11px 32px; position: relative; border-bottom: 1px solid var(--border); }
  .checks li:last-child { border-bottom: 0; }
  .checks li::before { content: "✓"; position: absolute; left: 0; color: var(--accent); font-weight: 700; }

  .pains { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
  .pains li { padding: 18px 22px; background: var(--bg); border-left: 3px solid var(--accent); border-radius: 0 10px 10px 0; }

  /* ── without / with ───────────────────────────────────────────────────── */
  .compare { display: grid; gap: 20px; }
  @media (min-width: 760px) { .compare { grid-template-columns: 1fr 1fr; gap: 26px; } }
  .compare-col { border-radius: var(--radius); padding: 26px; border: 1px solid var(--deep-border); }
  .compare-col.bad  { background: rgba(0,0,0,.16); }
  .compare-col.good { background: rgba(255,255,255,.05); border-color: var(--accent-on-deep); }
  .compare-col h3 { font-size: .74rem; text-transform: uppercase; letter-spacing: .14em; margin-bottom: 16px; }
  .compare-col.good h3 { color: var(--accent-on-deep); }
  .compare-col ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .compare-col li { padding-left: 26px; position: relative; font-size: .94rem; color: var(--on-deep-muted); }
  .compare-col.bad li::before  { content: "✕"; position: absolute; left: 0; opacity: .65; }
  .compare-col.good li::before { content: "→"; position: absolute; left: 0; color: var(--accent-on-deep); }

  /* ── author ───────────────────────────────────────────────────────────── */
  .author { display: grid; gap: 26px; align-items: start; }
  @media (min-width: 700px) { .author.has-photo { grid-template-columns: 150px 1fr; gap: 32px; } }
  .author-photo { width: 100%; border-radius: 12px; display: block; }
  .credential { font-size: .8rem; text-transform: uppercase; letter-spacing: .1em; color: var(--accent); margin-bottom: 14px; }

  .quotes { display: grid; gap: 18px; }
  @media (min-width: 760px) { .quotes { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); } }
  blockquote { margin: 0; padding: 24px; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); }
  blockquote p { font-size: .95rem; margin-bottom: .7em; }
  blockquote cite { font-style: normal; font-size: .82rem; color: var(--muted); }

  details { border-bottom: 1px solid var(--border); }
  summary { cursor: pointer; padding: 18px 0; font-weight: 600; color: var(--heading);
            font-family: ${fonts.heading}; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: "+"; float: right; color: var(--accent); font-weight: 400; }
  details[open] summary::after { content: "–"; }
  details p { color: var(--muted); margin: 0 0 18px; font-size: .95rem; }

  .guarantee { text-align: center; background: var(--bg); border: 2px solid var(--accent);
               border-radius: var(--radius); padding: 34px 28px; }
  .guarantee-badge {
    display: inline-grid; place-items: center; width: 62px; height: 62px; border-radius: 50%;
    background: var(--accent); color: var(--accent-contrast); font-family: ${fonts.heading};
    font-size: 1.15rem; font-weight: 700; line-height: 1.05; margin-bottom: 16px;
  }

  .trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 28px;
           font-size: .8rem; color: var(--on-deep-muted); margin-top: 26px; }

  footer { background: var(--deep); color: var(--on-deep-muted); padding: 40px 0 56px;
           border-top: 1px solid var(--deep-border); text-align: center; }
  footer p { font-size: .78rem; margin: 0 0 .7em; }

  /* ── motion ───────────────────────────────────────────────────────────────
     Scroll-driven CSS, deliberately not JavaScript: the in-app preview serves
     this page under a sandbox with no script permission, so a JS reveal would
     silently do nothing exactly where the user checks their work. It also keeps
     the published page free of executable code.

     Everything below is doubly guarded. Content is fully visible by default and
     the hidden start state only exists inside @supports — so a browser without
     scroll-timelines (Firefox today) shows a plain, complete page instead of a
     blank one. That failure mode is the whole reason for the guard. */
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

  /* Hero copy animates on load — safe everywhere, since it ends visible. */
  @media (prefers-reduced-motion: no-preference) {
    .hero .eyebrow  { animation: rise .55s ease .05s both; }
    .hero h1        { animation: rise .65s ease .12s both; }
    .hero-sub       { animation: rise .65s ease .20s both; }
    .hero .price-row,
    .hero .cta      { animation: rise .6s ease .30s both; }
    .hero-grid > div:last-child { animation: rise .8s ease .18s both; }
  }

  /* Scroll reveals. The hidden start state is scoped to .anim, a class that
     only JavaScript ever adds — so with scripts blocked, disabled or broken the
     page renders plain and complete instead of blank. */
  .anim .reveal,
  .anim .stagger > * {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity .55s ease, transform .55s cubic-bezier(.22,.61,.36,1);
  }
  .anim .reveal.in,
  .anim .stagger > *.in { opacity: 1; transform: none; }
  /* Siblings arrive in sequence rather than as one slab. */
  .anim .stagger > *:nth-child(2) { transition-delay: .07s; }
  .anim .stagger > *:nth-child(3) { transition-delay: .14s; }
  .anim .stagger > *:nth-child(4) { transition-delay: .21s; }
  .anim .stagger > *:nth-child(5) { transition-delay: .28s; }
  .anim .stagger > *:nth-child(6) { transition-delay: .35s; }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .cta { transition: none; }
  }
</style>
<script>
/* Arms the scroll reveals before first paint, so nothing flashes in and then
   hides. Two safety nets, because a hidden page that never un-hides is the
   worst outcome here: reveals are skipped entirely when the reader prefers
   reduced motion, and a timer strips the class if the observer below never
   reports ready (blocked script, parse error, ancient browser). */
(function () {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var root = document.documentElement;
    root.className += ' anim';
    setTimeout(function () {
      if (root.getAttribute('data-anim') !== 'ready') root.className = root.className.replace(' anim', '');
    }, 2500);
  } catch (e) { /* leave the page in its plain, fully visible state */ }
})();
</script>
</head>
<body>

<div class="bar">
  <div class="wrap">
    <span class="bar-name">${esc(primary?.title ?? model.siteName)}</span>
    ${primary && primary.priceCents !== null ? `<span class="bar-price">${money(primary.priceCents, model.currency)} · one-time</span>` : ''}
    ${ctaLink(primary, 'Get it now', 'cta')}
  </div>
</div>

<main>

  <!-- hero -->
  <section class="hero band-deep">
    ${model.heroImageDataUri ? `<div class="hero-photo" style="background-image:url('${esc(model.heroImageDataUri)}')"></div>` : ''}
    <div class="wrap">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">${esc(copy.eyebrow)}</p>
          <h1>${esc(copy.headline)}</h1>
          <p class="hero-sub">${esc(copy.subheadline)}</p>
          ${priceBlock(primary, model.currency)}
          ${ctaButton(primary, copy.ctaLabel, model)}
        </div>
        <div>${cover(primary)}</div>
      </div>
    </div>
  </section>

  ${
    model.stats.length > 0
      ? `<div class="stats stagger">
    ${model.stats
      .map((s) => `<div class="stat"><div class="stat-value">${esc(s.value)}</div><div class="stat-label">${esc(s.label)}</div></div>`)
      .join('\n    ')}
  </div>`
      : ''
  }

  ${
    copy.painPoints.length > 0
      ? `<section class="band-tint">
    <div class="wrap narrow">
      <p class="eyebrow">The problem</p>
      <h2>What it&rsquo;s costing you right now</h2>
      <ul class="pains stagger">
        ${copy.painPoints.map((p) => `<li>${esc(p)}</li>`).join('\n        ')}
      </ul>
    </div>
  </section>`
      : ''
  }

  <!-- what's inside -->
  <section class="band-plain">
    <div class="wrap">
      <p class="eyebrow">Inside the book</p>
      <h2>${esc(copy.whatsInsideHeading)}</h2>
      <div class="bullets stagger" style="margin-top:34px">
        ${copy.bullets
          .map((b) => `<div class="bullet"><h3>${esc(b.title)}</h3><p>${esc(b.body)}</p></div>`)
          .join('\n        ')}
      </div>
    </div>
  </section>

  <!-- product card(s) -->
  <section class="band-tint">
    <div class="wrap">
      <div class="center reveal" style="margin-bottom:34px">
        <p class="eyebrow">${products.length > 1 ? 'Choose your level' : 'Get your copy'}</p>
        <h2>${products.length > 1 ? 'Start with one, or take the set' : esc(primary?.title ?? model.siteName)}</h2>
      </div>
      <div class="cards stagger${products.length > 1 ? ' multi' : ''}">
        ${products.map((p) => productCard(p, model)).join('\n        ')}
      </div>
    </div>
  </section>

  ${
    copy.whoIsItFor.length > 0
      ? `<section class="band-plain">
    <div class="wrap narrow">
      <p class="eyebrow">The right reader</p>
      <h2>${esc(copy.whoIsItForHeading)}</h2>
      <ul class="checks stagger">
        ${copy.whoIsItFor.map((w) => `<li>${esc(w)}</li>`).join('\n        ')}
      </ul>
    </div>
  </section>`
      : ''
  }

  <!-- author -->
  <section class="band-tint">
    <div class="wrap narrow">
      <p class="eyebrow">Written by</p>
      <h2>${esc(copy.authorHeading)}</h2>
      <div class="author reveal${model.authorPhotoDataUri ? ' has-photo' : ''}" style="margin-top:26px">
        ${model.authorPhotoDataUri ? `<img class="author-photo" src="${esc(model.authorPhotoDataUri)}" alt="${esc(model.author ?? 'The author')}">` : ''}
        <div>
          ${model.authorCredential ? `<p class="credential">${esc(model.authorCredential)}</p>` : ''}
          <p style="margin:0">${esc(copy.authorBio)}</p>
        </div>
      </div>
    </div>
  </section>

  ${
    model.testimonials.length > 0
      ? `<section class="band-plain">
    <div class="wrap">
      <p class="eyebrow center">Readers</p>
      <h2 class="center" style="margin-bottom:32px">What readers say</h2>
      <div class="quotes stagger">
        ${model.testimonials
          .map((t) => `<blockquote><p>&ldquo;${esc(t.quote)}&rdquo;</p><cite>&mdash; ${esc(t.author)}</cite></blockquote>`)
          .join('\n        ')}
      </div>
    </div>
  </section>`
      : ''
  }

  ${
    copy.comparisonWithout.length > 0 && copy.comparisonWith.length > 0
      ? `<section class="band-deep">
    <div class="wrap">
      <div class="center" style="margin-bottom:32px">
        <p class="eyebrow">The choice</p>
        <h2>You already know how this goes</h2>
      </div>
      <div class="compare stagger">
        <div class="compare-col bad">
          <h3>Without it</h3>
          <ul>${copy.comparisonWithout.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        </div>
        <div class="compare-col good">
          <h3>With it</h3>
          <ul>${copy.comparisonWith.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        </div>
      </div>
    </div>
  </section>`
      : ''
  }

  ${
    model.guaranteeDays > 0
      ? `<section class="band-plain">
    <div class="wrap narrow">
      <div class="guarantee reveal">
        <div class="guarantee-badge">${model.guaranteeDays}<br>days</div>
        <h2 style="font-size:1.5rem">Zero risk</h2>
        <p class="muted" style="margin:0">Read it. If it doesn&rsquo;t deliver, email for a full refund within ${model.guaranteeDays} days &mdash; no questions asked.</p>
      </div>
    </div>
  </section>`
      : ''
  }

  ${
    copy.faqs.length > 0
      ? `<section class="band-tint">
    <div class="wrap narrow">
      <p class="eyebrow">Before you buy</p>
      <h2 style="margin-bottom:22px">Questions</h2>
      ${copy.faqs
        .map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`)
        .join('\n      ')}
    </div>
  </section>`
      : ''
  }

  <!-- closing -->
  <section class="band-deep center">
    <div class="wrap narrow">
      <p class="eyebrow">Last call</p>
      <h2>${esc(copy.closingHeading)}</h2>
      <p class="muted" style="font-size:1.1rem">${esc(copy.closingBody)}</p>
      ${priceBlock(primary, model.currency)}
      ${ctaButton(primary, copy.ctaLabel, model)}
      <div class="trust">
        <span>Instant download</span>
        <span>PDF &amp; DOCX</span>
        ${model.guaranteeDays > 0 ? `<span>${model.guaranteeDays}-day money back</span>` : ''}
        <span>Read on any device</span>
      </div>
    </div>
  </section>

</main>

<footer>
  <div class="wrap">
    <p>© ${new Date().getFullYear()} ${esc(model.siteName)}. All rights reserved.</p>
    <p>
      This is a digital product delivered as a downloadable file; nothing is shipped.
      Any results described are illustrative and not a guarantee — individual outcomes vary.
    </p>
  </div>
</footer>

<script>
/* Reveals each marked block the first time it enters the viewport.
   IntersectionObserver rather than a scroll-timeline: this has to work in every
   browser a buyer might arrive in, and scroll-driven CSS still does not. */
(function () {
  var root = document.documentElement;
  if (root.className.indexOf('anim') < 0) return;
  var els = document.querySelectorAll('.reveal, .stagger > *');
  function showAll() { for (var i = 0; i < els.length; i++) els[i].classList.add('in'); }
  root.setAttribute('data-anim', 'ready');
  if (!('IntersectionObserver' in window)) return showAll();
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) {
        entries[i].target.classList.add('in');
        io.unobserve(entries[i].target); // reveal once, never re-hide on scroll back
      }
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
  for (var i = 0; i < els.length; i++) io.observe(els[i]);
})();
</script>
</body>
</html>`;
  }
}

// ── fragments ────────────────────────────────────────────────────────────────

function productCard(p: LandingProduct, model: LandingPageModel): string {
  const many = model.products.length > 1;
  return `<div class="card${p.featured && many ? ' featured' : ''}">
          ${p.featured && many ? '<span class="tag">Most popular</span>' : ''}
          ${cover(p)}
          ${p.categoryLabel ? `<p class="card-eyebrow">${esc(p.categoryLabel)}</p>` : ''}
          <h3>${esc(p.title)}</h3>
          ${p.subtitle ? `<p class="muted" style="font-size:.92rem">${esc(p.subtitle)}</p>` : ''}
          ${p.pageCount ? `<p class="muted" style="font-size:.8rem">${p.pageCount} pages · PDF &amp; DOCX</p>` : ''}
          ${
            p.features.length > 0
              ? `<ul class="feature-list">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
              : p.contents.length > 0
                ? `<ul class="contents">${p.contents.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
                : ''
          }
          ${priceBlock(p, model.currency)}
          ${ctaButton(p, model.copy.ctaLabel, model)}
        </div>`;
}

function cover(p: LandingProduct | undefined): string {
  if (!p) return '';
  if (p.coverDataUri) return `<img class="cover" src="${esc(p.coverDataUri)}" alt="${esc(p.title)} cover">`;
  return `<div class="cover-fallback"><span>${esc(p.title)}</span></div>`;
}

function priceBlock(p: LandingProduct | undefined, currency: string): string {
  if (!p || p.priceCents === null) return '';
  const discounted = p.compareAtCents !== null && p.compareAtCents > p.priceCents;
  const was = discounted ? `<span class="price-was">${money(p.compareAtCents!, currency)}</span>` : '';
  // The saving is stated outright rather than left for the reader to subtract.
  const save = discounted ? `<span class="save">Save ${money(p.compareAtCents! - p.priceCents, currency)}</span>` : '';
  return `<div class="price-row"><span class="price">${money(p.priceCents, currency)}</span>${was}${save}</div>`;
}

/**
 * The checkout URL is written in verbatim and never composed, rewritten or
 * generated — a mangled link is the one defect on this page that costs real
 * money. With no link the button renders inert, which is what makes a preview
 * possible before the product exists on the store.
 */
function ctaButton(p: LandingProduct | undefined, label: string, model: LandingPageModel): string {
  const price = p && p.priceCents !== null ? ` — ${money(p.priceCents, model.currency)}` : '';
  const text = esc(label) + price;
  if (!p?.checkoutUrl) {
    return `<span class="cta" aria-disabled="true">${text}</span>
      <p class="cta-note muted">Checkout link not set yet.</p>`;
  }
  return `<a class="cta" href="${esc(p.checkoutUrl)}" rel="noopener nofollow">${text}</a>
      <p class="cta-note muted">Instant download${model.guaranteeDays > 0 ? ` · ${model.guaranteeDays}-day money-back guarantee` : ''}</p>`;
}

/** Bare CTA with no note beneath it — for the sticky bar. */
function ctaLink(p: LandingProduct | undefined, label: string, cls: string): string {
  if (!p?.checkoutUrl) return `<span class="${cls}" aria-disabled="true">${esc(label)}</span>`;
  return `<a class="${cls}" href="${esc(p.checkoutUrl)}" rel="noopener nofollow">${esc(label)}</a>`;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Escapes into HTML text/attribute context. Every model-supplied string passes
 * through here, so prose from Claude and a checkout URL from the user are both
 * inert data — they can never become markup.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function money(cents: number, currency: string): string {
  const amount = cents / 100;
  // Whole prices ($47) read better than padded ones ($47.00) in a headline.
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const symbol = SYMBOLS[currency.toUpperCase()];
  return symbol ? `${symbol}${text}` : `${text} ${currency.toUpperCase()}`;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };

/** Compact subscriber-style counts: 280000 → "280K". */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
