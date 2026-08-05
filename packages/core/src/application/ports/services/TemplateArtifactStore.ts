import type { Result } from '../../../domain/shared/Result.js';
import type { StoredLandingTemplate, TemplateAsset } from '../../../domain/landing/TemplateManifest.js';
import type { CapturedAsset, Shot } from './TemplateCapturer.js';

/**
 * Where a cloned template's bytes live, and how they are made self-contained.
 *
 * Exists as a port so `ExtractTemplateUseCase` stays free of storage, hashing,
 * CSS rewriting and font licensing — all of which are infrastructure concerns
 * that happen to be sequenced together.
 *
 * The reason any of this is a separate step: v1 base64'd every image into the
 * HTML and wrote the result into a single Postgres column, which produced a
 * 57014 statement timeout on one attempt and a gateway 502 on the next. Assets
 * belong beside the page, not inside it.
 */

export interface StoredArtifacts {
  originalHtmlPath: string;
  /** The cleaned DOM with every image `src` repointed at a local copy. */
  cleanHtml: string;
  /** The bundled stylesheet: local urls, embeddable fonts inlined. */
  css: string;
  breakpoints: number[];
  assets: TemplateAsset[];
  baselineShotPaths: Array<{ width: number; storagePath: string }>;
  /**
   * `exact` when every declared face was legally embeddable, `degraded` when
   * some were not and the stack falls back, `none` when the template used only
   * system fonts.
   *
   * Recorded rather than silently accepted: v1 downloaded fonts, base64'd them
   * into the stored CSS, and then mandated system stacks in the prompt — so
   * every page carried 100–300 KB of font data that nothing referenced.
   */
  fontFidelity: 'exact' | 'degraded' | 'none';
  /** Referenced urls that had no local copy and were dropped from the CSS. */
  unresolvedUrls: string[];
}

export interface TemplateArtifactStore {
  /** Stores the capture and makes the page self-contained. */
  storeTemplate(input: {
    templateId: string;
    originalHtml: string;
    cleanHtml: string;
    css: string;
    baseUrl: string;
    assets: CapturedAsset[];
    baselineShots: Shot[];
  }): Promise<Result<StoredArtifacts>>;

  /**
   * Discards assets the parameterised page no longer references.
   *
   * The template owner's own product photography becomes a placeholder during
   * annotation, so by this point nothing points at it — and keeping it would
   * mean storing and deploying their asset for no reason.
   */
  pruneAssets(input: {
    templateId: string;
    html: string;
    css: string;
    assets: TemplateAsset[];
  }): Promise<TemplateAsset[]>;

  storeParameterised(input: {
    templateId: string;
    html: string;
    css: string;
  }): Promise<Result<{ cleanHtmlPath: string; cssBundlePath: string }>>;

  /** Reads a stored template's markup and stylesheet back. */
  loadTemplate(template: StoredLandingTemplate): Promise<Result<{ html: string; css: string }>>;

  loadAssets(assets: TemplateAsset[]): Promise<Array<{ sitePath: string; bytes: Uint8Array; contentType: string }>>;

  /** A generated page's finished HTML, kept out of the database row. */
  storePageHtml(pageId: string, html: string): Promise<Result<string>>;
  loadPageHtml(path: string): Promise<Result<string>>;
}
