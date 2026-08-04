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
          ...(input.reference.markup
            ? [
                '',
                '=== THE TEMPLATE MARKUP (pruned) ===',
                'This is the reference page\'s actual DOM. Your task is to COPY THIS',
                'TEMPLATE, not to design in its spirit: reproduce its element structure,',
                'section order, spacing and component shapes as faithfully as the rules',
                'allow, translating its styling — including what its utility class names',
                'imply — into your own stylesheet on the palette variables.',
                'Change ONLY these things:',
                '  - the words: swap every piece of its text for the approved copy',
                '  - the colours: express everything through the palette variables',
                '  - images, prices, buy links, guarantees: use the placeholders',
                '  - branding: our book\'s title and author, never theirs',
                'Drop entirely: its scripts, cookie/consent chrome, tracking, and any',
                'section whose content we have no equivalent for (e.g. testimonials when',
                'none are supplied). If it sells several products and we have one, keep',
                'the offer section\'s design but as a single card.',
                '',
                input.reference.markup,
              ]
            : [
                'Its page text, for tone of structure (NOT for copying words — the copy for',
                'this book is given separately and is the only prose you may use):',
                input.reference.text.slice(0, 6000),
              ]),
          '',
          'Do not reproduce the reference\'s words, its prices, its claims, its',
          'testimonials or its statistics — only its design.',
          '',
          // With the actual markup in hand, descriptive craft guidance is
          // redundant and can fight the template - it applies only when the
          // model must work from the digest alone.
          ...(!input.reference.markup
            ? [
            'COMPONENT FIDELITY — copy the reference at the component level, not just the',
            'section level. Where its text suggests card grids, give cards the same feel:',
            'radius, borders, an icon at the top. You may draw SMALL inline SVG icons',
            '(viewBox="0 0 24 24", stroke="currentColor", fill="none", 2-4 simple shapes,',
            'sized ~28px, coloured via the accent variable) — receipts, carts, wrenches,',
            'planes, shields. Statistics quoted in the copy belong in a bordered callout',
            'with the key figure emphasised. FAQ entries are individual rounded cards, not',
            'bare rules, when the reference styles them that way. Eyebrow labels, big',
            'display headings, generous card padding — match the reference\'s scale.',
            '',
            'CRAFT BLUEPRINT — the finish professional direct-response pages share. This',
            'is a quality floor, NOT a design: express every item in the reference\'s own',
            'visual language, and wherever the reference clearly does something different',
            '(no icons, no cards, bare rules instead of pills, a plain text hero), THE',
            'REFERENCE WINS — drop the conflicting item rather than import a foreign style:',
            '  hero: an eyebrow in a small bordered pill; the headline\'s single most',
            '    striking phrase wrapped in <em> styled as accent colour (not italic);',
            '    beneath the subheadline, 3 divider-separated benefit lines with a small',
            '    accent ◆ marker and a bold lead-in, built from the card features',
            `  offer card: category eyebrow, ${PLACEHOLDERS.cover}, title, ${PLACEHOLDERS.price},`,
            '    check-marked feature lines, full-width CTA, then the guarantee line small',
            '  guarantee band: its own centred section — a short display heading in the',
            '    pattern "30 days. Zero risk." (use the real number from the guarantee',
            '    placeholder context) over two calm sentences',
            '  last call: display heading, CTA, then a letter-spaced uppercase trust row',
            '    "INSTANT DELIVERY · MONEY BACK · ANY DEVICE" separated by accent dots',
            '  footer: brand line, a one-line tagline in the book\'s voice, then',
            `    ${PLACEHOLDERS.legal}`,
            '  rhythm: ~90px section padding; alternate the ground variables so no two',
            '    adjacent sections share a background; content column 680-1080px',
              ]
            : []),
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
