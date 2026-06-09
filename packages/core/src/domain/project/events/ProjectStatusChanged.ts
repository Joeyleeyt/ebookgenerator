import { BaseDomainEvent } from '../../shared/DomainEvent.js';
import type { ProjectState } from '../ProjectStatus.js';

export class ProjectStatusChanged extends BaseDomainEvent {
  readonly name = 'project.status.changed';
  constructor(
    aggregateId: string,
    public readonly from: ProjectState,
    public readonly to: ProjectState,
    occurredAt: Date,
  ) {
    super(aggregateId, occurredAt);
  }
}
