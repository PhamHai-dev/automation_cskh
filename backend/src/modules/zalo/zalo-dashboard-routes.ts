/**
 * zalo-dashboard-routes.ts — Express Router: Zalo dashboard KPI stats.
 * Ported from ZaloCRM zalo-dashboard-routes.ts (675 lines, 34KB) → single-org, Int IDs.
 *
 * Simplifications (CRM deps not ported):
 *   - No nick-metrics-service → compute msgToday from Message table directly
 *   - No sdk-limit-service → SDK limits endpoints deferred
 *   - No RBAC scope (getZaloScope/canManageAccount) → basic ADMIN/MANAGE check
 *   - No DailyMessageStat model → proxy uptime via Message.timestamp + Friend
 *   - No revokeAllSessions → owner re-assign deferred
 *   - No requireGrant → basic role check
 *   - No dailyStrangerMessageCap → quota default 500 per nick
 *
 * Kept endpoints:
 *   GET  /dashboard/stats       — team KPI (total/active/idle/error/msgToday/uptimeTeam)
 *   GET  /dashboard/enriched    — list + per-account metrics for dashboard table
 *   GET  /:id/uptime            — 7-day activity sparkline
 *   POST /bulk-action           — reconnect / sync-contacts / disable many
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { checkAccess, handleError } from './zalo-route-helpers';
import { uptimeWindowBatch } from './status-log-service';
import { syncFriendsForAccount } from './friend-sync-service';
import { getNickDayMetricsBatch } from './nick-metrics-service';

const log = createLogger('ZaloDashboard');
const router = Router({ mergeParams: true });

const DAILY_QUOTA = 500; // per-nick soft cap

/** UTC start of "today". */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Range of N days ending today (inclusive). Returns ISO date strings YYYY-MM-DD. */
function lastNDays(n: number): { start: Date; days: string[] } {
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  const days: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return { start, days };
}

