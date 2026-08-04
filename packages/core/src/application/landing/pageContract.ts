import { Result } from '../../domain/shared/Result.js';

/**
 * The contract a model-generated landing page must satisfy before it is allowed
 * to become a draft.
 *
 * The model writes the LAYOUT — markup and CSS shaped after the reference page
 * the client nominated. It does not write anything that carries risk:
 *
 *   - money and links arrive as placeholders we substitute afterwards, so a
 *     mangled checkout URL is impossible rather than merely unlikely;
 *   - colours must come from the cover-derived palette variables, so contrast
 *     is guaranteed by construction instead of validated after the fact;
 *   - scripts, embeds, forms and external resources are refused outright.
 *
 * Everything here is mechanical and reported as specific, fixable errors — they
 * are fed straight back to the model for one repair attempt.
 */

/** Substituted with real markup after generation. The model only positions them. */
export const PLACEHOLDERS = {
  cta: '{{CTA_BUTTON}}',
  price: '{{PRICE}}',
  cover: '{{COVER}}',
  guarantee: '{{GUARANTEE}}',
  paymentMarks: '{{PAYMENT_MARKS}}',
  testimonials: '{{TESTIMONIALS}}',
  contents: '{{CONTENTS}}',
  legal: '{{FOOTER_LEGAL}}',
} as const;

/** A page without these is not a sales page. */
const REQUIRED_PLACEHOLDERS = [PLACEHOLDERS.cta, PLACEHOLDERS.price, PLACEHOLDERS.cover, PLACEHOLDERS.legal];

/** Marked with `data-section` so the structure can be checked mechanically. */
const REQUIRED_SECTIONS = ['hero', 'inside', 'order', 'faq'] as const;

/** Palette variables the page may reference. Anything else is a raw colour. */
export const PALETTE_VARS = [
  '--bg', '--surface', '--border', '--text', '--muted', '--heading',
  '--accent', '--accent-contrast', '--deep', '--on-deep', '--on-deep-muted',
  '--deep-border', '--accent-on-deep', '--tint',
] as const;

const MAX_CSS_BYTES = 120_000;
const MAX_HTML_BYTES = 160_000;

export interface GeneratedPage {
  css: string;
  bodyHtml: string;
}

/**
 * Validates a generated page. Returns every problem at once rather than the
 * first — the whole list goes back to the model, so one repair round can fix
 * everything instead of uncovering the next fault each time.
 */
export interface ValidateOptions {
  /**
   * Copy that must appear verbatim. The layout call is given already-approved
   * prose and told to place it, not rewrite it — this is what stops a layout
   * retry from quietly re-authoring claims that were validated in an earlier
   * step.
   */
  requiredText?: string[];
}

