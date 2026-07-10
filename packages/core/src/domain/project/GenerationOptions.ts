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
    return new GenerationOptions({
      ...(bookTitle ? { bookTitle } : {}),
      bookType,
      targetPages: props.targetPages ?? 100,
      // Cooking books analyze only the channel's top videos.
      maxVideos: isCooking ? (props.maxVideos ?? COOKING_MAX_VIDEOS) : (props.maxVideos ?? 30),
      recipeCount: props.recipeCount ?? COOKING_RECIPE_COUNT,
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
