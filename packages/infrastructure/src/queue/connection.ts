import { Redis } from 'ioredis';

let connection: Redis | null = null;

/** Shared ioredis connection for BullMQ (maxRetriesPerRequest must be null). */
export function getRedisConnection(url: string): Redis {
  if (!connection) {
    connection = new Redis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}
