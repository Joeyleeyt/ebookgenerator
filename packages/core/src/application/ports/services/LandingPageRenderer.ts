import type { LandingCopy } from '../../../domain/landing/LandingPage.js';
import type { Palette } from '../../../domain/landing/Palette.js';

/** One purchasable item on the page. */
export interface LandingProduct {
  title: string;
  subtitle: string;
  /** Cover art as a `data:` URI, or null to fall back to a typographic tile. */
  coverDataUri: string | null;
  pageCount: number | null;
  /** Chapter titles, listed under the cover. */
  contents: string[];
  /** Eyebrow above the card title, e.g. "Buying guide" / "Best value". */
  categoryLabel: string | null;
  /** Terse selling points listed on the card itself. */
  features: string[];
  priceCents: number | null;
  compareAtCents: number | null;
  /**
   * The user's checkout link, written into the CTA verbatim. Null renders the
   * buttons as disabled placeholders — which is why a page can be previewed
   * before the product exists on the store, but never published.
   */
  checkoutUrl: string | null;
  /** Marks the emphasised card when several products are offered. */
  featured?: boolean;
}

export interface LandingPageModel {
  copy: LandingCopy;
  palette: Palette;
  currency: string;
  guaranteeDays: number;
  /** Author byline, from the book strategy. */
  author: string | null;
  channelTitle: string | null;
  subscriberCount: number | null;
  /**
   * Real reader quotes supplied by the user. Empty by default: the section is
   * omitted rather than invented, because fabricated endorsements are a legal
   * exposure, not a stylistic choice.
   */
  testimonials: Array<{ quote: string; author: string }>;
  products: LandingProduct[];
  /** Shown in the footer next to the copyright line. */
  siteName: string;

  /**
   * The stat row under the hero. Every entry must be a fact the system already
   * holds — page count, guarantee window, the channel's real subscriber count.
   * Nothing here is written by the model, because a made-up "4,200 readers" is
   * a false claim about real people.
   */
  stats: Array<{ value: string; label: string }>;
  /** Optional photographic hero, behind the deep band. Supplied by the user. */
  heroImageDataUri: string | null;
  /** Optional author headshot. Supplied by the user; omitted when absent. */
  authorPhotoDataUri: string | null;
  /** Author credential line, e.g. "Founder · Car Care Garage". */
  authorCredential: string | null;
}

/** Renders the model into one self-contained HTML document (no external requests). */
export interface LandingPageRenderer {
  render(model: LandingPageModel): string;
}
