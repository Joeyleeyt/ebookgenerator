export const ChapterResearchPrompt = {
  build(input: {
    chapterTitle: string;
    chapterPurpose: string;
    keyPoints: string[];
    candidateMaterial: string; // pre-filtered video summaries + comment insights (keyword match)
  }) {
    return {
      system:
        'You assemble a research package for one book chapter from candidate source material. ' +
        'Select and rephrase only what is relevant to this chapter. Return ONLY JSON with keys: ' +
        'supportingStories (string[]), supportingLessons (string[]), supportingExamples (string[]), ' +
        'supportingCaseStudies (string[]), supportingFrameworks (string[]), supportingPrinciples (string[]), ' +
        'audienceQuestions (string[]).',
      user:
        `Chapter: ${input.chapterTitle}\nPurpose: ${input.chapterPurpose}\n` +
        `Key points: ${input.keyPoints.join('; ')}\n\n` +
        `Candidate source material:\n${input.candidateMaterial}`,
    };
  },
};
