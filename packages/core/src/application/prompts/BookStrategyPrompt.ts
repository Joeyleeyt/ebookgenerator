export const BookStrategyPrompt = {
  build(input: { knowledgeBase: string; targetPages: number; tone: string }) {
    const chapterCount = Math.max(8, Math.min(14, Math.round(input.targetPages / 8)));
    return {
      system:
        'You are a bestselling non-fiction book strategist. From a channel knowledge base, design the ' +
        'commercial strategy for a sellable Kindle-quality ebook. Return ONLY JSON with keys: ' +
        'title, subtitle, targetAudience, corePromise, transformation, authorVoice, tone, ' +
        'chapterCount (number), targetWordCount (number), uniqueSellingProposition, keyPrinciples (string[]). ' +
        `Aim for chapterCount=${chapterCount} and targetWordCount=${input.targetPages * 450}. Tone: ${input.tone}.`,
      user: `Channel knowledge base:\n${input.knowledgeBase}`,
    };
  },
};
