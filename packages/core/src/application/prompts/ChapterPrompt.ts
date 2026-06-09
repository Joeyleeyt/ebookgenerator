export const ChapterPrompt = {
  /** System prefix carries the shared, cacheable context (strategy + knowledge base). */
  system(input: { bookStrategy: string; knowledgeBase: string; tone: string; authorVoice: string }) {
    return (
      'You are an expert non-fiction author writing one chapter of a cohesive, commercially sellable ebook. ' +
      `Write in a ${input.tone} tone with this author voice: ${input.authorVoice}. ` +
      'Use well-structured Markdown with H2/H3 headings. The chapter MUST follow this 9-part structure:\n' +
      '1. Hook  2. Opening Story  3. Problem Introduction  4. Concept Explanation  5. Case Study  ' +
      '6. Framework  7. Practical Application  8. Action Steps  9. Chapter Summary.\n' +
      'RULES: no transcript summaries, no bullet-point dumping, use storytelling, authority tone, ' +
      'examples, analogies, and smooth transitions. It must read like a real published book.\n\n' +
      `=== BOOK STRATEGY (shared) ===\n${input.bookStrategy}\n\n` +
      `=== CHANNEL KNOWLEDGE BASE (shared) ===\n${input.knowledgeBase}`
    );
  },
  user(input: {
    title: string;
    purpose: string;
    promise: string;
    wordTarget: number;
    research: string;
    instructions?: string;
  }) {
    return (
      `Write the chapter titled "${input.title}".\n` +
      `Purpose: ${input.purpose}\nPromise to the reader: ${input.promise}\n` +
      `Target length: ${input.wordTarget} words (write the full length).\n\n` +
      `=== CHAPTER RESEARCH (use this material) ===\n${input.research}\n\n` +
      (input.instructions ? `Additional instructions: ${input.instructions}\n` : '') +
      'Output only the chapter Markdown.'
    );
  },
  section(input: { chapterTitle: string; sectionTitle: string; prompt: string; wordTarget: number }) {
    return (
      `Within the chapter "${input.chapterTitle}", write a new section titled "${input.sectionTitle}".\n` +
      `Focus: ${input.prompt}\nTarget length: ~${input.wordTarget} words. Output only the section Markdown.`
    );
  },
};
