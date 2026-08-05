import { Result, type EmbeddedFont, type WebFontFetcher } from '@yeg/core';
import { assertPublicUrl } from './HttpReferencePageFetcher.js';

/**
 * Origins that serve ONLY openly-licensed fonts (OFL / Apache / UFL), whose
 * terms permit redistribution — which is what inlining a font into a published
 * page does.
 *
 * This allowlist is the licence decision, made once and in code. A font served
 * from the reference site's own domain is refused no matter how good it looks:
 * it is very likely commercially licensed to that site alone, and copying it
 * into someone else's sales page is the kind of infringement nobody notices
 * until it matters.
 */
const OPEN_FONT_HOSTS = new Set([
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'cdn.jsdelivr.net', // serves @fontsource, which is OFL/Apache by policy
]);

/** A woff2 face is 20-120KB; anything larger is not a subsetted web font. */
const MAX_FONT_BYTES = 400_000;

/** Two faces are plenty — a display and a body — and each one costs page weight. */
const MAX_FONTS = 3;

/**
 * Inlines a reference's real typefaces when their licence allows it.
 *
 * Everything here is best-effort. A page that falls back to the closest system
 * stack is a working page; a page that fails to build because a font server was
 * slow is not.
 */
export class HttpWebFontFetcher implements WebFontFetcher {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async embedFrom(css: string, baseUrl: string): Promise<Result<EmbeddedFont[]>> {
    const faces = parseFontFaces(css);
    const embedded: EmbeddedFont[] = [];

    for (const face of faces) {
      if (embedded.length >= MAX_FONTS) break;
      // Prefer woff2: smallest, and universally supported by anything that can
      // render a modern landing page.
      const source = face.sources.find((s) => s.format === 'woff2') ?? face.sources[0];
      if (!source) continue;

      let absolute: URL;
      try {
        absolute = new URL(source.url, baseUrl);
      } catch {
        continue;
      }
      // The licence gate. Deliberately before the fetch, so a commercial font
      // is never even downloaded.
      if (!OPEN_FONT_HOSTS.has(absolute.hostname.toLowerCase())) continue;

      const safe = await assertPublicUrl(absolute.toString());
      if (safe.isFail()) continue;

      const bytes = await this.read(absolute.toString());
      if (!bytes) continue;

      const mime = source.format === 'woff2' ? 'font/woff2' : source.format === 'woff' ? 'font/woff' : 'font/ttf';
      const dataUri = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
      embedded.push({
        family: face.family,
        fontFaceCss:
          `@font-face{font-family:'${face.family.replace(/'/g, '')}';` +
          `font-style:${face.style};font-weight:${face.weight};font-display:swap;` +
          `src:url(${dataUri}) format('${source.format}');}`,
      });
    }

    return Result.ok(embedded);
  }

  private async read(url: string): Promise<Uint8Array | null> {
    try {
      const res = await this.fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'EbookGenerator/1.0 (+landing-page font embed)' },
      });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_FONT_BYTES) return null;
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }
}

interface ParsedFace {
  family: string;
  weight: string;
  style: string;
  sources: Array<{ url: string; format: string }>;
}

/**
 * Pulls `@font-face` blocks out of a stylesheet.
 *
 * Regex rather than a CSS parse for the same reason the page digest is: we need
 * a handful of fields, not a syntax tree, and a parser is a dependency plus a
 * new class of failure on malformed third-party CSS.
 */
export function parseFontFaces(css: string): ParsedFace[] {
  const faces: ParsedFace[] = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const body = block[1] ?? '';
    const family = /font-family:\s*["']?([^;"']+)["']?/i.exec(body)?.[1]?.trim();
    if (!family) continue;

    // Only upright regular/medium weights: italics and heavy display cuts
    // multiply page weight for faces the layout will rarely call for.
    const weight = /font-weight:\s*([^;]+)/i.exec(body)?.[1]?.trim() ?? '400';
    const style = /font-style:\s*([^;]+)/i.exec(body)?.[1]?.trim() ?? 'normal';
    if (style.toLowerCase() !== 'normal') continue;

    const sources: Array<{ url: string; format: string }> = [];
    for (const src of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/gi)) {
      const url = src[1]?.trim();
      if (!url || url.startsWith('data:')) continue;
      const format = (src[2] ?? url.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      sources.push({ url, format });
    }
    if (sources.length > 0) faces.push({ family, weight, style, sources });
  }
  return faces;
}
