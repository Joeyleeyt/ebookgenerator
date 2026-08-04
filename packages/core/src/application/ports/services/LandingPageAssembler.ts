import type { GeneratedPage } from '../../landing/pageContract.js';
import type { LandingPageModel } from './LandingPageRenderer.js';

/**
 * Assembles a validated, model-generated layout into the finished document.
 *
 * The split matters: the model supplies `css` and `bodyHtml` only. The document
 * shell, the cover-derived palette variables, the reveal and countdown scripts,
 * and every placeholder substitution are ours — so the parts that carry money,
 * execute, or must be legally present are never model output.
 */
export interface LandingPageAssembler {
  assemble(input: { page: GeneratedPage; model: LandingPageModel }): string;
}
