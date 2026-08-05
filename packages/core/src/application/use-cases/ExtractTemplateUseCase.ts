import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import {
  CORE_PLACEHOLDERS,
  REPEATER_PLACEHOLDERS,
  isExtendedKey,
  kindFor,
  splitRepeaterField,
} from '../../domain/landing/PlaceholderVocabulary.js';
import {
  LANDING_PIPELINE_VERSION,
  type ExtractionReport,
  type Finding,
  type PlaceholderEntry,
  type RepeaterEntry,
  type StoredLandingTemplate,
} from '../../domain/landing/TemplateManifest.js';
import { validateTemplate } from '../landing/templateContract.js';
import { TemplateAnnotationPrompt } from '../prompts/TemplateAnnotationPrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { CapturedTemplate, InventoryNode, TemplateCapturer } from '../ports/services/TemplateCapturer.js';
import type { PageDiffer } from '../ports/services/PageDiffer.js';
import type { LandingTemplateRepository } from '../ports/repositories/LandingTemplateRepository.js';
import type { TemplateArtifactStore } from '../ports/services/TemplateArtifactStore.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';

/**
 * The annotation model's only output shape.
 *
 * Ids and names — nothing that could be markup. A response that does not fit
 * this fails schema validation and the extraction retries; a response that fits
 * but names nodes that do not exist has those entries dropped. There is no
 * third case, which is what makes "the AI cannot break the layout" a property
 * of the system rather than an instruction in a prompt.
 */
const AnnotationSchema = z.object({
  map: z
    .array(
      z.object({
        nodeId: z.string(),
        placeholder: z.string(),
        maxChars: z.number().optional(),
      }),
    )
    .default([]),
  repeaters: z
    .array(z.object({ containerTplId: z.string(), key: z.string() }))
    .default([]),
});

/** Copy may run 15% longer than the words the template's CSS was tuned to. */
const LENGTH_HEADROOM = 1.15;

/** Below this, a slot is too small to write anything meaningful into. */
const MIN_MAX_CHARS = 12;

/**
 * How far the cleaned page may drift from the captured original before the
 * template is not worth building on.
 *
 * This is the honest measure of what cloning costs: scripts are stripped, so
 * anything the template drove with JavaScript stops. A page whose reveals or
 * carousel accounted for a fifth of its pixels is a page the seller should be
 * told about before they build on it, not after.
 */
const MAX_CLEANING_LOSS = 0.2;

export interface ExtractTemplateInput {
  ownerId: string;
  sourceUrl: string;
  /**
   * The user's assertion that they may copy this template.
   *
   * Required, and recorded. Cloning a site wholesale is a different act from
   * being inspired by one, and the system is not entitled to make that call on
   * the seller's behalf.
   */
  attestOwnership: boolean;
  /** Re-extract even when a template already exists at this pipeline version. */
  force?: boolean | undefined;
}

/**
 * Clones a template site and turns it into a fillable template.
 *
 * Stages 1–4: capture in a real browser, clean, label, parameterise. The only
 * model call is the labelling one, and it produces a mapping that deterministic
 * code applies — nothing here asks a model to write HTML, CSS, or layout.
 */
