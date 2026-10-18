/**
 * sdk-limit.service.ts — DB-backed SDK rate limit configuration.
 *
 * Ported from ZaloCRM sdk-limit-service.ts → single-org, Int IDs.
 * Adaptation notes:
 *   ZaloCRM (multi-tenant): orgId + zaloAccountId nullable (nick override → org default → fallback).
 *   Here (single-org): zalo_account_id nullable (nick override → global default → fallback).
 *   No orgId / nickOrgCache needed.
 *
 * Resolution priority:
 *   1. Nick-specific override (where zalo_account_id = nickId)
 *   2. Global default (where zalo_account_id = null)
 *   3. Hardcoded fallback (DEFAULT_SDK_LIMITS)
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import type { OpCategory } from './zalo-operations';

const log = createLogger('SdkLimit');

export interface CategoryLimit {
  daily: number;
  burst: number;
  burstWindowMs: number;
}

// Fallback constants — last resort if DB has no row for category.
// Note: friend_lookup is strictly capped (daily: 60, burst: 4 / 5min) because Zalo
// blocks phone searches with error -216 if >15-20 lookups/hour are attempted.
export const DEFAULT_SDK_LIMITS: Record<OpCategory, CategoryLimit> = {
  message:          { daily: 200,  burst: 20, burstWindowMs: 30_000 },
  stranger_message: { daily: 40,   burst: 5,  burstWindowMs: 60_000 },
  reaction:         { daily: 300,  burst: 10, burstWindowMs: 30_000 },
  chat_action:      { daily: 500,  burst: 15, burstWindowMs: 30_000 },
  group_admin:      { daily: 50,   burst: 5,  burstWindowMs: 60_000 },
  group_read:       { daily: 1000, burst: 20, burstWindowMs: 30_000 },
  friend_action:    { daily: 30,   burst: 8,  burstWindowMs: 60_000 },
  friend_read:      { daily: 500,  burst: 10, burstWindowMs: 30_000 },
  profile:          { daily: 10,   burst: 3,  burstWindowMs: 60_000 },
  query:            { daily: 2000, burst: 30, burstWindowMs: 30_000 },
  friend_lookup:    { daily: 60,   burst: 4,  burstWindowMs: 300_000 },
  contact_sync:     { daily: 100,  burst: 5,  burstWindowMs: 60_000 },
};

export const ALL_CATEGORIES = Object.keys(DEFAULT_SDK_LIMITS) as OpCategory[];

// ── Cache: 60s TTL ───────────────────────────────────────────────────────────
interface CacheEntry { limit: CategoryLimit; expiresAt: number; }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(nickId: number, category: string): string {
  return `${nickId}:${category}`;
}

/**
 * Effective limit for a nick + category: nick override → global default → fallback.
 */
export async function getEffectiveLimit(nickId: number, category: OpCategory): Promise<CategoryLimit> {
  const fallback = DEFAULT_SDK_LIMITS[category] ?? DEFAULT_SDK_LIMITS.message;

  try {
    const ck = cacheKey(nickId, category);
    const hit = cache.get(ck);
    if (hit && hit.expiresAt > Date.now()) return hit.limit;

    // Single query: fetch both nick override and global default for this category
    const rows = await prisma.sdkLimit.findMany({
      where: {
        category,
        OR: [{ zalo_account_id: nickId }, { zalo_account_id: null }],
      },
      select: { zalo_account_id: true, daily_limit: true, burst_limit: true, burst_window_ms: true },
    });

    const nickRow = rows.find((r) => r.zalo_account_id === nickId);
    const globalRow = rows.find((r) => r.zalo_account_id === null);
    const chosen = nickRow ?? globalRow;
    const limit: CategoryLimit = chosen
      ? { daily: chosen.daily_limit, burst: chosen.burst_limit, burstWindowMs: chosen.burst_window_ms }
      : fallback;

    cache.set(ck, { limit, expiresAt: Date.now() + CACHE_TTL_MS });
    return limit;
  } catch (err) {
    log.warn('getEffectiveLimit failed', { nickId, category, error: String(err) });
    return fallback;
  }
}

/**
 * Return effective limits across all categories for a given nick.
 */
export async function getAllEffectiveLimits(nickId: number): Promise<Record<OpCategory, CategoryLimit>> {
  const entries = await Promise.all(
    ALL_CATEGORIES.map(async (cat) => [cat, await getEffectiveLimit(nickId, cat)] as const),
  );
  return Object.fromEntries(entries) as Record<OpCategory, CategoryLimit>;
}

/**
 * Upsert a category limit override for a specific nick (`nickId = number`) or global default (`nickId = null`),
 * then invalidate the in-memory cache.
 */
export async function upsertAccountLimit(
  nickId: number | null,
  category: OpCategory,
  data: { daily_limit: number; burst_limit: number; burst_window_ms: number },
) {
  const daily_limit = Math.max(1, Math.floor(data.daily_limit));
  const burst_limit = Math.max(1, Math.floor(data.burst_limit));
  const burst_window_ms = Math.max(1_000, Math.floor(data.burst_window_ms));

  const existing = await prisma.sdkLimit.findFirst({
    where: { zalo_account_id: nickId, category },
  });

  const saved = existing
    ? await prisma.sdkLimit.update({
        where: { id: existing.id },
        data: { daily_limit, burst_limit, burst_window_ms },
      })
    : await prisma.sdkLimit.create({
        data: {
          zalo_account_id: nickId,
          category,
          daily_limit,
          burst_limit,
          burst_window_ms,
        },
      });

  invalidateLimitCache(nickId ?? undefined);
  return saved;
}

/**
 * Invalidate cache for a nick (called when admin edits limits).
 * If nickId omitted, clears entire cache.
 */
export function invalidateLimitCache(nickId?: number): void {
  if (nickId == null) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(`${nickId}:`)) cache.delete(k);
  }
}
