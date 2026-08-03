import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { LandingPageRepository } from '../ports/repositories/LandingPageRepository.js';
import type { SitePublisher } from '../ports/services/SitePublisher.js';
import type { Clock } from '../ports/Clock.js';

/**
 * Deploys the current draft to Netlify.
 *
 * Kept separate from generation on purpose: AI-written marketing copy should be
 * read by a human before it reaches a public URL, and — more concretely — a page
 * with no checkout link would be a live sales page nobody can buy from. Both are
 * enforced here rather than left to the caller.
 */
export class PublishLandingPageUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly books: BookRepository,
    private readonly pages: LandingPageRepository,
    private readonly publisher: SitePublisher,
    private readonly clock: Clock,
  ) {}

  async execute(input: { projectId: string }): Promise<Result<{ url: string }>> {
    const projectId = ProjectId.from(input.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    if (!this.publisher.isConfigured()) {
      return Result.fail('Publishing is not configured — set NETLIFY_AUTH_TOKEN');
    }
    // The one hard gate: a live page whose buttons go nowhere is worse than no
    // page at all.
    if (!project.options.hasCheckoutUrl) {
      return Result.fail('Add your checkout link before publishing — the buy buttons have nowhere to go');
    }

    const page = await this.pages.findByProject(projectId);
    if (!page) return Result.fail('No landing page has been generated yet');
    const html = page.html;
    if (!html) return Result.fail('Nothing to publish — generate the page first');

    const marked = page.markPublishing(this.clock.now());
    if (marked.isFail()) return Result.fail(marked.error);
    await this.pages.save(page);

    const book = await this.books.findByProject(projectId);
    const title = book?.title ?? project.options.bookTitle ?? 'book';

    const published = await this.publisher.publish({
      ...(page.siteId ? { siteId: page.siteId } : {}),
      preferredName: title,
      // The cover is inlined as a data: URI in the HTML, so the deploy is a
      // single file and the page has no external requests at all.
      files: [{ path: 'index.html', bytes: new TextEncoder().encode(html) }],
    });

    if (published.isFail()) {
      page.markFailed(published.error, this.clock.now());
      await this.pages.save(page);
      return Result.fail(published.error);
    }

    page.markPublished(published.value, this.clock.now());
    await this.pages.save(page);
    return Result.ok({ url: published.value.url });
  }
}