export class ExtractTemplateUseCase {
  constructor(
    private readonly templates: LandingTemplateRepository,
    private readonly capturer: TemplateCapturer,
    private readonly artifacts: TemplateArtifactStore,
    private readonly differ: PageDiffer,
    private readonly ai: AiTextGenerator,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ExtractTemplateInput): Promise<Result<{ templateId: string; report: ExtractionReport }>> {
    if (!input.attestOwnership) {
      return Result.fail(
        'Confirm you have the right to use this template before it can be copied. The system makes a complete ' +
          "copy of the page, which is not the same as taking inspiration from it.",
      );
    }

    const sourceUrl = input.sourceUrl.trim();
    if (!/^https?:\/\//i.test(sourceUrl)) return Result.fail('The template URL must start with http:// or https://');

    const existing = await this.templates.findCurrent(input.ownerId, sourceUrl, LANDING_PIPELINE_VERSION);
    if (existing && existing.state === 'READY' && !input.force) {
      return Result.ok({ templateId: existing.id, report: existing.report ?? emptyReport() });
    }

    const templateId = this.ids.uuid();
    const revision = (existing?.revision ?? 0) + 1;
    const created = await this.templates.create({
      id: templateId,
      ownerId: input.ownerId,
      sourceUrl,
      pipelineVersion: LANDING_PIPELINE_VERSION,
      revision,
    });
    if (created.isFail()) return Result.fail(created.error);

    const outcome = await this.run(templateId, sourceUrl, existing);
    if (outcome.isFail()) {
      await this.templates.save({
        ...blank(templateId, input.ownerId, sourceUrl, revision),
        state: 'FAILED',
        failureReason: outcome.error,
      });
      return Result.fail(outcome.error);
    }

    const { template, report } = outcome.value;
    await this.templates.save({
      ...template,
      id: templateId,
      ownerId: input.ownerId,
      sourceUrl,
      revision,
      state: 'READY',
      report,
    });
    return Result.ok({ templateId, report });
  }

  private async run(
    templateId: string,
    sourceUrl: string,
    previous: StoredLandingTemplate | null,
  ): Promise<Result<{ template: StoredLandingTemplate; report: ExtractionReport }>> {
    // ── STAGE 1–2: capture and clean ─────────────────────────────────────────
    const captured = await this.capturer.capture(sourceUrl);
    if (captured.isFail()) return Result.fail(captured.error);
    const page = captured.value;

    const findings: Finding[] = [];
    const notes = [...page.notes];

    // What cleaning cost, measured rather than assumed.
    const cleaningLoss: ExtractionReport['cleaningLoss'] = [];
    const diffed = await this.differ.compare({ baseline: page.baselineShots, candidate: page.cleanedShots });
    if (diffed.isOk()) {
      for (const result of diffed.value) {
        cleaningLoss.push({ width: result.width, mismatchRatio: result.mismatchRatio });
        if (result.mismatchRatio > MAX_CLEANING_LOSS) {
          findings.push({
            severity: 'BLOCKER',
            code: 'CLEANING_LOSS',
            message:
              `Removing scripts changed ${Math.round(result.mismatchRatio * 100)}% of the page at ` +
              `${result.width}px. This template's appearance depends on JavaScript that cannot be ` +
              'republished — most often a scroll-reveal library or a carousel.',
          });
        }
      }
    } else {
      notes.push(`The cleaning-loss check could not run: ${diffed.error}`);
    }

    // ── STAGE 2: store the artifacts and re-host the assets ───────────────────
    const stored = await this.artifacts.storeTemplate({
      templateId,
      originalHtml: page.originalHtml,
      cleanHtml: page.cleanHtml,
      css: page.css,
      baseUrl: page.finalUrl,
      assets: page.assets,
      baselineShots: page.baselineShots,
    });
    if (stored.isFail()) return Result.fail(stored.error);
    if (stored.value.unresolvedUrls.length > 0) {
      notes.push(
        `${stored.value.unresolvedUrls.length} stylesheet asset(s) could not be re-hosted; those decorations ` +
          'are absent rather than loaded from the template owner’s server.',
      );
    }
    if (stored.value.fontFidelity === 'degraded') {
      notes.push(
        "The template's webfonts could not be legally re-hosted, so the type falls back to the nearest " +
          'available faces. Typography will differ from the original.',
      );
    }

    // ── STAGE 3: label ───────────────────────────────────────────────────────
    const annotated = await this.annotate(templateId, page, previous);
    if (annotated.isFail()) return Result.fail(annotated.error);

    const placeholders = annotated.value.placeholders;
    const repeaters = annotated.value.repeaters;
    findings.push(...annotated.value.findings);

    // ── STAGE 4: parameterise ────────────────────────────────────────────────
    const parameterised = await this.capturer.parameterise({
      cleanHtml: stored.value.cleanHtml,
      placeholders,
      repeaters,
    });
    if (parameterised.isFail()) return Result.fail(parameterised.error);

    if (parameterised.value.droppedIds.length > 0) {
      // The safety property, visible: an id that named nothing did nothing.
      findings.push({
        severity: 'WARN',
        code: 'NODES_DROPPED',
        message:
          `${parameterised.value.droppedIds.length} labelled node(s) no longer existed and were skipped. ` +
          'Those parts of the page keep the original wording.',
      });
    }

    const applied = new Set(parameterised.value.appliedIds);
    const kept = placeholders.filter((p) => applied.has(p.tplId));

    // ── validate ─────────────────────────────────────────────────────────────
    const host = hostOf(page.finalUrl);
    const contract = validateTemplate({
      html: parameterised.value.html,
      placeholders: kept,
      repeaters: repeaters.filter((r) => r.key),
      sourceHost: host,
      originalCtaCount: page.ctaIds.length,
      sectionCount: page.sections.length,
    });
    if (contract.isFail()) findings.push(...contract.error);

    findings.push(...brandLeakFindings(parameterised.value.html, host, page.title));

    const blockers = findings.filter((f) => f.severity === 'BLOCKER');
    if (blockers.length > 0) {
      return Result.fail(blockers.map((f) => f.message).join(' · '));
    }

    // Only assets the parameterised page still references are worth keeping —
    // the template owner's own product photography becomes a placeholder, and
    // storing or deploying it would be republishing their asset.
    const pruned = await this.artifacts.pruneAssets({
      templateId,
      html: parameterised.value.html,
      css: stored.value.css,
      assets: stored.value.assets,
    });

    const finalHtml = await this.artifacts.storeParameterised({
      templateId,
      html: parameterised.value.html,
      css: stored.value.css,
    });
    if (finalHtml.isFail()) return Result.fail(finalHtml.error);

    const report: ExtractionReport = {
      findings,
      cleaningLoss,
      droppedImages: page.contentImages
        .filter((img) => !kept.some((p) => p.tplId === img.tplId))
        .map((img) => ({
          tplId: img.tplId,
          sourceUrl: img.sourceUrl,
          rect: { x: 0, y: 0, width: img.width, height: img.height },
        })),
      fontFidelity: stored.value.fontFidelity,
      assetBytes: pruned.reduce((total, a) => total + a.byteSize, 0),
      sectionCount: page.sections.length,
      notes,
    };

    return Result.ok({
      template: {
        id: templateId,
        ownerId: '',
        sourceUrl,
        state: 'READY',
        name: page.title || hostOf(page.finalUrl),
        originalHtmlPath: stored.value.originalHtmlPath,
        cleanHtmlPath: finalHtml.value.cleanHtmlPath,
        cssBundlePath: finalHtml.value.cssBundlePath,
        placeholders: kept,
        repeaters: repeaters.filter((r) => r.key),
        theme: page.theme,
        responsive: {
          widths: page.baselineShots.map((s) => s.width),
          breakpoints: stored.value.breakpoints,
          sections: page.sections,
        },
        baselineShots: stored.value.baselineShotPaths,
        overrides: previous?.overrides ?? [],
        report,
        failureReason: null,
        pipelineVersion: LANDING_PIPELINE_VERSION,
        revision: 0,
        capturedAt: this.clock.now(),
      },
      report,
    });
  }

  /**
   * The one model call, plus the deterministic guards that outrank it.
   *
   * The guards run AFTER the model and override it. That order is deliberate:
   * a missed buy button is a live anchor still pointing at the template owner's
   * store, which is the worst thing a cloned page can ship, and it is not a
   * judgement call — an href either matches a payment processor or it does not.
   */
  private async annotate(
    templateId: string,
    page: CapturedTemplate,
    previous: StoredLandingTemplate | null,
  ): Promise<Result<{ placeholders: PlaceholderEntry[]; repeaters: RepeaterEntry[]; findings: Finding[] }>> {
    const byId = new Map(page.inventory.map((n) => [n.tplId, n]));
    const findings: Finding[] = [];
    let repairErrors: string[] | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = TemplateAnnotationPrompt.build({
        sourceUrl: page.finalUrl,
        title: page.title,
        inventory: page.inventory,
        repeaterContainers: page.repeaters.map((r) => ({
          containerTplId: r.containerTplId,
          itemCount: r.originalCount,
          sampleText: byId.get(r.itemTplId)?.text ?? '',
        })),
        ...(previous && previous.overrides.length > 0
          ? {
              overrides: previous.overrides
                .filter((o) => o.action === 'relabel' && o.matchText)
                .map((o) => ({ placeholder: o.replacement ?? o.placeholder, matchText: o.matchText ?? '' })),
            }
          : {}),
        ...(repairErrors ? { repairErrors } : {}),
      });

      const completion = await this.ai.generate({
        // Sonnet: this is structured extraction against a supplied list, not
        // design judgement. Nothing in this pipeline is the 30k-token authoring
        // call that justified Opus in the previous one.
        model: 'claude-sonnet-4-6',
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        maxTokens: 8_000,
        cacheControl: { systemPrefix: true },
        metadata: { projectId: templateId, stage: 'landing-template-annotate' },
      });
      if (completion.isFail()) return Result.fail(`Template annotation failed: ${completion.error.type}`);
      if (completion.value.stopReason === 'max_tokens') {
        repairErrors = ['Your response was cut off. Return fewer, higher-value labels — the essential ones only.'];
        continue;
      }

      const parsed = parseJsonCompletion(completion.value.text, AnnotationSchema);
      if (parsed.isFail()) {
        repairErrors = [`Your response was not valid JSON in the required shape: ${parsed.error}`];
        continue;
      }

      const resolved = resolveAnnotation(parsed.value, page, byId);
      if (resolved.errors.length > 0 && attempt === 0) {
        repairErrors = resolved.errors;
        continue;
      }
      findings.push(...resolved.findings);
      return Result.ok({ placeholders: resolved.placeholders, repeaters: resolved.repeaters, findings });
    }

    return Result.fail(
      `The template could not be labelled after two attempts: ${(repairErrors ?? ['unknown reason']).join('; ')}`,
    );
  }
}

