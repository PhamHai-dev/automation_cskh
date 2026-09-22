/**
 * status-log-service.ts — Phase ZaloAccounts redesign 2026-05-22
 * Ported from ZaloCRM status-log-service.ts (201 lines) → single-org, Int IDs.
 * Hybrid uptime tracking: event-driven + cron 5p checkpoint.
 * Invariant: 1 record with ended_at=NULL per account.
 * Adaptations: no orgId, tenantTransaction→prisma.$transaction, string→number accountId, snake_case DB fields.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('StatusLogService');

export type ZaloStatus = 'connected' | 'disconnected' | 'auth_failed' | 'qr_pending' | 'expired';
export type StatusReason =
  | 'login' | 'qr_scan' | 'reconnect_ok' | 'reconnect_failed'
  | 'disconnect' | 'auth_fail' | 'session_expired'
  | 'crash_recovery' | 'checkpoint' | 'manual';

export async function writeTransition(input: {
  accountId: number;
  status: ZaloStatus;
  reason: StatusReason;
  at?: Date;
}): Promise<void> {
  const now = input.at ?? new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const open = await tx.zaloAccountStatusLog.findFirst({
        where: { account_id: input.accountId, ended_at: null },
        select: { id: true, status: true, started_at: true },
      });
      if (open && open.status === input.status) return;
      if (open) {
        const endedAt = now < open.started_at ? open.started_at : now;
        await tx.zaloAccountStatusLog.update({ where: { id: open.id }, data: { ended_at: endedAt } });
      }
      await tx.zaloAccountStatusLog.create({
        data: { account_id: input.accountId, status: input.status, started_at: now, ended_at: null, reason: input.reason },
      });
    });
  } catch (err) {
    log.warn(`writeTransition failed accountId=${input.accountId} status=${input.status}`, { error: String(err) });
  }
}

export async function uptimeWindow(accountId: number, sinceDays: number): Promise<{ uptimePct: number; effectiveWindowMs: number }> {
  const now = Date.now();
  const since = new Date(now - sinceDays * 86400_000);
  const logs = await prisma.zaloAccountStatusLog.findMany({
    where: { account_id: accountId, OR: [{ ended_at: null }, { ended_at: { gt: since } }] },
    select: { status: true, started_at: true, ended_at: true },
    orderBy: { started_at: 'asc' },
  });
  if (logs.length === 0) return { uptimePct: 0, effectiveWindowMs: 0 };
  const earliestStart = logs[0].started_at.getTime();
  const effectiveStart = Math.max(since.getTime(), earliestStart);
  const effectiveWindowMs = Math.max(0, now - effectiveStart);
  if (effectiveWindowMs === 0) return { uptimePct: 0, effectiveWindowMs: 0 };
  let connectedMs = 0;
  for (const r of logs) {
    if (r.status !== 'connected') continue;
    const start = Math.max(r.started_at.getTime(), effectiveStart);
    const end = (r.ended_at ?? new Date()).getTime();
    if (end <= start) continue;
    connectedMs += Math.min(end, now) - start;
  }
  const uptimePct = (connectedMs / effectiveWindowMs) * 100;
  return { uptimePct: Number(uptimePct.toFixed(1)), effectiveWindowMs };
}

export async function uptimeWindowBatch(accountIds: number[], sinceDays: number): Promise<Map<number, { uptimePct: number; effectiveWindowMs: number }>> {
  const result = new Map<number, { uptimePct: number; effectiveWindowMs: number }>();
  if (accountIds.length === 0) return result;
  const now = Date.now();
  const since = new Date(now - sinceDays * 86400_000);
  const logs = await prisma.zaloAccountStatusLog.findMany({
    where: { account_id: { in: accountIds }, OR: [{ ended_at: null }, { ended_at: { gt: since } }] },
    select: { account_id: true, status: true, started_at: true, ended_at: true },
    orderBy: { started_at: 'asc' },
  });
  const byAccount = new Map<number, typeof logs>();
  for (const r of logs) {
    const arr = byAccount.get(r.account_id) ?? [];
    arr.push(r);
    byAccount.set(r.account_id, arr);
  }
  for (const accountId of accountIds) {
    const accountLogs = byAccount.get(accountId) ?? [];
    if (accountLogs.length === 0) { result.set(accountId, { uptimePct: 0, effectiveWindowMs: 0 }); continue; }
    const earliestStart = accountLogs[0].started_at.getTime();
    const effectiveStart = Math.max(since.getTime(), earliestStart);
    const effectiveWindowMs = Math.max(0, now - effectiveStart);
    if (effectiveWindowMs === 0) { result.set(accountId, { uptimePct: 0, effectiveWindowMs: 0 }); continue; }
    let connectedMs = 0;
    for (const r of accountLogs) {
      if (r.status !== 'connected') continue;
      const start = Math.max(r.started_at.getTime(), effectiveStart);
      const end = (r.ended_at ?? new Date()).getTime();
      if (end <= start) continue;
      connectedMs += Math.min(end, now) - start;
    }
    const uptimePct = (connectedMs / effectiveWindowMs) * 100;
    result.set(accountId, { uptimePct: Number(uptimePct.toFixed(1)), effectiveWindowMs });
  }
  return result;
}
