import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { ImageGenerator } from '../ports/services/ImageGenerator.js';
import type { ObjectStorage } from '../ports/services/ObjectStorage.js';
import { CoverImagePrompt } from '../prompts/CoverImagePrompt.js';
import { EXPORT_BUCKET } from './ExportEbookUseCase.js';

/**
 * Generates one cover illustration per book from the WHOLE-CHANNEL knowledge
 * base (so the art reflects the channel's subject, not just the title) and
 * stores it in the exports bucket. Runs best-effort at the ASSEMBLING stage and
 * is idempotent — once a book has a cover path, it is left untouched, so retries
 * and re-exports neither regenerate nor double-bill.
 */
export class GenerateCoverImageUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly images: ImageGenerator,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(cmd: { projectId: string }): Promise<Result<{ generated: boolean }>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    if (book.coverImagePath) return Result.ok({ generated: false }); // idempotent

    const ctx = await this.books.loadSharedContext(projectId);
    const strategy = await this.knowledge.getBookStrategy(projectId);

    const prompt = CoverImagePrompt.build({
      title: book.title ?? strategy?.title ?? 'Untitled',
      subtitle: strategy?.subtitle ?? '',
      knowledgeBase: ctx.knowledgeBase,
      tone: ctx.tone,
    });

    const image = await this.images.generate({ prompt, size: '1024x1536' });
    if (image.isFail()) return Result.fail(image.error);

    const path = `${projectId.value}/cover.png`;
    const put = await this.storage.put(EXPORT_BUCKET, path, image.value.bytes, image.value.contentType);
    if (put.isFail()) return Result.fail(put.error);

    book.setCoverImagePath(path);
    await this.books.save(book);
    return Result.ok({ generated: true });
  }
}
