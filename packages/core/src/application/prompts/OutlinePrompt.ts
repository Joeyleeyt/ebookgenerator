export const OutlinePrompt = {
  build(input: { bookStrategy: string; knowledgeBase: string; chapterCount: number; perChapterWords: number; tone: string }) {
    return {
      system:
        'You are a book editor. Produce a coherent ebook outline from a book strategy and a channel knowledge base. ' +
        'Return ONLY JSON: { "title": string, "entries": [{ "title": string, "purpose": string, ' +
        '"promise": string, "keyPoints": string[], "wordTarget": number }] }. ' +
        'CHAPTER TITLE RULES: each entry "title" must be a SHORT, benefit-driven chapter title (about 3–7 words). ' +
        'Do NOT prefix it with "Chapter N". Do NOT add a subtitle, tagline, colon clause, or em-dash continuation — ' +
        'give the title only, with the curiosity/benefit baked into those few words. ' +
        'Keep each entry compact to avoid bloated output: "purpose" and "promise" one sentence each (≤25 words); ' +
        '"keyPoints" must be 3–5 short bullet phrases (≤12 words each). ' +
        `Produce exactly ${input.chapterCount} chapters that build on one another, each with ` +
        `wordTarget≈${input.perChapterWords}. Tone: ${input.tone}.`,
      user:
        `=== BOOK STRATEGY ===\n${input.bookStrategy}\n\n` +
        `=== CHANNEL KNOWLEDGE BASE ===\n${input.knowledgeBase}`,
    };
  },
};
