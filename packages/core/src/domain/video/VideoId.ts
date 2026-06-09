import { Identifier } from '../shared/Identifier.js';

export class VideoId extends Identifier {
  static from(value: string): VideoId {
    return new VideoId(value);
  }
}
