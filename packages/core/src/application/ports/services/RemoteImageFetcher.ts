import type { Result } from '../../../domain/shared/Result.js';

/**
 * Fetches a remote image (e.g. the YouTube channel avatar that becomes the
 * page's logo) and returns it as a `data:` URI for embedding. Implementations
 * MUST apply the same SSRF discipline as the reference-page fetcher: the URL
 * ultimately originates outside our control.
 */
export interface RemoteImageFetcher {
  fetchDataUri(url: string): Promise<Result<string>>;
}
