import type { Result } from '../../../domain/shared/Result.js';
import type { ExportFormat } from '../../../domain/export/ExportArtifact.js';

export interface AssembledDocument {
  title: string;
  subtitle: string;
  /** Optional cover promise/benefit line (the book's core promise). */
  promise?: string;
  /** Optional URL of the AI-generated cover illustration, rendered full-bleed behind the cover text. */
  coverImage?: string;
  author: string;
  copyright: string;
  /** Front-matter table of contents (chapter titles in order). */
  tableOfContents: string[];
  /** Front matter (introduction, foreword) rendered before the chapters. */
  frontMatter: Array<{ title: string; content: string }>;
  chapters: Array<{
    title: string;
    content: string; // markdown
    sections: Array<{ title: string; content: string }>;
  }>;
  /** Optional back-matter (conclusion, resources, glossary, about author). */
  backMatter: Array<{ title: string; content: string }>;
}

export interface ExportedDocument {
  bytes: Uint8Array;
  pageCount: number;
  contentType: string;
}

/** PDF (Puppeteer) and DOCX exporters implement this. */
export interface DocumentExporter {
  readonly format: ExportFormat;
  export(doc: AssembledDocument): Promise<Result<ExportedDocument>>;
}
