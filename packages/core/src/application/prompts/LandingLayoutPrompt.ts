import { PALETTE_VARS, PLACEHOLDERS } from '../landing/pageContract.js';
import type { LandingCopy } from '../../domain/landing/LandingPage.js';
import type { ReferencePage } from '../ports/services/ReferencePageFetcher.js';

/**
 * The layout call: arrange already-approved copy into a page shaped after the
 * reference site the client nominated for this book.
 *
 * This is deliberately a SECOND call, after the copy has been written and
 * schema-validated. Splitting them means a layout retry re-arranges the page
 * without re-authoring the claims on it, and the copy rules (no invented
 * testimonials, ratings or savings figures) are enforced once, upstream, rather
 * than repeated in a prompt that is mostly about markup.
 */
export const LandingLayoutPrompt = {
  build(input: {
    reference: ReferencePage | null;
    copy: LandingCopy;
    bookTitle: string;
    pageCount: number | null;
    /** Errors from the previous attempt, when this is the repair round. */
    repairErrors?: string[];
  }) {
    const system = [
      'You build single-page sales sites. You return ONLY JSON with exactly two keys:',
      '  css      — the page stylesheet, no <style> tag',
      '  bodyHtml — the page markup, no <html>, <head>, <body> or <style> tags',
      '',
      'YOU WRITE LAYOUT, NOT CONTENT AND NOT VALUES.',
      '',
      'PLACEHOLDERS. Position these exactly as written; the system substitutes real',
      'markup for them afterwards. Never write a price, a link or an image yourself.',
      `  ${PLACEHOLDERS.cta}      the buy button (its label already ENDS with the price) — use 2-3 times`,
      `  ${PLACEHOLDERS.price}          a standalone price block with strike-through and savings chip.`,
      '                        NEVER put it right next to the button — the price would show twice.',
      '                        Use it once, in the order section, above the button.',
      `  ${PLACEHOLDERS.cover}          the book cover image — once, twice at most`,
      `  ${PLACEHOLDERS.contents}       the chapter breakdown list`,
      `  ${PLACEHOLDERS.guarantee}      the guarantee panel (omit if not wanted)`,
      `  ${PLACEHOLDERS.paymentMarks}   payment marks, near a buy button`,
      `  ${PLACEHOLDERS.testimonials}   reader quotes — may render to nothing, so never`,
      '                        put a heading inside a section that has only this',
      `  ${PLACEHOLDERS.legal}   the footer disclaimer — exactly once, in the footer`,
      '',
      'The substituted markup arrives PRE-STYLED by a system stylesheet loaded before',
      'yours, under these selectors: .cta, .cta-note, .price-row/.price/.price-was/.save,',
      '.pay, .guarantee, .contents/.contents-item/.contents-count, .testimonials, .legal.',
      'They already look right; restyle them only to match the reference (your CSS wins).',
      '',
      'THERE IS EXACTLY ONE PRODUCT — this book. Do not invent editions, tiers,',
      'bundles or a "choose your level" grid. If the reference sells several products,',
      'adapt its layout to selling ONE: a single offer card, stated once, repeated as',
      'a closing call to action.',
      '',
      'REQUIRED SECTIONS. Mark them so the structure can be checked:',
      '  <section data-section="hero">   <section data-section="inside">',
      '  <section data-section="order">  <section data-section="faq">',
      'Add as many further sections as the reference calls for; give each its own',
      'descriptive data-section value.',
      '',
      'COLOUR. Use ONLY these CSS variables — they are derived from this book\'s own',
      'cover and their contrast is already proven. Any raw colour is rejected:',
      `  ${PALETTE_VARS.join(', ')}`,
      '  --deep / --on-deep are a dark band and its text; --tint is a subtle band.',
      '  For shadows and scrims only, rgba(0,0,0,x) and rgba(255,255,255,x) are allowed.',
      '  Your own non-colour variables are fine if prefixed --x-.',
      '',
      'HARD LIMITS. The page is deployed as one static file and must render offline:',
      '  no <script>, no <iframe>, <object>, <embed>, <form> or form controls',
      '  no on* attributes, no javascript: URLs',
      '  no external URLs anywhere, no @import, no remote url() — system font stacks only',
      '  close every tag; unbalanced markup is rejected',
      '',
      'COPY. The prose below is final and approved. Place it verbatim — do not',
      'rewrite, shorten, extend or "improve" a single sentence, and do not invent',
      'any new claim, statistic, review, rating or subscriber count. You may choose',
      'the order of sections and which copy goes where.',
      '',
      'TOP BAR. If the page has a sticky bar, build it like a professional brand',
      'header, not a text row:',
      '  - a single slim row, vertically centered, padding-block 10-12px',
      '  - brand block on the left: the book title set in a SANS-SERIF stack even on',
      '    a serif page, uppercase, ~0.8rem, letter-spacing .12-.18em, one line with',
      '    a CSS ellipsis — never wrapping. Beneath it, optionally, the author as a',
      '    tiny byline (~0.62rem, letter-spacing .2em, uppercase, muted)',
      `  - ${PLACEHOLDERS.cta} on the right, nothing else beside it`,
      '  - optionally a separate 1-line announcement strip ABOVE it with a short',
      '    plain-text offer line such as "Instant download · 30-day money-back',
      '    guarantee" — never a price, the button already carries the price',
      '',
      'SCROLL ANIMATION. The system animates the page as the reader scrolls: every',
      '<section> fades and rises when it enters the viewport, automatically. Add the',
      'class "stagger" to any grid or list whose CHILDREN should arrive one after',
      'another (feature cards, pain-point cards, comparison columns, FAQ items), and',
      '"reveal" to a standalone block that should animate on its own (the offer',
      'card). Do not write your own animation CSS or keyframes.',
      '',
      'SIZE. Keep the stylesheet under 10,000 characters and the markup lean — no',
      'repeated rule blocks, no per-section copies of the same card styles. A',
      'response that exceeds the output limit is cut off mid-JSON and rejected.',
      '',
      'RESPONSIVE. Mobile first; the page must not scroll sideways at 360px. Any',
      'table or wide block gets its own overflow-x: auto container.',
      'Respect @media (prefers-reduced-motion: reduce).',
    ].join('\n');

    const reference = input.reference
      ? [
          '=== REFERENCE PAGE — MATCH THIS ===',
          `Source: ${input.reference.url}`,
          `Title: ${input.reference.title}`,
          '',
          'Observed treatment:',
          `  headings: ${input.reference.style.serifHeadings ? 'serif' : 'sans-serif'}`,
          input.reference.style.headingFont
            ? `  display typeface: "${input.reference.style.headingFont}" — you cannot load fonts, so pick the` +
              ' SYSTEM stack closest in character (a high-contrast serif → Georgia/"Iowan Old Style"; a geometric' +
              ' sans → "Avenir Next"/"Century Gothic"/"Helvetica Neue"; a grotesque → "Helvetica Neue"/Arial)' +
              ' and echo its feel with weight, letter-spacing and case'
            : '',
          `  section numbering: ${input.reference.style.numberedSections ? 'yes — number the sections the same way' : 'no'}`,
          `  content column: ${input.reference.style.measurePx ? `${input.reference.style.measurePx}px` : 'unspecified'}`,
          `  imagery: ${input.reference.style.imageDensity < 1 ? 'text-led, very few images' : input.reference.style.imageDensity < 4 ? 'balanced' : 'image-led'}`,
          `  distinct section grounds: ${input.reference.style.grounds.length}`,
          '',
          'Its section headings, in order — mirror this sequence and this density:',
          input.reference.headings.map((h) => `  ${'  '.repeat(Math.max(0, h.level - 1))}h${h.level}: ${h.text}`).join('\n'),
          '',
          'Its page text, for tone of structure (NOT for copying words — the copy for',
          'this book is given separately and is the only prose you may use):',
          input.reference.text.slice(0, 6000),
          '',
          'Reproduce this page\'s STRUCTURE, section order, typographic feel and density',
          'for our book. Do not reproduce its words, its prices, its claims, its',
          'testimonials or its statistics.',
          '',
          'COMPONENT FIDELITY — copy the reference at the component level, not just the',
          'section level. Where its text suggests card grids, give cards the same feel:',
          'radius, borders, an icon at the top. You may draw SMALL inline SVG icons',
          '(viewBox="0 0 24 24", stroke="currentColor", fill="none", 2-4 simple shapes,',
          'sized ~28px, coloured via the accent variable) — receipts, carts, wrenches,',
          'planes, shields. Statistics quoted in the copy belong in a bordered callout',
          'with the key figure emphasised. FAQ entries are individual rounded cards, not',
          'bare rules, when the reference styles them that way. Eyebrow labels, big',
          'display headings, generous card padding — match the reference\'s scale.',
        ].join('\n')
      : [
          '=== NO REFERENCE PAGE ===',
          'Build a conventional long-form sales page: hero with the cover, the problem,',
          'what is inside, who it is for, the author, the order block, questions, and a',
          'closing call to action.',
        ].join('\n');

    const copy = [
      '=== THE BOOK ===',
      `Title: ${input.bookTitle}`,
      input.pageCount ? `Length: ${input.pageCount} pages` : '',
      '',
      '=== APPROVED COPY — place verbatim ===',
      JSON.stringify(input.copy, null, 2),
    ]
      .filter(Boolean)
      .join('\n');

    const repair =
      input.repairErrors && input.repairErrors.length > 0
        ? [
            '',
            '=== YOUR PREVIOUS ATTEMPT WAS REJECTED ===',
            'Fix every one of these and return the corrected page. Change nothing else:',
            ...input.repairErrors.map((e) => `  - ${e}`),
          ].join('\n')
        : '';

    return { system, user: `${reference}\n\n${copy}${repair}` };
  },
};
