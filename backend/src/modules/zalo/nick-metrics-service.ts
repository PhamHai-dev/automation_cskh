/**
 * nick-metrics-service.ts — per-nick per-day metrics for dashboard analytics.
 * Ported from ZaloCRM nick-metrics-service.ts (320 lines) → simplified.
 *
 * Adaptations (CRM deps NOT in automation_cskh schema):
 *   - No FriendshipAttempt model → friend-req metrics return 0 (schema gap)
 *   - No PhoneSearchEvent model → phone-search metrics return 0 (schema gap)
 *   - No Message.senderType/sentVia → use is_self + sender_uid join Friend
 *   - accountId: string → number (Int IDs)
 *   - PostgreSQL raw syntax → Prisma groupBy/count (MySQL-safe)
 *
 * Kept from CRM:
 *   - In-memory cache TTL 60s + force bypass (automation gate needs real-time)
 *   - startOfDayUtc/endOfDayUtc day-window helpers
 *   - Friend/Stranger split for sent + received (2026-06-06 decision: cap only
 *     applies to sent-to-strangers; sent-to-friends + received don't count)
 *   - getNickDayMetrics / getNickDayMetricsBatch / getNickRangeMetrics /
 *     invalidateMetricsCache / clearMetricsCache API surface
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('NickMetrics');

export interface NickDayMetrics {
  // Messages
  msgSentTotal: number;
  msgReceivedTotal: number;
  msgSentToStrangers: number; // capped by dailyStrangerMessageCap
  msgSentToFriends: number;   // NOT capped
  msgReceivedFromFriends: number;
  msgReceivedFromStrangers: number;

  // Friend requests — schema gap: FriendshipAttempt not ported → always 0
  friendReqSent: number;
  friendReqAccepted: number;
  friendReqRejected: number;
  friendReqPending: number;
  friendReqByUser: number;
  friendReqByBot: number;

  // Phone search — schema gap: PhoneSearchEvent not ported → always 0
  phoneSearchTotal: number;
  phoneSearchFoundZalo: number;
  phoneSearchNoZalo: number;
  phoneSearchByUser: number;
  phoneSearchByBot: number;
}

const ZERO_METRICS: NickDayMetrics = {
  msgSentTotal: 0,
  msgReceivedTotal: 0,
  msgSentToStrangers: 0,
  msgSentToFriends: 0,
  msgReceivedFromFriends: 0,
  msgReceivedFromStrangers: 0,
  friendReqSent: 0,
  friendReqAccepted: 0,
  friendReqRejected: 0,
  friendReqPending: 0,
  friendReqByUser: 0,
  friendReqByBot: 0,
  phoneSearchTotal: 0,
  phoneSearchFoundZalo: 0,
  phoneSearchNoZalo: 0,
  phoneSearchByUser: 0,
  phoneSearchByBot: 0,
};

// In-memory cache TTL 60s. Key: `${accountId}:${dayUtcMs}`.
const cache = new Map<string, { metrics: NickDayMetrics; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function cacheKey(accountId: number, dayUtc: Date): string {
  return `${accountId}:${dayUtc.getTime()}`;
}

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfDayUtc(d: Date): Date {
  const x = startOfDayUtc(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

/**
 * Metrics 1 nick for 1 UTC day.
 * force=true bypasses cache (automation gate needs real-time).
 */
