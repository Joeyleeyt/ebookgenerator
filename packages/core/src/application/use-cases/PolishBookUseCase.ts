import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { Clock } from '../ports/Clock.js';
import { PolishPrompt } from '../prompts/PolishPrompt.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

/**
 * Phase 12 (Opus). Polishes each chapter for flow, transitions, consistency and
 * readability. Done per chapter (45k words won't fit one call), threading the
 * previous chapter title for smooth handoffs. Idempotent: a chapter already at
 * a 'polished' inputHash is skipped.
 */
export class PolishBookUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly ai: AiTextGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<{ polished: number }>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    const strategy = await this.knowledge.getBookStrategy(projectId);
    const tone = strategy?.tone ?? 'professional';
    const authorVoice = strategy?.authorVoice ?? 'authoritative and clear';

    const chapters = [...book.chapters].sort((a, b) => a.position - b.position);
    let polished = 0;
    let previousTitle: string | null = null;

    for (const chapter of chapters) {
      const polishHash = `polished:${chapter.version}`;
      if (chapter.isGeneratedFor(polishHash) || !chapter.content) {
        previousTitle = chapter.title;
        continue; // already polished for this version, or nothing to polish
      }
      const completion = await this.ai.generate({
        model: 'claude-opus-4-8',
        system: PolishPrompt.system({ tone, authorVoice }),
        messages: [{ role: 'user', content: PolishPrompt.user({ title: chapter.title, content: chapter.content, previousChapterTitle: previousTitle }) }],
        maxTokens: 8000,
        metadata: { projectId: cmd.projectId, stage: 'polish-book' },
      });
      if (completion.isFail()) return Result.fail(completion.error.type);

      book.regenerateChapter(chapter.id, { content: completion.value.text, inputHash: polishHash }, this.clock.now());
      polished++;
      previousTitle = chapter.title;
    }

    await this.books.save(book);
    return Result.ok({ polished });
  }
}
