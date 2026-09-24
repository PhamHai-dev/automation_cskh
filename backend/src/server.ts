import { app } from './app';
import { env } from './config/env';
import { createLogger } from './shared/logger/logger';
import { zaloPool } from './modules/zalo/zalo-pool';
import { wirePoolEvents } from './modules/zalo/zalo-listener-factory';
import { closeRedis } from './shared/queue/redis-connection';
import { setupIo, closeIo } from './shared/realtime/socket-singleton';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket';
import { startAutomationWorker, stopAutomationWorker } from './modules/automation/automation-worker';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check';

const log = createLogger('Server');

const PORT = parseInt(env.PORT, 10);

const server = app.listen(PORT, async () => {
  // Setup Socket.IO server + register Zalo real-time handlers
  const io = setupIo(server);
  registerZaloSocketHandlers(io);

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

  // Start Zalo health check cron (every 5 min reconnect + daily refresh + hourly ghost cleanup)
  try {
    startZaloHealthCheck();
    log.info('Zalo health check started');
  } catch (err) {
    log.warn('Zalo health check start failed (continuing)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start friend sync cron (every 15 min for all connected accounts)
  try {
    const { startFriendSyncCron } = await import('./modules/zalo/friend-sync-cron');
    startFriendSyncCron(io);
    log.info('Friend sync cron started');
  } catch (err) {
    log.warn('Friend sync cron start failed (continuing)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Start automation delivery worker
  try {
    const worker = startAutomationWorker();
    if (worker) {
      log.info('Automation worker started');
    }
  } catch (err) {
    log.warn('Automation worker start failed (continuing without automation)', {
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

  // Stop automation worker
  try {
    await stopAutomationWorker();
    log.info('Automation worker stopped');
  } catch (err) {
    log.error('Automation worker shutdown error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Close Socket.IO
  try {
    await closeIo();
    log.info('Socket.IO closed');
  } catch (err) {
    log.error('Socket.IO close error', {
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
