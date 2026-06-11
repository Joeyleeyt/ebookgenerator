import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { BookSectionId } from '../../domain/book/ids.js';
import { BookSection, ExtraContentKind, placementOf } from '../../domain/book/BookSection.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import { ExtraContentPrompt } from '../prompts/ExtraContentPrompt.js';

/**
 * The default front/back matter every book gets, in reading order:
 * Preface (front), Conclusion → Acknowledgments (back). The Preface folds the
 * former Foreword and Introduction into one section.
 * Iteration order sets each section's position within its placement lane.
 */
const DEFAULT_SECTIONS: { kind: ExtraContentKind; title: string }[] = [
  { kind: ExtraContentKind.FOREWORD, title: 'Preface' },
  { kind: ExtraContentKind.CONCLUSION, title: 'Conclusion' },
  { kind: ExtraContentKind.ACKNOWLEDGMENTS, title: 'Acknowledgments' },
];

/**
 * Gives every generated book a real publishing structure: a Dedication, Foreword
 * and Introduction (front matter), and a Conclusion and Acknowledgments (back
 * matter). Runs at the ASSEMBLING stage, before the document is assembled.
 * Idempotent — a section already filled is left untouched, so retries and the
 * export re-assembly are safe.
 */
export class GenerateFrontBackMatterUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly ai: AiTextGenerator,
    private readonly ids: IdGenerator,
  ) {}

  async execute(cmd: { projectId: string }): Promise<Result<{ generated: number }>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');

    const ctx = await this.books.loadSharedContext(projectId);
    const tableOfContents = [...book.chapters].sort((a, b) => a.position - b.position).map((c) => c.title);

    let generated = 0;
    for (const def of DEFAULT_SECTIONS) {
      const existing = book.bookSections.find((s) => s.kind === def.kind);
      if (existing?.status === 'DONE' && existing.content) continue; // idempotent

      const section =
        existing ??
        BookSection.create({
          id: BookSectionId.from(this.ids.uuid()),
          bookId: book.id.value,
          kind: def.kind,
          position: book.nextSectionPosition(placementOf(def.kind)),
          title: def.title,
          prompt: null,
        });
      if (!existing) book.addBookSection(section);

      const prompt = ExtraContentPrompt.build({
        kind: def.kind,
        bookTitle: book.title ?? 'Untitled',
        bookStrategy: ctx.bookStrategy,
        knowledgeBase: ctx.knowledgeBase,
        tone: ctx.tone,
        authorVoice: ctx.authorVoice,
        tableOfContents,
      });
      const completion = await this.ai.generate({
        model: 'claude-opus-4-8',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        maxTokens: prompt.maxTokens,
        cacheControl: { systemPrefix: true },
        metadata: { projectId: cmd.projectId, stage: 'front-back-matter' },
      });
      if (completion.isFail()) return Result.fail(completion.error.type);

      section.fill(completion.value.text);
      generated += 1;
    }

    if (generated > 0) await this.books.save(book);
    return Result.ok({ generated });
  }
}
