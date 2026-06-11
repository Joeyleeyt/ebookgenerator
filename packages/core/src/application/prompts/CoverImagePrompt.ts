interface CoverImageInput {
  title: string;
  subtitle: string;
  /** Whole-channel knowledge base — the source of the book's subject matter. */
  knowledgeBase: string;
  tone: string;
}

/**
 * Builds a TEXTLESS cover-art prompt. The illustration must reflect the whole
 * YouTube channel's subject, not just the title — so we feed it the channel
 * knowledge base. No words/letters are requested: the title is typeset in HTML
 * over the art, guaranteeing it always matches the book and stays crisp.
 */
export const CoverImagePrompt = {
  build(input: CoverImageInput): string {
    const subject = input.knowledgeBase.replace(/\s+/g, ' ').trim().slice(0, 1200);
    return (
      'Design a professional non-fiction book cover ILLUSTRATION for a digital ebook. ' +
      `The book is titled "${input.title}"${input.subtitle ? ` (${input.subtitle})` : ''}. ` +
      'Base the imagery on the overall subject matter of this content library:\n' +
      `"""${subject}"""\n` +
      'STYLE: editorial, modern, premium "field manual" aesthetic — clean line-art / blueprint-style ' +
      'illustration of the central subject, set on a deep navy background with a single warm orange accent color, ' +
      'subtle technical grid texture, and thin corner-bracket framing. Portrait orientation. ' +
      `Match a ${input.tone} mood. ` +
      'HARD CONSTRAINTS: absolutely NO text, NO letters, NO words, NO numbers, NO title, NO logos anywhere in the ' +
      'image. Leave calm negative space in the upper third and lower third for text to be added later. ' +
      'A single cohesive illustration, not a collage.'
    );
  },
};
