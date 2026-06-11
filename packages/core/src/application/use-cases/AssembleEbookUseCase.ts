import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AssembledDocument } from '../ports/services/DocumentExporter.js';
import type { ObjectStorage } from '../ports/services/ObjectStorage.js';
import type { Clock } from '../ports/Clock.js';
import type { ProjectJob } from '../dto/jobs.dto.js';
import { EXPORT_BUCKET } from './ExportEbookUseCase.js';

/**
 * Phase 14: assemble a deterministic document model with front matter (title
 * page, copyright, TOC), body (chapters + sections) and back matter.
 */
export class AssembleEbookUseCase {
  constructor(
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly clock: Clock,
    private readonly storage: ObjectStorage,
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

    // Sign a short-lived URL for the generated cover art (rendered full-bleed behind the
    // cover text). Best-effort: a missing/unsignable cover just falls back to the plain cover.
    let coverImage: string | undefined;
    if (book.coverImagePath) {
      const signed = await this.storage.signedUrl(EXPORT_BUCKET, book.coverImagePath, 3600);
      if (signed.isOk()) coverImage = signed.value;
    }

    const doc: AssembledDocument = {
      title: strategy?.title ?? 'Generated Ebook',
      subtitle: strategy?.subtitle ?? '',
      promise: strategy?.corePromise ?? '',
      ...(coverImage ? { coverImage } : {}),
      author: strategy?.author?.trim() || 'The Author',
      copyright: `© ${year}. All rights reserved. Generated from publicly available YouTube content.`,
      tableOfContents: orderedChapters.map((c) => c.title),
      // Front matter (Foreword, Introduction). Strip any leading heading so the content
      // doesn't repeat the section title the renderer already prints.
      frontMatter: book
        .frontMatter()
        .filter((s) => s.status === 'DONE' && s.content)
        .map((s) => ({ title: s.title, content: stripLeadingHeadings(s.content ?? '') })),
      chapters: orderedChapters.map((c) => ({
        title: cleanChapterTitle(c.title),
        // Chapters are pure prose: the renderer prints the chapter number + title, and the
        // book must carry no in-chapter subtitles, so strip every heading from the body.
        content: stripAllHeadings(c.content ?? ''),
        sections: [...c.sections]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ title: s.title, content: s.content ?? '' })),
      })),
      // Back matter (Conclusion, plus any author-added FAQ/resources/glossary/bonus).
      backMatter: book
        .backMatter()
        .filter((s) => s.status === 'DONE' && s.content)
        .map((s) => ({ title: s.title, content: stripLeadingHeadings(s.content ?? '') })),
    };
    return Result.ok(doc);
  }
}

/** Strip a leading "Chapter N:" / "Chapter N —" prefix; the layout prints the number itself. */
function cleanChapterTitle(title: string): string {
  return title.replace(/^\s*chapter\s+\d+\s*[:.\-–—]?\s*/i, '').trim() || title.trim();
}

/**
 * Chapters must begin with prose. Remove up to two leading Markdown heading lines
 * (a title echo and/or a subtitle/tagline) so the body doesn't duplicate the
 * chapter title the renderer already prints.
 */
function stripLeadingHeadings(content: string): string {
  const lines = content.split(/\r?\n/);
  let removed = 0;
  while (removed < 2) {
    let i = 0;
    while (i < lines.length && (lines[i] ?? '').trim() === '') i++;
    const line = lines[i];
    if (line !== undefined && /^#{1,6}\s+\S/.test(line.trim())) {
      lines.splice(0, i + 1);
      removed++;
    } else break;
  }
  return lines.join('\n').replace(/^\s+/, '');
}

/**
 * Remove EVERY Markdown heading line from a chapter body. Chapters are rendered as
 * one continuous narrative under a single title; any in-chapter "##" heading reads
 * as an unwanted subtitle, so we drop them all and collapse the blank lines left behind.
 */
function stripAllHeadings(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s+/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '');
}
