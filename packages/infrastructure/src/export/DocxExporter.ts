import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { Result, ExportFormat, type DocumentExporter, type AssembledDocument, type ExportedDocument } from '@yeg/core';

/** Renders the assembled document to a .docx using the `docx` library. */
export class DocxExporter implements DocumentExporter {
  readonly format = ExportFormat.DOCX;

  async export(doc: AssembledDocument): Promise<Result<ExportedDocument>> {
    try {
      const children: Paragraph[] = [
        new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE }),
        ...(doc.subtitle ? [new Paragraph({ children: [new TextRun({ text: doc.subtitle })] })] : []),
        new Paragraph({ children: [new TextRun({ text: doc.author, italics: true })] }),
        new Paragraph({ children: [new TextRun({ text: doc.copyright, size: 16 })], pageBreakBefore: true }),
      ];

      // Front matter (introduction, foreword).
      for (const m of doc.frontMatter) {
        children.push(new Paragraph({ text: m.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        children.push(...toParagraphs(m.content));
      }

      // Table of contents.
      if (doc.tableOfContents.length) {
        children.push(new Paragraph({ text: 'Contents', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        doc.tableOfContents.forEach((t, i) => children.push(new Paragraph({ children: [new TextRun(`${i + 1}. ${t}`)] })));
      }

      for (const chapter of doc.chapters) {
        children.push(new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        children.push(...toParagraphs(chapter.content));
        for (const section of chapter.sections) {
          children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2 }));
          children.push(...toParagraphs(section.content));
        }
      }

      // Back matter (conclusion, FAQ, resources, glossary, bonus chapter, about).
      for (const m of doc.backMatter) {
        children.push(new Paragraph({ text: m.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
        children.push(...toParagraphs(m.content));
      }

      const document = new Document({ sections: [{ children }] });
      const buffer = await Packer.toBuffer(document);
      // ~3 paragraphs/inch is a rough heuristic; real count comes from the PDF render.
      const pageCount = Math.max(1, Math.ceil(children.length / 30));
      return Result.ok({
        bytes: new Uint8Array(buffer),
        pageCount,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    } catch (e) {
      return Result.fail(e instanceof Error ? e.message : String(e));
    }
  }
}

function toParagraphs(markdown: string): Paragraph[] {
  return markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith('## ')) return new Paragraph({ text: block.slice(3), heading: HeadingLevel.HEADING_2 });
      if (block.startsWith('### ')) return new Paragraph({ text: block.slice(4), heading: HeadingLevel.HEADING_3 });
      return new Paragraph({ children: [new TextRun(block.replace(/[*#]/g, ''))] });
    });
}
