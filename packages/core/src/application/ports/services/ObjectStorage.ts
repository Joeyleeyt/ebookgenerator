import type { Result } from '../../../domain/shared/Result.js';

export interface ObjectStorage {
  put(bucket: string, path: string, data: Uint8Array, contentType: string): Promise<Result<{ path: string }>>;
  /** Time-limited signed URL for client download. */
  signedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<Result<string>>;
  remove(bucket: string, path: string): Promise<Result<void>>;
}
