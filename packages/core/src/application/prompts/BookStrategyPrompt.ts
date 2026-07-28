export const BookStrategyPrompt = {
  build(input: {
    knowledgeBase: string;
    targetPages: number;
    tone: string;
    channelTitle: string;
    /** User-supplied book title. When present it GOVERNS the subject of the book. */
    bookTitle?: string | undefined;
  }) {
    // Keep in step with GenerateOutlineUseCase's deterministic count (≈14 at 100 pages).
    const chapterCount = Math.max(2, Math.min(14, Math.round(input.targetPages / 7)));

    // The knowledge base describes what the CHANNEL talks about. When the user has given
    // a title, that title — not the channel's recurring topics — decides what the book is
    // about; the channel is demoted to a source of voice, audience and credibility only.
    const titleRule = input.bookTitle
      ? 'THE BOOK TITLE IS FIXED AND GOVERNS THE ENTIRE BOOK.\n' +
        `The title is: "${input.bookTitle}"\n` +
        'Return this EXACT string as "title" — do not reword, shorten, extend or "improve" it.\n' +
        'The subject matter of the book is whatever this title promises, and NOTHING ELSE. Read the title ' +
        'literally: every noun in it constrains the topic. If the title promises a buying guide to products, ' +
        'the book is a buying guide to products — not a repair manual, not a maintenance guide. If it promises ' +
        'repairs you can do yourself, the book is those repairs — not a guide to buying products.\n' +
        'corePromise, transformation, targetAudience, uniqueSellingProposition and keyPrinciples MUST all ' +
        'describe delivering exactly what this title promises. If the channel knowledge base is mostly about ' +
        'some OTHER topic, ignore that topic entirely for subject matter.\n' +
        'USE THE CHANNEL KNOWLEDGE BASE FOR STYLE AND AUDIENCE ONLY: how the creator speaks, the vocabulary and ' +
        'expertise level, the audience\'s pain points, goals, objections and how they talk. Do NOT let the ' +
        'channel\'s recurring subject matter replace the title\'s subject matter.\n' +
        'Write a "subtitle" that expands on the title\'s specific promise.'
      : 'Derive the title, subtitle and positioning from the channel knowledge base.';

    return {
      system:
        'You are a bestselling non-fiction book strategist. Design the commercial strategy for a sellable ' +
        'Kindle-quality ebook. Return ONLY JSON with keys: ' +
        'title, subtitle, targetAudience, corePromise, transformation, authorVoice, tone, ' +
        'chapterCount (number), targetWordCount (number), uniqueSellingProposition, keyPrinciples (string[]), ' +
        'author.\n\n' +
        titleRule +
        '\n\nThe "author" is the cover byline and MUST be based on the real channel — use the channel/creator ' +
        `name "${input.channelTitle}". If that name reads like a person, use it as-is; if it reads like a brand, ` +
        'use a natural byline such as "<Name> from ' + `${input.channelTitle}` + '" or "The ' + `${input.channelTitle}` +
        ' Team". Do not invent an unrelated name and do not use a famous real person. ' +
        'The "authorVoice" must capture how the creator actually speaks, drawn from the knowledge base. ' +
        `Aim for chapterCount=${chapterCount} and targetWordCount=${input.targetPages * 450}. Tone: ${input.tone}.`,
      user:
        (input.bookTitle ? `=== BOOK TITLE (governs the subject of the book) ===\n${input.bookTitle}\n\n` : '') +
        `Channel: ${input.channelTitle}\n\n` +
        '=== CHANNEL KNOWLEDGE BASE ===\n' +
        (input.bookTitle
          ? '(Use for writing style, voice, expertise level and audience understanding. ' +
            'Do NOT take the book\'s subject matter from here — the title decides that.)\n'
          : '') +
        input.knowledgeBase,
    };
  },
};
