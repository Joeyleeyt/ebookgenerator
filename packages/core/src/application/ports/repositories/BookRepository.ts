import type { Book } from '../../../domain/book/Book.js';
import type { BookId } from '../../../domain/book/ids.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

export interface SharedChapterContext {
  bookStrategy: string;
  knowledgeBase: string;
  tone: string;
  authorVoice: string;
  contextVersion: string;
}

export interface BookRepository {
  findByProject(projectId: ProjectId): Promise<Book | null>;
  findById(id: BookId): Promise<Book | null>;
  save(book: Book): Promise<void>;
  /** Snapshot current chapter content into chapter_versions before a regenerate. */
  snapshotChapterVersion(bookId: BookId, chapterId: string): Promise<void>;
  /** The cached prompt prefix shared across all chapter generations. */
  loadSharedContext(projectId: ProjectId): Promise<SharedChapterContext>;
}
