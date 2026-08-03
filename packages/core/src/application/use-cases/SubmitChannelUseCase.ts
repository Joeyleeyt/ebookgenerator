import { Result } from '../../domain/shared/Result.js';
import { Project } from '../../domain/project/Project.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { GenerationOptions } from '../../domain/project/GenerationOptions.js';
import { ChannelUrl } from '../../domain/channel/ChannelUrl.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { JobQueue } from '../ports/services/JobQueue.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { SubmitChannelDto } from '../dto/SubmitChannel.dto.js';

export interface SubmitChannelResult {
  projectId: string;
  status: string;
}

/**
 * Entry point: validates the channel URL, creates the project, kicks off ingestion.
 *
 * Users may run several books at once — the pipeline is project-scoped end to
 * end and the queue adapter schedules fairly across projects — but not an
 * unbounded number: `maxActiveProjects` caps how many can be in flight so one
 * account can't monopolise the workers or the AI rate limits.
 */
export class SubmitChannelUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly maxActiveProjects: number = 3,
  ) {}

  async execute(ownerId: string, dto: SubmitChannelDto): Promise<Result<SubmitChannelResult>> {
    const url = ChannelUrl.create(dto.channelUrl);
    if (url.isFail()) return Result.fail(url.error);

    // Soft cap: two simultaneous submits can both pass this check, which at worst
    // lets a user exceed the limit by one. Worth avoiding a lock for.
    const active = await this.projects.countActiveByOwner(ownerId);
    if (active >= this.maxActiveProjects) {
      return Result.fail(
        `You already have ${active} book${active === 1 ? '' : 's'} in progress (limit ${this.maxActiveProjects}). ` +
          'Wait for one to finish, or delete it, before starting another.',
      );
    }

    const options = GenerationOptions.create(dto.options);
    const id = ProjectId.from(this.ids.uuid());
    const project = Project.create({
      id,
      ownerId,
      channelUrl: url.value,
      options,
      now: this.clock.now(),
    });
    if (project.isFail()) return Result.fail(project.error);

    const advance = project.value.advanceTo('INGESTING_CHANNEL', this.clock.now());
    if (advance.isFail()) return Result.fail(advance.error);

    await this.projects.save(project.value);
    await this.queue.enqueue(
      'channel-ingest',
      { projectId: id.value },
      { jobId: `channel-ingest:${id.value}` },
    );

    return Result.ok({ projectId: id.value, status: project.value.status.value });
  }
}
