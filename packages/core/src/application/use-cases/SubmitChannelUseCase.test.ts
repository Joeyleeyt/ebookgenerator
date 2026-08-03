import { describe, it, expect } from 'vitest';
import { SubmitChannelUseCase } from './SubmitChannelUseCase.js';
import type { ProjectRepository, ProjectListItem } from '../ports/repositories/ProjectRepository.js';
import type { JobQueue, QueueName } from '../ports/services/JobQueue.js';
import type { Project } from '../../domain/project/Project.js';
import type { SubmitChannelDto } from '../dto/SubmitChannel.dto.js';

const now = new Date('2026-01-01T00:00:00Z');

const dto: SubmitChannelDto = {
  channelUrl: 'https://www.youtube.com/@example',
  options: {
    bookTitle: 'A Book',
    bookType: 'normal',
    targetPages: 100,
    maxVideos: 30,
    recipeCount: 60,
    tone: 'professional',
    includeComments: true,
    includeIllustrations: true,
    illustrationEveryPages: 5,
  },
};

class FakeProjectRepo implements ProjectRepository {
  saved: Project[] = [];
  constructor(private readonly active: number) {}
  async findById(): Promise<Project | null> {
    return null;
  }
  async save(project: Project): Promise<void> {
    this.saved.push(project);
  }
  async decrementPending(): Promise<number> {
    return 0;
  }
  async advanceStatusAtomic(): Promise<boolean> {
    return true;
  }
  async listByOwner(): Promise<ProjectListItem[]> {
    return [];
  }
  async countActiveByOwner(): Promise<number> {
    return this.active;
  }
}

class FakeQueue implements JobQueue {
  enqueued: QueueName[] = [];
  async enqueue(queue: QueueName): Promise<void> {
    this.enqueued.push(queue);
  }
  async failedStages(): Promise<QueueName[]> {
    return [];
  }
  async retryFailed(): Promise<number> {
    return 0;
  }
  async drain(): Promise<number> {
    return 0;
  }
}

function build(activeProjects: number, max: number) {
  const projects = new FakeProjectRepo(activeProjects);
  const queue = new FakeQueue();
  let n = 0;
  const useCase = new SubmitChannelUseCase(
    projects,
    queue,
    { uuid: () => `p${++n}` },
    { now: () => now },
    max,
  );
  return { useCase, projects, queue };
}

describe('SubmitChannelUseCase concurrency cap', () => {
  it('starts a project while the user is below the cap', async () => {
    const { useCase, projects, queue } = build(2, 3);

    const result = await useCase.execute('u1', dto);

    expect(result.isOk()).toBe(true);
    expect(projects.saved).toHaveLength(1);
    expect(queue.enqueued).toEqual(['channel-ingest']);
  });

  it('rejects a submission once the cap is reached, without touching the queue', async () => {
    const { useCase, projects, queue } = build(3, 3);

    const result = await useCase.execute('u1', dto);

    expect(result.isFail()).toBe(true);
    expect(projects.saved).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });

  it('validates the channel URL before spending a repository read', async () => {
    const { useCase, queue } = build(0, 3);

    const result = await useCase.execute('u1', { ...dto, channelUrl: 'not-a-channel' });

    expect(result.isFail()).toBe(true);
    expect(queue.enqueued).toHaveLength(0);
  });
});
