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
      '- Do NOT render a subtitle, byline, or any other text — render ONLY the title.',
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
};
