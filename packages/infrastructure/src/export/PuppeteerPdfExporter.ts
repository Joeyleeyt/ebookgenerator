import puppeteer from 'puppeteer';
import { Result, ExportFormat, type DocumentExporter, type AssembledDocument, type ExportedDocument } from '@yeg/core';
import { renderHtml } from './html.js';

/** Renders the assembled document to a paginated PDF via headless Chromium. */
export class PuppeteerPdfExporter implements DocumentExporter {
  readonly format = ExportFormat.PDF;

  async export(doc: AssembledDocument): Promise<Result<ExportedDocument>> {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(renderHtml(doc), { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
        printBackground: true,
        displayHeaderFooter: true,
        footerTemplate: '<div style="font-size:9px;width:100%;text-align:center;"><span class="pageNumber"></span></div>',
        headerTemplate: '<div></div>',
      });
      const pageCount = await estimatePageCount(page);
      return Result.ok({ bytes: new Uint8Array(pdf), pageCount, contentType: 'application/pdf' });
    } catch (e) {
      return Result.fail(e instanceof Error ? e.message : String(e));
    } finally {
      await browser.close();
    }
  }
}

async function estimatePageCount(page: import('puppeteer').Page): Promise<number> {
  // Runs in the browser context; avoid requiring the DOM lib in this package.
  const height = await page.evaluate(
    () => (globalThis as unknown as { document: { body: { scrollHeight: number } } }).document.body.scrollHeight,
  );
  const a4PxHeight = 1122; // ~96dpi A4
  return Math.max(1, Math.ceil(height / a4PxHeight));
}
