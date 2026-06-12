interface IllustrationInput {
  /** The chapter this illustration sits in. */
  chapterTitle: string;
  /** The passage the illustration sits beside — the art must depict THIS. */
  passage: string;
  /** Whole-book subject, for visual coherence across illustrations. */
  bookSubject: string;
  tone: string;
}

/**
 * Builds a TEXTLESS, full-color editorial illustration prompt for one in-chapter
 * image. The art is driven by the surrounding passage so it matches the content
 * it accompanies, while a shared style keeps every illustration cohesive across
 * the book. No words are requested — illustrations carry no captions baked into
 * the pixels, so nothing can render as garbled text.
 */
export const IllustrationPrompt = {
  build(input: IllustrationInput): string {
    const passage = input.passage.replace(/\s+/g, ' ').trim().slice(0, 900);
    const subject = input.bookSubject.replace(/\s+/g, ' ').trim().slice(0, 400);
    return (
      'Create a single full-color editorial illustration for a non-fiction book, ' +
      `for the chapter "${input.chapterTitle}". ` +
      'Illustrate the specific idea described in THIS passage so the image matches the surrounding text:\n' +
      `"""${passage}"""\n` +
      (subject ? `Overall book subject (for visual coherence): "${subject}".\n` : '') +
      'STYLE: modern full-color editorial illustration — clean, confident shapes, a warm and ' +
      'cohesive palette, soft depth and tasteful texture, the polished look of a premium magazine ' +
      'or trade non-fiction book. Conceptual and metaphorical rather than a literal diagram. ' +
      `Match a ${input.tone} mood. ` +
      'HARD CONSTRAINTS: absolutely NO text, NO letters, NO words, NO numbers, NO labels, NO logos, ' +
      'NO captions anywhere in the image. One cohesive illustration, not a collage, not a grid.'
    );
  },
};
