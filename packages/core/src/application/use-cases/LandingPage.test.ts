import { describe, it, expect } from 'vitest';
import { GenerateLandingPageUseCase } from './GenerateLandingPageUseCase.js';
import { PublishLandingPageUseCase } from './PublishLandingPageUseCase.js';
import { Project } from '../../domain/project/Project.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { GenerationOptions } from '../../domain/project/GenerationOptions.js';
import { ChannelUrl } from '../../domain/channel/ChannelUrl.js';
import { Book } from '../../domain/book/Book.js';
import { Chapter } from '../../domain/book/Chapter.js';
import { BookId, ChapterId } from '../../domain/book/ids.js';
import { BookStrategy } from '../../domain/book/BookStrategy.js';
import { Channel } from '../../domain/channel/Channel.js';
import { LandingPage } from '../../domain/landing/LandingPage.js';
import { Result } from '../../domain/shared/Result.js';
import type { LandingPageRepository } from '../ports/repositories/LandingPageRepository.js';
import type { PublishInput, PublishOutput, SitePublisher } from '../ports/services/SitePublisher.js';
import type { LandingPageModel, LandingPageRenderer } from '../ports/services/LandingPageRenderer.js';

const now = new Date('2026-08-03T00:00:00Z');

// ── fakes ────────────────────────────────────────────────────────────────────

function makeProject(landing: Partial<Parameters<typeof GenerationOptions.create>[0]> = {}): Project {
  return Project.create({
    id: ProjectId.from('11111111-1111-4111-8111-111111111111'),
    ownerId: 'owner',
    channelUrl: ChannelUrl.create('https://www.youtube.com/@example').value,
    options: GenerationOptions.create({ bookTitle: 'The Mechanic Bible', landingPage: true, ...landing }),
    now,
  }).value;
}

function makeBook(): Book {
  const book = Book.create({ id: BookId.from('book-1'), projectId: 'p1', targetPages: 100 });
  book.setTitle('The Mechanic Bible');
  book.setCoverImagePath('covers/book-1.png');
  book.addChapter(
    Chapter.create({
      id: ChapterId.from('c1'),
      bookId: 'book-1',
      position: 1,
      title: 'Reading the dashboard',
      topic: 't',
      promise: 'p',
      keyPoints: [],
      wordTarget: 3000,
    }),
  );
  return book;
}

class FakeLandingRepo implements LandingPageRepository {
  saves = 0;
  constructor(private page: LandingPage | null = null) {}
  async findByProject(): Promise<LandingPage | null> {
    return this.page;
  }
  async save(page: LandingPage): Promise<void> {
    this.saves++;
    this.page = page;
  }
  current(): LandingPage | null {
    return this.page;
  }
}

const COPY_JSON = JSON.stringify({
  eyebrow: 'For weekend mechanics',
  headline: 'Stop paying for repairs you could do yourself',
  subheadline: 'The workshop manual for people who own a car, not a garage.',
  ctaLabel: 'Get the manual',
  painPoints: ['Shops charge for diagnosis you can do in ten minutes.'],
  whatsInsideHeading: "What's inside",
  bullets: [{ title: 'Read the dashboard', body: 'Know which warnings mean stop now.' }],
  whoIsItForHeading: 'Who this is for',
  whoIsItFor: ['You keep a car past its warranty.'],
  authorHeading: 'About the author',
  authorBio: 'Adrian has spent nineteen years under other people’s cars.',
  faqs: [{ question: 'What format?', answer: 'PDF and DOCX.' }],
  closingHeading: 'Fix it yourself',
  closingBody: 'One repair pays for the book.',
  fontFamily: 'sans',
});

