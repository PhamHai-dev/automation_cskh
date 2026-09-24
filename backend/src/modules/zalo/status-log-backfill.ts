/**
 * status-log-backfill.ts — Phase ZaloAccounts redesign 2026-05-22
 *
 * Ported from ZaloCRM status-log-backfill.ts (82 lines) → single-org, Int IDs.
 *
 * One-shot backfill: tao 1 open record cho moi nick chua co status log.
 *
 * Logic:
 *   - Nick co status='connected' + lastConnectedAt → open record (status='connected',
 *     startedAt=lastConnectedAt, endedAt=NULL, reason='login').
 *   - Nick co status='disconnected' / 'qr_pending' → open record voi startedAt=createdAt
 *     hoac lastConnectedAt neu co (baseline coarse).
 *   - Nick da co open record → skip (idempotent, chay nhieu lan OK).
 *
 * Sau backfill, cron checkpoint se reconcile bat ky drift nao trong tick tiep theo (5p).
 *
 * Trigger: goi 1 lan luc deploy. Co the expose qua admin route neu can re-run.
 *
 * Adaptations: no orgId, prisma import from '../../prisma/client', logger→createLogger,
 * snake_case DB fields, ZaloAccountStatus enum mapping.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import type { ZaloStatus, StatusReason } from './status-log-service';

const log = createLogger('StatusLogBackfill');

export async function backfillStatusLog(): Promise<{
  totalAccounts: number;
  backfilled: number;
  skipped: number;
}> {
  const accounts = await prisma.zaloAccount.findMany({
    select: { id: true, status: true, last_connected_at: true, created_at: true },
  });

  let backfilled = 0;
  let skipped = 0;

  for (const acct of accounts) {
    // Idempotent: skip neu da co open record
    const existing = await prisma.zaloAccountStatusLog.findFirst({
      where: { account_id: acct.id, ended_at: null },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const logStatus = mapToLogStatus(acct.status);
    if (!logStatus) {
      skipped++;
      continue;
    }

    const startedAt = acct.last_connected_at ?? acct.created_at;
    const reason: StatusReason = logStatus === 'connected' ? 'login' : 'crash_recovery';

    await prisma.zaloAccountStatusLog.create({
      data: {
        account_id: acct.id,
        status: logStatus,
        started_at: startedAt,
        ended_at: null,
        reason,
      },
    });
    backfilled++;
  }

  log.info(`[status-log-backfill] totalAccounts=${accounts.length} backfilled=${backfilled} skipped=${skipped}`);
  return { totalAccounts: accounts.length, backfilled, skipped };
}

/**
 * Map ZaloAccountStatus enum (Prisma) to ZaloStatus type (status-log-service).
 * CRM uses raw strings; our schema uses Prisma enums.
 */
function mapToLogStatus(status: string): ZaloStatus | null {
  // Prisma enum values (ACTIVE, QR_PENDING, NOT_LOGGED_IN, EXPIRED, etc.)
  if (status === 'ACTIVE') return 'connected';
  if (status === 'QR_PENDING') return 'qr_pending';
  if (status === 'NOT_LOGGED_IN') return 'disconnected';
  if (status === 'EXPIRED') return 'expired';
  if (status === 'BANNED' || status === 'DISABLED') return 'auth_failed';
  // Raw string values (from CRM-style strings if ever encountered)
  if (status === 'connected') return 'connected';
  if (status === 'disconnected') return 'disconnected';
  if (status === 'qr_pending') return 'qr_pending';
  if (status === 'auth_failed') return 'auth_failed';
  if (status === 'expired') return 'expired';
  return null;
}
