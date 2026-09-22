import Redis from 'ioredis';
import { env } from '../../config/env';
import { createLogger } from '../logger/logger';

const log = createLogger('Redis');

let _client: Redis | null = null;

/**
 * Get or create a Redis client singleton.
 * Uses lazy initialization — the connection is only opened on first use.
 */
export function getRedisClient(): Redis {
  if (_client) return _client;

  _client = new Redis({
    host: env.REDIS_HOST,
    port: parseInt(env.REDIS_PORT, 10),
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        log.error('Redis: too many retries, giving up', { retries: times });
        return null;
      }
      const delay = Math.min(times * 200, 5000);
      log.warn('Redis: retrying connection', { attempt: times, delayMs: delay });
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
  });

  _client.on('connect', () => log.info('Redis: connected'));
  _client.on('ready', () => log.info('Redis: ready'));
  _client.on('error', (err: Error) => log.error('Redis: error', { message: err.message }));
  _client.on('close', () => log.warn('Redis: connection closed'));

  // Connect eagerly on first call
  _client.connect().catch((err: Error) => {
    log.error('Redis: initial connection failed', { message: err.message });
  });

  return _client;
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
    log.info('Redis: disconnected');
  }
}