/** Everything GenerateLandingPageUseCase needs, with sensible defaults. */
function buildGenerate(options: {
  project?: Project;
  existingPage?: LandingPage | null;
  aiText?: string;
  renderer?: LandingPageRenderer;
  /** Simulate the completion hitting the output ceiling. */
  truncated?: boolean;
}) {
  const project = options.project ?? makeProject();
  const book = makeBook();
  const pages = new FakeLandingRepo(options.existingPage ?? null);
  let aiCalls = 0;
  const rendered: LandingPageModel[] = [];

  const useCase = new GenerateLandingPageUseCase(
    { findById: async () => project } as never,
    { findByProject: async () => book } as never,
    {
      getBookStrategy: async () =>
        BookStrategy.create({
          title: 'The Mechanic Bible',
          subtitle: 'Fix it yourself',
          targetAudience: 'car owners',
          corePromise: 'save money',
          transformation: 'confidence',
          authorVoice: 'blunt',
          author: 'Adrian',
          tone: 'professional',
          chapterCount: 1,
          targetWordCount: 45000,
          uniqueSellingProposition: 'usp',
          keyPrinciples: [],
          inputHash: 'strategy-hash',
        }),
    } as never,
    {
      getChannel: async () =>
        Channel.create({
          youtubeId: 'y',
          title: 'Car Care Garage',
          description: null,
          subscriberCount: 280_000,
          videoCount: 100,
          thumbnailUrl: null,
        }),
    } as never,
    { listByProject: async () => [] } as never,
    pages,
    { find: async () => null, save: async () => Result.ok() } as never,
    {
      generate: async () => {
        aiCalls++;
        return Result.ok({
          text: options.aiText ?? COPY_JSON,
          model: 'claude-opus-4-8',
          inputTokens: 1,
          outputTokens: 1,
          stopReason: options.truncated ? 'max_tokens' : 'end_turn',
        });
      },
    } as never,
    options.renderer ?? {
      render: (m: LandingPageModel) => {
        rendered.push(m);
        return '<html>page</html>';
      },
    },
    { assemble: () => '<html>generated</html>' },
    // No reference URL is set on the default fixture, so this is never called.
    { fetch: async () => Result.fail('no reference') },
    { capture: async () => Result.fail("no screenshots in tests") } as never,
    { dominantColor: async () => Result.ok({ r: 30, g: 60, b: 120 }) },
    { fetchDataUri: async () => Result.fail("no logo in tests") } as never,
    {
      getBytes: async () => Result.ok({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }),
      getDataUri: async () => Result.ok('data:image/png;base64,AQID'),
    } as never,
    { uuid: () => 'lp-1' },
    { now: () => now },
    // Order-insensitive stable hash — enough to prove "same inputs, same hash".
    { hash: (input: unknown) => JSON.stringify(input) },
  );

  return { useCase, pages, rendered, aiCalls: () => aiCalls, project };
}

const SIBLING_A = '22222222-2222-4222-8222-222222222222';
const SIBLING_B = '33333333-3333-4333-8333-333333333333';

/**
 * A three-book page, with a lookup keyed by project id so each sibling can be
 * made to exist, belong to someone else, or be unfinished independently.
 */
