import { AggregateRoot } from '../shared/AggregateRoot.js';
import { Result } from '../shared/Result.js';
import { Identifier } from '../shared/Identifier.js';
import { Palette } from './Palette.js';

export class LandingPageId extends Identifier {
  static from(value: string): LandingPageId {
    return new LandingPageId(value);
  }
}

export type LandingPageState = 'GENERATING' | 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';

/** One selling point / chapter teaser in the "what's inside" list. */
export interface LandingBullet {
  title: string;
  body: string;
}

export interface LandingFaq {
  question: string;
  answer: string;
}

/**
 * The written content of the page — everything Claude produces, and nothing
 * else. Layout, colours, prices and the checkout URL are all supplied by the
 * system; the model only writes prose. Note the absence of a testimonials
 * field: invented social proof is a fabricated endorsement, so the section is
 * rendered only from real quotes the user supplies, never generated.
 */
export interface LandingCopy {
  /** Problem-led hero headline. */
  headline: string;
  subheadline: string;
  /** Short label above the headline, e.g. "For weekend mechanics". */
  eyebrow: string;
  /** Primary button label — the checkout URL is attached by the renderer. */
  ctaLabel: string;
  /** 3–5 sentences on the cost of the status quo. */
  painPoints: string[];
  whatsInsideHeading: string;
  bullets: LandingBullet[];
  whoIsItForHeading: string;
  whoIsItFor: string[];
  authorHeading: string;
  authorBio: string;
  faqs: LandingFaq[];
  /** Short label above the product card, e.g. "Buying guide". */
  categoryLabel: string;
  /** Terse feature lines for the product card — not full sentences. */
  productFeatures: string[];
  /** The before/after block every reference page runs before its final CTA. */
  comparisonWithout: string[];
  comparisonWith: string[];
  closingHeading: string;
  closingBody: string;
  /** Serif suits narrative//lifestyle subjects; sans suits technical ones. */
  fontFamily: 'serif' | 'sans';
}

interface LandingPageProps {
  projectId: string;
  state: LandingPageState;
  copy: LandingCopy | null;
  palette: Palette | null;
  /** The rendered, self-contained page. Kept so preview is instant and so the
   * exact bytes that were reviewed are the bytes that get deployed. */
  html: string | null;
  /** Netlify site + deploy identifiers, set on first publish. */
  siteId: string | null;
  deployId: string | null;
  /** The public URL, once live. */
  url: string | null;
  /** Hash of every generation input; an unchanged hash short-circuits a re-run. */
  inputHash: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A sales landing page for a finished book: generated as a DRAFT, reviewed by
 * the user, then PUBLISHED to Netlify. Generation and publication are separate
 * on purpose — AI-written marketing copy should not reach a public URL without
 * a human having read it.
 */
export class LandingPage extends AggregateRoot<LandingPageProps, LandingPageId> {
  static create(input: { id: LandingPageId; projectId: string; now: Date }): LandingPage {
    return new LandingPage(
      {
        projectId: input.projectId,
        state: 'GENERATING',
        copy: null,
        palette: null,
        html: null,
        siteId: null,
        deployId: null,
        url: null,
        inputHash: null,
        error: null,
        createdAt: input.now,
        updatedAt: input.now,
      },
      input.id,
    );
  }

  static rehydrate(props: LandingPageProps, id: LandingPageId): LandingPage {
    return new LandingPage(props, id);
  }

  get projectId() {
    return this.props.projectId;
  }
  get state() {
    return this.props.state;
  }
  get copy() {
    return this.props.copy;
  }
  get palette() {
    return this.props.palette;
  }
  get html() {
    return this.props.html;
  }
  get siteId() {
    return this.props.siteId;
  }
  get deployId() {
    return this.props.deployId;
  }
  get url() {
    return this.props.url;
  }
  get inputHash() {
    return this.props.inputHash;
  }
  get error() {
    return this.props.error;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  /** A page that has been live at least once keeps its URL through re-drafts. */
  get isPublished(): boolean {
    return this.props.url !== null;
  }

  markGenerating(now: Date): void {
    this.props.state = 'GENERATING';
    this.props.error = null;
    this.props.updatedAt = now;
  }

  /** Store a freshly generated draft. Never clears an existing live URL. */
  setDraft(input: { copy: LandingCopy; palette: Palette; html: string; inputHash: string }, now: Date): void {
    this.props.copy = input.copy;
    this.props.palette = input.palette;
    this.props.html = input.html;
    this.props.inputHash = input.inputHash;
    // A republish is required for the new draft to reach the live URL, so a page
    // that is already live stays PUBLISHED (with stale content) rather than
    // silently reporting DRAFT while the old page is still being served.
    this.props.state = this.isPublished ? 'PUBLISHED' : 'DRAFT';
    this.props.error = null;
    this.props.updatedAt = now;
  }

  markPublishing(now: Date): Result<void> {
    if (!this.props.html) return Result.fail('Nothing to publish — generate the page first');
    this.props.state = 'PUBLISHING';
    this.props.error = null;
    this.props.updatedAt = now;
    return Result.ok();
  }

  markPublished(input: { siteId: string; deployId: string; url: string }, now: Date): void {
    this.props.siteId = input.siteId;
    this.props.deployId = input.deployId;
    this.props.url = input.url;
    this.props.state = 'PUBLISHED';
    this.props.error = null;
    this.props.updatedAt = now;
  }

  markFailed(reason: string, now: Date): void {
    this.props.state = 'FAILED';
    this.props.error = reason;
    this.props.updatedAt = now;
  }

  toJSON(): LandingPageProps {
    return { ...this.props };
  }
}
