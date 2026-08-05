import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import {
  LandingPage,
  LandingPageId,
  type LandingBinding,
  type LandingCopy,
  type LandingFidelity,
  type LandingPageAsset,
} from '../../domain/landing/LandingPage.js';
import { normalizeBookTitle } from '../../domain/project/GenerationOptions.js';
import { adaptTheme } from '../../domain/landing/ThemeAdaptation.js';
import { REQUIRED_PLACEHOLDERS, isCopyKey, splitRepeaterField } from '../../domain/landing/PlaceholderVocabulary.js';
import type { Finding, PlaceholderEntry, Rect, StoredLandingTemplate } from '../../domain/landing/TemplateManifest.js';
import { validateBoundPage } from '../landing/templateContract.js';
import { TemplateCopyPrompt } from '../prompts/TemplateCopyPrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { ChannelRepository } from '../ports/repositories/ChannelRepository.js';
import type { ExportArtifactRepository } from '../ports/repositories/ExportArtifactRepository.js';
import type { LandingPageRepository } from '../ports/repositories/LandingPageRepository.js';
import type { LandingTemplateRepository } from '../ports/repositories/LandingTemplateRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { ImageColorSampler } from '../ports/services/ImageColorSampler.js';
import type { ImageProcessor } from '../ports/services/ImageProcessor.js';
import type { RemoteImageFetcher } from '../ports/services/RemoteImageFetcher.js';
import type { ObjectStorage } from '../ports/services/ObjectStorage.js';
import type { TemplateArtifactStore } from '../ports/services/TemplateArtifactStore.js';
import type { TemplateCapturer } from '../ports/services/TemplateCapturer.js';
import type { PageDiffer } from '../ports/services/PageDiffer.js';
import type { LandingPageBinder } from '../ports/services/LandingPageBinder.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';

const EXPORTS_BUCKET = 'exports';

/** Widths every generated page is verified at. */
const VERIFY_WIDTHS = [1280, 768, 390];

/**
 * How far the bound page may differ from the template OUTSIDE the regions where
 * content was replaced on purpose.
 *
 * Everything else on the page is the template's own markup and CSS, so a
 * difference here is not a design choice — it is something that moved, and the
 * usual cause is copy overflowing a box the template sized for shorter words.
 */
const MAX_UNMASKED_DRIFT = 0.02;

/**
 * A masked region that barely changed usually means a placeholder never got a
 * value and the node collapsed, leaving the template's own layout with a hole.
 */
const MIN_MASKED_CHANGE = 0.005;

const CopyResponseSchema = z.object({
  slots: z.record(z.string()).default({}),
  repeats: z.record(z.array(z.record(z.string()))).default({}),
});

/** Displayed image widths, in device pixels — roughly 2× their CSS width. */
const IMAGE_WIDTHS = { cover: 720, authorPhoto: 400, logo: 240 } as const;
const IMAGE_QUALITY = 72;

export interface GenerateClonedLandingPageInput {
  projectId: string;
  force?: boolean | undefined;
}

/**
 * Builds a book's sales page by filling a cloned template.
 *
 * Stages 5–7 of the clone pipeline: Claude writes prose into slots whose size
 * was measured from the template's own text, deterministic code binds it, and a
 * pixel diff against the captured template proves nothing but the content moved.
 *
 * No model call in this use case can affect layout. The copy call returns a flat
 * `Record<string, string>`; everything structural was decided during extraction
 * and is stored.
 */
export class GenerateClonedLandingPageUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly books: BookRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly channels: ChannelRepository,
    private readonly artifacts: ExportArtifactRepository,
    private readonly pages: LandingPageRepository,
    private readonly templates: LandingTemplateRepository,
    private readonly store: TemplateArtifactStore,
    private readonly binder: LandingPageBinder,
    private readonly capturer: TemplateCapturer,
    private readonly differ: PageDiffer,
    private readonly ai: AiTextGenerator,
    private readonly colors: ImageColorSampler,
    private readonly images: RemoteImageFetcher,
    private readonly imageProcessor: ImageProcessor,
    private readonly storage: ObjectStorage,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async execute(
    input: GenerateClonedLandingPageInput,
  ): Promise<Result<{ regenerated: boolean; fidelity: LandingFidelity }>> {
    const projectId = ProjectId.from(input.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!project.options.landingPage) return Result.fail('Landing page is not enabled for this project');

    const templateId = project.options.landingTemplateId;
    if (!templateId) return Result.fail('This project has no template selected');

    const template = await this.templates.findById(templateId);
    if (!template) return Result.fail('The selected template no longer exists');
    if (template.ownerId !== project.ownerId) {
      // The template id arrives from the client. Without this, anyone could
      // bind their book onto another account's cloned template.
      return Result.fail('The selected template belongs to a different account');
    }
    if (template.state !== 'READY') {
      return Result.fail(
        template.failureReason
          ? `The template is not usable: ${template.failureReason}`
          : 'The template is still being extracted',
      );
    }

    const book = await this.books.findSummaryByProject(projectId);
    if (!book) return Result.fail('Book not found');
    if (book.chapterTitles.length === 0) return Result.fail('Book has no chapters yet');
    const strategy = await this.knowledge.getBookStrategy(projectId);
    const title =
      normalizeBookTitle(book.title ?? project.options.bookTitle ?? strategy?.title ?? undefined) ?? 'Untitled';

    const now = this.clock.now();
    const existing = await this.pages.findByProject(projectId);
    const page =
      existing ?? LandingPage.create({ id: LandingPageId.from(this.ids.uuid()), projectId: input.projectId, now });

    const inputHash = this.hasher.hash({
      title,
      chapters: book.chapterTitles,
      strategy: strategy?.inputHash ?? '',
      cover: book.coverImagePath ?? '',
      price: project.options.landingPriceCents ?? null,
      compareAt: project.options.landingCompareAtCents ?? null,
      currency: project.options.landingCurrency,
      checkout: project.options.landingCheckoutUrl ?? '',
      guarantee: project.options.landingGuaranteeDays,
      // Both the template AND its revision: a re-extraction produces different
      // markup, and serving the cached page would silently ignore it.
      template: `${template.id}:${template.revision}`,
    });
    if (!input.force && existing?.inputHash === inputHash && existing.html) {
      return Result.ok({ regenerated: false, fidelity: existing.fidelity ?? emptyFidelity() });
    }

    page.markGenerating(now);
    await this.pages.saveState(page);

    const outcome = await this.build({ project, template, book, strategy, title, projectId, inputHash });
    if (outcome.isFail()) {
      page.markFailed(outcome.error, this.clock.now());
      await this.pages.saveState(page);
      return Result.fail(outcome.error);
    }

    page.setClonedDraft(
      {
        copy: outcome.value.copy,
        html: outcome.value.html,
        inputHash,
        templateId: template.id,
        binding: outcome.value.binding,
        assets: outcome.value.assets,
        fidelity: outcome.value.fidelity,
      },
      this.clock.now(),
    );
    await this.pages.save(page);
    return Result.ok({ regenerated: true, fidelity: outcome.value.fidelity });
  }

  private async build(input: {
    project: NonNullable<Awaited<ReturnType<ProjectRepository['findById']>>>;
    template: StoredLandingTemplate;
    book: NonNullable<Awaited<ReturnType<BookRepository['findSummaryByProject']>>>;
    strategy: Awaited<ReturnType<KnowledgeRepository['getBookStrategy']>>;
    title: string;
    projectId: ProjectId;
    inputHash: string;
  }): Promise<
    Result<{
      html: string;
      copy: LandingCopy;
      binding: LandingBinding;
      assets: LandingPageAsset[];
      fidelity: LandingFidelity;
    }>
  > {
    const { project, template, book, strategy, title } = input;

    const loaded = await this.store.loadTemplate(template);
    if (loaded.isFail()) return Result.fail(loaded.error);

    const channel = await this.channels.getChannel(input.projectId);
    const artifactList = await this.artifacts.listByProject(input.projectId);
    const pageCount = artifactList.find((a) => a.pageCount > 0)?.pageCount ?? null;

    // ── STAGE 5: copy ────────────────────────────────────────────────────────
    const copySlots = template.placeholders.filter((p) => isCopyKey(p.placeholder) && !splitRepeaterField(p.placeholder));
    const repeaterBriefs = template.repeaters
      .filter((r) => r.fields.length > 0)
      .map((r) => ({
        key: r.key,
        // The template's own count unless its container provably reflows.
        count: r.originalCount,
        fields: r.fields.map((field) => {
          const entry = template.placeholders.find((p) => p.placeholder === `${r.key}.${field}`);
          return { name: field, maxChars: entry?.maxChars ?? 120, originalText: entry?.originalText ?? '' };
        }),
      }));

    // Audience psychology from phase 6. The landing copy has never seen it —
    // it only ever received the book strategy — and it is the one input that
    // lets a page answer an objection before it costs a sale.
    const insights = await this.knowledge.listCommentInsights(input.projectId);
    const audiencePains = unique(insights.flatMap((i) => [...i.frustrations, ...i.recurringProblems])).slice(0, 12);
    const audienceObjections = unique(insights.flatMap((i) => i.objections)).slice(0, 8);

    const written = await this.writeCopy({
      projectId: input.projectId.value,
      bookTitle: title,
      subtitle: strategy?.subtitle ?? '',
      channelTitle: channel?.title ?? 'this creator',
      author: strategy?.author,
      strategy: strategy?.toText() ?? '',
      chapterTitles: book.chapterTitles,
      pageCount,
      tone: project.options.tone,
      audiencePains: audiencePains.length > 0 ? audiencePains : undefined,
      audienceObjections: audienceObjections.length > 0 ? audienceObjections : undefined,
      slots: copySlots,
      repeaters: repeaterBriefs,
    });
    if (written.isFail()) return Result.fail(written.error);

    // ── images become deployed files, not base64 in the row ──────────────────
    const assets: Array<{ sitePath: string; bytes: Uint8Array; contentType: string; storagePath: string }> = [];
    const cover = await this.loadImage(book.coverImagePath, IMAGE_WIDTHS.cover);
    if (cover) assets.push({ ...cover, sitePath: 'assets/cover.webp', storagePath: '' });
    const authorPhoto = await this.loadImage(project.options.landingAuthorPhotoPath ?? null, IMAGE_WIDTHS.authorPhoto);
    if (authorPhoto) assets.push({ ...authorPhoto, sitePath: 'assets/author.webp', storagePath: '' });
    const logo = await this.loadRemoteImage(channel?.thumbnailUrl ?? null, IMAGE_WIDTHS.logo);
    if (logo) assets.push({ ...logo, sitePath: 'assets/logo.webp', storagePath: '' });

    // ── STAGE 6: bind ────────────────────────────────────────────────────────
    const coverAccent = await this.coverAccent(book.coverImagePath);
    const theme = adaptTheme({ theme: template.theme, coverAccent });

    const scalars: Record<string, string> = {
      ...written.value.slots,
      BRAND_NAME: channel?.title ?? title,
      AUTHOR_NAME: strategy?.author ?? channel?.title ?? '',
      PRICE: formatMoney(project.options.landingPriceCents, project.options.landingCurrency),
      COMPARE_AT_PRICE: formatMoney(project.options.landingCompareAtCents, project.options.landingCurrency),
      GUARANTEE_DAYS: String(project.options.landingGuaranteeDays),
      ...(cover ? { BOOK_COVER: 'assets/cover.webp', BOOK_COVER_ALT: `${title} cover` } : {}),
      ...(authorPhoto ? { AUTHOR_IMAGE: 'assets/author.webp' } : {}),
      ...(logo ? { BRAND_LOGO: 'assets/logo.webp' } : {}),
      ...(project.options.landingCheckoutUrl ? { CHECKOUT_URL: project.options.landingCheckoutUrl } : {}),
    };

    const binding: LandingBinding = { scalars, repeats: written.value.repeats };

    const assembled = this.binder.assemble({
      templateHtml: loaded.value.html,
      css: loaded.value.css,
      themeOverrideCss: theme.overrideCss,
      accentLiteral: theme.literalFrom && theme.accentHex ? { from: theme.literalFrom, to: theme.accentHex } : null,
      values: {
        scalars,
        repeats: written.value.repeats,
        trustedHtml: { FOOTER_LEGAL: legalMarkup(channel?.title ?? title, this.clock.now().getFullYear()) },
      },
      // The checkout URL is deliberately NOT required here: a seller previews
      // the page before the product exists on their store. Publishing is where
      // a missing link is fatal, and that gate is already in place.
      required: REQUIRED_PLACEHOLDERS.filter((key) => key !== 'CHECKOUT_URL'),
      documentTitle: written.value.slots['PAGE_TITLE'] || title,
      metaDescription: written.value.slots['META_DESCRIPTION'] || written.value.slots['HERO_SUBTITLE'] || '',
    });
    if (assembled.isFail()) return Result.fail(assembled.error.join(' · '));

    // ── STAGE 7: verify ──────────────────────────────────────────────────────
    const fidelity = await this.verify({
      html: assembled.value.html,
      template,
      assets,
      checkoutUrl: project.options.landingCheckoutUrl ?? null,
      unresolved: assembled.value.unresolved,
      themeReason: theme.reason,
    });

    // Persist each image beside the template's own assets so the deploy can
    // read them back without re-deriving anything.
    const pageAssets: LandingPageAsset[] = [];
    for (const asset of assets) {
      const path = `pages/${input.projectId.value}/${asset.sitePath.replace('assets/', '')}`;
      const put = await this.storage.put('landing-assets', path, asset.bytes, asset.contentType);
      if (put.isOk()) {
        pageAssets.push({ sitePath: asset.sitePath, storagePath: path, contentType: asset.contentType });
      }
    }

    return Result.ok({
      html: assembled.value.html,
      copy: toLandingCopy(written.value.slots, title),
      binding,
      assets: pageAssets,
      fidelity,
    });
  }

  /**
   * Renders the bound page and proves that only the replaced content moved.
   *
   * Masked at 1280 with each placeholder's captured rect: content swapped on
   * purpose must not count as drift, or every page fails its own check. The
   * narrower widths are reported without masks and never block — masking them
   * would need an inventory pass per width, and the desktop comparison is the
   * one that catches real breakage.
   */
  private async verify(input: {
    html: string;
    template: StoredLandingTemplate;
    assets: Array<{ sitePath: string; bytes: Uint8Array; contentType: string }>;
    checkoutUrl: string | null;
    unresolved: string[];
    themeReason: string;
  }): Promise<LandingFidelity> {
    const findings: Finding[] = validateBoundPage({
      html: input.html,
      checkoutUrl: input.checkoutUrl,
      sourceHost: hostOf(input.template.sourceUrl),
      expectedCtaCount: input.template.placeholders.filter((p) => p.placeholder === 'CHECKOUT_URL').length,
    });

    findings.push({ severity: 'INFO', code: 'THEME', message: input.themeReason });
    for (const slot of input.unresolved) {
      findings.push({
        severity: 'WARN',
        code: 'SLOT_EMPTY',
        message: `${slot} had no value, so that part of the page is blank.`,
      });
    }

    const visual: LandingFidelity['visual'] = [];
    const templateAssets = await this.store.loadAssets(await this.templates.listAssets(input.template.id));
    const shot = await this.capturer.shoot({
      html: input.html,
      assets: [...templateAssets, ...input.assets],
      widths: VERIFY_WIDTHS,
    });

    if (shot.isFail()) {
      findings.push({
        severity: 'WARN',
        code: 'VERIFY_SKIPPED',
        message: `The page could not be rendered for verification: ${shot.error}`,
      });
      return { findings: findings.map(toPlain), visual, unresolvedSlots: input.unresolved };
    }

    // The captured baseline lives in storage; without it there is nothing to
    // diff against, which is a gap in the report rather than a bad page.
    const baseline = await this.loadBaseline(input.template);
    if (baseline.length === 0) {
      findings.push({
        severity: 'WARN',
        code: 'NO_BASELINE',
        message: 'The template has no stored screenshots, so the visual check could not run.',
      });
      return { findings: findings.map(toPlain), visual, unresolvedSlots: input.unresolved };
    }

    const masks: Record<number, Rect[]> = { 1280: masksFor(input.template.placeholders) };
    const compared = await this.differ.compare({ baseline, candidate: shot.value, masks });
    if (compared.isFail()) {
      findings.push({ severity: 'WARN', code: 'DIFF_FAILED', message: compared.error });
      return { findings: findings.map(toPlain), visual, unresolvedSlots: input.unresolved };
    }

    for (const result of compared.value) {
      visual.push({
        width: result.width,
        mismatchRatio: result.mismatchRatio,
        maskedMismatchRatio: result.maskedMismatchRatio,
      });

      if (result.width === 1280) {
        if (result.mismatchRatio > MAX_UNMASKED_DRIFT) {
          findings.push({
            severity: 'BLOCKER',
            code: 'LAYOUT_DRIFT',
            message:
              `${Math.round(result.mismatchRatio * 1000) / 10}% of the page changed outside the regions where ` +
              'content was replaced. The usual cause is copy longer than the box the template sized for it.',
          });
        }
        if (masks[1280] && masks[1280].length > 0 && result.maskedMismatchRatio < MIN_MASKED_CHANGE) {
          findings.push({
            severity: 'WARN',
            code: 'CONTENT_UNCHANGED',
            message:
              "The regions meant to hold this book's content barely changed. Some placeholders may have " +
              "collapsed, leaving the template's layout with holes.",
          });
        }
      } else if (result.mismatchRatio > MAX_UNMASKED_DRIFT * 4) {
        // Unmasked, so a large number here is expected — it is reported for a
        // human to glance at rather than used as a gate.
        findings.push({
          severity: 'INFO',
          code: 'NARROW_DRIFT',
          message: `At ${result.width}px the page differs from the template by ${Math.round(result.mismatchRatio * 100)}%.`,
        });
      }
    }

    return { findings: findings.map(toPlain), visual, unresolvedSlots: input.unresolved };
  }

  private async loadBaseline(template: StoredLandingTemplate) {
    const shots = [];
    for (const entry of template.baselineShots) {
      const bytes = await this.storage.getBytes('landing-assets', entry.storagePath);
      if (bytes.isFail()) continue;
      shots.push({
        width: entry.width,
        mediaType: 'image/png',
        dataBase64: bytesToBase64(bytes.value.bytes),
      });
    }
    return shots;
  }

  private async writeCopy(input: {
    projectId: string;
    bookTitle: string;
    subtitle: string;
    channelTitle: string;
    author: string | undefined;
    strategy: string;
    chapterTitles: string[];
    pageCount: number | null;
    tone: string;
    audiencePains: string[] | undefined;
    audienceObjections: string[] | undefined;
    slots: PlaceholderEntry[];
    repeaters: Array<{ key: string; count: number; fields: Array<{ name: string; maxChars: number; originalText: string }> }>;
  }): Promise<Result<{ slots: Record<string, string>; repeats: Record<string, Array<Record<string, string>>> }>> {
    const prompt = TemplateCopyPrompt.build({
      ...input,
      slots: input.slots.map((s) => ({ key: s.placeholder, maxChars: s.maxChars, originalText: s.originalText })),
    });

    const completion = await this.ai.generate({
      model: 'claude-sonnet-4-6',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: 16_000,
      cacheControl: { systemPrefix: true },
      metadata: { projectId: input.projectId, stage: 'landing-page-copy' },
    });
    if (completion.isFail()) return Result.fail(`Copywriting failed: ${completion.error.type}`);
    if (completion.value.stopReason === 'max_tokens') {
      return Result.fail('The copywriting response was cut off — the template declares more slots than the budget allows.');
    }

    const parsed = parseJsonCompletion(completion.value.text, CopyResponseSchema);
    if (parsed.isFail()) return Result.fail(parsed.error);

    // Trim to the measured budget rather than failing. The template's CSS is
    // what enforces the length; a slot four characters over is a clipped word,
    // not a reason to lose the whole page.
    const slots: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.value.slots)) {
      const budget = input.slots.find((s) => s.placeholder === key)?.maxChars;
      slots[key] = budget && value.length > budget ? `${value.slice(0, budget - 1).trimEnd()}…` : value;
    }

    return Result.ok({ slots, repeats: parsed.value.repeats });
  }

  private async loadImage(
    path: string | null | undefined,
    maxWidth: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!path) return null;
    const raw = await this.storage.getBytes(EXPORTS_BUCKET, path);
    if (raw.isFail()) return null;
    const processed = await this.imageProcessor.downscaleToBytes({
      bytes: raw.value.bytes,
      maxWidth,
      quality: IMAGE_QUALITY,
    });
    return processed.isOk() ? processed.value : null;
  }

  private async loadRemoteImage(
    url: string | null,
    maxWidth: number,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!url) return null;
    const fetched = await this.images.fetchBytes(url);
    if (fetched.isFail()) return null;
    const processed = await this.imageProcessor.downscaleToBytes({
      bytes: fetched.value.bytes,
      maxWidth,
      quality: IMAGE_QUALITY,
    });
    return processed.isOk() ? processed.value : null;
  }

  private async coverAccent(path: string | null) {
    if (!path) return null;
    const raw = await this.storage.getBytes(EXPORTS_BUCKET, path);
    if (raw.isFail()) return null;
    const sampled = await this.colors.dominantColor(raw.value.bytes);
    return sampled.isOk() ? sampled.value : null;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function masksFor(placeholders: PlaceholderEntry[]): Rect[] {
  return placeholders
    .map((p) => p.rect)
    .filter((rect): rect is Rect => rect !== undefined && rect.width > 0 && rect.height > 0);
}

function toPlain(finding: Finding) {
  return { severity: finding.severity, code: finding.code, message: finding.message };
}

function emptyFidelity(): LandingFidelity {
  return { findings: [], visual: [], unresolvedSlots: [] };
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };

function formatMoney(cents: number | undefined, currency: string): string {
  if (cents === undefined) return '';
  const amount = cents / 100;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  return symbol ? `${symbol}${text}` : `${text} ${currency.toUpperCase()}`;
}

/**
 * The disclaimer, system-rendered.
 *
 * Never the template's own: cloning the owner's refund policy would publish a
 * contractual claim the seller never made, on a page taking their money.
 */
function legalMarkup(siteName: string, year: number): string {
  const safe = siteName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    `<p>© ${year} ${safe}. All rights reserved.</p>` +
    `<p>This is a digital product delivered as a downloadable file; nothing is shipped. ` +
    `Any figures shown are illustrative and not a guarantee — individual results vary.</p>`
  );
}

/**
 * The subset of `LandingCopy` a cloned page has.
 *
 * Most of that interface describes the built-in renderer's fixed sections,
 * which a cloned page does not have — its sections are the template's. Filled
 * so the existing row shape and preview endpoint keep working unchanged.
 */
function toLandingCopy(slots: Record<string, string>, title: string): LandingCopy {
  return {
    headline: slots['HERO_TITLE'] ?? title,
    subheadline: slots['HERO_SUBTITLE'] ?? '',
    eyebrow: '',
    ctaLabel: slots['CTA_TEXT'] ?? 'Get the book',
    painPoints: [],
    whatsInsideHeading: '',
    bullets: [],
    whoIsItForHeading: '',
    whoIsItFor: [],
    authorHeading: '',
    authorBio: slots['AUTHOR_BIO'] ?? '',
    faqs: [],
    categoryLabel: '',
    productFeatures: [],
    comparisonWithout: [],
    comparisonWith: [],
    closingHeading: '',
    closingBody: '',
    fontFamily: 'sans',
    templateSections: [],
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Base64 without Node's Buffer, so this file stays framework-free. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}
