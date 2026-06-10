import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { Book } from '../../domain/book/Book.js';
import { BookId, ChapterId } from '../../domain/book/ids.js';
import { Outline } from '../../domain/book/Outline.js';
import { Chapter } from '../../domain/book/Chapter.js';
import { PageBudget } from '../../domain/book/PageBudget.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { JobQueue } from '../ports/services/JobQueue.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import { OutlinePrompt } from '../prompts/OutlinePrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

const Schema = z.object({
  title: z.string(),
  entries: z.array(
    z.object({
      title: z.string(),
      purpose: z.string(),
      promise: z.string(),
      keyPoints: z.array(z.string()),
      wordTarget: z.number(),
    }),
  ),
});

/**
 * Phase 9 (Sonnet): generate the outline from strategy + knowledge base,
 * materialize chapters, then fan out one chapter-research job per chapter
 * (the producer owns the GENERATING_CHAPTER_RESEARCH barrier).
 */
export class GenerateOutlineUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly ai: AiTextGenerator,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<void>> {
    const projectId = ProjectId.from(cmd.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    const strategy = await this.knowledge.getBookStrategy(projectId);
    const kb = await this.knowledge.getKnowledgeBase(projectId);
    if (!strategy || !kb) return Result.fail('Book strategy or knowledge base missing');

    const budget = PageBudget.of(project.options.targetPages);
    const chapterCount = Math.max(2, Math.min(14, strategy.chapterCount || 2));
    const inputHash = this.hasher.hash({ strat: strategy.inputHash, kb: kb.inputHash });

    let book = await this.books.findByProject(projectId);
    if (!book?.outline || book.outline.inputHash !== inputHash) {
      const prompt = OutlinePrompt.build({
        bookStrategy: strategy.toText(),
        knowledgeBase: kb.toText(),
        chapterCount,
        perChapterWords: budget.perChapterWords(chapterCount),
        tone: strategy.tone,
      });
      const completion = await this.ai.generate({
        model: 'claude-sonnet-4-6',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        maxTokens: 4000,
        metadata: { projectId: cmd.projectId, stage: 'outline-generate' },
      });
      if (completion.isFail()) return Result.fail(completion.error.type);
      const parsed = parseJsonCompletion(completion.value.text, Schema);
      if (parsed.isFail()) return Result.fail(parsed.error);

      book = book ?? Book.create({ id: BookId.from(this.ids.uuid()), projectId: projectId.value, targetPages: project.options.targetPages });
      book.setTitle(strategy.title);
      book.setOutline(Outline.create({ version: 1, entries: parsed.value.entries, inputHash }));
      // Materialize chapters from the outline (Phase 9 → chapters).
      parsed.value.entries.forEach((entry, index) => {
        book!.addChapter(
          Chapter.create({
            id: ChapterId.from(this.ids.uuid()),
            bookId: book!.id.value,
            position: index,
            title: entry.title,
            topic: entry.purpose,
            promise: entry.promise,
            keyPoints: entry.keyPoints,
            wordTarget: entry.wordTarget,
          }),
        );
      });
      await this.books.save(book);
    }

    // Fan out chapter research and own the GENERATING_CHAPTER_RESEARCH barrier.
    project.setPending('GENERATING_CHAPTER_RESEARCH', book.chapters.length);
    project.advanceTo('GENERATING_CHAPTER_RESEARCH', this.clock.now());
    await this.projects.save(project);

    for (const chapter of book.chapters) {
      await this.queue.enqueue(
        'chapter-research',
        { projectId: projectId.value, chapterId: chapter.id.value, inputHash },
        { jobId: `chapter-research:${projectId.value}:${chapter.id.value}:${inputHash}` },
      );
    }
    return Result.ok();
  }
}
