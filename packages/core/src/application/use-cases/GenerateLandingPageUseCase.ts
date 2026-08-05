import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { LandingPage, LandingPageId, type LandingCopy } from '../../domain/landing/LandingPage.js';
import { normalizeBookTitle } from '../../domain/project/GenerationOptions.js';
import { Palette, parseHexColor } from '../../domain/landing/Palette.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { ChannelRepository } from '../ports/repositories/ChannelRepository.js';
import type { ExportArtifactRepository } from '../ports/repositories/ExportArtifactRepository.js';
import type { LandingPageRepository } from '../ports/repositories/LandingPageRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { ImageColorSampler } from '../ports/services/ImageColorSampler.js';
import type { RemoteImageFetcher } from '../ports/services/RemoteImageFetcher.js';
import type { LandingPageRenderer, LandingProduct } from '../ports/services/LandingPageRenderer.js';
import type { ObjectStorage } from '../ports/services/ObjectStorage.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import { LandingPagePrompt } from '../prompts/LandingPagePrompt.js';
import { LandingLayoutPrompt } from '../prompts/LandingLayoutPrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import { validateGeneratedPage, type GeneratedPage } from '../landing/pageContract.js';
import type { LandingPageAssembler } from '../ports/services/LandingPageAssembler.js';
import type { ReferencePage, ReferencePageFetcher } from '../ports/services/ReferencePageFetcher.js';
import type { ReferenceScreenshotter, ReferenceShot } from '../ports/services/ReferenceScreenshotter.js';
import { referenceUrlFor } from '../../domain/landing/LandingTemplate.js';

const LayoutSchema = z.object({ css: z.string(), bodyHtml: z.string() });

/** The bucket the cover art and exports already live in. */
const EXPORTS_BUCKET = 'exports';

/**
 * The stat row under the hero, built ONLY from facts already in the system.
 * The reference sales pages show things like "4,200+ owners reading" — a real
 * figure their owner can stand behind. We have no such number, and inventing
 * one would be a false claim about real customers, so each stat renders only
 * when its source exists.
 */
function buildStats(input: {
  pageCount: number | null;
  subscriberCount: number | null;
  guaranteeDays: number;
}): Array<{ value: string; label: string }> {
  const stats: Array<{ value: string; label: string }> = [];
  if (input.pageCount && input.pageCount > 0) {
    stats.push({ value: String(input.pageCount), label: 'Pages' });
  }
  if (input.subscriberCount && input.subscriberCount >= 1000) {
    stats.push({ value: compactCount(input.subscriberCount), label: 'Subscribers' });
  }
  if (input.guaranteeDays > 0) {
    stats.push({ value: String(input.guaranteeDays), label: 'Day guarantee' });
  }
  // One lonely stat looks like an oversight; show the row only once it's a row.
  return stats.length >= 2 ? stats : [];
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  return `${Math.round(n / 1000)}K`;
}

/** Roman numeral year for the footer's edition line, e.g. 2026 → "MMXXVI". */
function romanYear(year: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = year;
  let out = '';
  for (const [value, sym] of table) {
    while (n >= value) {
      out += sym;
      n -= value;
    }
  }
  return out;
}

/** "Adrian · Car Care Garage" — both halves are real, so both are optional. */
function buildCredential(author: string | undefined, channelTitle: string | null): string | null {
  const parts = [author, channelTitle].filter((p): p is string => Boolean(p && p.trim()));
  // Avoid "Car Care Garage · Car Care Garage" when the byline IS the channel.
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' · ') : null;
}

const CopySchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  subheadline: z.string(),
  ctaLabel: z.string(),
  painPoints: z.array(z.string()).default([]),
  whatsInsideHeading: z.string(),
  bullets: z.array(z.object({ title: z.string(), body: z.string() })).min(1),
  whoIsItForHeading: z.string(),
  whoIsItFor: z.array(z.string()).default([]),
  authorHeading: z.string(),
  authorBio: z.string(),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  categoryLabel: z.string().default(''),
  productFeatures: z.array(z.string()).default([]),
  comparisonWithout: z.array(z.string()).default([]),
  comparisonWith: z.array(z.string()).default([]),
  closingHeading: z.string(),
  closingBody: z.string(),
  fontFamily: z.enum(['serif', 'sans']).default('sans'),
});

