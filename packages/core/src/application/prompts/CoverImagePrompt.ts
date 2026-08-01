interface CoverImageInput {
  title: string;
  subtitle: string;
  /**
   * THIS book's own brief — the strategy text (core promise, transformation, key
   * principles, audience). Per-book, so two books from the same channel get
   * genuinely different art. Falls back to the channel knowledge base only when a
   * book has no strategy.
   */
  subject: string;
  tone: string;
  /**
   * Stable per-book key (the project id) used to pick a style variant. Must be
   * stable so a retry after a storage failure reproduces the same cover.
   */
  variantKey: string;
}

/**
 * One art direction: the parts of the brief that make two covers look different.
 * STYLE / COMPOSITION / TYPOGRAPHY / QUALITY stay fixed across all variants —
 * that is the house look and the hard-won text-rendering safety rules — while the
 * concept, scene, and palette rotate.
 */
interface CoverVariant {
  name: string;
  coreConcept: string;
  visualDirection: string;
  palette: string[];
  designFeatures: string[];
}

/**
 * Five distinct art directions for the premium nonfiction cover. Picked
 * deterministically from the project id, so covers vary across books but never
 * across retries of the same book.
 */
const NONFICTION_VARIANTS: CoverVariant[] = [
  {
    name: 'blueprint-to-reality',
    coreConcept:
      "Show the transformation of the book's subject from concept to reality — ideas and plans becoming a " +
      'polished, fully realized result.',
    visualDirection:
      "A striking, photorealistic scene representing the book's subject seamlessly emerging from " +
      'architectural-style blueprints and schematics. The lower portion contains clean blueprint drawings, ' +
      'plans, measurements, and precise line work. The upper portion transitions into a stunning ' +
      'photorealistic representation of the subject with elegant detail, lighting, textures, and premium ' +
      'materials.',
    palette: [
      '- Deep navy background',
      '- Warm gold accents',
      '- White typography',
      '- Subtle copper highlights',
      '- Premium luxury appearance',
    ],
    designFeatures: [
      '- Architectural blueprint overlays',
      '- Subject sketches relevant to the topic',
      '- Precision drafting lines',
      '- Minimalist geometric details',
      '- Elegant visual callouts',
    ],
  },
  {
    name: 'hero-object',
    coreConcept:
      "Elevate the single most iconic object of the book's subject into a museum-grade hero portrait — " +
      'mastery distilled into one perfect artifact.',
    visualDirection:
      "One hero object central to the book's subject, rendered photorealistically and lit like a luxury " +
      'product photograph: a single dramatic key light, deep falloff into shadow, crisp specular highlights ' +
      'on its material. The object floats against a near-black seamless backdrop with a soft gradient halo. ' +
      'Nothing else competes with it.',
    palette: [
      '- Near-black charcoal background with a soft gradient halo',
      '- Warm amber and brass highlights on the object',
      '- Crisp white typography',
      '- One restrained accent colour drawn from the subject itself',
      '- Rich, cinematic, high-contrast',
    ],
    designFeatures: [
      '- Single dramatic key light with deep shadow falloff',
      '- Subtle reflective floor or plinth beneath the object',
      '- Fine dust or atmosphere catching the light',
      '- Thin metallic rule lines framing the composition',
      '- Museum-label restraint',
    ],
  },
  {
    name: 'bold-editorial',
    coreConcept:
      "State the book's promise with flat, confident graphic conviction — a modern editorial statement " +
      'rather than a photograph.',
    visualDirection:
      "A bold flat-graphic illustration of the book's subject: simplified geometric shapes, confident thick " +
      'strokes, generous flat colour fields, and a strong diagonal or circular motif anchoring the ' +
      'composition. Screen-print texture and slight ink imperfection give it warmth. No photorealism, no ' +
      'gradients, no drop shadows.',
    palette: [
      '- Warm off-white or bone paper base',
      '- Two strong flat accent colours (e.g. burnt orange and deep teal)',
      '- Near-black ink for typography',
      '- One small bright highlight colour used sparingly',
      '- Confident, graphic, poster-like',
    ],
    designFeatures: [
      '- Flat vector-style geometric shapes',
      '- Screen-print grain and slight ink misregistration',
      '- A single strong diagonal or circular anchoring motif',
      '- Thick confident strokes, no fine detail',
      '- Large uninterrupted colour fields',
    ],
  },
  {
    name: 'atmospheric-photographic',
    coreConcept:
      "Place the reader inside the world of the book's subject — an atmospheric moment that promises " +
      'expertise earned in real conditions.',
    visualDirection:
      "A cinematic photorealistic environment where the book's subject actually lives — the workspace, " +
      'landscape, or setting it belongs to — shot at golden hour or under moody directional light with a ' +
      'shallow depth of field. Rich textures, real materials, atmospheric haze. Human presence implied but ' +
      'no recognisable faces.',
    palette: [
      '- Warm golden-hour light against cool blue-grey shadow',
      '- Desaturated earth tones with deep contrast',
      '- White or pale cream typography',
      '- Subtle film grain and gentle halation',
      '- Cinematic, immersive, filmic',
    ],
    designFeatures: [
      '- Shallow depth of field with soft background falloff',
      '- Atmospheric haze catching directional light',
      '- Real material texture — wood, metal, stone, fabric',
      '- Natural framing from the environment itself',
      '- Subtle film grain',
    ],
  },
  {
    name: 'minimal-symbolic',
    coreConcept:
      "Reduce the book's core idea to one elegant symbol — the confidence of a definitive work that needs " +
      'no explanation.',
    visualDirection:
      "A single refined symbolic mark representing the book's central idea, rendered with precise geometry " +
      'and a subtle metallic or embossed finish, sitting in a vast field of calm negative space. Extreme ' +
      'restraint: one idea, perfectly executed, nothing decorative.',
    palette: [
      '- Deep forest green, oxblood, or slate as a single saturated ground',
      '- Soft metallic gold or silver for the symbol',
      '- Crisp white or bone typography',
      '- No secondary colours at all',
      '- Austere, expensive, definitive',
    ],
    designFeatures: [
      '- One precise geometric symbol, perfectly centred or optically balanced',
      '- Subtle emboss, foil, or letterpress impression on the mark',
      '- Vast calm negative space around it',
      '- Optional single hairline rule for structure',
      '- Zero decorative elements',
    ],
  },
];

