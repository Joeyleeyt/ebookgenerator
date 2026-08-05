import { Result, type RemoteImageFetcher } from '@yeg/core';
import { assertPublicUrl } from './HttpReferencePageFetcher.js';

/** An avatar/logo, not a wallpaper. */
const MAX_IMAGE_BYTES = 1_500_000;

/**
 * Fetches a remote image (the YouTube channel avatar that becomes the page's
 * logo) and returns it as a data: URI for embedding. Same SSRF discipline as
 * the reference fetcher — the URL is stored data that originated outside us.
 */
export class HttpImageFetcher implements RemoteImageFetcher {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetchDataUri(url: string): Promise<Result<string>> {
    const safe = await assertPublicUrl(url);
    if (safe.isFail()) return Result.fail(safe.error);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'EbookGenerator/1.0 (+landing-page logo fetch)', Accept: 'image/*' },
      });
    } catch (e) {
      return Result.fail(`Could not fetch image: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) return Result.fail(`Image fetch returned ${res.status}`);

    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return Result.fail(`Not an image: ${type || 'unknown content type'}`);

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) return Result.fail('Image is too large to embed');
    if (buffer.byteLength === 0) return Result.fail('Image was empty');

    return Result.ok(`data:${type.split(';')[0]};base64,${Buffer.from(buffer).toString('base64')}`);
  }
}
