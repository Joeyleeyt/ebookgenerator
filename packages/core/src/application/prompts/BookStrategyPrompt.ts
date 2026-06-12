export const BookStrategyPrompt = {
  build(input: { knowledgeBase: string; targetPages: number; tone: string; channelTitle: string }) {
    // Keep in step with GenerateOutlineUseCase's deterministic count (≈14 at 100 pages).
    const chapterCount = Math.max(2, Math.min(14, Math.round(input.targetPages / 7)));
    return {
      system:
        'You are a bestselling non-fiction book strategist. From a channel knowledge base, design the ' +
        'commercial strategy for a sellable Kindle-quality ebook. Return ONLY JSON with keys: ' +
        'title, subtitle, targetAudience, corePromise, transformation, authorVoice, tone, ' +
        'chapterCount (number), targetWordCount (number), uniqueSellingProposition, keyPrinciples (string[]), ' +
        'author. The "author" is the cover byline and MUST be based on the real channel — use the channel/creator ' +
        `name "${input.channelTitle}". If that name reads like a person, use it as-is; if it reads like a brand, ` +
        'use a natural byline such as "<Name> from ' + `${input.channelTitle}` + '" or "The ' + `${input.channelTitle}` +
        ' Team". Do not invent an unrelated name and do not use a famous real person. ' +
        `Aim for chapterCount=${chapterCount} and targetWordCount=${input.targetPages * 450}. Tone: ${input.tone}.`,
      user: `Channel: ${input.channelTitle}\n\nChannel knowledge base:\n${input.knowledgeBase}`,
    };
  },
};
