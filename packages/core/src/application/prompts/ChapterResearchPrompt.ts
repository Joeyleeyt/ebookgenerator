export const ChapterResearchPrompt = {
  build(input: {
    chapterTitle: string;
    chapterPurpose: string;
    keyPoints: string[];
    candidateMaterial: string; // pre-filtered video summaries + comment insights (keyword match)
    bookTitle?: string | undefined;
  }) {
    return {
      system:
        'You assemble a research package for one book chapter from candidate source material. ' +
        'Select and rephrase only what is relevant to this chapter. ' +
        (input.bookTitle
          ? `The book is titled "${input.bookTitle}" and the chapter must serve that title. Candidate material ` +
            'comes from the creator\'s channel and often covers adjacent topics that do NOT belong in this book. ' +
            'Keep only material that genuinely supports this chapter\'s subject; DISCARD anything off-topic rather ' +
            'than stretching it to fit. Prefer capturing the creator\'s voice, examples and the audience\'s ' +
            'questions. If little material fits, return few items — never pad with irrelevant material. '
          : '') +
        'Return ONLY JSON with keys: ' +
        'supportingStories (string[]), supportingLessons (string[]), supportingExamples (string[]), ' +
        'supportingCaseStudies (string[]), supportingFrameworks (string[]), supportingPrinciples (string[]), ' +
        'audienceQuestions (string[]).',
      user:
        (input.bookTitle ? `Book: ${input.bookTitle}\n` : '') +
        `Chapter: ${input.chapterTitle}\nPurpose: ${input.chapterPurpose}\n` +
        `Key points: ${input.keyPoints.join('; ')}\n\n` +
        `Candidate source material:\n${input.candidateMaterial}`,
    };
  },
};
