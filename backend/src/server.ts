import { app } from './app';
import { env } from './config/env';
import { createLogger } from './shared/logger/logger';
import { zaloPool } from './modules/zalo/zalo-pool';
import { linePool } from './modules/line/line-pool';
import { wirePoolEvents } from './modules/zalo/zalo-listener-factory';
import { closeRedis } from './shared/queue/redis-connection';
import { setupIo, closeIo } from './shared/realtime/socket-singleton';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket';
import { registerLineSocketHandlers } from './modules/line/line-socket';
import { startAutomationWorker, stopAutomationWorker } from './modules/automation/automation-worker';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check';
import { startLineHealthCheck } from './modules/line/line-health-check';
import { startAutoAttendanceScheduler, stopAutoAttendanceScheduler } from './modules/auto-attendance/auto-attendance-scheduler';
import { startGoogleSheetSyncScheduler, stopGoogleSheetSyncScheduler } from './modules/imports/sheet-sync.service';
import { startCsSheetBackupScheduler, stopCsSheetBackupScheduler } from './modules/imports/sheet-backup.service';

const log = createLogger('Server');

const PORT = parseInt(env.PORT, 10);

const server = app.listen(PORT, async () => {
  // Setup Socket.IO server + register Zalo & LINE real-time handlers
  const io = setupIo(server);
  registerZaloSocketHandlers(io);
  registerLineSocketHandlers(io);

  const isTestOrIsolated =
    env.NODE_ENV === 'test' || process.env.DISABLE_EXTERNAL_WORKERS === 'true';

  if (isTestOrIsolated) {
    log.info('External channels & background schedulers skipped in test/isolated mode', {
      nodeEnv: env.NODE_ENV,
    });
  } else {
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

    // Initialize LINE Hybrid pool (OA + Personal) — restore active sessions from DB
    try {
      await linePool.init();
    } catch (err) {
      log.warn('LINE pool init failed (continuing without LINE)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Start Zalo & LINE health check crons (every 5 min reconnect + quota refresh + hourly ghost cleanup)
    try {
      startZaloHealthCheck();
      startLineHealthCheck();
      log.info('Zalo & LINE health checks started');
    } catch (err) {
      log.warn('Health check start failed (continuing)', {
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

    // Start auto attendance background scheduler
    try {
      startAutoAttendanceScheduler();
      log.info('Auto attendance scheduler started');
    } catch (err) {
      log.warn('Auto attendance scheduler start failed (continuing)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Start Google Sheet sync background scheduler
    try {
      startGoogleSheetSyncScheduler();
      log.info('Google Sheet sync scheduler started');
    } catch (err) {
      log.warn('Google Sheet sync scheduler start failed (continuing)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Start CS Sheet backup background scheduler
    try {
      startCsSheetBackupScheduler();
      log.info('CS Sheet backup scheduler started');
    } catch (err) {
      log.warn('CS Sheet backup scheduler start failed (continuing)', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
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

  // Disconnect Zalo & LINE accounts (stop timers, clear pool)
  try {
    await zaloPool.shutdown();
    await linePool.shutdown();
    log.info('Zalo & LINE pools shut down');
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

  // Stop auto attendance scheduler
  try {
    stopAutoAttendanceScheduler();
    log.info('Auto attendance scheduler stopped');
  } catch (err) {
    log.error('Auto attendance scheduler shutdown error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stop Google Sheet sync scheduler
  try {
    stopGoogleSheetSyncScheduler();
    log.info('Google Sheet sync scheduler stopped');
  } catch (err) {
    log.error('Google Sheet sync scheduler shutdown error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Stop CS Sheet backup scheduler
  try {
    stopCsSheetBackupScheduler();
    log.info('CS Sheet backup scheduler stopped');
  } catch (err) {
    log.error('CS Sheet backup scheduler shutdown error', {
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