/**
 * Turns the model's answer into a placeholder map, discarding anything that
 * does not resolve and forcing the checkout labels that are not negotiable.
 */
function resolveAnnotation(
  annotation: z.infer<typeof AnnotationSchema>,
  page: CapturedTemplate,
  byId: Map<string, InventoryNode>,
): {
  placeholders: PlaceholderEntry[];
  repeaters: RepeaterEntry[];
  findings: Finding[];
  errors: string[];
} {
  const findings: Finding[] = [];
  const errors: string[] = [];
  const placeholders: PlaceholderEntry[] = [];
  const claimed = new Map<string, string>();

  for (const entry of annotation.map) {
    const node = byId.get(entry.nodeId);
    if (!node) continue; // an invented id names nothing and does nothing

    const kind = kindFor(entry.placeholder);
    if (!kind) {
      errors.push(`"${entry.placeholder}" is not a token in the vocabulary.`);
      continue;
    }

    // A `src` label on a text node, or a `text` label on an image, is a mapping
    // the DOM cannot honour.
    if ((kind === 'src' || kind === 'alt') && node.tag !== 'img') {
      errors.push(`${entry.placeholder} was put on a <${node.tag}>, but it can only go on an image.`);
      continue;
    }
    if (kind === 'href' && node.tag !== 'a') {
      errors.push(`${entry.placeholder} was put on a <${node.tag}>, but it can only go on a link.`);
      continue;
    }

    // Single-use core tokens. CTA_TEXT and CHECKOUT_URL are exempt: a sales
    // page repeats its buy button and every one must be labelled.
    const repeatable = entry.placeholder === 'CHECKOUT_URL' || entry.placeholder === 'CTA_TEXT';
    const isCore = Boolean(CORE_PLACEHOLDERS[entry.placeholder]);
    if (isCore && !repeatable) {
      const already = claimed.get(entry.placeholder);
      if (already && already !== entry.nodeId) {
        errors.push(`${entry.placeholder} was assigned to two different nodes (${already} and ${entry.nodeId}).`);
        continue;
      }
      claimed.set(entry.placeholder, entry.nodeId);
    }

    const originalText = node.text ?? node.alt ?? '';
    placeholders.push({
      tplId: entry.nodeId,
      placeholder: entry.placeholder,
      kind,
      maxChars: budgetFor(entry.maxChars, originalText),
      originalText,
      hadInlineMarkup: node.hasInlineMarkup === true,
      ...(node.rect ? { rect: node.rect } : {}),
    });
  }

  // ── the guard that outranks the model ────────────────────────────────────
  for (const ctaId of page.ctaIds) {
    if (placeholders.some((p) => p.tplId === ctaId && p.placeholder === 'CHECKOUT_URL')) continue;
    const node = byId.get(ctaId);
    placeholders.push({
      tplId: ctaId,
      placeholder: 'CHECKOUT_URL',
      kind: 'href',
      maxChars: 2048,
      originalText: node?.href ?? '',
      hadInlineMarkup: false,
    });
    findings.push({
      severity: 'INFO',
      code: 'CTA_FORCED',
      message: `A buy button (${ctaId}) was not labelled and was assigned the checkout link automatically.`,
    });
  }

  // ── repeaters: detection is mechanical, naming is the model's ────────────
  const named = new Map(annotation.repeaters.map((r) => [r.containerTplId, r.key]));
  const repeaters: RepeaterEntry[] = [];
  for (const detected of page.repeaters) {
    const key = named.get(detected.containerTplId);
    if (!key) continue;
    if (!REPEATER_PLACEHOLDERS[key]) {
      errors.push(`"${key}" is not a known repeating region.`);
      continue;
    }
    if (repeaters.some((r) => r.key === key)) {
      findings.push({
        severity: 'WARN',
        code: 'DUPLICATE_REPEATER',
        message: `More than one container was named ${key}; only the first is used.`,
      });
      continue;
    }
    const fields = placeholders
      .map((p) => splitRepeaterField(p.placeholder))
      .filter((f): f is { key: string; field: string } => f !== null && f.key === key)
      .map((f) => f.field);
    repeaters.push({ ...detected, key, fields: [...new Set(fields)] });
  }

  // A labelled region with no fields would clone an item that has nothing to
  // fill, printing the template's own words once per book.
  for (const repeater of repeaters) {
    if (repeater.fields.length === 0) {
      errors.push(`Repeater "${repeater.key}" was named but none of its item's fields were labelled.`);
    }
  }

  const extended = placeholders.filter((p) => isExtendedKey(p.placeholder)).length;
  if (extended === 0 && page.sections.length > 5) {
    findings.push({
      severity: 'WARN',
      code: 'NO_EXTENDED_SLOTS',
      message:
        `The template has ${page.sections.length} sections but no extended slots were assigned. Sections the core ` +
        "vocabulary does not cover will keep the original page's words.",
    });
  }

  return { placeholders, repeaters, findings, errors };
}

