/**
 * status-log-checkpoint-cron.ts — Phase ZaloAccounts 2026-05-22
 * Ported from ZaloCRM status-log-checkpoint-cron.ts (147 lines) → single-org, Int IDs.
 * Cron 5p reconcile orphan open records after crash/network glitch.
 * Algorithm: snapshot pool statuses → compare vs DB open records → writeTransition if drift.
 * Adaptations: no orgId/withTenant/runSystemQuery, Int IDs, snake_case, createLogger.
 */
import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { writeTransition, type ZaloStatus } from './status-log-service';
import { zaloPool } from './zalo-pool';

const log = createLogger('StatusLogCheckpoint');
const CRON_SCHEDULE = '*/5 * * * *';
let cronTask: ReturnType<typeof cron.schedule> | null = null;
let cronRunning = false;

export function startStatusLogCheckpointCron(): void {
  if (cronTask) { log.info('[status-log-checkpoint] Already started, skipping'); return; }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) { log.warn('[status-log-checkpoint] Previous cycle still running, skipping this tick'); return; }
    cronRunning = true;
    const startedAt = Date.now();
    try { await runCheckpoint(); } catch (err) { log.error('[status-log-checkpoint] Unexpected cycle error', { error: String(err) }); }
    finally { cronRunning = false; log.info(`[status-log-checkpoint] Cycle completed in ${Date.now() - startedAt}ms`); }
  });
  log.info(`[status-log-checkpoint] Started, schedule="${CRON_SCHEDULE}"`);
}

export function stopStatusLogCheckpointCron(): void {
  if (cronTask) { cronTask.stop(); cronTask = null; log.info('[status-log-checkpoint] Stopped'); }
}

export async function runCheckpoint(): Promise<{ scanned: number; reconciled: number; created: number }> {
  const poolStatuses = zaloPool.getAllStatuses() as Record<number, string>;
  const poolIds = new Set(Object.keys(poolStatuses).map(Number));
  const dbAccounts = await prisma.zaloAccount.findMany({ select: { id: true, status: true } });
  let reconciled = 0; let created = 0; let scanned = 0;
  for (const acct of dbAccounts) {
    scanned++;
    const liveStatusRaw = (poolStatuses as any)[acct.id] ?? acct.status;
    const liveStatus = mapToLogStatus(String(liveStatusRaw));
    if (!liveStatus) continue;
    const open = await prisma.zaloAccountStatusLog.findFirst({
      where: { account_id: acct.id, ended_at: null }, select: { status: true },
    });
    if (!open) {
      await writeTransition({ accountId: acct.id, status: liveStatus, reason: 'crash_recovery' });
      created++; continue;
    }
    if (open.status !== liveStatus) {
      await writeTransition({ accountId: acct.id, status: liveStatus, reason: 'checkpoint' });
      reconciled++;
    }
  }
  for (const pid of poolIds) {
    if (!dbAccounts.some((a) => a.id === pid)) log.debug('[status-log-checkpoint] pool-only nick, skipping', { accountId: pid });
  }
  if (reconciled > 0 || created > 0) log.info(`[status-log-checkpoint] scanned=${scanned} reconciled=${reconciled} created=${created} pool=${poolIds.size}`);
  return { scanned, reconciled, created };
}

function mapToLogStatus(status: string): ZaloStatus | null {
  if (status === 'connected') return 'connected';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'qr_pending' || status === 'QR_PENDING') return 'qr_pending';
  if (status === 'auth_failed') return 'auth_failed';
  if (status === 'expired' || status === 'EXPIRED') return 'expired';
  if (status === 'ACTIVE') return 'connected';
  if (status === 'NOT_LOGGED_IN') return 'disconnected';
  return null;
}
