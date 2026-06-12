import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { ChapterId } from '../../domain/book/ids.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { Clock } from '../ports/Clock.js';
import { ChapterPrompt } from '../prompts/ChapterPrompt.js';
import type { ChapterJob } from '../dto/jobs.dto.js';

/**
 * Phase 11. Writes one chapter using the 9-part structure, fed by the book
 * strategy + knowledge base (cached system prefix) and this chapter's research
 * package. Drafts on Sonnet — far faster token generation than Opus — and the
 * Phase 12 polish pass (Opus) recovers quality. Idempotent on inputHash.
 */
export class GenerateChapterUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly ai: AiTextGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: ChapterJob): Promise<Result<{ skipped: boolean }>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    const chapter = book.chapter(ChapterId.from(cmd.chapterId));
    if (!chapter) return Result.fail('Chapter not found');
    if (chapter.isGeneratedFor(cmd.inputHash)) return Result.ok({ skipped: true }); // idempotent

    const ctx = await this.books.loadSharedContext(projectId);
    const research = await this.knowledge.getChapterResearch(chapter.id);
    chapter.markGenerating();

    const completion = await this.ai.generate({
      model: 'claude-sonnet-4-6',
      system: ChapterPrompt.system({
        bookStrategy: ctx.bookStrategy,
        knowledgeBase: ctx.knowledgeBase,
        tone: ctx.tone,
        authorVoice: ctx.authorVoice,
      }),
      messages: [
        {
          role: 'user',
          content: ChapterPrompt.user({
            title: chapter.title,
            purpose: chapter.topic,
            promise: chapter.promise,
            wordTarget: chapter.wordTarget,
            research: research?.toText() ?? 'No additional research available; rely on the knowledge base.',
            ...(cmd.instructions ? { instructions: cmd.instructions } : {}),
          }),
        },
      ],
      maxTokens: 8000,
      cacheControl: { systemPrefix: true },
      metadata: { projectId: cmd.projectId, stage: 'chapter-generate' },
    });
    if (completion.isFail()) return Result.fail(completion.error.type);

    if (cmd.mode === 'regenerate') {
      await this.books.snapshotChapterVersion(book.id, chapter.id.value);
    }
    const applied = book.regenerateChapter(
      chapter.id,
      { content: completion.value.text, inputHash: cmd.inputHash },
      this.clock.now(),
    );
    if (applied.isFail()) return Result.fail(applied.error);
    // Persist ONLY this chapter. A full save(book) re-upserts every chapter, so
    // parallel chapter jobs would clobber each other's just-written content with
    // their own stale snapshot — leaving a chapter PENDING and breaking assembly.
    await this.books.saveChapter(book.id, chapter);
    return Result.ok({ skipped: false });
  }
}
