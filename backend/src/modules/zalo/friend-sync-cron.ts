/**
 * friend-sync-cron.ts — Periodic Friend full-sync cho moi connected nick.
 * Ported from ZaloCRM friend-sync-cron.ts (128 lines) -> single-org, Int IDs.
 *
 * Moi 15 phut: query connected ZaloAccount -> iterate sequential, moi account
 * ~5s + 200ms stagger -> goi syncFriendsForAccount (diff-then-emit).
 * Mutex chong overlap: neu chu ky truoc chua xong khi tick moi -> skip tick.
 * Sequential thay vi parallel de tranh burst Zalo rate-limit.
 *
 * Adaptations from ZaloCRM:
 *   - No runSystemQuery/withTenant/orgId -> single-org direct prisma
 *   - syncAccountFully (friends+aliases+labels) -> syncFriendsForAccount (friends only; aliases/labels in Phase B)
 *   - Server (socket.io) -> SyncIo
 *   - prisma from '../../prisma/client', createLogger
 */
import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { syncFriendsForAccount } from './friend-sync-service';
import type { SyncIo } from './friend-sync-service';

const log = createLogger('FriendSyncCron');

const CRON_SCHEDULE = '*/15 * * * *';
const STAGGER_MS = 200;

let cronRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start periodic Friend sync cron. Idempotent — neu da start thi no-op.
 * Caller pass SyncIo de syncFriendsForAccount emit 'friend:updated' patches.
 */
export function startFriendSyncCron(io: SyncIo | null): void {
  if (cronTask) {
    log.info('[friend-sync-cron] Already started, skipping');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      log.warn('[friend-sync-cron] Previous cycle still running, skipping this tick');
      return;
    }
    cronRunning = true;
    const startedAt = Date.now();
    try {
      await runCronCycle(io);
    } catch (err) {
      log.error('[friend-sync-cron] Unexpected cycle error', { error: String(err) });
    } finally {
      cronRunning = false;
      log.info(`[friend-sync-cron] Cycle completed in ${Date.now() - startedAt}ms`);
    }
  });
  log.info(`[friend-sync-cron] Started, schedule="${CRON_SCHEDULE}"`);
}

/** Stop cron task (dung cho test cleanup / graceful shutdown). */
export function stopFriendSyncCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    log.info('[friend-sync-cron] Stopped');
  }
}

/** Single cycle: iterate connected accounts sequential with stagger. */
async function runCronCycle(io: SyncIo | null): Promise<void> {
  const accounts = await prisma.zaloAccount.findMany({
    where: { status: 'ACTIVE' as any },
    select: { id: true, display_name: true },
  });

  if (accounts.length === 0) {
    log.info('[friend-sync-cron] No connected accounts, nothing to sync');
    return;
  }

  log.info(`[friend-sync-cron] Starting cycle: ${accounts.length} connected account(s)`);

  let totalEmitted = 0;
  let totalErrors = 0;
  for (const acc of accounts) {
    try {
      const res = await syncFriendsForAccount(acc.id, { trigger: 'cron', io });
      totalEmitted += res.emittedCount;
      totalErrors += res.errors;
    } catch (err) {
      totalErrors++;
      log.error(`[friend-sync-cron] Account ${acc.id} (${acc.display_name}) failed`, { error: String(err) });
    }
    if (STAGGER_MS > 0) {
      await new Promise((r) => setTimeout(r, STAGGER_MS));
    }
  }

  log.info(
    `[friend-sync-cron] Cycle stats: accounts=${accounts.length} friends_emitted=${totalEmitted} errors=${totalErrors}`,
  );
}

/** Export for test injection — run 1 cycle directly without scheduling. */
export async function runFriendSyncCycleNow(io: SyncIo | null): Promise<void> {
  return runCronCycle(io);
}
