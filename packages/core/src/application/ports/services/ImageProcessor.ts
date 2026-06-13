import type { Result } from '../../../domain/shared/Result.js';

export interface ProcessedImage {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Post-processes a raster image — primarily to downscale and re-encode generated
 * illustrations before they're stored and inlined into the export. Image models
 * return needlessly large files (OpenAI gpt-image-1 PNGs are ~3MB), but
 * illustrations render at only ~76% page width, so shrinking them to a sane
 * print resolution keeps the inlined PDF small and fast to render.
 */
export interface ImageProcessor {
  /**
   * Resize to at most `maxWidth` px wide (never upscaling) and re-encode as JPEG
   * at `quality` (1–100). Returns the processed bytes and their content type.
   */
  downscaleToJpeg(input: { bytes: Uint8Array; maxWidth: number; quality: number }): Promise<Result<ProcessedImage>>;
}
