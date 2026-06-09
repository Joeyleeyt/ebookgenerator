import { Identifier } from '../shared/Identifier.js';

export class ProjectId extends Identifier {
  static from(value: string): ProjectId {
    return new ProjectId(value);
  }
}
