/**
 * zalo-rate-limiter.ts — Per-account, per-operation-category rate limiting.
 *
 * Ported from ZaloCRM zalo-rate-limiter.ts → single-org, Int IDs.
 * Reads effective limits from sdk-limit.service (nick override → org default → fallback),
 * never hardcodes category constants here.
 *
 * Uses Redis (shared/queue/redis-connection) when configured, otherwise in-memory Maps.
 * Fail-open: if checking fails, operations are allowed through.
 */

import { getRedisClient } from '../../shared/queue/redis-connection';
import { createLogger } from '../../shared/logger/logger';
import { getEffectiveLimit, type CategoryLimit } from './sdk-limit.service';
import type { OpCategory } from './zalo-operations';

const log = createLogger('ZaloRateLimiter');

const DAILY_KEY = (acctId: number, cat: string) => `rl:daily:${acctId}:${cat}`;
const BURST_KEY = (acctId: number, cat: string) => `rl:burst:${acctId}:${cat}`;

interface DailyCounter {
  date: string;
  count: number;
}

export class ZaloRateLimiter {
  private dailyCounts = new Map<string, DailyCounter>();
  private recentSends = new Map<string, number[]>();
  private redis: ReturnType<typeof getRedisClient> | null = null;
  private redisChecked = false;

  private async getRedis(): Promise<ReturnType<typeof getRedisClient> | null> {
    if (!this.redisChecked) {
      this.redisChecked = true;
      try {
        this.redis = getRedisClient();
        if (this.redis) log.info('Rate limiter using Redis backing');
      } catch {
        this.redis = null;
      }
    }
    return this.redis;
  }

  /**
   * Check whether an operation for accountId+category is currently allowed.
   * Effective limit resolved per-call (DB-backed, cached 60s in sdk-limit.service).
   */
  async checkLimits(
    accountId: number,
    category: OpCategory = 'message',
  ): Promise<{ allowed: boolean; reason?: string }> {
    let limits: CategoryLimit;
    try {
      limits = await getEffectiveLimit(accountId, category);
    } catch {
      // Fail-open — never block sends because limit resolution failed
      return { allowed: true };
    }

    const r = await this.getRedis();
    if (r) return this.checkRedis(r, accountId, category, limits);
    return this.checkMemory(accountId, category, limits);
  }

  private checkMemory(
    accountId: number,
    category: OpCategory,
    limits: CategoryLimit,
  ): { allowed: boolean; reason?: string } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(key) || []).filter((t) => now - t < limits.burstWindowMs);
    if (recent.length >= limits.burst) {
      return {
        allowed: false,
        reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)`,
      };
    }
    return { allowed: true };
  }

  private async checkRedis(
    r: ReturnType<typeof getRedisClient>,
    accountId: number,
    category: OpCategory,
    limits: CategoryLimit,
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = DAILY_KEY(accountId, category);
      const dailyVal = await r.hget(dailyKey, today);
      const dailyCount = dailyVal ? parseInt(dailyVal, 10) : 0;

      if (dailyCount >= limits.daily) {
        return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
      }

      const burstKey = BURST_KEY(accountId, category);
      const now = Date.now();
      await r.zremrangebyscore(burstKey, '-inf', String(now - limits.burstWindowMs));
      const burstCount = await r.zcard(burstKey);
      if (burstCount >= limits.burst) {
        return {
          allowed: false,
          reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)`,
        };
      }
      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  /** Record a successful send for daily + burst accounting. */
  async recordSend(accountId: number, category: OpCategory = 'message'): Promise<void> {
    const r = await this.getRedis();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = DAILY_KEY(accountId, category);
        await r.hincrby(dailyKey, today, 1);
        await r.expire(dailyKey, 86400 * 2);

        const burstKey = BURST_KEY(accountId, category);
        const now = Date.now();
        await r.zadd(burstKey, String(now), `${now}`);
        await r.pexpire(burstKey, 120_000);
        return;
      } catch {
        /* fall through to in-memory */
      }
    }

    const key = `${accountId}:${category}`;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const recent = (this.recentSends.get(key) || []).filter((t) => now - t < 60_000);
    recent.push(now);
    this.recentSends.set(key, recent);

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today) daily.count++;
    else this.dailyCounts.set(key, { count: 1, date: today });
  }

  /**
   * Get today's send count for an account+category (dashboard).
   */
  async getDailyCount(accountId: number, category: OpCategory = 'message'): Promise<number> {
    const r = await this.getRedis();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const val = await r.hget(DAILY_KEY(accountId, category), today);
        return val ? parseInt(val, 10) : 0;
      } catch {
        /* fall through */
      }
    }
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(key);
    return daily && daily.date === today ? daily.count : 0;
  }

  /**
   * Get all per-category daily counts for an account (dashboard).
   */
  async getDailyCountsForAccount(
    accountId: number,
  ): Promise<Record<string, number>> {
    const r = await this.getRedis();
    const today = new Date().toISOString().split('T')[0];
    const result: Record<string, number> = {};

    const categories: OpCategory[] = [
      'message',
      'reaction',
      'chat_action',
      'group_admin',
      'group_read',
      'friend_action',
      'friend_read',
      'profile',
      'query',
      'friend_lookup',
      'contact_sync',
    ];

    if (r) {
      for (const cat of categories) {
        try {
          const val = await r.hget(DAILY_KEY(accountId, cat), today);
          result[cat] = val ? parseInt(val, 10) : 0;
        } catch {
          result[cat] = 0;
        }
      }
      return result;
    }

    for (const cat of categories) {
      const key = `${accountId}:${cat}`;
      const daily = this.dailyCounts.get(key);
      result[cat] = daily && daily.date === today ? daily.count : 0;
    }
    return result;
  }
}

/** Singleton */
export const zaloRateLimiter = new ZaloRateLimiter();