function buildTriple(opts: {
  siblings?: Array<{ projectId: string; priceCents?: number; checkoutUrl?: string }>;
  bundlePriceCents?: number;
  bundleCheckoutUrl?: string;
  /** Project ids that resolve to a project owned by somebody else. */
  foreignIds?: string[];
  /** Project ids whose book has no chapters yet. */
  unfinishedIds?: string[];
  /** Project ids that do not resolve at all. */
  missingIds?: string[];
} = {}) {
  const siblings = opts.siblings ?? [
    { projectId: SIBLING_A, priceCents: 3900, checkoutUrl: 'https://payhip.com/b/TWO' },
    { projectId: SIBLING_B, priceCents: 2900, checkoutUrl: 'https://payhip.com/b/THREE' },
  ];
  const root = makeProject({
    landingMode: 'triple',
    landingCheckoutUrl: 'https://payhip.com/b/ONE',
    landingPriceCents: 4700,
    landingSiblings: siblings,
    ...(opts.bundlePriceCents !== undefined ? { landingBundlePriceCents: opts.bundlePriceCents } : {}),
    ...(opts.bundleCheckoutUrl ? { landingBundleCheckoutUrl: opts.bundleCheckoutUrl } : {}),
  });
  const pages = new FakeLandingRepo(null);
  const rendered: LandingPageModel[] = [];

  const projects = {
    findById: async (id: ProjectId) => {
      const raw = id.toString();
      if (opts.missingIds?.includes(raw)) return null;
      if (raw === root.id.toString()) return root;
      const foreign = opts.foreignIds?.includes(raw);
      return Project.create({
        id: ProjectId.from(raw),
        ownerId: foreign ? 'someone-else' : 'owner',
        channelUrl: ChannelUrl.create('https://www.youtube.com/@example').value,
        options: GenerationOptions.create({ bookTitle: `Sibling ${raw.slice(0, 1)}`, landingPage: true }),
        now,
      }).value;
    },
  };

  const books = {
    findByProject: async (id: ProjectId) => {
      const raw = id.toString();
      if (opts.unfinishedIds?.includes(raw)) {
        return Book.create({ id: BookId.from(`book-${raw}`), projectId: raw, targetPages: 100 });
      }
      const book = makeBook();
      if (raw !== root.id.toString()) book.setTitle(`Sibling Book ${raw.slice(0, 1)}`);
      return book;
    },
  };

  const useCase = new GenerateLandingPageUseCase(
    projects as never,
    books as never,
    { getBookStrategy: async () => null } as never,
    { getChannel: async () => null } as never,
    { listByProject: async () => [] } as never,
    pages,
    { find: async () => null, save: async () => Result.ok() } as never,
    {
      generate: async () =>
        Result.ok({ text: COPY_JSON, model: 'm', inputTokens: 1, outputTokens: 1, stopReason: 'end_turn' }),
    } as never,
    {
      render: (m: LandingPageModel) => {
        rendered.push(m);
        return '<html>page</html>';
      },
    },
    { assemble: () => '<html>generated</html>' },
    { fetch: async () => Result.fail('no reference') },
    { capture: async () => Result.fail("no screenshots in tests") } as never,
    { dominantColor: async () => Result.ok({ r: 30, g: 60, b: 120 }) },
    { fetchDataUri: async () => Result.fail('no logo in tests') } as never,
    {
      getBytes: async () => Result.ok({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' }),
      getDataUri: async () => Result.ok('data:image/png;base64,AQID'),
    } as never,
    { uuid: () => 'lp-1' },
    { now: () => now },
    { hash: (input: unknown) => JSON.stringify(input) },
  );

  return { useCase, pages, rendered, root };
}

// ── three-book pages ─────────────────────────────────────────────────────────

describe('GenerateLandingPageUseCase — three-book pages', () => {
  const run = (b: ReturnType<typeof buildTriple>) =>
    b.useCase.execute({ projectId: '11111111-1111-4111-8111-111111111111' });

  it('sells all three books, each with its own price and link', async () => {
    const b = buildTriple();
    const result = await run(b);

    expect(result.isOk()).toBe(true);
    const products = b.rendered[0]!.products;
    expect(products).toHaveLength(3);
    expect(products.map((p) => p.checkoutUrl)).toEqual([
      'https://payhip.com/b/ONE',
      'https://payhip.com/b/TWO',
      'https://payhip.com/b/THREE',
    ]);
    expect(products.map((p) => p.priceCents)).toEqual([4700, 3900, 2900]);
  });

  it('adds the bundle as a fourth product when the seller set one up', async () => {
    const b = buildTriple({ bundlePriceCents: 6900, bundleCheckoutUrl: 'https://payhip.com/b/SET' });
    await run(b);

    const products = b.rendered[0]!.products;
    expect(products).toHaveLength(4);
    expect(products[3]?.kind).toBe('bundle');
    expect(products[3]?.checkoutUrl).toBe('https://payhip.com/b/SET');
  });

  it('leaves the bundle out entirely when no bundle link or price was given', async () => {
    const b = buildTriple();
    await run(b);
    expect(b.rendered[0]!.products.some((p) => p.kind === 'bundle')).toBe(false);
  });

  it('never lets the bundle become the hero — it has no cover of its own', async () => {
    const b = buildTriple({ bundlePriceCents: 6900, bundleCheckoutUrl: 'https://payhip.com/b/SET' });
    await run(b);

    const featured = b.rendered[0]!.products.filter((p) => p.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0]?.kind).toBe('book');
  });

  // The client's requirement is absolute: choosing 3 ebooks must produce a
  // 3-ebook page or an error. Never a quietly-smaller page.
  it('fails rather than dropping a book that no longer exists', async () => {
    const b = buildTriple({ missingIds: [SIBLING_B] });
    const result = await run(b);

    if (result.isOk()) throw new Error('expected generation to fail');
    expect(result.error).toContain('no longer exists');
    expect(b.rendered).toHaveLength(0);
    expect(b.pages.current()?.state).toBe('FAILED');
  });

  it('fails rather than dropping a book that is still generating', async () => {
    const b = buildTriple({ unfinishedIds: [SIBLING_A] });
    const result = await run(b);

    if (result.isOk()) throw new Error('expected generation to fail');
    expect(result.error).toContain('not finished');
    expect(b.rendered).toHaveLength(0);
  });

  // Sibling ids arrive from the client; without this check anyone could put
  // another account's book on their own sales page.
  it('refuses a book belonging to a different account', async () => {
    const b = buildTriple({ foreignIds: [SIBLING_B] });
    const result = await run(b);

    if (result.isOk()) throw new Error('expected generation to fail');
    expect(result.error).toContain('different account');
    expect(b.rendered).toHaveLength(0);
  });

  it('refuses to generate when the wrong number of books is selected', async () => {
    const b = buildTriple({ siblings: [{ projectId: SIBLING_A, checkoutUrl: 'https://payhip.com/b/TWO' }] });
    const result = await run(b);

    if (result.isOk()) throw new Error('expected generation to fail');
    expect(result.error).toContain('exactly 2');
  });
});

// ── generation ───────────────────────────────────────────────────────────────

describe('GenerateLandingPageUseCase', () => {
  it('writes a draft and stores the rendered page', async () => {
    const { useCase, pages, rendered } = buildGenerate({});

    const result = await useCase.execute({ projectId: 'p1' });

    expect(result.isOk()).toBe(true);
    const page = pages.current()!;
    expect(page.state).toBe('DRAFT');
    expect(page.html).toBe('<html>page</html>');
    expect(page.copy?.headline).toContain('Stop paying');
    // The palette comes from the cover, not from a default.
    expect(page.palette?.toJSON().seed).toBe('#1e3c78');
    expect(rendered[0]?.products[0]?.title).toBe('The Mechanic Bible');
  });

  // Without this the layout has no image but the cover, which is why generated
  // heroes showed the book where the reference shows a face.
  it('puts an uploaded author photo into the page model', async () => {
    const { useCase, rendered } = buildGenerate({
      project: makeProject({ landingAuthorPhotoPath: 'p1/landing/author.jpg' }),
    });
    await useCase.execute({ projectId: 'p1' });
    expect(rendered[0]?.authorPhotoDataUri).toBe('data:image/png;base64,AQID');
  });

  it('leaves the portrait absent when nothing was uploaded', async () => {
    const { useCase, rendered } = buildGenerate({});
    await useCase.execute({ projectId: 'p1' });
    expect(rendered[0]?.authorPhotoDataUri).toBeNull();
  });

  // A cut-off copy call surfaces as "Invalid JSON: Expected ',' or ']'", which
  // reads like a model defect and sends the job into a retry loop repeating it.
  it('reports a truncated copy response as truncation, not as bad JSON', async () => {
    const { useCase, pages } = buildGenerate({ truncated: true });

    const result = await useCase.execute({ projectId: 'p1' });

    if (result.isOk()) throw new Error('expected generation to fail');
    expect(result.error).toContain('cut off at the output limit');
    expect(result.error).not.toContain('Invalid JSON');
    expect(pages.current()?.state).toBe('FAILED');
  });

  it('never invents testimonials', async () => {
    const { useCase, rendered } = buildGenerate({});
    await useCase.execute({ projectId: 'p1' });
    expect(rendered[0]?.testimonials).toEqual([]);
  });

  it('passes the checkout URL through untouched', async () => {
    const url = 'https://payhip.com/b/AbC9?ref=x&y=1';
    const { useCase, rendered } = buildGenerate({ project: makeProject({ landingCheckoutUrl: url }) });

    await useCase.execute({ projectId: 'p1' });

    expect(rendered[0]?.products[0]?.checkoutUrl).toBe(url);
  });

  it('is idempotent — unchanged inputs do not re-run the model', async () => {
    const first = buildGenerate({});
    await first.useCase.execute({ projectId: 'p1' });
    expect(first.aiCalls()).toBe(1);

    // Same project, same book, carrying forward the page the first run stored.
    const second = buildGenerate({ existingPage: first.pages.current() });
    const result = await second.useCase.execute({ projectId: 'p1' });

    expect(result.isOk()).toBe(true);
    expect((result as { value: { regenerated: boolean } }).value.regenerated).toBe(false);
    expect(second.aiCalls()).toBe(0);
  });

  it('rebuilds when the price changes, so the buttons never advertise a stale one', async () => {
    const first = buildGenerate({ project: makeProject({ landingPriceCents: 4700 }) });
    await first.useCase.execute({ projectId: 'p1' });

    const second = buildGenerate({
      project: makeProject({ landingPriceCents: 2700 }),
      existingPage: first.pages.current(),
    });
    await second.useCase.execute({ projectId: 'p1' });

    expect(second.aiCalls()).toBe(1);
    expect(second.rendered[0]?.products[0]?.priceCents).toBe(2700);
  });

  it('force rebuilds even when nothing changed', async () => {
    const first = buildGenerate({});
    await first.useCase.execute({ projectId: 'p1' });

    const second = buildGenerate({ existingPage: first.pages.current() });
    await second.useCase.execute({ projectId: 'p1', force: true });

    expect(second.aiCalls()).toBe(1);
  });

  it('refuses when the landing page was never enabled', async () => {
    const { useCase } = buildGenerate({ project: makeProject({ landingPage: false }) });
    const result = await useCase.execute({ projectId: 'p1' });
    expect(result.isFail()).toBe(true);
  });

  it('records the failure on the page when the model returns unusable output', async () => {
    const { useCase, pages } = buildGenerate({ aiText: 'sorry, I cannot do that' });

    const result = await useCase.execute({ projectId: 'p1' });

    expect(result.isFail()).toBe(true);
    expect(pages.current()?.state).toBe('FAILED');
    expect(pages.current()?.error).toBeTruthy();
  });
});

// ── generated layouts from a reference page ──────────────────────────────────

const REFERENCE = {
  url: 'https://eliasyoder.com/',
  title: 'The Manual',
  headings: [{ level: 2, text: 'I. The Manual' }],
  text: 'A reference sales page.',
  markup: '<section class="hero"><h1>x</h1></section>',
  style: { serifHeadings: true, headingFont: 'Playfair Display', grounds: ['#faf7f0'], accent: '#b8860b', numberedSections: true, imageDensity: 0.3, measurePx: 720 },
};

/**
 * A reusable layout that satisfies the contract: no book's prose, only slots.
 * `extraSlots` lets a test add or omit slots to trip the manifest checks.
 */
function goodLayout(): string {
  const slots = [
    { key: 'hero.headline', purpose: 'Problem-led hero headline', maxChars: 120 },
    { key: 'hero.subheadline', purpose: 'What the book does about it', maxChars: 220 },
    { key: 'cta.label', purpose: 'Action-first button label', maxChars: 28 },
    { key: 'inside.heading', purpose: "What's inside heading", maxChars: 60 },
    { key: 'faq.q1', purpose: 'First question', maxChars: 80 },
    { key: 'faq.a1', purpose: 'Its answer', maxChars: 300 },
    { key: 'order.heading', purpose: 'Order section heading', maxChars: 60 },
    { key: 'closing.heading', purpose: 'Closing heading', maxChars: 70 },
  ];
  return JSON.stringify({
    css: 'body { background: var(--bg); color: var(--text); }',
    slots,
    bodyHtml:
      '<section data-section="hero"><h1>{{COPY:hero.headline}}</h1><p>{{COPY:hero.subheadline}}</p>' +
      '<p>{{COPY:cta.label}}</p>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>' +
      '<section data-section="inside"><h2>{{COPY:inside.heading}}</h2>{{CONTENTS}}</section>' +
      '<section data-section="order"><h2>{{COPY:order.heading}}</h2>{{PRICE}}{{CTA_BUTTON}}</section>' +
      '<section data-section="faq"><h3>{{COPY:faq.q1}}</h3><p>{{COPY:faq.a1}}</p>' +
      '<p>{{COPY:closing.heading}}</p></section>' +
      '<footer>{{FOOTER_LEGAL}}</footer>',
  });
}

/** What the slot-filling copy call returns for the layout above. */
const SLOT_COPY_JSON = JSON.stringify({
  'hero.headline': 'Stop paying for repairs you could do yourself',
  'hero.subheadline': 'The workshop manual for people who own a car.',
  'cta.label': 'Get the manual',
  'inside.heading': "What's inside",
  'faq.q1': 'What format?',
  'faq.a1': 'PDF and DOCX.',
  'order.heading': 'Order the book',
  'closing.heading': 'Fix it yourself',
});

/** Builds the use case with a reference URL set and a scripted AI. */
function buildWithReference(
  layoutResponses: string[],
  opts: {
    stored?: import('../ports/repositories/LandingLayoutRepository.js').StoredLandingLayout;
    /** What the copy call returns — slot map by default, fixed schema when the
     *  test expects the built-in fallback path. */
    copyText?: string;
  } = {},
) {
  const project = makeProject({ landingTemplateUrl: 'https://eliasyoder.com/' });
  const pages = new FakeLandingRepo(null);
  const calls: string[] = [];
  let assembled = 0;
  let builtin = 0;

  const useCase = new GenerateLandingPageUseCase(
    { findById: async () => project } as never,
    { findByProject: async () => makeBook() } as never,
    { getBookStrategy: async () => null } as never,
    { getChannel: async () => null } as never,
    { listByProject: async () => [] } as never,
    pages,
    { find: async () => opts.stored ?? null, save: async () => Result.ok() } as never,
    {
      generate: async (req: { metadata?: { stage: string } }) => {
        const stage = req.metadata?.stage ?? '';
        calls.push(stage);
        const text =
          stage === 'landing-page'
            ? (opts.copyText ?? SLOT_COPY_JSON)
            : (layoutResponses.shift() ?? '{"bad":true}');
        return Result.ok({ text, model: 'm', inputTokens: 1, outputTokens: 1, stopReason: 'end_turn' });
      },
    } as never,
    {
      render: () => {
        builtin++;
        return '<html>builtin</html>';
      },
    },
    {
      assemble: () => {
        assembled++;
        return '<html>generated</html>';
      },
    },
    { fetch: async () => Result.ok(REFERENCE) },
    { capture: async () => Result.fail('no screenshots in tests') } as never,
    { dominantColor: async () => Result.ok({ r: 30, g: 60, b: 120 }) },
    { fetchDataUri: async () => Result.fail("no logo in tests") } as never,
    {
      getBytes: async () => Result.fail('none'),
      getDataUri: async () => Result.fail('none'),
    } as never,
    { uuid: () => 'lp-1' },
    { now: () => now },
    { hash: (i: unknown) => JSON.stringify(i) },
  );

  return { useCase, pages, calls, counts: () => ({ assembled, builtin }) };
}

const HEADLINE = 'Stop paying for repairs you could do yourself';
const SUB = 'The workshop manual for people who own a car, not a garage.';

describe('GenerateLandingPageUseCase — reference-driven layout', () => {
  it('captures a reusable layout and pours the book copy into it', async () => {
    const h = buildWithReference([goodLayout()]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    expect(result.isOk()).toBe(true);
    if (result.isFail()) throw new Error(result.error);
    expect(result.value.layout).toBe('generated');
    expect(h.counts()).toEqual({ assembled: 1, builtin: 0 });
    expect(h.calls).toEqual(['landing-layout', 'landing-page']);
  });

  it('repairs a rejected layout and uses the corrected one', async () => {
    // Valid JSON, valid sections, but no slots — so it is not reusable.
    const noSlots = JSON.stringify({
      css: '',
      bodyHtml:
        '<section data-section="hero"><h1>A headline</h1>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>' +
        '<section data-section="inside">{{CONTENTS}}</section>' +
        '<section data-section="order"></section><section data-section="faq"></section>' +
        '<footer>{{FOOTER_LEGAL}}</footer>',
    });
    const h = buildWithReference([noSlots, goodLayout()]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    if (result.isFail()) throw new Error(result.error);
    expect(result.value.layout).toBe('generated');
    expect(h.counts().assembled).toBe(1);
  });

  it('falls back to the built-in template after repeated failures', async () => {
    const broken = JSON.stringify({ css: '', bodyHtml: '<div>nope</div>' });
    const h = buildWithReference([broken, broken, broken], { copyText: COPY_JSON });

    const result = await h.useCase.execute({ projectId: 'p1' });

    if (result.isFail()) throw new Error(result.error);
    expect(result.value.layout).toBe('builtin');
    expect(h.counts()).toEqual({ assembled: 0, builtin: 1 });
  });

  // A layout carrying one book's words would print them on every other book
  // that reuses the template — the failure the slot contract exists to catch.
  it('rejects a layout with a book prose written into it', async () => {
    const withProse = JSON.stringify({
      css: '',
      slots: [{ key: 'hero.headline', purpose: 'Headline', maxChars: 120 }],
      bodyHtml:
        '<section data-section="hero"><h1>{{COPY:hero.headline}}</h1>' +
        '<p>Adrian has spent nineteen years under other cars.</p>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>' +
        '<section data-section="inside">{{CONTENTS}}</section>' +
        '<section data-section="order"></section><section data-section="faq"></section>' +
        '<footer>{{FOOTER_LEGAL}}</footer>',
    });
    const h = buildWithReference([withProse, withProse, withProse], { copyText: COPY_JSON });

    const result = await h.useCase.execute({ projectId: 'p1' });

    if (result.isFail()) throw new Error(result.error);
    // Too few slots and the required ones missing — never stored, never used.
    expect(result.value.layout).toBe('builtin');
  });

  // The point of storing layouts: the second book pays no layout cost at all.
  it('reuses a stored layout instead of deriving it again', async () => {
    const h = buildWithReference([goodLayout()], {
      stored: {
        referenceUrl: 'https://eliasyoder.com/',
        mode: 'single',
        css: 'body{}',
        bodyHtml:
          '<section data-section="hero"><h1>{{COPY:hero.headline}}</h1>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>' +
          '<footer>{{FOOTER_LEGAL}}</footer>',
        slots: [{ key: 'hero.headline', purpose: 'Headline', maxChars: 120 }],
        inputHash: 'h',
      },
    });

    const result = await h.useCase.execute({ projectId: 'p1' });

    if (result.isFail()) throw new Error(result.error);
    expect(result.value.layout).toBe('generated');
    // Only the copy call ran — no landing-layout call at all.
    expect(h.calls).toEqual(['landing-page']);
  });

  it('uses the built-in template when the reference cannot be fetched', async () => {
    // The no-reference path: nothing to copy from, so no layout is stored.
    const plain = buildGenerate({});
    const result = await plain.useCase.execute({ projectId: 'p1' });
    expect(result.isOk()).toBe(true);
    expect((result as { value: { layout: string } }).value.layout).toBe('builtin');
  });
});

// ── publishing ───────────────────────────────────────────────────────────────

class FakePublisher implements SitePublisher {
  calls: PublishInput[] = [];
  constructor(
    private readonly configured = true,
    private readonly outcome: 'ok' | 'fail' = 'ok',
  ) {}
  isConfigured(): boolean {
    return this.configured;
  }
  async publish(input: PublishInput) {
    this.calls.push(input);
    if (this.outcome === 'fail') return Result.fail<PublishOutput>('netlify exploded');
    return Result.ok<PublishOutput>({ siteId: 'site-1', deployId: 'dep-1', url: 'https://x.netlify.app' });
  }
}

function draftPage(): LandingPage {
  const page = LandingPage.create({ id: { value: 'lp-1' } as never, projectId: 'p1', now });
  page.setDraft(
    { copy: {} as never, palette: {} as never, html: '<html>draft</html>', inputHash: 'h' },
    now,
  );
  return page;
}

function buildPublish(project: Project, page: LandingPage | null, publisher: SitePublisher) {
  const pages = new FakeLandingRepo(page);
  const useCase = new PublishLandingPageUseCase(
    { findById: async () => project } as never,
    { findByProject: async () => makeBook() } as never,
    pages,
    publisher,
    { now: () => now },
  );
  return { useCase, pages };
}

describe('PublishLandingPageUseCase', () => {
  const withCheckout = () => makeProject({ landingCheckoutUrl: 'https://payhip.com/b/AbC9' });

  it('publishes the stored draft verbatim', async () => {
    const publisher = new FakePublisher();
    const { useCase, pages } = buildPublish(withCheckout(), draftPage(), publisher);

    const result = await useCase.execute({ projectId: 'p1' });

    expect(result.isOk()).toBe(true);
    expect(pages.current()?.state).toBe('PUBLISHED');
    expect(pages.current()?.url).toBe('https://x.netlify.app');
    // Exactly the bytes that were reviewed, as a single self-contained file.
    expect(publisher.calls[0]?.files).toHaveLength(1);
    expect(new TextDecoder().decode(publisher.calls[0]!.files[0]!.bytes)).toBe('<html>draft</html>');
  });

  it('refuses to publish a page whose buy buttons go nowhere', async () => {
    const publisher = new FakePublisher();
    const { useCase } = buildPublish(makeProject(), draftPage(), publisher);

    const result = await useCase.execute({ projectId: 'p1' });

    expect(result.isFail()).toBe(true);
    expect(publisher.calls).toHaveLength(0);
  });

  it('refuses when there is no draft to publish', async () => {
    const { useCase } = buildPublish(withCheckout(), null, new FakePublisher());
    expect((await useCase.execute({ projectId: 'p1' })).isFail()).toBe(true);
  });

  it('refuses when Netlify is not configured', async () => {
    const publisher = new FakePublisher(false);
    const { useCase } = buildPublish(withCheckout(), draftPage(), publisher);

    expect((await useCase.execute({ projectId: 'p1' })).isFail()).toBe(true);
    expect(publisher.calls).toHaveLength(0);
  });

  it('records a deploy failure instead of leaving the page stuck publishing', async () => {
    const { useCase, pages } = buildPublish(withCheckout(), draftPage(), new FakePublisher(true, 'fail'));

    const result = await useCase.execute({ projectId: 'p1' });

    expect(result.isFail()).toBe(true);
    expect(pages.current()?.state).toBe('FAILED');
    expect(pages.current()?.error).toContain('netlify exploded');
  });

  it('redeploys to the same site once one exists, keeping the URL stable', async () => {
    const publisher = new FakePublisher();
    const { useCase, pages } = buildPublish(withCheckout(), draftPage(), publisher);
    await useCase.execute({ projectId: 'p1' });

    const second = buildPublish(withCheckout(), pages.current(), publisher);
    await second.useCase.execute({ projectId: 'p1' });

    expect(publisher.calls[1]?.siteId).toBe('site-1');
  });
});
