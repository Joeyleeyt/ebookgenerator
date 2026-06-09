import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { BookRepository } from '../ports/repositories/BookRepository.js';
import type { JobQueue } from '../ports/services/JobQueue.js';
import type { Clock } from '../ports/Clock.js';
import type { Hasher } from '../ports/Hasher.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

/**
 * Bridges GENERATING_CHAPTER_RESEARCH → GENERATING_CHAPTERS: advances the status,
 * sets the chapter fan-in barrier, and enqueues one chapter-generate job per chapter.
 */
export class StartChapterGenerationUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly books: BookRepository,
    private readonly queue: JobQueue,
    private readonly clock: Clock,
    private readonly hasher: Hasher,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<void>> {
    const projectId = ProjectId.from(cmd.projectId);
    const book = await this.books.findByProject(projectId);
    if (!book || !book.outline) return Result.fail('Book/outline missing');
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');

    project.setPending('GENERATING_CHAPTERS', book.chapters.length);
    project.advanceTo('GENERATING_CHAPTERS', this.clock.now());
    await this.projects.save(project);

    for (const chapter of book.chapters) {
      const inputHash = this.hasher.hash({
        title: chapter.title,
        promise: chapter.promise,
        wordTarget: chapter.wordTarget,
        outline: book.outline.inputHash,
      });
      await this.queue.enqueue(
        'chapter-generate',
        { projectId: projectId.value, chapterId: chapter.id.value, inputHash, mode: 'generate' },
        { jobId: `chapter:${projectId.value}:${chapter.id.value}:${inputHash}` },
      );
    }
    return Result.ok();
  }
}
