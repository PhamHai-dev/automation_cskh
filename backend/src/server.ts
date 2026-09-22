import { app } from './app';
import { env } from './config/env';
import { createLogger } from './shared/logger/logger';
import { zaloPool } from './modules/zalo/zalo-pool';
import { wirePoolEvents } from './modules/zalo/zalo-listener-factory';
import { closeRedis } from './shared/queue/redis-connection';

const log = createLogger('Server');

const PORT = parseInt(env.PORT, 10);

const server = app.listen(PORT, async () => {
  // Wire listener-factory to pool events FIRST (message/friend/group routing).
  // Must run before init(): reconnectAll() emits session:connected synchronously
  // during boot, and a late subscription would miss those events.
  wirePoolEvents();

  // Initialize Zalo pool — restore active sessions from DB
  try {
    await zaloPool.init();
  } catch (err) {
    log.warn('Zalo pool init failed (continuing without Zalo)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  log.info('Server started', {
    port: PORT,
    nodeEnv: env.NODE_ENV,
    zaloEnabled: zaloPool.getActiveAccountIds().length > 0,
  });
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  log.info('Shutting down', { signal });

  // Stop accepting new connections
  if (server.listening) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    log.info('HTTP server closed');
  }

  // Disconnect Zalo accounts (stop timers, clear pool)
  try {
    await zaloPool.shutdown();
    log.info('Zalo pool shut down');
  } catch (err) {
    log.error('Zalo pool shutdown error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Close Redis connection
  try {
    await closeRedis();
    log.info('Redis closed');
  } catch (err) {
    log.error('Redis close error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
