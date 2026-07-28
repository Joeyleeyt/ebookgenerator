import { ValueObject } from '../shared/ValueObject.js';

export type Tone = 'educational' | 'conversational' | 'professional';

/**
 * The kind of book to generate.
 * - `normal`: the default YouTube-channel-to-ebook (prose chapters).
 * - `cooking`: a cookbook of AI-suggested recipes (structured recipe cards +
 *   one food photo per recipe), built from the channel's top videos.
 */
export type BookType = 'normal' | 'cooking';

/** Default number of recipes generated for a cooking book. */
export const COOKING_RECIPE_COUNT = 60;
/** For cooking books we only analyze the channel's top videos. */
export const COOKING_MAX_VIDEOS = 10;
/** Recipe counts are clamped to this range (matches the SubmitChannel DTO). */
export const RECIPE_COUNT_MIN = 10;
export const RECIPE_COUNT_MAX = 120;

/**
 * If the book title names a recipe count (e.g. "101 Recipes", "50 Easy Dinners"),
 * that number wins — the book should match its title. Returns undefined when the
 * title has no leading count, so the caller can fall back to the default.
 * The number must PRECEDE the "recipe(s)"-style word, so "Recipes for the 4th of July"
 * isn't misread as 4 recipes. Up to three descriptive words may sit between them
 * ("101 Easy Weeknight Recipes"), which is how these titles are usually written.
 */
export function recipeCountFromTitle(title: string | undefined): number | undefined {
  if (!title) return undefined;
  const m = title.match(
    /(\d{1,3})\s*(?:\+\s*)?(?:[a-z'-]+\s+){0,3}(?:recipe|dish|meal|dinner|plate)s?\b/i,
  );
  if (!m?.[1]) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(RECIPE_COUNT_MIN, Math.min(RECIPE_COUNT_MAX, n));
}

/**
 * Titles are frequently pasted in filename form ("THE_DIY_REPAIR_BIBLE_101_REPAIRS").
 * Normalize once, here, so the clean title is what gets stored, hashed, sent to every
 * prompt and printed on the cover. Doing it at the edge (rather than asking the model
 * to tidy it) keeps the "return the title EXACTLY" prompt rule intact — the model
 * receives an already-clean string.
 *
 * Separators become spaces; an ALL-CAPS or all-lowercase title is title-cased, with
 * short joining words kept lowercase unless they lead. A title that already has mixed
 * case is left alone, since the author's own capitalization is deliberate.
 */
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of', 'on',
  'or', 'the', 'to', 'v', 'via', 'vs', 'with', 'without',
]);

/**
 * Acronyms that must stay upper-case when title-casing an ALL-CAPS input — otherwise
 * "THE_DIY_REPAIR_BIBLE" becomes "The Diy Repair Bible" on the cover. Only genuinely
 * unambiguous ones; a word that is also a common noun (e.g. "GAS") is left to normal
 * casing rather than risk shouting a real word.
 */
const ACRONYMS = new Set([
  'diy', 'suv', 'rv', 'atv', 'ev', 'hvac', 'abs', 'obd', 'obd2', 'tv', 'pc', 'usa',
  'us', 'uk', 'ai', 'seo', 'ceo', 'diyer', 'mpg', 'psi', 'gps', 'led', 'ac', 'dc',
]);

export function normalizeBookTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Underscores are the common filename separator; collapse runs of them and of
  // whitespace alike. Hyphens are left alone — they are meaningful in real titles.
  const spaced = raw.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!spaced) return undefined;

  const letters = spaced.replace(/[^A-Za-z]/g, '');
  const isAllCaps = letters.length > 0 && letters === letters.toUpperCase();
  const isAllLower = letters.length > 0 && letters === letters.toLowerCase();
  if (!isAllCaps && !isAllLower) return spaced; // deliberate mixed case — preserve it

  const words = spaced.split(' ');
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      // Strip punctuation when testing for an acronym so "DIY," / "(DIY)" still match.
      const bare = lower.replace(/[^a-z0-9]/g, '');
      if (ACRONYMS.has(bare)) return word.toUpperCase();
      // Keep tokens that aren't plain words (numbers, "101", hyphenates) as-is apart
      // from casing their first letter.
      if (MINOR_WORDS.has(lower) && i > 0 && i < words.length - 1) return lower;
      return lower.replace(/^([a-z])/, (c) => c.toUpperCase());
    })
    .join(' ');
}

interface GenerationOptionsProps {
  /** User-provided book title. When set, it overrides the AI-generated title. */
  bookTitle?: string | undefined;
  bookType: BookType;
  targetPages: number;
  maxVideos: number;
  /** Number of recipes to generate for a cooking book. Ignored for normal books. */
  recipeCount: number;
  tone: Tone;
  includeComments: boolean;
  /** Generate full-color in-chapter illustrations (69labs). Off by default. */
  includeIllustrations: boolean;
  /** Roughly one illustration per this many finished pages. */
  illustrationEveryPages: number;
}

export class GenerationOptions extends ValueObject<GenerationOptionsProps> {
  static create(props: Partial<GenerationOptionsProps>): GenerationOptions {
    const bookTitle = normalizeBookTitle(props.bookTitle);
    const bookType: BookType = props.bookType ?? 'normal';
    const isCooking = bookType === 'cooking';
    // The recipe count should follow the title: "101 Recipes" → 101. A count named
    // in the title wins over both an explicit option and the default, so the book
    // matches what its cover promises. Falls back to the option, then the default.
    const recipeCount = recipeCountFromTitle(bookTitle) ?? props.recipeCount ?? COOKING_RECIPE_COUNT;
    return new GenerationOptions({
      ...(bookTitle ? { bookTitle } : {}),
      bookType,
      targetPages: props.targetPages ?? 100,
      // Cooking books analyze only the channel's top videos.
      maxVideos: isCooking ? (props.maxVideos ?? COOKING_MAX_VIDEOS) : (props.maxVideos ?? 30),
      recipeCount,
      tone: props.tone ?? 'professional',
      includeComments: props.includeComments ?? true,
      includeIllustrations: props.includeIllustrations ?? true,
      illustrationEveryPages: props.illustrationEveryPages ?? 5,
    });
  }

  get bookTitle() {
    return this.props.bookTitle;
  }
  get bookType() {
    return this.props.bookType;
  }
  get isCooking() {
    return this.props.bookType === 'cooking';
  }
  get recipeCount() {
    return this.props.recipeCount;
  }
  get targetPages() {
    return this.props.targetPages;
  }
  get maxVideos() {
    return this.props.maxVideos;
  }
  get tone() {
    return this.props.tone;
  }
  get includeComments() {
    return this.props.includeComments;
  }
  get includeIllustrations() {
    return this.props.includeIllustrations;
  }
  get illustrationEveryPages() {
    return this.props.illustrationEveryPages;
  }
}
