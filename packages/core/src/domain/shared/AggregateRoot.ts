import { Entity } from './Entity.js';
import type { Identifier } from './Identifier.js';
import type { DomainEvent } from './DomainEvent.js';

/** Aggregate root: the only entry point for mutating an aggregate; records domain events. */
export abstract class AggregateRoot<TProps, TId extends Identifier> extends Entity<TProps, TId> {
  private _domainEvents: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  /** Drain events after the aggregate is persisted, then dispatch them. */
  pullEvents(): DomainEvent[] {
    const events = this._domainEvents;
    this._domainEvents = [];
    return events;
  }
}
