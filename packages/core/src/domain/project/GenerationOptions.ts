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
 * Only a number that immediately precedes a "recipe(s)"-style word counts, so a
 * title like "Recipes for the 4th of July" isn't misread as 4 recipes.
 */
export function recipeCountFromTitle(title: string | undefined): number | undefined {
  if (!title) return undefined;
  const m = title.match(/(\d{1,3})\s*(?:\+\s*)?(?:recipe|dish|meal|dinner|plate)s?\b/i);
  if (!m?.[1]) return undefined;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.max(RECIPE_COUNT_MIN, Math.min(RECIPE_COUNT_MAX, n));
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
    const bookTitle = props.bookTitle?.trim();
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