export async function getNickDayMetrics(
  accountId: number,
  dayUtc: Date,
  opts: { force?: boolean } = {},
): Promise<NickDayMetrics> {
  const day = startOfDayUtc(dayUtc);
  const k = cacheKey(accountId, day);
  if (!opts.force) {
    const hit = cache.get(k);
    if (hit && hit.expiresAt > Date.now()) return hit.metrics;
  }

  const dayEnd = endOfDayUtc(day);

  // Accepted friend UIDs for this nick (used for friend/stranger split).
  const acceptedFriends = await prisma.friend.findMany({
    where: { zalo_account_id: accountId, friendship_status: 'accepted' },
    select: { zalo_uid_in_nick: true },
  });
  const friendUidSet = new Set(acceptedFriends.map((f) => f.zalo_uid_in_nick));

  const [sentCount, receivedCount] = await Promise.all([
    // Messages sent (self) today
    prisma.message.count({
      where: {
        conversation: { zalo_account_id: accountId },
        is_self: true,
        timestamp: { gte: day, lt: dayEnd },
      },
    }),
    // Messages received (contact) today
    prisma.message.count({
      where: {
        conversation: { zalo_account_id: accountId },
        is_self: false,
        timestamp: { gte: day, lt: dayEnd },
      },
    }),
  ]);

  // Split received: from friends vs from strangers
  const receivedRows = await prisma.message.findMany({
    where: {
      conversation: { zalo_account_id: accountId },
      is_self: false,
      timestamp: { gte: day, lt: dayEnd },
    },
    select: { sender_uid: true },
  });
  const receivedFromFriends = receivedRows.filter((m) =>
    friendUidSet.has(m.sender_uid),
  ).length;

  // Split sent: to friends vs to strangers (2026-06-06 decision: cap only for strangers)
  const sentRows = await prisma.message.findMany({
    where: {
      conversation: { zalo_account_id: accountId },
      is_self: true,
      timestamp: { gte: day, lt: dayEnd },
    },
    select: { conversation: { select: { external_thread_id: true, thread_type: true } } },
  });
  const sentToStrangers = sentRows.filter(
    (m) => m.conversation.thread_type === 'user' && !friendUidSet.has(m.conversation.external_thread_id),
  ).length;

  const metrics: NickDayMetrics = {
    ...ZERO_METRICS,
    msgSentTotal: sentCount,
    msgReceivedTotal: receivedCount,
    msgSentToStrangers: sentToStrangers,
    msgSentToFriends: Math.max(0, sentCount - sentToStrangers),
    msgReceivedFromFriends: receivedFromFriends,
    msgReceivedFromStrangers: Math.max(0, receivedCount - receivedFromFriends),
    // friendReq*/phoneSearch* = 0 (schema gaps)
  };

  cache.set(k, { metrics, expiresAt: Date.now() + CACHE_TTL_MS });
  return metrics;
}

/**
 * Batch: multiple nicks x 1 day (dashboard table).
 */
export async function getNickDayMetricsBatch(
  accountIds: number[],
  dayUtc: Date,
  opts: { force?: boolean } = {},
): Promise<Map<number, NickDayMetrics>> {
  const results = new Map<number, NickDayMetrics>();
  const CONCURRENCY = 8;
  for (let i = 0; i < accountIds.length; i += CONCURRENCY) {
    const chunk = accountIds.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (id) => [id, await getNickDayMetrics(id, dayUtc, opts)] as const),
    );
    for (const [id, m] of rows) results.set(id, m);
  }
  return results;
}

/**
 * Range metrics (aggregated per day) — for sparkline 7 days.
 * Returns Map<YYYY-MM-DD, NickDayMetrics>.
 */
export async function getNickRangeMetrics(
  accountId: number,
  startUtc: Date,
  endUtc: Date,
  opts: { force?: boolean } = {},
): Promise<Map<string, NickDayMetrics>> {
  const out = new Map<string, NickDayMetrics>();
  const cur = startOfDayUtc(startUtc);
  const end = startOfDayUtc(endUtc);
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 10);
    out.set(key, await getNickDayMetrics(accountId, new Date(cur), opts));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Invalidate cache for 1 nick 1 day (call after new message arrives). */
export function invalidateMetricsCache(accountId: number, dayUtc: Date): void {
  cache.delete(cacheKey(accountId, startOfDayUtc(dayUtc)));
}

/** Clear all cache (admin endpoint / deploy). */
export function clearMetricsCache(): void {
  cache.clear();
  log.info('Metrics cache cleared');
}
