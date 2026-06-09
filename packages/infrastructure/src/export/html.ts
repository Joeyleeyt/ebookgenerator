import type { AssembledDocument } from '@yeg/core';

/** Minimal, dependency-free Markdown→HTML for headings/paragraphs/emphasis. */
export function renderHtml(doc: AssembledDocument): string {
  const matter = (m: { title: string; content: string }) =>
    `<section class="matter"><h1>${esc(m.title)}</h1>${md(m.content)}</section>`;

  const frontMatter = doc.frontMatter.map(matter).join('\n');
  const toc = doc.tableOfContents.length
    ? `<section class="toc"><h1>Contents</h1><ol>${doc.tableOfContents.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>`
    : '';
  const chapters = doc.chapters
    .map((c) => {
      const sections = c.sections.map((s) => `<h3>${esc(s.title)}</h3>${md(s.content)}`).join('\n');
      return `<section class="chapter"><h1>${esc(c.title)}</h1>${md(c.content)}${sections}</section>`;
    })
    .join('\n');
  const backMatter = doc.backMatter.map(matter).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; }
    body { font-family: Georgia, serif; line-height: 1.6; color: #1a1a1a; }
    h1 { page-break-before: always; font-size: 26px; margin-top: 0; }
    h2 { font-size: 20px; } h3 { font-size: 16px; }
    .title-page { text-align: center; padding-top: 35vh; }
    .title-page h1 { page-break-before: avoid; font-size: 40px; }
    .title-page .subtitle { font-size: 18px; color: #555; }
    .copyright { page-break-before: always; font-size: 12px; color: #555; }
    .toc ol { line-height: 2; } p { margin: 0 0 12px; text-align: justify; }
  </style></head><body>
    <div class="title-page"><h1>${esc(doc.title)}</h1>${doc.subtitle ? `<p class="subtitle">${esc(doc.subtitle)}</p>` : ''}<p>${esc(doc.author)}</p></div>
    <div class="copyright"><p>${esc(doc.copyright)}</p></div>
    ${frontMatter}
    ${toc}
    ${chapters}
    ${backMatter}
  </body></html>`;
}

function md(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (t.startsWith('### ')) return `<h3>${esc(t.slice(4))}</h3>`;
      if (t.startsWith('## ')) return `<h2>${esc(t.slice(3))}</h2>`;
      if (t.startsWith('# ')) return `<h2>${esc(t.slice(2))}</h2>`;
      return `<p>${inline(esc(t))}</p>`;
    })
    .join('\n');
}

function inline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
