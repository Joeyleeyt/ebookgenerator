import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { Illustration } from '../../domain/book/Illustration.js';
import { IllustrationId } from '../../domain/book/ids.js';
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

  async execute(cmd: { projectId: string }): Promise<Result<{ generated: number; attempted: number; error?: string }>> {
    const projectId = ProjectId.from(cmd.projectId);

    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!project.options.includeIllustrations) return Result.ok({ generated: 0, attempted: 0 }); // feature off

    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    if (book.illustrations.length > 0) return Result.ok({ generated: 0, attempted: 0 }); // idempotent

    const ctx = await this.books.loadSharedContext(projectId);
    const everyPages = Math.max(1, project.options.illustrationEveryPages);

    // "One illustration per N pages" is anchored to the book's TARGET page count
    // (what the client chose), NOT the actual generated word count — otherwise a
    // book that the model wrote short would silently get far fewer images than the
    // client asked for. 100 target pages ÷ 5 ⇒ 20 illustrations.
    const targetCount = Math.max(1, Math.round(project.options.targetPages / everyPages));

    const chapters = [...book.chapters]
      .filter((c) => c.status === 'DONE' && (c.content ?? '').trim().length > 0)
      .sort((a, b) => a.position - b.position);
    if (chapters.length === 0) return Result.ok({ generated: 0, attempted: 0 });

    // Distribute the target count across chapters in proportion to their length
    // (largest-remainder), so longer chapters host more images and the total lands
    // exactly on targetCount regardless of how the words fell across chapters.
    const chapterWords = chapters.map((c) => (c.content ?? '').trim().split(/\s+/));
    const wordCounts = chapterWords.map((w) => w.length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;
    const exact = wordCounts.map((w) => (w / totalWords) * targetCount);
    const counts = exact.map(Math.floor);
    let remainder = targetCount - counts.reduce((a, b) => a + b, 0);
    [...exact.keys()]
      .sort((a, b) => exact[b]! - counts[b]! - (exact[a]! - counts[a]!))
      .forEach((idx) => {
        if (remainder > 0) {
          counts[idx]!++;
          remainder--;
        }
      });

    const plan: Array<{ chapterId: string; chapterTitle: string; order: number; passage: string }> = [];
    chapters.forEach((ch, ci) => {
      const k = counts[ci]!;
      const words = chapterWords[ci]!;
      for (let i = 0; i < k; i++) {
        plan.push({
          chapterId: ch.id.value,
          chapterTitle: ch.title,
          order: i,
          // Passage = the slice of the chapter this slot sits over, so the prompt
          // (and therefore the art) matches the text it will be placed beside.
          passage: sliceWords(words, i, k, 160),
        });
      }
    });

    if (plan.length === 0) return Result.ok({ generated: 0, attempted: 0 });

    // Generate concurrently; a failed image is skipped, not fatal — but its reason
    // is captured so the caller can log WHY the bucket ended up short.
    const outcomes = await Promise.all(
      plan.map(async (slot): Promise<{ illustration?: Illustration; error?: string }> => {
        const prompt = IllustrationPrompt.build({
          chapterTitle: slot.chapterTitle,
          passage: slot.passage,
          bookSubject: ctx.knowledgeBase,
          tone: ctx.tone,
        });
        const image = await this.images.generate({ prompt, size: '1536x1024' });
        if (image.isFail()) return { error: `generate: ${image.error}` };
        const path = `${projectId.value}/illustrations/${slot.chapterId}-${slot.order}.png`;
        const put = await this.storage.put(EXPORT_BUCKET, path, image.value.bytes, image.value.contentType);
        if (put.isFail()) return { error: `store: ${put.error}` };
        return {
          illustration: Illustration.create({
            id: IllustrationId.from(this.ids.uuid()),
            chapterId: slot.chapterId,
            orderInChapter: slot.order,
            storagePath: path,
            prompt,
          }),
        };
      }),
    );

    const made = outcomes.map((o) => o.illustration).filter((i): i is Illustration => i !== undefined);
    for (const ill of made) book.addIllustration(ill);
    if (made.length > 0) await this.books.save(book);

    const firstError = outcomes.find((o) => o.error)?.error;
    return Result.ok({
      generated: made.length,
      attempted: plan.length,
      ...(firstError ? { error: firstError } : {}),
    });
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
