/**
 * presence-service.ts — Real-time Zalo presence cache + bulk refresh.
 * Ported from ZaloCRM presence-service.ts (175 lines) → single-org, Int IDs.
 *
 * Adaptations:
 *   - zaloOps.getLastOnline/getFriendOnlines → zaloPool.getApi(accountId) methods
 *   - No orgId/runSystemQuery (single org) → prisma direct
 *   - No socket.io Server → ioRef typed as { emit(...): void }-compatible; emit via log when absent
 *   - createLogger, Int accountId
 */
import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';

const log = createLogger('PresenceService');

export interface PresenceEntry {
  /** Unix ms timestamp from Zalo lastOnline. null = privacy off OR unknown */
  lastOnline: number | null;
  /** Whether user has show_online_status privacy enabled */
  showStatus: boolean;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30s — single-uid fetch dedup
const cache = new Map<string, PresenceEntry>();

// Minimal emit surface — thay thế socket.io Server (chưa có dep trong project).
export interface PresenceIo {
  emit(event: string, payload: unknown): void;
}
let ioRef: PresenceIo | null = null;

function key(accountId: number, friendUid: string): string {
  return `${accountId}:${friendUid}`;
}

/**
 * Get presence for a single friend uid. Returns cached entry if fresh (<30s),
 * else fetches via Zalo SDK lastOnline + updates cache.
 *
 * Returns null on fetch error (caller handles fallback UI).
 */
export async function getPresence(accountId: number, friendUid: string): Promise<PresenceEntry | null> {
  const k = key(accountId, friendUid);
  const cached = cache.get(k);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const api = zaloPool.getApi(accountId);
    if (!api) return cached || null;

    const result: any = await api.lastOnline(friendUid);
    // Zalo returns: { lastOnline: number, settings: { show_online_status: boolean } }
    // lastOnline = 0 → Zalo không có data hoặc chưa từng online → treat as null
    let lastOnlineMs: number | null = null;
    if (typeof result?.lastOnline === 'number' && result.lastOnline > 0) {
      // Zalo trả ms hoặc s tuỳ version — detect bằng magnitude (<1e12 ≈ trước 2001 nếu ms → s)
      lastOnlineMs = result.lastOnline < 1e12 ? result.lastOnline * 1000 : result.lastOnline;
    }
    const showStatus = result?.settings?.show_online_status !== false;

    const entry: PresenceEntry = {
      lastOnline: showStatus ? lastOnlineMs : null,
      showStatus,
      fetchedAt: now,
    };
    cache.set(k, entry);
    return entry;
  } catch (err) {
    log.warn('[presence] fetch failed', { accountId, friendUid, err: (err as Error).message });
    return cached || null;
  }
}

/**
 * Bulk refresh — getFriendOnlines() per account, mark friends in `onlines` list
 * as fresh, emit socket update. Stale entries naturally TTL-expire.
 *
 * Note: getFriendOnlines returns currently-online friends only. Friends NOT in
 * the list might still be online if they recently went offline — we don't
 * proactively mark offline; we let stale data expire and re-fetch on demand.
 */
async function refreshAccountPresence(accountId: number): Promise<{ onlineCount: number } | null> {
  try {
    const api = zaloPool.getApi(accountId);
    if (!api) return null;

    const result: any = await api.getFriendOnlines(accountId);
    const onlines: Array<{ userId: string; status?: string }> = result?.onlines ?? [];
    const now = Date.now();

    for (const o of onlines) {
      if (!o.userId) continue;
      cache.set(key(accountId, o.userId), {
        lastOnline: now, // currently online → lastOnline ≈ now
        showStatus: true,
        fetchedAt: now,
      });
    }

    if (ioRef) {
      ioRef.emit('friend:presence', {
        accountId,
        onlines: onlines.map((o) => o.userId),
        at: now,
      });
    }

    return { onlineCount: onlines.length };
  } catch (err) {
    // Common: account not connected (status != 'connected'). Silent fail.
    return null;
  }
}

let cronJob: ReturnType<typeof cron.schedule> | null = null;

export function startPresenceCron(io: PresenceIo | null): void {
  ioRef = io;

  // Every 60s — bulk refresh all connected accounts
  cronJob = cron.schedule('*/1 * * * *', async () => {
    const accounts = await prisma.zaloAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    let totalOnline = 0;
    for (const acc of accounts) {
      const result = await refreshAccountPresence(acc.id);
      if (result) totalOnline += result.onlineCount;
    }
    if (accounts.length > 0) {
      log.debug('[presence] bulk refresh done', {
        accounts: accounts.length,
        totalOnline,
        cacheSize: cache.size,
      });
    }
  });
  log.info('[presence] cron started — refresh every 60s');
}

export function stopPresenceCron(): void {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

/** Cleanup entries older than 5min (called periodically). */
export function pruneCache(): number {
  const cutoff = Date.now() - 5 * 60_000;
  let removed = 0;
  for (const [k, v] of cache) {
    if (v.fetchedAt < cutoff) {
      cache.delete(k);
      removed++;
    }
  }
  return removed;
}
