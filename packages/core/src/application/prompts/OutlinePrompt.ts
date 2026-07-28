export const OutlinePrompt = {
  build(input: {
    bookStrategy: string;
    knowledgeBase: string;
    chapterCount: number;
    perChapterWords: number;
    tone: string;
    /** User-supplied book title. When present it GOVERNS what the chapters cover. */
    bookTitle?: string | undefined;
  }) {
    // Without this, the outline is derived from the knowledge base's dominant topic and
    // the chapters end up about the channel's usual subject instead of the title's.
    const titleRule = input.bookTitle
      ? 'THE BOOK TITLE IS FIXED AND GOVERNS EVERY CHAPTER.\n' +
        `The title is: "${input.bookTitle}"\n` +
        'Return this EXACT string as "title". Every chapter must deliver a distinct part of what THIS TITLE ' +
        'promises. Read the title literally and let it define the scope: if it promises a buying guide to ' +
        'products, every chapter is about choosing and buying products; if it promises repairs to do yourself, ' +
        'every chapter is about doing those repairs. If the title names a number of items (e.g. "101 products"), ' +
        'the chapters must be categories that together cover that many items.\n' +
        'Before writing each chapter title, check it against the book title: a reader who bought the book for ' +
        'the title must find that chapter obviously relevant. Drop any chapter that belongs to a different book.\n' +
        'USE THE CHANNEL KNOWLEDGE BASE FOR STYLE AND AUDIENCE ONLY — the creator\'s voice, the audience\'s ' +
        'pain points, goals and vocabulary. Do NOT take chapter SUBJECTS from the knowledge base when they ' +
        'fall outside what the title promises.\n\n'
      : '';

    return {
      system:
        'You are a book editor. Produce a coherent ebook outline. ' +
        'Return ONLY JSON: { "title": string, "entries": [{ "title": string, "purpose": string, ' +
        '"promise": string, "keyPoints": string[], "wordTarget": number }] }.\n\n' +
        titleRule +
        'CHAPTER TITLE RULES: each entry "title" must be a SHORT, benefit-driven chapter title (about 3–7 words). ' +
        'Do NOT prefix it with "Chapter N". Do NOT add a subtitle, tagline, colon clause, or em-dash continuation — ' +
        'give the title only, with the curiosity/benefit baked into those few words. ' +
        'Keep each entry compact to avoid bloated output: "purpose" and "promise" one sentence each (≤25 words); ' +
        '"keyPoints" must be 3–5 short bullet phrases (≤12 words each). ' +
        `Produce exactly ${input.chapterCount} chapters that build on one another, each with ` +
        `wordTarget≈${input.perChapterWords}. Tone: ${input.tone}.`,
      user:
        (input.bookTitle ? `=== BOOK TITLE (governs every chapter) ===\n${input.bookTitle}\n\n` : '') +
        `=== BOOK STRATEGY ===\n${input.bookStrategy}\n\n` +
        '=== CHANNEL KNOWLEDGE BASE ===\n' +
        (input.bookTitle
          ? '(Style, voice and audience only — do NOT take chapter subjects from here.)\n'
          : '') +
        input.knowledgeBase,
    };
  },
};
