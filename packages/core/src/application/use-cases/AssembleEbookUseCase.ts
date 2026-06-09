import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AssembledDocument } from '../ports/services/DocumentExporter.js';
import type { Clock } from '../ports/Clock.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

/**
 * Phase 14: assemble a deterministic document model with front matter (title
 * page, copyright, TOC), body (chapters + sections) and back matter.
 */
export class AssembleEbookUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<AssembledDocument>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');

    const incomplete = book.chapters.filter((c) => c.status !== 'DONE');
    if (incomplete.length > 0) {
      return Result.fail(`Cannot assemble: ${incomplete.length} chapter(s) not generated`);
    }

    const strategy = await this.knowledge.getBookStrategy(projectId);
    const orderedChapters = [...book.chapters].sort((a, b) => a.position - b.position);
    const year = this.clock.now().getFullYear();

    const doc: AssembledDocument = {
      title: strategy?.title ?? 'Generated Ebook',
      subtitle: strategy?.subtitle ?? '',
      author: 'YouTube Ebook Generator',
      copyright: `© ${year}. All rights reserved. Generated from publicly available YouTube content.`,
      tableOfContents: orderedChapters.map((c) => c.title),
      frontMatter: book
        .frontMatter()
        .filter((s) => s.status === 'DONE' && s.content)
        .map((s) => ({ title: s.title, content: s.content ?? '' })),
      chapters: orderedChapters.map((c) => ({
        title: c.title,
        content: c.content ?? '',
        sections: [...c.sections]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ title: s.title, content: s.content ?? '' })),
      })),
      backMatter: [
        // Author-added back matter (conclusion, FAQ, resources, glossary, bonus chapter…).
        ...book
          .backMatter()
          .filter((s) => s.status === 'DONE' && s.content)
          .map((s) => ({ title: s.title, content: s.content ?? '' })),
        {
          title: 'About This Book',
          content: strategy?.corePromise
            ? `This book delivers on a single promise: ${strategy.corePromise}`
            : 'Thank you for reading.',
        },
      ],
    };
    return Result.ok(doc);
  }
}