export function validateGeneratedPage(page: GeneratedPage, options: ValidateOptions = {}): Result<void, string[]> {
  const errors: string[] = [];
  const { css, bodyHtml } = page;
  const all = `${css}\n${bodyHtml}`;

  for (const text of options.requiredText ?? []) {
    // Compare on collapsed whitespace: wrapping the markup is fine, editing the
    // words is not.
    if (!collapse(bodyHtml).includes(collapse(text))) {
      errors.push(`Copy was altered. This must appear verbatim: "${truncateForError(text)}"`);
    }
  }

  if (css.length > MAX_CSS_BYTES) errors.push(`CSS is ${css.length} bytes; the limit is ${MAX_CSS_BYTES}.`);
  if (bodyHtml.length > MAX_HTML_BYTES) {
    errors.push(`HTML is ${bodyHtml.length} bytes; the limit is ${MAX_HTML_BYTES}.`);
  }

  // ── placeholders ──
  for (const token of REQUIRED_PLACEHOLDERS) {
    if (!bodyHtml.includes(token)) errors.push(`Missing required placeholder ${token}.`);
  }
  if (occurrences(bodyHtml, PLACEHOLDERS.legal) > 1) {
    errors.push(`${PLACEHOLDERS.legal} must appear exactly once, in the footer.`);
  }
  // Caps sized for template copying — a reference page legitimately repeats its
  // cover and buy button many times. The caps only stop true runaway repetition.
  if (occurrences(bodyHtml, PLACEHOLDERS.cover) > 6) {
    errors.push(`${PLACEHOLDERS.cover} may appear at most 6 times.`);
  }
  if (occurrences(bodyHtml, PLACEHOLDERS.cta) > 6) {
    errors.push(`${PLACEHOLDERS.cta} may appear at most 6 times.`);
  }
  if (occurrences(bodyHtml, PLACEHOLDERS.price) > 3) {
    errors.push(`${PLACEHOLDERS.price} may appear at most 3 times; the button's label already ends with the price.`);
  }
  // An unknown {{TOKEN}} would ship to a buyer as literal braces.
  const known = new Set<string>(Object.values(PLACEHOLDERS));
  for (const m of bodyHtml.matchAll(/\{\{[A-Z_]+\}\}/g)) {
    if (!known.has(m[0])) errors.push(`Unknown placeholder ${m[0]}. Use only: ${[...known].join(', ')}.`);
  }

  // ── structure ──
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`data-section=["']${section}["']`).test(bodyHtml)) {
      errors.push(`Missing <section data-section="${section}">.`);
    }
  }

  // ── executable content ──
  if (/<script\b/i.test(all)) errors.push('Scripts are not allowed; remove every <script> tag.');
  if (/<(iframe|object|embed|form|input|button)\b/i.test(bodyHtml)) {
    errors.push('Embeds, forms and form controls are not allowed. Use the placeholders for actions.');
  }
  if (/\son[a-z]+\s*=/i.test(bodyHtml)) errors.push('Inline event handlers (onclick, onload…) are not allowed.');
  if (/javascript:/i.test(all)) errors.push('javascript: URLs are not allowed.');

  // ── external resources ──
  // The page is deployed as a single file and must render with no network.
  if (/(?:src|href)\s*=\s*["']https?:/i.test(bodyHtml)) {
    errors.push('No external URLs. The only link is the CTA placeholder; images come from {{COVER}}.');
  }
  if (/@import|url\(\s*["']?https?:/i.test(css)) {
    errors.push('No @import and no remote url() in CSS. Fonts must be system stacks.');
  }

  // ── colour discipline ──
  // Raw colours would bypass the cover-derived palette, whose contrast is
  // already proven. Translucent black and white are allowed for shadows and
  // scrims, since neither can make text unreadable on its own.
  for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgb\(|\bhsl\(/g)) {
    errors.push(`Raw colour "${m[0]}" in CSS. Use the palette variables only: ${PALETTE_VARS.join(', ')}.`);
    break; // one example is enough to make the point
  }
  for (const m of css.matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const neutral = (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255);
    if (!neutral) {
      errors.push(`Raw colour "${m[0]})" in CSS. rgba() is allowed only for black or white overlays.`);
      break;
    }
  }
  for (const m of css.matchAll(/var\(\s*(--[a-z-]+)/g)) {
    const name = m[1] ?? '';
    if (!(PALETTE_VARS as readonly string[]).includes(name) && !name.startsWith('--x-')) {
      errors.push(`Unknown CSS variable ${name}. Use the palette variables, or your own prefixed --x-.`);
      break;
    }
  }

  // Single-axis `overflow-x: hidden` forces overflow-y to auto, turning the
  // element into its own scroll container — on body that is a second vertical
  // scrollbar beside the viewport's. Two-axis `overflow: hidden` is fine (it
  // has no auto side-effect and is the normal way to clip rounded corners).
  if (/overflow-[xy]\s*:\s*hidden/i.test(css)) {
    errors.push('Do not use single-axis "overflow-x/y: hidden" — it creates a nested scrollbar; use "clip" instead.');
  }

  // ── well-formedness ──
  // A truncated completion is the common failure, and it shows up as unbalanced
  // block tags long before it shows up as anything visible.
  for (const tag of ['section', 'div', 'ul', 'li', 'p', 'h1', 'h2', 'h3']) {
    const open = occurrences(bodyHtml, `<${tag}`) - occurrences(bodyHtml, `</${tag}`);
    if (open !== 0) {
      errors.push(`Unbalanced <${tag}> tags (${open > 0 ? `${open} unclosed` : `${-open} stray closing`}).`);
    }
  }

  return errors.length === 0 ? Result.ok<void, string[]>(undefined) : Result.fail<void, string[]>(errors);
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Comparison that sees only the WORDS: tags are stripped and basic entities
 * decoded before comparing. Copying a template's inline styling — an accent
 * span around a phrase inside the headline — is legitimate; changing the words
 * is not, and this is what tells those apart.
 */
function collapse(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|[‘’]/g, "'")
    .replace(/&quot;|[“”]/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateForError(value: string): string {
  return value.length <= 60 ? value : `${value.slice(0, 57)}…`;
}

/** Substitutes the real markup for each placeholder. */
export function fillPlaceholders(bodyHtml: string, values: Record<keyof typeof PLACEHOLDERS, string>): string {
  let out = bodyHtml;
  for (const [key, token] of Object.entries(PLACEHOLDERS) as Array<[keyof typeof PLACEHOLDERS, string]>) {
    out = out.split(token).join(values[key] ?? '');
  }
  return out;
}