/**
 * The character budget for a slot.
 *
 * Measured from the template's own text, not taken from the model: the CSS was
 * tuned to those words, so their length is the only honest ceiling. The model's
 * suggestion is accepted only when it is close to the measurement.
 */
function budgetFor(suggested: number | undefined, originalText: string): number {
  const measured = Math.max(MIN_MAX_CHARS, Math.ceil(originalText.length * LENGTH_HEADROOM));
  if (!suggested || !Number.isFinite(suggested) || suggested <= 0) return measured;
  // Within a quarter of the measurement, the model's number is fine and may
  // reflect something it can see that a character count cannot. Beyond that,
  // the measurement wins.
  const ratio = suggested / measured;
  return ratio > 0.75 && ratio < 1.25 ? Math.round(suggested) : measured;
}

/**
 * Text that still names the template's owner.
 *
 * Easy to miss and embarrassing when it ships: a footer, a masthead or an alt
 * attribute still reading "The Mechanic Bible" on a page selling something
 * else. Reported rather than auto-removed — the fix is usually to label the
 * node, which is a decision, not a deletion.
 */
function brandLeakFindings(html: string, host: string, title: string): Finding[] {
  const candidates = new Set<string>();

  const bare = host.replace(/^www\./, '').split('.')[0] ?? '';
  if (bare.length >= 5) candidates.add(bare);

  // "The Mechanic Bible — Fix your own car" → "The Mechanic Bible"
  const brandFromTitle = (title.split(/[|—–:·-]/)[0] ?? '').trim();
  if (brandFromTitle.length >= 5 && brandFromTitle.split(/\s+/).length <= 5) candidates.add(brandFromTitle);

  const text = html.replace(/<[^>]+>/g, ' ');
  const findings: Finding[] = [];
  for (const candidate of candidates) {
    const re = new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const hits = text.match(re);
    if (hits && hits.length > 0) {
      findings.push({
        severity: 'WARN',
        code: 'BRAND_LEAK',
        message:
          `"${candidate}" still appears ${hits.length} time(s) in the template text. Label those nodes ` +
          'BRAND_NAME, or the published page will name the template owner.',
      });
    }
  }
  return findings;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function emptyReport(): ExtractionReport {
  return {
    findings: [],
    cleaningLoss: [],
    droppedImages: [],
    fontFidelity: 'none',
    assetBytes: 0,
    sectionCount: 0,
    notes: [],
  };
}

function blank(id: string, ownerId: string, sourceUrl: string, revision: number): StoredLandingTemplate {
  return {
    id,
    ownerId,
    sourceUrl,
    state: 'FAILED',
    name: null,
    originalHtmlPath: null,
    cleanHtmlPath: null,
    cssBundlePath: null,
    placeholders: [],
    repeaters: [],
    theme: { accentToken: null, accentValue: null, onAccentValue: null, isDark: false, rootTokens: {} },
    responsive: { widths: [], breakpoints: [], sections: [] },
    baselineShots: [],
    overrides: [],
    report: null,
    failureReason: null,
    pipelineVersion: LANDING_PIPELINE_VERSION,
    revision,
    capturedAt: null,
  };
}