/**
 * Builds a premium, bestseller-grade cover brief. The TITLE is rendered INTO the
 * image (the AI designs the whole cover) and it is the ONLY text on the cover —
 * the subtitle appears on the title page instead, so nothing is overlaid on the
 * artwork.
 *
 * The fixed STYLE / COMPOSITION / TYPOGRAPHY / QUALITY rules keep every book at
 * the same commercial standard, while the CORE CONCEPT / VISUAL DIRECTION /
 * COLOR PALETTE come from one of several art-direction variants chosen
 * deterministically from the project id — so books from the same channel no
 * longer share a cover, but a retry of the SAME book reproduces the same look.
 */
export const CoverImagePrompt = {
  build(input: CoverImageInput): string {
    const subject = compact(input.subject, 900);
    const title = compact(input.title, 200);
    const subtitle = compact(input.subtitle, 200);
    const variant = pickVariant(NONFICTION_VARIANTS, input.variantKey);

    return [
      'Design a premium bestselling NON-FICTION book cover.',
      '',
      'STYLE:',
      'Commercial publishing quality, comparable to top-selling nonfiction books on Amazon and bookstore ' +
        'shelves. The cover must look professionally designed by an award-winning editorial designer, not ' +
        'AI-generated or template-based.',
      '',
      'CORE CONCEPT:',
      variant.coreConcept,
      '',
      'VISUAL DIRECTION:',
      variant.visualDirection,
      '',
      'THIS BOOK:',
      `Title: "${title}"`,
      ...(subtitle ? [`What it promises (context for the art only — do NOT render it): "${subtitle}"`] : []),
      `Subject and premise: """${subject}"""`,
      'The artwork must be specific to THIS book — draw the imagery from the subject and premise above, ' +
        'not from generic stock ideas.',
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
      '  The ONLY words on the cover are the title above — any extra text ruins the cover.',
      '- Extremely large bold title in the UPPER portion of the cover',
      '- Title occupies 30-40% of the cover',
      '- Professional sans-serif typography with multiple font weights',
      '- Typography integrated into the design',
      '- CRITICAL: every letter of the title must be FULLY VISIBLE and contained well',
      '  inside the cover with generous safe margins — never cropped or overflowing.',
      '- Leave the BOTTOM ~20% of the cover as clean, calm negative space (no text, no',
      '  busy detail) to give the composition room to breathe.',
      '',
      'COLOR PALETTE:',
      ...variant.palette,
      '',
      'DESIGN FEATURES:',
      ...variant.designFeatures,
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
   * TITLE is rendered into the art and is the only text on the cover.
   *
   * The period look is fixed; the binding material, frame treatment, and palette
   * era rotate deterministically so two cookbooks from the same channel are not
   * the same artifact.
   */
  buildVintage(input: CoverImageInput): string {
    const subject = compact(input.subject, 700);
    const title = compact(input.title, 200);
    const era = pickVariant(VINTAGE_ERAS, input.variantKey);

    return [
      'Design the FRONT COVER of an antique vintage American cookbook, in the exact style of early-1900s to ' +
        'mid-century recipe books (1900s-1960s).',
      '',
      'OVERALL LOOK:',
      'An old, well-loved cookbook cover — aged, slightly worn and faded, as if photographed from a real ' +
        'antique book. It should look like a genuine period artifact, NOT a modern or digital design, and NOT ' +
        'glossy or photorealistic-modern.',
      `Specifically: ${era.look}`,
      '',
      'MATERIAL & TEXTURE:',
      `- ${era.material}`,
      '- Subtle stains, gentle wear at the edges and corners, a faint vintage patina',
      '- A soft letterpress / worn-ink printed feel, with slightly imperfect old printing',
      '',
      'COMPOSITION (classic cookbook cover):',
      `- ${era.frame}`,
      '- A single framed CENTRAL ILLUSTRATION in a vintage style: a hand-drawn or engraved image of a ' +
        'homemaker/cook, a laid table, produce, or a kitchen still-life — line-art or muted flat colour, ' +
        'in the manner of old recipe-book engravings and lithographs (NOT a modern photo)',
      '- Symmetrical, centred, calm layout with generous margins',
      `- The illustration must be specific to THIS book's subject: """${subject}""".`,
      '',
      'TYPOGRAPHY:',
      `- Render ONLY the book TITLE, spelled EXACTLY and correctly: "${title}"`,
      '- ABSOLUTELY NO other text of any kind: no subtitle, no tagline, no descriptive',
      '  line, no author, no price, no "used to make"-style phrase under the title.',
      '  The ONLY words anywhere on the cover are the title above — any extra text',
      '  ruins the cover.',
      `- ${era.lettering}`,
      '- Title placed prominently in the UPPER or CENTRE of the cover, fully legible, every letter contained ' +
        'well inside the frame with safe margins — never cropped',
      '- Leave the BOTTOM ~18% as calm negative space (no text) inside the frame',
      '',
      'COLOR PALETTE (muted, period-authentic):',
      ...era.palette,
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

/** Period variations for the vintage cookbook cover. */
interface VintageEra {
  name: string;
  look: string;
  material: string;
  frame: string;
  lettering: string;
  palette: string[];
}

const VINTAGE_ERAS: VintageEra[] = [
  {
    name: 'edwardian-1900s',
    look: 'an Edwardian-era household recipe book, roughly 1900-1915, printed in one or two ink colours only.',
    material: 'Aged cream or lightly foxed laid paper with visible fibre and a soft deckle feel',
    frame:
      'An ornate art-nouveau decorative BORDER with flowing corner flourishes and a fine double-rule keyline ' +
      'around the whole cover',
    lettering:
      'Use ornate art-nouveau hand-lettering with elongated forms and decorative swashes, the kind seen on ' +
      'turn-of-the-century recipe books',
    palette: [
      '- Faded cream and ecru base',
      '- Sepia brown and muted olive as the only inks',
      '- A single dusty barn-red accent',
    ],
  },
  {
    name: 'deco-1920s',
    look: 'a 1920s-30s art-deco kitchen manual with a cloth-bound spine and stamped cover.',
    material: 'A worn cloth or linen hardcover binding with a lightly stamped, slightly debossed surface',
    frame:
      'A geometric art-deco FRAME — stepped corners, symmetrical fan or sunburst motifs, and crisp straight ' +
      'keylines around the whole cover',
    lettering:
      'Use geometric art-deco display lettering with strong verticals and tight even spacing, stamped as if ' +
      'in faded gold or dark ink on cloth',
    palette: [
      '- Muted sage or dusty teal cloth ground',
      '- Faded gold or bronze stamping',
      '- Deep sepia brown for detail',
    ],
  },
  {
    name: 'wartime-1940s',
    look: 'a 1940s wartime economy cook book — plain, thrifty, printed on cheap stock with limited inks.',
    material: 'Thin, slightly yellowed pulp paper with visible age spots, soft creases, and worn corners',
    frame: 'A simple plain double-rule keyline border, honest and unornamented, with wide calm margins',
    lettering:
      'Use a sturdy condensed slab-serif or plain bold serif, printed with slightly uneven worn ink — ' +
      'practical rather than decorative',
    palette: [
      '- Yellowed newsprint cream base',
      '- Dusty barn red and ink black as the only colours',
      '- A trace of faded mustard ochre',
    ],
  },
  {
    name: 'midcentury-1950s',
    look: 'a cheerful 1950s American home cookbook with warm lithographed illustration.',
    material: 'Smooth aged coated board with a gentle patina and softly rounded, bumped corners',
    frame:
      'A friendly rounded-rectangle FRAME with a hand-drawn scalloped or ric-rac edge and small kitchen ' +
      'motifs at the corners',
    lettering:
      'Use warm mid-century hand-lettered script with a bouncing baseline, in the style of 1950s recipe ' +
      'book covers',
    palette: [
      '- Warm buttercream base',
      '- Muted cherry red and soft turquoise',
      '- Faded mustard ochre accents',
    ],
  },
  {
    name: 'homespun-1960s',
    look: 'a 1960s community or church recipe collection — homespun, printed simply, gently faded.',
    material: 'Textured pebbled cover stock or a soft matte board, faded unevenly by sun and handling',
    frame:
      'A hand-drawn folk-art BORDER of simple repeated motifs — leaves, wheat, or checkered edging — ' +
      'slightly irregular as if drawn by hand',
    lettering:
      'Use a warm rounded serif or gentle hand-drawn lettering with small imperfections, homely rather ' +
      'than professional',
    palette: [
      '- Faded ecru and oat base',
      '- Avocado and forest green with harvest gold',
      '- Warm sepia brown for line work',
    ],
  },
];

/** Collapse whitespace and clamp to a budget. */
function compact(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Deterministic variant choice — FNV-1a over the key, so the same project always
 * gets the same art direction (retries reproduce the cover) while different
 * projects spread evenly across the variants.
 */
function pickVariant<T>(variants: T[], key: string): T {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return variants[hash % variants.length]!;
}
