interface CoverImageInput {
  title: string;
  subtitle: string;
  /** Whole-channel knowledge base — the source of the book's subject matter. */
  knowledgeBase: string;
  tone: string;
}

/**
 * Builds a premium, bestseller-grade cover brief. The TITLE is rendered INTO the
 * image (the AI designs the whole cover), but the SUBTITLE is NOT baked in — it
 * is typeset over the bottom of the cover in HTML so its position/margin are
 * exact and it can never be clipped. The fixed STYLE / COLOR / COMPOSITION /
 * TYPOGRAPHY / QUALITY rules give every book the same high-end navy-and-gold,
 * blueprint-to-reality look, while the CORE CONCEPT and VISUAL DIRECTION adapt to
 * THIS book's subject (from the channel knowledge base).
 */
export const CoverImagePrompt = {
  build(input: CoverImageInput): string {
    const subject = input.knowledgeBase.replace(/\s+/g, ' ').trim().slice(0, 600);
    const title = input.title.replace(/\s+/g, ' ').trim();

    return [
      'Design a premium bestselling NON-FICTION book cover.',
      '',
      'STYLE:',
      'Commercial publishing quality, comparable to top-selling nonfiction books on Amazon and bookstore ' +
        'shelves. The cover must look professionally designed by an award-winning editorial designer, not ' +
        'AI-generated or template-based.',
      '',
      'CORE CONCEPT:',
      "Show the transformation of the book's subject from concept to reality — ideas and plans becoming a " +
        'polished, fully realized result.',
      '',
      'VISUAL DIRECTION:',
      "A striking, photorealistic scene representing the book's subject seamlessly emerging from " +
        'architectural-style blueprints and schematics. The lower portion contains clean blueprint drawings, ' +
        'plans, measurements, and precise line work. The upper portion transitions into a stunning ' +
        'photorealistic representation of the subject with elegant detail, lighting, textures, and premium ' +
        'materials.',
      `The book's subject: """${subject}""".`,
      '',
      'COMPOSITION:',
      '- Strong central focal point',
      '- Symmetrical professional layout',
      '- Clean grid structure',
      '- Large empty breathing space',
      '- Sophisticated visual hierarchy',
      '- Instantly recognizable as a premium nonfiction book',
      '',
      'TYPOGRAPHY:',
      `- Render ONLY the book TITLE text, spelled EXACTLY and correctly: "${title}"`,
      '- ABSOLUTELY NO other text: no subtitle, tagline, descriptive line, or byline.',
      '  The ONLY words on the cover are the title above. A subtitle is typeset separately',
      '  afterward, so any extra text you add will collide with it and ruin the cover.',
      '- Extremely large bold title in the UPPER portion of the cover',
      '- Title occupies 30-40% of the cover',
      '- Professional sans-serif typography with multiple font weights',
      '- Typography integrated into the design',
      '- CRITICAL: every letter of the title must be FULLY VISIBLE and contained well',
      '  inside the cover with generous safe margins — never cropped or overflowing.',
      '- Leave the BOTTOM ~20% of the cover as clean, calm negative space (no text, no',
      '  busy detail) so a subtitle can be placed there afterward.',
      '',
      'COLOR PALETTE:',
      '- Deep navy background',
      '- Warm gold accents',
      '- White typography',
      '- Subtle copper highlights',
      '- Premium luxury appearance',
      '',
      'DESIGN FEATURES:',
      '- Architectural blueprint overlays',
      '- Subject sketches relevant to the topic',
      '- Precision drafting lines',
      '- Minimalist geometric details',
      '- Elegant visual callouts',
      '- High-end editorial composition',
      '',
      'MOOD:',
      `Expertise, authority, sophistication, luxury, transformation, modern mastery. Match a ${input.tone} tone.`,
      '',
      'QUALITY REQUIREMENTS:',
      '- Bestseller-quality book cover',
      '- Professional publishing standard',
      '- Sharp, correctly spelled typography',
      '- Clean composition',
      '- No clutter',
      '- No stock-photo appearance',
      '- No generic Canva style',
      '- No amateur design elements',
      '',
      'OUTPUT:',
      'Front cover only.',
      'Portrait book format.',
      'Ultra-high detail.',
      'Commercial publishing quality.',
    ].join('\n');
  },

  /**
   * Vintage cookbook cover — for cooking books. Styled after early-1900s to
   * mid-century American recipe books (War-Time Cook Book, Book of Recipes,
   * Metropolitan Cook Book, etc.): aged paper/cloth binding, ornate decorative
   * typography, a framed central illustration, and a muted period palette. The
   * TITLE is rendered into the art; the subtitle is typeset over it later in HTML.
   */
  buildVintage(input: CoverImageInput): string {
    const subject = input.knowledgeBase.replace(/\s+/g, ' ').trim().slice(0, 500);
    const title = input.title.replace(/\s+/g, ' ').trim();

    return [
      'Design the FRONT COVER of an antique vintage American cookbook, in the exact style of early-1900s to ' +
        'mid-century recipe books (1900s-1960s).',
      '',
      'OVERALL LOOK:',
      'An old, well-loved cookbook cover — aged, slightly worn and faded, as if photographed from a real ' +
        'antique book. It should look like a genuine period artifact, NOT a modern or digital design, and NOT ' +
        'glossy or photorealistic-modern.',
      '',
      'MATERIAL & TEXTURE:',
      '- Aged cream, ecru, or lightly foxed paper, OR a cloth/linen hardcover binding',
      '- Subtle stains, gentle wear at the edges and corners, a faint vintage patina',
      '- A soft letterpress / worn-ink printed feel, with slightly imperfect old printing',
      '',
      'COMPOSITION (classic cookbook cover):',
      '- A decorative ruled BORDER or ornamental FRAME around the whole cover (art-nouveau or deco lines, ' +
        'corner flourishes, or a simple double-rule keyline)',
      '- A single framed CENTRAL ILLUSTRATION in a vintage style: a hand-drawn or engraved image of a ' +
        'homemaker/cook, a laid table, produce, or a kitchen still-life — line-art or muted flat colour, ' +
        'in the manner of old recipe-book engravings and lithographs (NOT a modern photo)',
      '- Symmetrical, centred, calm layout with generous margins',
      `- The illustration should evoke the book's subject: """${subject}""".`,
      '',
      'TYPOGRAPHY:',
      `- Render ONLY the book TITLE, spelled EXACTLY and correctly: "${title}"`,
      '- ABSOLUTELY NO other text of any kind: no subtitle, no tagline, no descriptive',
      '  line, no author, no price, no "used to make"-style phrase under the title.',
      '  The ONLY words anywhere on the cover are the title above. A subtitle is added',
      '  separately later, so any extra text you add will collide with it and ruin the cover.',
      '- Use ornate vintage lettering: a decorative serif, art-nouveau, or hand-lettered period style, the ' +
        'kind seen on antique cookbook covers',
      '- Title placed prominently in the UPPER or CENTRE of the cover, fully legible, every letter contained ' +
        'well inside the frame with safe margins — never cropped',
      '- Leave the BOTTOM ~18% as calm negative space (no text) so a subtitle can be typeset there afterward',
      '',
      'COLOR PALETTE (muted, period-authentic):',
      '- Faded cream and ecru base',
      '- Muted accents drawn from: dusty barn red, forest/avocado green, mustard/ochre gold, sepia brown, ' +
        'faded teal',
      '- Soft, low-saturation, slightly yellowed by age — NEVER bright, neon, or modern',
      '',
      'MOOD:',
      'Nostalgic, homely, heritage, hand-made, trustworthy — a treasured family recipe book from decades past.',
      '',
      'AVOID:',
      '- Modern/minimalist/flat-vector or Canva-style design',
      '- Glossy studio food photography',
      '- Neon or high-saturation colours',
      '- Sans-serif corporate typography',
      '- ANY text other than the title — no subtitle, tagline, or second line under the',
      '  title (e.g. no "Grandma Used To Make"). Title only.',
      '',
      'OUTPUT:',
      'Front cover only. Portrait book format. Ultra-high detail. Looks like a real antique cookbook.',
    ].join('\n');
  },
};