// ───────────────────────────────────────────────────────────────────────
// GET /dashboard/stats — team-level KPI for header cards
// ───────────────────────────────────────────────────────────────────────
router.get('/dashboard/stats', async (req: Request, res: Response) => {
  try {
    const today = startOfDay(new Date());
    const yesterday = new Date(today.getTime() - 86_400_000);

    const accounts = await prisma.zaloAccount.findMany({
      where: { archived_at: null },
      select: { id: true, status: true, last_connected_at: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const [uptimeMap, msgTodayCount, msgYesterdayCount, friendCount] = await Promise.all([
      uptimeWindowBatch(accountIds, 7),
      // Messages today (sent + received)
      prisma.message.count({
        where: {
          conversation: { zalo_account_id: { in: accountIds } },
          timestamp: { gte: today },
        },
      }),
      // Messages yesterday
      prisma.message.count({
        where: {
          conversation: { zalo_account_id: { in: accountIds } },
          timestamp: { gte: yesterday, lt: today },
        },
      }),
      // Friend count
      prisma.friend.count({
        where: { zalo_account_id: { in: accountIds }, friendship_status: 'accepted' },
      }),
    ]);

    let active = 0;
    let idle = 0;
    let error = 0;
    let uptimeSum = 0;

    for (const a of accounts) {
      const live = zaloPool.getStatus(a.id) ?? a.status;
      const u = uptimeMap.get(a.id);
      uptimeSum += u?.uptimePct ?? 0;

      if (live === 'ACTIVE') {
        // Active = has messages in last 24h (simple proxy)
        if (msgYesterdayCount > 0 || msgTodayCount > 0) active++;
        else idle++;
      } else {
        error++;
      }
    }

    const totalNick = accounts.length;
    const quota = totalNick * DAILY_QUOTA;
    const uptimeTeam = totalNick > 0 ? uptimeSum / totalNick : 0;

    return res.json({
      totalNick,
      active,
      idle,
      error,
      msgToday: msgTodayCount,
      friendCount,
      quota,
      uptimeTeam: Number(uptimeTeam.toFixed(1)),
    });
  } catch (err) {
    return handleError(res, err, 'dashboard-stats');
  }
});

// ───────────────────────────────────────────────────────────────────────
// GET /dashboard/enriched — list + per-account metrics
// ───────────────────────────────────────────────────────────────────────
router.get('/dashboard/enriched', async (req: Request, res: Response) => {
  try {
    const today = startOfDay(new Date());

    // F7: includeArchived lets admin see deleted nicks for restore
    const includeArchived = (req.query.includeArchived as string) === 'true';
    const accounts = await prisma.zaloAccount.findMany({
      where: includeArchived ? {} : { archived_at: null },
      select: {
        id: true,
        zalo_uid: true,
        display_name: true,
        status: true,
        cs_id: true,
        proxy_url: true,
        last_connected_at: true,
        disconnected_at: true,
        disconnect_reason: true,
        archived_at: true, // F7: expose for admin UI
        created_at: true,
        accesses: {
          select: {
            id: true,
            permission: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const ids = accounts.map((a) => a.id);
    if (ids.length === 0) return res.json([]);

    const [uptimeMap, lastMsgRows, metricsToday] = await Promise.all([
      uptimeWindowBatch(ids, 7),
      prisma.$queryRaw<Array<{ account_id: number; last_at: Date }>>`
        SELECT c.zalo_account_id as account_id, MAX(m.timestamp) as last_at
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.zalo_account_id IN (${ids})
        GROUP BY c.zalo_account_id
      `,
      // F7: Use nick-metrics for detailed msg breakdown (friend/stranger split)
      getNickDayMetricsBatch(ids, today),
    ]);

    const lastActivityMap = new Map<number, Date>(
      lastMsgRows.map((r) => [r.account_id, r.last_at]),
    );

    // Batch: msgToday per account
    const msgTodayRows = await prisma.message.groupBy({
      by: ['conversation_id'],
      where: {
        conversation: { zalo_account_id: { in: ids } },
        timestamp: { gte: today },
      },
      _count: { id: true },
    });
    // Map conversation.account_id → msg count (need join via conversation table)
    const convIds = msgTodayRows.map((r) => r.conversation_id);
    const convToAcc = convIds.length > 0
      ? await prisma.conversation.findMany({
          where: { id: { in: convIds } },
          select: { id: true, zalo_account_id: true },
        })
      : [];
    const accMsgMap = new Map<number, number>();
    for (const row of msgTodayRows) {
      const conv = convToAcc.find((c) => c.id === row.conversation_id);
      if (conv) {
        accMsgMap.set(conv.zalo_account_id, (accMsgMap.get(conv.zalo_account_id) ?? 0) + row._count.id);
      }
    }

    const result = accounts.map((a) => {
      const live = zaloPool.getStatus(a.id) ?? a.status;
      const u = uptimeMap.get(a.id);
      const uptime7d = u?.uptimePct ?? 0;
      const lastActivity = lastActivityMap.get(a.id) ?? a.last_connected_at;
      const metrics = metricsToday.get(a.id);

      return {
        id: a.id,
        zaloUid: a.zalo_uid,
        displayName: a.display_name,
        status: a.status,
        liveStatus: live,
        hasProxy: !!a.proxy_url,
        lastConnectedAt: a.last_connected_at,
        disconnectedAt: a.disconnected_at,
        disconnectReason: a.disconnect_reason,
        archivedAt: a.archived_at, // F7: expose for admin UI
        createdAt: a.created_at,
        owner: null,
        ownerUserId: a.cs_id,
        crew: a.accesses.map((ac) => ({
          accessId: ac.id,
          permission: ac.permission,
          role: ac.permission === 'admin' ? 'owner' : ac.permission === 'chat' ? 'editor' : 'viewer',
          user: ac.user,
        })),
        crewCount: a.accesses.length,
        msgToday: metrics ? metrics.msgSentTotal + metrics.msgReceivedTotal : (accMsgMap.get(a.id) ?? 0),
        msgSentToStrangers: metrics?.msgSentToStrangers ?? 0,
        quota: DAILY_QUOTA,
        uptime7d,
        lastActivityAt: lastActivity,
        healthAlert: uptime7d < 80,
      };
    });

    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'dashboard-enriched');
  }
});

// ───────────────────────────────────────────────────────────────────────
// GET /:id/uptime?range=7d — sparkline data
// ───────────────────────────────────────────────────────────────────────
router.get('/:id/uptime', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.id, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;

    const range = (req.query.range as string) ?? '7d';
    const n = range === '24h' ? 1 : range === '30d' ? 30 : 7;

    const { start, days } = lastNDays(n);
    const today = startOfDay(new Date());

    // Count messages per day for this account
    const rows = await prisma.$queryRaw<Array<{ date: string; msg_count: bigint }>>`
      SELECT DATE(m.timestamp) as date, COUNT(*) as msg_count
      FROM messages m
      INNER JOIN conversations c ON c.id = m.conversation_id
      WHERE c.zalo_account_id = ${accountId}
        AND m.timestamp >= ${start}
        AND m.timestamp <= ${today}
      GROUP BY DATE(m.timestamp)
    `;
    const byDate = new Map(rows.map((r) => [r.date, Number(r.msg_count)]));

    const buckets = days.map((date) => {
      const count = byDate.get(date) ?? 0;
      return { date, msgCount: count, hasActivity: count > 0 };
    });

    const activeDays = buckets.filter((b) => b.hasActivity).length;
    const uptimePct = Number(((activeDays / n) * 100).toFixed(1));

    return res.json({ range, buckets, uptimePct });
  } catch (err) {
    return handleError(res, err, 'uptime');
  }
});

// ───────────────────────────────────────────────────────────────────────
// POST /bulk-action — reconnect / sync-contacts / disable many
// ───────────────────────────────────────────────────────────────────────
router.post('/bulk-action', async (req: Request, res: Response) => {
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { ids, action } = req.body as { ids?: number[]; action?: string };

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids[] is required' });
  }
  if (!['reconnect', 'sync-contacts', 'disable'].includes(action ?? '')) {
    return res.status(400).json({ error: 'action must be reconnect | sync-contacts | disable' });
  }

  const accounts = await prisma.zaloAccount.findMany({
    where: { id: { in: ids } },
  });

  const results: Array<{ id: number; ok: boolean; error?: string }> = [];

  for (const a of accounts) {
    try {
      if (action === 'reconnect') {
        const sessionData = a.encrypted_session_data as string | null;
        if (!sessionData) {
          results.push({ id: a.id, ok: false, error: 'no saved session' });
          continue;
        }
        // Fire-and-forget; status delivered via events
        zaloPool.reconnect(a.id, sessionData).catch(() => {});
        results.push({ id: a.id, ok: true });
      } else if (action === 'sync-contacts') {
        // Fire-and-forget sync
        syncFriendsForAccount(a.id, { trigger: 'manual' }).catch(() => {});
        results.push({ id: a.id, ok: true });
      } else if (action === 'disable') {
        zaloPool.disconnect(a.id);
        await prisma.zaloAccount.update({
          where: { id: a.id },
          data: {
            status: 'DISABLED',
            disconnect_reason: 'manual',
            disconnected_at: new Date(),
          },
        });
        results.push({ id: a.id, ok: true });
      }
    } catch (err: any) {
      results.push({ id: a.id, ok: false, error: err.message ?? 'unknown' });
    }
  }

  log.info(
    `Bulk action ${action} on ${results.length} accounts by userId=${user.id}: ` +
    `${results.filter((r) => r.ok).length} ok, ${results.filter((r) => !r.ok).length} failed`,
  );

  return res.json({
    action,
    total: ids.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

export { router as zaloDashboardRouter };
