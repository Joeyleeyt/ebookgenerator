import puppeteer from 'puppeteer';
import { createRequire } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { Result, ExportFormat, type DocumentExporter, type AssembledDocument, type ExportedDocument } from '@yeg/core';
import { renderHtml } from './html.js';
import { renderCookbookHtml } from './cookbookHtml.js';

// Paged.js polyfill — runs in the page to lay out CSS Paged Media features that
// headless Chrome alone can't: running headers, named pages, and real TOC page
// numbers (target-counter). The package's `exports` map blocks the dist subpath,
// so derive it from the resolved package root.
//
// Resolved LAZILY (on first export), not at module load. This file is reachable
// from the Next.js web build via the shared DI container, and a top-level
// `require.resolve('pagedjs')` gets rewritten by webpack into a numeric module id
// — `path.dirname(<number>)` then throws and crashes `next build`'s page-data
// collection. The web app never exports PDFs (that runs only in the worker, plain
// Node with no bundler), so deferring the resolve keeps it out of that code path.
let pagedPolyfillPath: string | undefined;
function pagedPolyfillFile(): string {
  if (pagedPolyfillPath === undefined) {
    const requireFromHere = createRequire(import.meta.url);
    pagedPolyfillPath = resolvePath(dirname(requireFromHere.resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js');
  }
  return pagedPolyfillPath;
}

/** Renders the assembled document to a paginated PDF via Paged.js + headless Chromium. */
export class PuppeteerPdfExporter implements DocumentExporter {
  readonly format = ExportFormat.PDF;

  async export(doc: AssembledDocument): Promise<Result<ExportedDocument>> {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      // Books with illustrations inline many large base64 images (OpenAI PNGs are
      // ~3MB each → ~4MB as base64), so parsing/decoding the document can exceed
      // Puppeteer's default 30s navigation timeout on a constrained container.
      // Everything is inlined as data URIs (no real network), so raise the ceiling
      // generously rather than waiting on a network that never fires.
      const html = doc.bookType === 'cooking' ? renderCookbookHtml(doc) : renderHtml(doc);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120_000 });
      // Configure Paged.js to auto-run with a completion flag, THEN load the polyfill.
      // (Auto-mode is the only path that honours `@page { size }`; calling preview()
      // manually leaves the sheet at Paged.js's US-Letter default, which shrinks the
      // A4 cover and leaves a gap at the page edges.)
      await page.addScriptTag({
        content: 'window.PagedConfig = { auto: true, after: function () { window.__pagedRendered = true; } };',
      });
      await page.addScriptTag({ path: pagedPolyfillFile() });
      // Wait until Paged.js has built every page box.
      await page.waitForFunction('window.__pagedRendered === true', { timeout: 60000 });
      // Auto-fit recipe cards AFTER pagination so each recipe FILLS its fixed one-page
      // card — neither overflowing nor leaving a big empty gap at the bottom. We scale
      // the `.recipe__fit` region with `zoom` (which reflows and changes real height):
      // shrink a content-heavy recipe until it fits, or grow a short recipe up until it
      // nearly fills the card. Runs post-Paged.js so it measures the ACTUAL paginated
      // card boxes, re-checking after each step because zoom reflows the content.
      await page.evaluate(() => {
        const doc = (globalThis as unknown as { document: any }).document;
        const cards: any[] = Array.prototype.slice.call(doc.querySelectorAll('.recipe__card'));
        for (const card of cards) {
          const fit = card.querySelector('.recipe__fit');
          if (!fit) continue;
          const banner = card.querySelector('.recipe__banner');
          const cs = card.ownerDocument.defaultView.getComputedStyle(card);
          // Height the fit box may occupy = card content box minus banner, minus a
          // small safety margin so nothing kisses the printed frame.
          const avail =
            card.clientHeight -
            parseFloat(cs.paddingTop) -
            parseFloat(cs.paddingBottom) -
            (banner ? banner.offsetHeight : 0) -
            8;
          let z = 1;
          if (fit.scrollHeight > avail) {
            // Overflowing — shrink in small steps down to 60% until it fits.
            for (let guard = 0; guard < 24 && fit.scrollHeight > avail && z > 0.6; guard++) {
              z = Math.max(0.6, z - 0.02);
              fit.style.zoom = String(z);
            }
          } else {
            // Short recipe with surplus room — grow up to 1.35× until it nearly fills
            // the card, so there's no large empty band at the bottom. Stop one step
            // BEFORE it would overflow (roll back the last step that broke the fit).
            for (let guard = 0; guard < 24 && z < 1.35; guard++) {
              const next = Math.min(1.35, z + 0.02);
              fit.style.zoom = String(next);
              if (fit.scrollHeight > avail) {
                fit.style.zoom = String(z); // last good step
                break;
              }
              z = next;
            }
          }
        }
      });
      // Fill the Table of Contents page numbers from the actual pagination (paged.js'
      // target-counter doesn't resolve forward refs reliably, so we read the real page
      // each chapter landed on and write it into the entry).
      await page.evaluate(() => {
        const g = globalThis as unknown as { document: any; CSS: { escape: (s: string) => string } };
        const pages: any[] = Array.prototype.slice.call(g.document.querySelectorAll('.pagedjs_page'));
        const entries: any[] = Array.prototype.slice.call(g.document.querySelectorAll('.toc__entry'));
        for (const entry of entries) {
          const id = String(entry.getAttribute('href') || '').replace(/^#/, '');
          if (!id) continue;
          const idx = pages.findIndex((pg: any) => pg.querySelector('#' + g.CSS.escape(id)));
          const slot = entry.querySelector('.toc__pageno');
          if (slot && idx !== -1) slot.textContent = String(idx + 1);
        }
      });
      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true, // use the @page size Paged.js laid out
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      const pageCount = await page.evaluate(
        () => (globalThis as unknown as { document: { querySelectorAll: (s: string) => { length: number } } }).document.querySelectorAll('.pagedjs_page').length,
      );
      return Result.ok({ bytes: new Uint8Array(pdf), pageCount: Math.max(1, pageCount), contentType: 'application/pdf' });
    } catch (e) {
      return Result.fail(e instanceof Error ? e.message : String(e));
    } finally {
      await browser.close();
    }
  }
}
