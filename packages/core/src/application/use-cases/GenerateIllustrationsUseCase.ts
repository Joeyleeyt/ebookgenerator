import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { Illustration } from '../../domain/book/Illustration.js';
import { IllustrationId } from '../../domain/book/ids.js';
import { PageBudget } from '../../domain/book/PageBudget.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { ImageGenerator } from '../ports/services/ImageGenerator.js';
import type { ObjectStorage } from '../ports/services/ObjectStorage.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import { IllustrationPrompt } from '../prompts/IllustrationPrompt.js';
import { EXPORT_BUCKET } from './ExportEbookUseCase.js';

/**
 * Generates the in-chapter illustrations and stores them in the exports bucket.
 * One illustration roughly every `illustrationEveryPages` finished pages, spread
 * across chapters in proportion to their length, and EACH generated from the
 * passage it sits beside so the art matches the surrounding content.
 *
 * Runs best-effort at the ASSEMBLING stage and is idempotent: a book that
 * already has illustrations is left untouched, so retries/re-exports neither
 * regenerate nor double-bill. Individual image failures are skipped, never fatal.
 */
export class GenerateIllustrationsUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly projects: ProjectRepository,
    private readonly images: ImageGenerator,
    private readonly storage: ObjectStorage,
    private readonly ids: IdGenerator,
  ) {}

  async execute(cmd: { projectId: string }): Promise<Result<{ generated: number }>> {
    const projectId = ProjectId.from(cmd.projectId);

    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!project.options.includeIllustrations) return Result.ok({ generated: 0 }); // feature off

    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    if (book.illustrations.length > 0) return Result.ok({ generated: 0 }); // idempotent

    const ctx = await this.books.loadSharedContext(projectId);
    const everyPages = Math.max(1, project.options.illustrationEveryPages);
    const wordsPerImage = everyPages * PageBudget.WORDS_PER_PAGE;

    // Only chapters with real prose can host an illustration. Allocate a count per
    // chapter proportional to length, carrying the remainder so the global cadence
    // (≈ one per `wordsPerImage`) holds across chapter boundaries.
    const chapters = [...book.chapters]
      .filter((c) => c.status === 'DONE' && (c.content ?? '').trim().length > 0)
      .sort((a, b) => a.position - b.position);

    const plan: Array<{ chapterId: string; chapterTitle: string; order: number; passage: string }> = [];
    let carried = 0;
    for (const ch of chapters) {
      const words = (ch.content ?? '').trim().split(/\s+/);
      const available = carried + words.length;
      const count = Math.floor(available / wordsPerImage);
      carried = available - count * wordsPerImage;
      for (let i = 0; i < count; i++) {
        plan.push({
          chapterId: ch.id.value,
          chapterTitle: ch.title,
          order: i,
          // Passage = the slice of the chapter this slot sits over, so the prompt
          // (and therefore the art) matches the text it will be placed beside.
          passage: sliceWords(words, i, count, 160),
        });
      }
    }

    if (plan.length === 0) return Result.ok({ generated: 0 });

    // Generate concurrently; a failed image is skipped, not fatal.
    const results = await Promise.all(
      plan.map(async (slot) => {
        const prompt = IllustrationPrompt.build({
          chapterTitle: slot.chapterTitle,
          passage: slot.passage,
          bookSubject: ctx.knowledgeBase,
          tone: ctx.tone,
        });
        const image = await this.images.generate({ prompt, size: '1536x1024' });
        if (image.isFail()) return null;
        const path = `${projectId.value}/illustrations/${slot.chapterId}-${slot.order}.png`;
        const put = await this.storage.put(EXPORT_BUCKET, path, image.value.bytes, image.value.contentType);
        if (put.isFail()) return null;
        return Illustration.create({
          id: IllustrationId.from(this.ids.uuid()),
          chapterId: slot.chapterId,
          orderInChapter: slot.order,
          storagePath: path,
          prompt,
        });
      }),
    );

    const made = results.filter((r): r is Illustration => r !== null);
    for (const ill of made) book.addIllustration(ill);
    if (made.length > 0) await this.books.save(book);

    return Result.ok({ generated: made.length });
  }
}

/** The `index`-th of `count` equal word-slices of a chapter, trimmed to `maxWords`. */
function sliceWords(words: string[], index: number, count: number, maxWords: number): string {
  const per = Math.max(1, Math.floor(words.length / count));
  const start = index * per;
  return words
    .slice(start, start + maxWords)
    .join(' ')
    .replace(/[#*_`>]/g, '');
}
