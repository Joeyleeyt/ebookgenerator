import { ExtraContentKind } from '../../domain/book/BookSection.js';

interface ExtraContentInput {
  kind: ExtraContentKind;
  bookTitle: string;
  bookStrategy: string;
  knowledgeBase: string;
  tone: string;
  authorVoice: string;
  tableOfContents: string[];
  userPrompt?: string;
}

/** Per-type instructions and word budgets — each extra-content kind has its own shape. */
const SPEC: Record<ExtraContentKind, { instruction: string; words: number }> = {
  [ExtraContentKind.INTRODUCTION]: {
    instruction:
      'Write an Introduction that frames the book, states the core promise, and tells the reader what they will gain and how to use the book.',
    words: 900,
  },
  [ExtraContentKind.FOREWORD]: {
    instruction:
      'Write a Foreword in the warm, credible voice of a respected peer endorsing the author and the value of the book. Do not invent a real named person.',
    words: 600,
  },
  [ExtraContentKind.CONCLUSION]: {
    instruction:
      'Write a Conclusion that synthesizes the transformation, reinforces the key principles, and ends with a motivating call to action.',
    words: 900,
  },
  [ExtraContentKind.FAQ]: {
    instruction:
      'Write an FAQ as a series of "**Q:** …\\n**A:** …" pairs answering the audience\'s most common questions. 8–12 questions.',
    words: 1200,
  },
  [ExtraContentKind.BONUS_CHAPTER]: {
    instruction:
      'Write a full Bonus Chapter following the same 9-part structure as the main chapters (Hook → Opening Story → Problem → Concept → Case Study → Framework → Application → Action Steps → Summary).',
    words: 3500,
  },
  [ExtraContentKind.RESOURCES]: {
    instruction:
      'Write a Resources section: a curated, categorized list of tools, references, and next steps with a one-line note on why each matters.',
    words: 700,
  },
  [ExtraContentKind.CHECKLIST]: {
    instruction:
      'Write a Checklist as actionable Markdown checkbox items ("- [ ] …") grouped under short headings the reader can follow step by step.',
    words: 600,
  },
  [ExtraContentKind.GLOSSARY]: {
    instruction:
      'Write a Glossary as "**Term** — definition" entries in alphabetical order, covering the key terms used across the book.',
    words: 800,
  },
};

export const ExtraContentPrompt = {
  build(input: ExtraContentInput) {
    const spec = SPEC[input.kind];
    return {
      system:
        `You are an expert non-fiction author writing the "${input.kind}" element of a cohesive, sellable ebook. ` +
        `Maintain a ${input.tone} tone and this author voice: ${input.authorVoice}. ` +
        `${spec.instruction} Target ~${spec.words} words. Output only well-structured Markdown (no surrounding commentary).\n\n` +
        `=== BOOK STRATEGY (shared) ===\n${input.bookStrategy}\n\n` +
        `=== CHANNEL KNOWLEDGE BASE (shared) ===\n${input.knowledgeBase}`,
      user:
        `Book: "${input.bookTitle}"\n` +
        `Table of contents:\n${input.tableOfContents.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n` +
        (input.userPrompt ? `Author's specific request: ${input.userPrompt}\n` : '') +
        `Write the ${input.kind}.`,
      maxTokens: Math.min(8000, Math.ceil(spec.words * 2)),
    };
  },
};
