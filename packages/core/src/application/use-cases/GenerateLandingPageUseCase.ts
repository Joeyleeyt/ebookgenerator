import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { LandingPage, LandingPageId, type LandingCopy } from '../../domain/landing/LandingPage.js';
import { Palette, parseHexColor } from '../../domain/landing/Palette.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { ChannelRepository } from '../ports/repositories/ChannelRepository.js';
import type { ExportArtifactRepository } from '../ports/repositories/ExportArtifactRepository.js';
import type { LandingPageRepository } from '../ports/repositories/LandingPageRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { ImageColorSampler } from '../ports/services/ImageColorSampler.js';
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
    private readonly colors: ImageColorSampler,
    private readonly storage: ObjectStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async execute(
    input: GenerateLandingPageInput,
  ): Promise<Result<{ regenerated: boolean; layout?: 'generated' | 'builtin' }>> {
    const projectId = ProjectId.from(input.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!project.options.landingPage) return Result.fail('Landing page is not enabled for this project');

    const book = await this.books.findByProject(projectId);
    if (!book) return Result.fail('Book not found');
    const strategy = await this.knowledge.getBookStrategy(projectId);
    const title = book.title ?? project.options.bookTitle ?? strategy?.title ?? 'Untitled';
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
      template: project.options.landingTemplateUrl ?? '',
    });
    if (!input.force && existing?.inputHash === inputHash && existing.html) {
      return Result.ok({ regenerated: false }); // idempotent — nothing has changed
    }

    page.markGenerating(now);
    await this.pages.save(page);

    // ── the reference page this book's layout should follow ──
    // Strictly best-effort: the reference is someone else's live site and may
    // be down, slow or blocking us. A book still gets a landing page.
    let reference: ReferencePage | null = null;
    if (project.options.landingTemplateUrl) {
      const fetched = await this.references.fetch(project.options.landingTemplateUrl);
      if (fetched.isOk()) reference = fetched.value;
    }

    // ── palette, from the book's own cover ──
    const cover = await this.loadCover(book.coverImagePath);
    // The reference page's brand colour, when it was detectable, takes over the
    // scheme's hue — "match the template" includes looking like it. The cover
    // still decides light-vs-dark, since the cover is the artwork on the page.
    const accentSeed = parseHexColor(reference?.style.accent) ?? undefined;
    const palette = cover.seed
      ? Palette.fromSeed(cover.seed, { accentSeed })
      : accentSeed
        ? Palette.fromSeed(accentSeed)
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
    };

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
      products: [product],
      siteName: title,
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
    });

    page.setDraft({ copy, palette, html: layout.html, inputHash }, this.clock.now());
    await this.pages.save(page);
    return Result.ok({ regenerated: true, layout: layout.source });
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
  }): Promise<{ html: string; source: 'generated' | 'builtin' }> {
    if (!input.reference) {
      return { html: this.renderer.render(input.pageModel), source: 'builtin' };
    }

    // The copy was already written and validated; the layout call may place it
    // but not rewrite it, and this is what proves it didn't.
    const requiredText = [input.copy.headline, input.copy.subheadline, ...input.copy.faqs.map((f) => f.question)];

    let repairErrors: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = LandingLayoutPrompt.build({
        reference: input.reference,
        copy: input.copy,
        bookTitle: input.bookTitle,
        pageCount: input.pageCount,
        ...(repairErrors ? { repairErrors } : {}),
      });

      const completion = await this.ai.generate({
        model: 'claude-opus-4-8',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        // A full page of markup and CSS; well above the copy call's ceiling.
        maxTokens: 16_000,
        cacheControl: { systemPrefix: true },
        metadata: { projectId: input.projectId, stage: 'landing-layout' },
      });
      if (completion.isFail()) break;

      const parsed = parseJsonCompletion(completion.value.text, LayoutSchema);
      if (parsed.isFail()) {
        repairErrors = [`Your response was not valid JSON with keys "css" and "bodyHtml": ${parsed.error}`];
        continue;
      }

      const generated: GeneratedPage = parsed.value;
      const check = validateGeneratedPage(generated, { requiredText });
      if (check.isOk()) {
        return {
          html: this.assembler.assemble({ page: generated, model: input.pageModel }),
          source: 'generated',
        };
      }
      repairErrors = check.error;
    }

    return { html: this.renderer.render(input.pageModel), source: 'builtin' };
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
