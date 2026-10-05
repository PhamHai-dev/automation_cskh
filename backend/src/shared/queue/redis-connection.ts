import Redis from 'ioredis';
import { env } from '../../config/env';
import { createLogger } from '../logger/logger';

const log = createLogger('Redis');

let _client: Redis | null = null;

/**
 * Get or create a Redis client singleton.
 * Uses lazy initialization — returns null when REDIS_ENABLED is false.
 */
export function getRedisClient(): Redis | null {
  if (env.REDIS_ENABLED === 'false') {
    return null;
  }
  if (_client) return _client;

  const host = env.REDIS_HOST === 'localhost' ? '127.0.0.1' : env.REDIS_HOST;
  const port = parseInt(env.REDIS_PORT, 10);

  const useTls = host.endsWith('.upstash.io');

  _client = new Redis({
    host,
    port,
    username: env.REDIS_USERNAME,
    password: env.REDIS_PASSWORD,
    tls: useTls ? { servername: host } : undefined,
    family: 4,
    maxRetriesPerRequest: null,
    retryStrategy(times: number): number | null {
      if (times > 5) {
        log.warn('Redis: too many retries, giving up', { retries: times });
        return null;
      }
      const delay = Math.min(times * 300, 3000);
      log.warn('Redis: retrying connection', { attempt: times, delayMs: delay });
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: true,
  });

  _client.on('connect', () => log.info('Redis: connected'));
  _client.on('ready', () => log.info('Redis: ready'));
  _client.on('error', (err: Error) => log.warn('Redis: error', { message: err.message }));
  _client.on('close', () => log.warn('Redis: connection closed'));

  // Connect eagerly on first call
  _client.connect().catch((err: Error) => {
    log.warn('Redis: initial connection failed', { message: err.message });
  });

  return _client;
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (_client) {
    try {
      await _client.quit();
    } catch {
      _client.disconnect();
    }
    _client = null;
    log.info('Redis: disconnected');
  }
}
