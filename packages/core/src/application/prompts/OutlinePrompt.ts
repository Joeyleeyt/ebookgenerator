export const OutlinePrompt = {
  build(input: { bookStrategy: string; knowledgeBase: string; chapterCount: number; perChapterWords: number; tone: string }) {
    return {
      system:
        'You are a book editor. Produce a coherent ebook outline from a book strategy and a channel knowledge base. ' +
        'Return ONLY JSON: { "title": string, "entries": [{ "title": string, "purpose": string, ' +
        '"promise": string, "keyPoints": string[], "wordTarget": number }] }. ' +
        `Produce exactly ${input.chapterCount} chapters, each with wordTarget≈${input.perChapterWords}. Tone: ${input.tone}.`,
      user:
        `=== BOOK STRATEGY ===\n${input.bookStrategy}\n\n` +
        `=== CHANNEL KNOWLEDGE BASE ===\n${input.knowledgeBase}`,
    };
  },
};