export interface GenerateLandingPageInput {
  projectId: string;
  /** Rebuild even when the inputs are unchanged (the user pressed Regenerate). */
  force?: boolean;
}

/**
 * Builds the sales page for a finished book: Claude writes the copy, the palette
 * is derived from the book's own cover art, and a fixed template renders both
 * into one self-contained HTML document, stored as a DRAFT.
 *
 * Publishing is a separate, explicitly-triggered step — see
 * PublishLandingPageUseCase.
 */
export class GenerateLandingPageUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly channels: ChannelRepository,
    private readonly artifacts: ExportArtifactRepository,
    private readonly pages: LandingPageRepository,
    private readonly ai: AiTextGenerator,
    private readonly renderer: LandingPageRenderer,
    private readonly assembler: LandingPageAssembler,
    private readonly references: ReferencePageFetcher,
    private readonly screenshots: ReferenceScreenshotter,
    private readonly colors: ImageColorSampler,
    private readonly images: RemoteImageFetcher,
    private readonly storage: ObjectStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async execute(
    input: GenerateLandingPageInput,
  ): Promise<Result<{ regenerated: boolean; layout?: 'generated' | 'builtin'; layoutFailure?: string[] }>> {
    const projectId = ProjectId.from(input.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!project.options.landingPage) return Result.fail('Landing page is not enabled for this project');
    // A 3-ebook page with the wrong number of books selected is a configuration
    // error. Failing here is deliberate: the alternative is rendering a
    // single-book page for someone who asked for three, which looks like the
    // request was ignored rather than like an error.
    const configError = project.options.landingConfigError();
    if (configError) return Result.fail(configError);

    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    const strategy = await this.knowledge.getBookStrategy(projectId);
    // Older projects stored the title in raw filename form; normalize on the
    // way out so the page never shows THE_DIY_REPAIR_BIBLE_… in its masthead.
    const title =
      normalizeBookTitle(book.title ?? project.options.bookTitle ?? strategy?.title ?? undefined) ?? 'Untitled';
    const chapterTitles = book.chapters.map((c) => c.title);
    if (chapterTitles.length === 0) return Result.fail('Book has no chapters yet');

    const now = this.clock.now();
    const existing = await this.pages.findByProject(projectId);
    const page =
      existing ?? LandingPage.create({ id: LandingPageId.from(this.ids.uuid()), projectId: input.projectId, now });

    // Everything the page is derived from. Prices and the checkout URL are in
    // here too: changing the price must rebuild the page, or the buttons keep
    // advertising the old one.
    const inputHash = this.hasher.hash({
      title,
      chapters: chapterTitles,
      strategy: strategy?.inputHash ?? '',
      cover: book.coverImagePath ?? '',
      price: project.options.landingPriceCents ?? null,
      compareAt: project.options.landingCompareAtCents ?? null,
      currency: project.options.landingCurrency,
      checkout: project.options.landingCheckoutUrl ?? '',
      guarantee: project.options.landingGuaranteeDays,
      // Pointing the book at a different reference must rebuild the layout.
      template: referenceUrlFor(project.options.landingMode, project.options.landingTemplateUrl) ?? '',
      // Mode and every sibling's price and link. Without these, changing a
      // sibling's price would serve the cached page still advertising the old
      // one — the same reason this book's own price is in the hash.
      mode: project.options.landingMode,
      siblings: project.options.landingSiblings,
      bundlePrice: project.options.landingBundlePriceCents ?? null,
      bundleCheckout: project.options.landingBundleCheckoutUrl ?? '',
    });
    if (!input.force && existing?.inputHash === inputHash && existing.html) {
      return Result.ok({ regenerated: false }); // idempotent — nothing has changed
    }

    page.markGenerating(now);
    await this.pages.save(page);

    // ── the reference page this book's layout should follow ──
    // Which reference depends on the MODE, not on the project: a three-book
    // page always follows the three-book template.
    const referenceUrl = referenceUrlFor(project.options.landingMode, project.options.landingTemplateUrl);

    // Strictly best-effort: the reference is someone else's live site and may
    // be down, slow or blocking us. A book still gets a landing page.
    let reference: ReferencePage | null = null;
    let referenceShots: ReferenceShot[] = [];
    if (referenceUrl) {
      const fetched = await this.references.fetch(referenceUrl);
      if (fetched.isOk()) reference = fetched.value;
      // The screenshots are what carry spacing and visual rhythm; the markup
      // alone only carries structure. Also best-effort — a site that blocks
      // automation costs fidelity, never the page itself.
      const shot = await this.screenshots.capture(referenceUrl);
      if (shot.isOk()) referenceShots = shot.value;
    }

    // ── palette, from the book's own cover ──
    const cover = await this.loadCover(book.coverImagePath);
    // The client's spec is "copy the template, change the branding/colours to
    // the ebook": the reference contributes the LAYOUT, the book's own cover
    // contributes the COLOURS. The reference's detected accent is used only
    // when the book has no readable cover to derive a scheme from.
    const referenceAccent = parseHexColor(reference?.style.accent) ?? undefined;
    const palette = cover.seed
      ? Palette.fromSeed(cover.seed)
      : referenceAccent
        ? Palette.fromSeed(referenceAccent)
        : Palette.neutral();

    // ── copy, from Claude ──
    const channel = await this.channels.getChannel(projectId);
    const artifactList = await this.artifacts.listByProject(projectId);
    const pageCount = artifactList.find((a) => a.pageCount > 0)?.pageCount ?? null;

    const prompt = LandingPagePrompt.build({
      bookTitle: title,
      subtitle: strategy?.subtitle ?? '',
      channelTitle: channel?.title ?? 'this creator',
      author: strategy?.author,
      strategy: strategy?.toText() ?? '',
      chapterTitles,
      pageCount,
      tone: project.options.tone,
      hasRealTestimonials: false,
    });

    const completion = await this.ai.generate({
      // Opus: this is the one page a buyer reads before deciding, and it is a
      // single call per book — the quality is worth more than the token saving.
      model: 'claude-opus-4-8',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: 4000,
      cacheControl: { systemPrefix: true },
      metadata: { projectId: input.projectId, stage: 'landing-page' },
    });
    if (completion.isFail()) {
      page.markFailed(`Copywriting failed: ${completion.error.type}`, this.clock.now());
      await this.pages.save(page);
      return Result.fail(completion.error.type);
    }

    const parsed = parseJsonCompletion(completion.value.text, CopySchema);
    if (parsed.isFail()) {
      page.markFailed(parsed.error, this.clock.now());
      await this.pages.save(page);
      return Result.fail(parsed.error);
    }
    const copy = parsed.value as LandingCopy;

    // ── render ──
    const product: LandingProduct = {
      title,
      subtitle: strategy?.subtitle ?? '',
      coverDataUri: cover.dataUri,
      pageCount,
      categoryLabel: copy.categoryLabel || null,
      features: copy.productFeatures,
      // A long chapter list buries the CTA; the first eight make the point.
      // Only used when the model gave no card features.
      contents: chapterTitles.slice(0, 8),
      // The "what's inside" breakdown comes from the book's own outline — each
      // chapter with its key points beneath — rather than from the model
      // re-imagining the contents it was only told the titles of.
      sections: (book.outline?.entries ?? []).map((e) => ({
        title: e.title,
        items: e.keyPoints.slice(0, 6),
      })),
      priceCents: project.options.landingPriceCents ?? null,
      compareAtCents: project.options.landingCompareAtCents ?? null,
      checkoutUrl: project.options.landingCheckoutUrl ?? null,
      kind: 'book',
      // The book the user came from leads the page and takes the emphasised card.
      featured: true,
    };

    // ── the other books on this page ──
    // A triple page sells three products, each with its own cover, price and
    // buy link. A sibling that can't be loaded fails the whole generation
    // rather than silently reducing the page to fewer books.
    const products: LandingProduct[] = [product];
    for (const sibling of project.options.landingSiblings) {
      const loaded = await this.loadSiblingProduct(sibling, project.ownerId);
      if (loaded.isFail()) {
        page.markFailed(loaded.error, this.clock.now());
        await this.pages.save(page);
        return Result.fail(loaded.error);
      }
      products.push(loaded.value);
    }

    const bundle = this.buildBundle(project.options, products);
    if (bundle) products.push(bundle);

    const pageModel = {
      copy,
      palette,
      currency: project.options.landingCurrency,
      guaranteeDays: project.options.landingGuaranteeDays,
      author: strategy?.author ?? null,
      channelTitle: channel?.title ?? null,
      subscriberCount: channel?.subscriberCount ?? null,
      // Only ever real quotes, supplied by the user. None exist yet, so the
      // section is omitted rather than invented.
      testimonials: [],
      products,
      // A three-book page is the creator's storefront, not one book's page, so
      // it is named after the channel rather than after whichever book the user
      // happened to generate from.
      siteName: (project.options.isTripleLanding ? (channel?.title ?? title) : title),
      logoDataUri: await this.loadLogo(channel?.thumbnailUrl ?? null),
      // Every stat is a fact the system already holds — never a figure the
      // model wrote. A fabricated "4,200 readers" is a false claim about real
      // people, so a stat with no source simply doesn't render.
      stats: buildStats({
        pageCount,
        subscriberCount: channel?.subscriberCount ?? null,
        guaranteeDays: project.options.landingGuaranteeDays,
      }),
      // No UI supplies these yet; the layout adapts when they are absent.
      heroImageDataUri: null,
      authorPhotoDataUri: null,
      authorCredential: buildCredential(strategy?.author, channel?.title ?? null),
      // The commercial furniture the reference page carries. Every one of these
      // is a factual claim — a real deadline, real reviewers, products that
      // exist, money a reader will actually save — so none is model-generated
      // and each stays absent until the seller supplies it.
      promoEndsAt: null,
      rating: null,
      valueStack: [],
      costComparison: null,
      paymentMethods: ['Visa', 'Mastercard', 'PayPal', 'Apple Pay'],
      edition: `${romanYear(this.clock.now().getFullYear())} · No. I`,
    };

    // ── layout ──
    // With a reference page the layout is generated to match it; without one
    // (or when generation can't be made to pass the contract) the built-in
    // template renders the same model. Either way the page gets built.
    const layout = await this.buildLayout({
      projectId: input.projectId,
      reference,
      copy,
      bookTitle: title,
      pageCount,
      pageModel,
      // Drives the contract's offer-grid rule: more than one product makes
      // {{OFFER_GRID}} mandatory, because it is the only element that carries
      // each book's own buy link.
      productCount: products.length,
      referenceShots,
      otherTitles: products.slice(1).map((p) => p.title),
    });

    page.setDraft({ copy, palette, html: layout.html, inputHash }, this.clock.now());
    await this.pages.save(page);
    return Result.ok({
      regenerated: true,
      layout: layout.source,
      ...(layout.failure ? { layoutFailure: layout.failure } : {}),
    });
  }

  /**
   * Produces the page body. With a reference page the model generates a layout
   * shaped after it; that layout must clear the contract before it is used.
   *
   * One repair round, then the built-in template. Model-authored markup is
   * unreliable in exactly the ways the validator checks for, and a sales page
   * that fails to build is worse than one that looks generic — so the fallback
   * is a guarantee, not an error path.
   */
  private async buildLayout(input: {
    projectId: string;
    reference: ReferencePage | null;
    copy: LandingCopy;
    bookTitle: string;
    pageCount: number | null;
    pageModel: Parameters<LandingPageRenderer['render']>[0];
    productCount: number;
    referenceShots: ReferenceShot[];
    otherTitles: string[];
  }): Promise<{ html: string; source: 'generated' | 'builtin'; failure?: string[] }> {
    if (!input.reference) {
      return { html: this.renderer.render(input.pageModel), source: 'builtin' };
    }

    // The copy was already written and validated; the layout call may place it
    // but not rewrite it, and this is what proves it didn't.
    const requiredText = [input.copy.headline, input.copy.subheadline, ...input.copy.faqs.map((f) => f.question)];

    let repairErrors: string[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const prompt = LandingLayoutPrompt.build({
        reference: input.reference,
        copy: input.copy,
        bookTitle: input.bookTitle,
        pageCount: input.pageCount,
        productCount: input.productCount,
        otherTitles: input.otherTitles,
        referenceShots: input.referenceShots,
        ...(repairErrors ? { repairErrors } : {}),
      });

      const completion = await this.ai.generate({
        model: 'claude-opus-4-8',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        // A full page of markup and CSS. Generous on purpose: a ceiling that
        // truncates the completion mid-JSON burns the attempt AND the repair.
        maxTokens: 30_000,
        cacheControl: { systemPrefix: true },
        metadata: { projectId: input.projectId, stage: 'landing-layout' },
      });
      if (completion.isFail()) {
        repairErrors = [`AI call failed: ${completion.error.type}`];
        break;
      }

      // Truncation is the single most likely failure for a call this large, and
      // it is invisible downstream — it just looks like broken JSON or an
      // unbalanced tag. Name it, so the repair round fixes the actual problem.
      if (completion.value.stopReason === 'max_tokens') {
        repairErrors = [
          'Your response was cut off at the output limit. Make it smaller and return the COMPLETE JSON: ' +
            'keep the stylesheet under 10,000 characters, remove repeated rule blocks, and keep the markup lean.',
        ];
        continue;
      }

      const parsed = parseJsonCompletion(completion.value.text, LayoutSchema);
      if (parsed.isFail()) {
        repairErrors = [`Your response was not valid JSON with keys "css" and "bodyHtml": ${parsed.error}`];
        continue;
      }

      const generated: GeneratedPage = parsed.value;
      const check = validateGeneratedPage(generated, { requiredText, productCount: input.productCount });
      if (check.isOk()) {
        return {
          html: this.assembler.assemble({ page: generated, model: input.pageModel }),
          source: 'generated',
        };
      }
      repairErrors = check.error;
    }

    // The rejection reasons ride along so the worker can log them — a silent
    // fallback is indistinguishable from success until someone compares pages.
    return {
      html: this.renderer.render(input.pageModel),
      source: 'builtin',
      ...(repairErrors ? { failure: repairErrors } : {}),
    };
  }

  /**
   * Loads one of the other books sold on this page, as its own product.
   *
   * Every failure here is fatal rather than skipped. The user asked for a page
   * selling three specific books; silently publishing one that sells two would
   * be wrong in a way nobody notices until a reader can't buy the book the page
   * promised.
   *
   * The ownership check is a security boundary, not a sanity check: the sibling
   * project id arrives from the client, so without it anyone could put someone
   * else's book — cover, title and all — on their own sales page.
   */
  private async loadSiblingProduct(
    sibling: { projectId: string; priceCents?: number | undefined; checkoutUrl?: string | undefined },
    ownerId: string,
  ): Promise<Result<LandingProduct>> {
    const siblingId = ProjectId.from(sibling.projectId);
    const siblingProject = await this.projects.findById(siblingId);
    if (!siblingProject) return Result.fail(`Selected book ${sibling.projectId} no longer exists`);
    if (siblingProject.ownerId !== ownerId) {
      return Result.fail(`Selected book ${sibling.projectId} belongs to a different account`);
    }

    const siblingBook = await this.books.findByProject(siblingId);
    if (!siblingBook || siblingBook.chapters.length === 0) {
      return Result.fail(`Selected book ${sibling.projectId} is not finished yet`);
    }

    const siblingStrategy = await this.knowledge.getBookStrategy(siblingId);
    const siblingTitle =
      normalizeBookTitle(
        siblingBook.title ?? siblingProject.options.bookTitle ?? siblingStrategy?.title ?? undefined,
      ) ?? 'Untitled';
    const siblingArtifacts = await this.artifacts.listByProject(siblingId);
    // Its own cover, embedded on its own card — the covers must not be shared
    // between products or every card would show the same book.
    const siblingCover = await this.loadCover(siblingBook.coverImagePath);

    return Result.ok({
      title: siblingTitle,
      subtitle: siblingStrategy?.subtitle ?? '',
      coverDataUri: siblingCover.dataUri,
      pageCount: siblingArtifacts.find((a) => a.pageCount > 0)?.pageCount ?? null,
      // The copy model wrote card features for the primary book only, so a
      // sibling's card is built from its own chapter titles instead.
      categoryLabel: null,
      features: [],
      contents: siblingBook.chapters.map((c) => c.title).slice(0, 8),
      sections: (siblingBook.outline?.entries ?? []).map((e) => ({
        title: e.title,
        items: e.keyPoints.slice(0, 6),
      })),
      // Price and link come from THIS sibling's own entry, never from the
      // project it points at — the seller sets them per page.
      priceCents: sibling.priceCents ?? null,
      compareAtCents: null,
      checkoutUrl: sibling.checkoutUrl ?? null,
      kind: 'book',
    });
  }

  /**
   * The all-books bundle, when the seller has set one up. It is a real product
   * on their store with its own link, so it exists only when that link or price
   * was supplied — never synthesised to fill out the grid.
   */
  private buildBundle(
    options: { landingBundlePriceCents?: number | undefined; landingBundleCheckoutUrl?: string | undefined },
    books: LandingProduct[],
  ): LandingProduct | null {
    if (options.landingBundlePriceCents === undefined && !options.landingBundleCheckoutUrl) return null;
    if (books.length < 2) return null; // a "bundle" of one book is just the book
    return {
      title: `The complete set — all ${books.length} books`,
      subtitle: 'Every book above, in one purchase.',
      coverDataUri: null,
      pageCount: books.reduce((t, b) => t + (b.pageCount ?? 0), 0) || null,
      categoryLabel: null,
      features: books.map((b) => b.title),
      contents: [],
      sections: [],
      priceCents: options.landingBundlePriceCents ?? null,
      compareAtCents: null,
      checkoutUrl: options.landingBundleCheckoutUrl ?? null,
      kind: 'bundle',
      // Deliberately NOT `featured`. Both renderers resolve the page's hero
      // book as `products.find(p => p.featured)`, and a featured bundle — which
      // has no cover of its own — would blank the hero image.
      bundleCoverDataUris: books.map((b) => b.coverDataUri).filter((u): u is string => Boolean(u)),
    };
  }

  /**
   * The channel's avatar, used as the page's brand mark. Strictly best-effort,
   * like the cover: a dead avatar URL must never cost the seller their page.
   */
  private async loadLogo(thumbnailUrl: string | null): Promise<string | null> {
    if (!thumbnailUrl) return null;
    const fetched = await this.images.fetchDataUri(thumbnailUrl);
    return fetched.isOk() ? fetched.value : null;
  }

  /**
   * The cover feeds both the palette and the page's hero image. It is strictly
   * best-effort: a book whose cover generation failed still gets a landing page,
   * on a neutral palette with a typographic cover tile.
   */
  private async loadCover(
    path: string | null,
  ): Promise<{ dataUri: string | null; seed: { r: number; g: number; b: number } | null }> {
    if (!path) return { dataUri: null, seed: null };
    // Two reads of the same object: the raw bytes for colour sampling, and the
    // adapter's own base64 encoding for embedding. Keeping base64 in the adapter
    // is what lets the application layer stay free of Node's Buffer.
    const [bytes, dataUri] = await Promise.all([
      this.storage.getBytes(EXPORTS_BUCKET, path),
      this.storage.getDataUri(EXPORTS_BUCKET, path),
    ]);
    if (bytes.isFail()) return { dataUri: dataUri.isOk() ? dataUri.value : null, seed: null };
    const sampled = await this.colors.dominantColor(bytes.value.bytes);
    return {
      dataUri: dataUri.isOk() ? dataUri.value : null,
      seed: sampled.isOk() ? sampled.value : null,
    };
  }
}
