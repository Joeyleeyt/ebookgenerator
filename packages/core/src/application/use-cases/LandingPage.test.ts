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
    {
      generate: async () => {
        aiCalls++;
        return Result.ok({
          text: options.aiText ?? COPY_JSON,
          model: 'claude-opus-4-8',
          inputTokens: 1,
          outputTokens: 1,
          stopReason: 'end_turn',
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
    { dominantColor: async () => Result.ok({ r: 30, g: 60, b: 120 }) },
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
  style: { serifHeadings: true, grounds: ['#faf7f0'], accent: '#b8860b', numberedSections: true, imageDensity: 0.3, measurePx: 720 },
};

/** A layout that satisfies the contract, echoing the approved copy verbatim. */
function goodLayout(copyHeadline: string, copySub: string): string {
  return JSON.stringify({
    css: 'body { background: var(--bg); color: var(--text); }',
    bodyHtml:
      `<section data-section="hero"><h1>${copyHeadline}</h1><p>${copySub}</p>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>` +
      `<section data-section="inside">{{CONTENTS}}</section>` +
      `<section data-section="order">{{PRICE}}{{CTA_BUTTON}}</section>` +
      `<section data-section="faq"><p>What format?</p></section>` +
      `<footer>{{FOOTER_LEGAL}}</footer>`,
  });
}

/** Builds the use case with a reference URL set and a scripted AI. */
function buildWithReference(layoutResponses: string[]) {
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
    {
      generate: async (req: { metadata?: { stage: string } }) => {
        const stage = req.metadata?.stage ?? '';
        calls.push(stage);
        const text = stage === 'landing-page' ? COPY_JSON : (layoutResponses.shift() ?? '{"bad":true}');
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
    { dominantColor: async () => Result.ok({ r: 30, g: 60, b: 120 }) },
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
  it('generates a layout when a valid one comes back first time', async () => {
    const h = buildWithReference([goodLayout(HEADLINE, SUB)]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    expect(result.isOk()).toBe(true);
    expect((result as { value: { layout: string } }).value.layout).toBe('generated');
    expect(h.counts()).toEqual({ assembled: 1, builtin: 0 });
    expect(h.pages.current()?.html).toBe('<html>generated</html>');
    // Copy first, then layout — two distinct calls.
    expect(h.calls).toEqual(['landing-page', 'landing-layout']);
  });

  it('repairs a rejected layout and uses the corrected one', async () => {
    // First attempt omits the CTA placeholder and uses a raw colour.
    const broken = JSON.stringify({
      css: 'body { color: #ff0000; }',
      bodyHtml: '<section data-section="hero"></section>',
    });
    const h = buildWithReference([broken, goodLayout(HEADLINE, SUB)]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    expect((result as { value: { layout: string } }).value.layout).toBe('generated');
    expect(h.calls).toEqual(['landing-page', 'landing-layout', 'landing-layout']);
    expect(h.counts()).toEqual({ assembled: 1, builtin: 0 });
  });

  it('falls back to the built-in template after a second failure', async () => {
    const broken = JSON.stringify({ css: '', bodyHtml: '<div>nope</div>' });
    const h = buildWithReference([broken, broken]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    // A page that fails to build is worse than one that looks generic.
    expect(result.isOk()).toBe(true);
    expect((result as { value: { layout: string } }).value.layout).toBe('builtin');
    expect(h.counts()).toEqual({ assembled: 0, builtin: 1 });
    expect(h.pages.current()?.state).toBe('DRAFT');
  });

  // The copy was already written and validated; the layout call places it.
  it('rejects a layout that rewrote the approved copy', async () => {
    const rewritten = goodLayout('A snappier headline I invented', SUB);
    const h = buildWithReference([rewritten, goodLayout(HEADLINE, SUB)]);

    const result = await h.useCase.execute({ projectId: 'p1' });

    expect((result as { value: { layout: string } }).value.layout).toBe('generated');
    expect(h.calls.filter((c) => c === 'landing-layout')).toHaveLength(2); // it was made to redo it
  });

  it('uses the built-in template when the reference cannot be fetched', async () => {
    const h = buildWithReference([goodLayout(HEADLINE, SUB)]);
    // Re-build with a failing fetcher by exercising the no-reference path.
    const plain = buildGenerate({});
    const result = await plain.useCase.execute({ projectId: 'p1' });
    expect(result.isOk()).toBe(true);
    expect((result as { value: { layout: string } }).value.layout).toBe('builtin');
    expect(h.calls).toEqual([]); // the reference handle was never executed
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
