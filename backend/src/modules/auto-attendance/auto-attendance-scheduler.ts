import cron from 'node-cron';
import { AutoAttendanceService } from './auto-attendance.service';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AutoAttendanceScheduler');

const CRON_SCHEDULE = '* * * * *'; // Run every minute

let cronTask: ReturnType<typeof cron.schedule> | null = null;
let isCycleRunning = false;
const service = new AutoAttendanceService();

/**
 * Start the auto attendance background scheduler.
 * Runs once every minute to check if any class schedules have reached start_time + delay_minutes.
 */
export function startAutoAttendanceScheduler(): void {
  if (cronTask) {
    log.info('Auto attendance scheduler already running');
    return;
  }

  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (isCycleRunning) {
      log.warn('Previous auto attendance cycle still running, skipping tick');
      return;
    }

    isCycleRunning = true;
    const startedAt = Date.now();

    try {
      const result = await service.processAutoAttendance();
      if (result.processed_schedules > 0 || result.issues_created > 0) {
        log.info('Auto attendance cycle finished with activity', {
          ...result,
          elapsedMs: Date.now() - startedAt,
        });
      }
    } catch (err: any) {
      log.error('Unexpected error during auto attendance cycle', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      isCycleRunning = false;
    }
  });

  log.info(`Auto attendance scheduler started, schedule="${CRON_SCHEDULE}"`);
}

/**
 * Stop the scheduler (for graceful shutdown / tests).
 */
export function stopAutoAttendanceScheduler(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    log.info('Auto attendance scheduler stopped');
  }
}
