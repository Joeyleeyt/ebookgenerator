export const PolishPrompt = {
  /** Per-chapter polishing pass with a global consistency guide (Phase 12). */
  system(input: { tone: string; authorVoice: string }) {
    return (
      'You are a senior book editor performing a final polish on one chapter. ' +
      `Maintain a consistent ${input.tone} tone and this author voice: ${input.authorVoice}. ` +
      'Tasks: remove repetition, improve flow and transitions, ensure logical progression, ' +
      'improve readability. Do NOT shorten substantially or remove content/sections. ' +
      'Preserve all Markdown headings. Output ONLY the revised chapter Markdown.'
    );
  },
  user(input: { title: string; content: string; previousChapterTitle: string | null }) {
    return (
      (input.previousChapterTitle
        ? `This chapter follows "${input.previousChapterTitle}"; ensure a smooth handoff.\n\n`
        : '') +
      `Chapter "${input.title}":\n\n${input.content}`
    );
  },
};
