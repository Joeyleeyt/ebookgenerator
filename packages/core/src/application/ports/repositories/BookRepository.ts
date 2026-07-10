import type { Book } from '../../../domain/book/Book.js';
import type { Chapter } from '../../../domain/book/Chapter.js';
import type { BookId } from '../../../domain/book/ids.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

export interface SharedChapterContext {
  bookStrategy: string;
  knowledgeBase: string;
  tone: string;
  authorVoice: string;
  contextVersion: string;
  /** The kind of book being written; drives recipe vs. prose generation. */
  bookType: 'normal' | 'cooking';
}

export interface BookRepository {
  findByProject(projectId: ProjectId): Promise<Book | null>;
  findById(id: BookId): Promise<Book | null>;
  save(book: Book): Promise<void>;
  /**
   * Persist a single chapter (and its sections) without rewriting the rest of the
   * book. Required for parallel per-chapter writes (e.g. polishing): a full
   * `save(book)` re-upserts every chapter, so concurrent savers would clobber
   * each other's in-flight changes with their own stale snapshot.
   */
  saveChapter(bookId: BookId, chapter: Chapter): Promise<void>;
  /** Snapshot current chapter content into chapter_versions before a regenerate. */
  snapshotChapterVersion(bookId: BookId, chapterId: string): Promise<void>;
  /** The cached prompt prefix shared across all chapter generations. */
  loadSharedContext(projectId: ProjectId): Promise<SharedChapterContext>;
}
