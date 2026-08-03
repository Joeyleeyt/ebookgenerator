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
