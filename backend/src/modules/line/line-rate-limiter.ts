/**
 * line-rate-limiter.ts — Anti-Ban Rate Limiter & OA Quota Guardrail for LINE.
 *
 * Enforces safe anti-ban bounds specifically calibrated for LINE (`legy.line-apps.com`
 * `GuardService` & `TalkException` code 35):
 *   - PERSONAL accounts (`@evex/linejs`):
 *       message:        { daily: 250, burst: 8,  burstWindowMs: 60_000 }
 *       group_message:  { daily: 300, burst: 10, burstWindowMs: 60_000 }
 *       friend_lookup:  { daily: 20,  burst: 2,  burstWindowMs: 600_000 }  (Max 2 lookups per 10 mins, 20/day — highest ban risk on LINE!)
 *       friend_action:  { daily: 18,  burst: 3,  burstWindowMs: 1_800_000 } (Max 3 requests per 30 mins, 18/day)
 *       contact_sync:   { daily: 10,  burst: 1,  burstWindowMs: 600_000 }
 *       group_sync:     { daily: 15,  burst: 2,  burstWindowMs: 600_000 }
 *   - OA accounts (`@line/bot-sdk`):
 *       message:        { daily: 10000, burst: 100, burstWindowMs: 10_000 }
 *       group_message:  { daily: 10000, burst: 100, burstWindowMs: 10_000 }
 *       friend_lookup:  { daily: 1000,  burst: 30,  burstWindowMs: 60_000 }
 *       friend_action:  { daily: 500,   burst: 20,  burstWindowMs: 60_000 }
 *       contact_sync:   { daily: 100,   burst: 10,  burstWindowMs: 60_000 }
 *       group_sync:     { daily: 200,   burst: 15,  burstWindowMs: 60_000 }
 *   - Monthly Quota Guardrail (`checkOaQuotaGuardrail(account)`):
 *       Computes `usagePct = monthly_quota ? (monthly_consumption / monthly_quota) * 100 : 0`.
 *       Returns `{ status: 'OK' | 'WARN_80' | 'CRITICAL_95' | 'EXHAUSTED_100', usagePct, allowPush: usagePct < 100, allowFreeReplyToken: true }`.
 */

import type Redis from 'ioredis';
import { createLogger } from '../../shared/logger/logger';
import type { LineAccountType } from '@prisma/client';

const log = createLogger('LineRateLimiter');

export type LineOpCategory =
  | 'message'
  | 'group_message'
  | 'friend_lookup'
  | 'friend_action'
  | 'contact_sync'
  | 'group_sync';

export interface LineCategoryLimit {
  daily: number;
  burst: number;
  burstWindowMs: number;
}

export type LineOaQuotaStatus = 'OK' | 'WARN_80' | 'CRITICAL_95' | 'EXHAUSTED_100';

export interface LineOaQuotaGuardrailResult {
  status: LineOaQuotaStatus;
  usagePct: number;
  monthlyQuota: number | null;
  monthlyConsumption: number;
  allowPush: boolean;
  allowFreeReplyToken: boolean;
}

export const LINE_PERSONAL_DEFAULT_LIMITS: Record<LineOpCategory, LineCategoryLimit> = {
  message: { daily: 250, burst: 8, burstWindowMs: 60_000 },
  group_message: { daily: 300, burst: 10, burstWindowMs: 60_000 },
  friend_lookup: { daily: 20, burst: 2, burstWindowMs: 600_000 },
  friend_action: { daily: 18, burst: 3, burstWindowMs: 1_800_000 },
  contact_sync: { daily: 10, burst: 1, burstWindowMs: 600_000 },
  group_sync: { daily: 15, burst: 2, burstWindowMs: 600_000 },
};

export const LINE_OA_DEFAULT_LIMITS: Record<LineOpCategory, LineCategoryLimit> = {
  message: { daily: 10000, burst: 100, burstWindowMs: 10_000 },
  group_message: { daily: 10000, burst: 100, burstWindowMs: 10_000 },
  friend_lookup: { daily: 1000, burst: 30, burstWindowMs: 60_000 },
  friend_action: { daily: 500, burst: 20, burstWindowMs: 60_000 },
  contact_sync: { daily: 100, burst: 10, burstWindowMs: 60_000 },
  group_sync: { daily: 200, burst: 15, burstWindowMs: 60_000 },
};

export const ALL_LINE_OP_CATEGORIES: LineOpCategory[] = [
  'message',
  'group_message',
  'friend_lookup',
  'friend_action',
  'contact_sync',
  'group_sync',
];

const DAILY_KEY = (acctId: number, cat: string) => `line:rl:daily:${acctId}:${cat}`;
const BURST_KEY = (acctId: number, cat: string) => `line:rl:burst:${acctId}:${cat}`;
const OVERRIDE_KEY = (acctId: number) => `line:rl:override:${acctId}`;

interface DailyCounter {
  date: string;
  count: number;
}

export class LineRateLimiter {
  private dailyCounts = new Map<string, DailyCounter>();
  private recentSends = new Map<string, number[]>();
  private customOverrides = new Map<number, Partial<Record<LineOpCategory, LineCategoryLimit>>>();
  private redis: Redis | null = null;
  private redisChecked = false;

  private async getRedis(): Promise<Redis | null> {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    if (!this.redisChecked) {
      this.redisChecked = true;
      try {
        // Lazy-load redis-connection so unit tests without .env don't trigger env.ts process.exit
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRedisClient } = require('../../shared/queue/redis-connection');
        this.redis = getRedisClient();
        if (this.redis) log.info('LINE rate limiter using Redis backing');
      } catch {
        this.redis = null;
      }
    }
    return this.redis;
  }

  /**
   * Reset all in-memory counters and overrides (useful for unit tests).
   */
  public resetMemory(): void {
    this.dailyCounts.clear();
    this.recentSends.clear();
    this.customOverrides.clear();
  }

  /**
   * Resolve effective limit for an account + category.
   */
  public async getEffectiveLimit(
    accountId: number,
    category: LineOpCategory,
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<LineCategoryLimit> {
    const defaults =
      accountType === 'OA' ? LINE_OA_DEFAULT_LIMITS : LINE_PERSONAL_DEFAULT_LIMITS;
    const base = defaults[category] ?? defaults.message;

    const memOverride = this.customOverrides.get(accountId)?.[category];
    if (memOverride) {
      return memOverride;
    }

    const r = await this.getRedis();
    if (r) {
      try {
        const raw = await r.hget(OVERRIDE_KEY(accountId), category);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<LineCategoryLimit>;
          if (
            typeof parsed.daily === 'number' &&
            typeof parsed.burst === 'number' &&
            typeof parsed.burstWindowMs === 'number'
          ) {
            return {
              daily: parsed.daily,
              burst: parsed.burst,
              burstWindowMs: parsed.burstWindowMs,
            };
          }
        }
      } catch {
        // ignore redis read error
      }
    }

    return base;
  }

  /**
   * Set custom per-account rate-limit override for one or more categories.
   */
  public async setAccountLimitOverride(
    accountId: number,
    overrides: Partial<Record<LineOpCategory, Partial<LineCategoryLimit>>>,
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<Record<LineOpCategory, LineCategoryLimit>> {
    const defaults =
      accountType === 'OA' ? LINE_OA_DEFAULT_LIMITS : LINE_PERSONAL_DEFAULT_LIMITS;
    const existing = this.customOverrides.get(accountId) ?? {};

    for (const cat of ALL_LINE_OP_CATEGORIES) {
      const incoming = overrides[cat];
      if (!incoming) continue;
      const base = existing[cat] ?? defaults[cat];
      const merged: LineCategoryLimit = {
        daily:
          typeof incoming.daily === 'number' && incoming.daily > 0
            ? incoming.daily
            : base.daily,
        burst:
          typeof incoming.burst === 'number' && incoming.burst > 0
            ? incoming.burst
            : base.burst,
        burstWindowMs:
          typeof incoming.burstWindowMs === 'number' && incoming.burstWindowMs >= 1000
            ? incoming.burstWindowMs
            : base.burstWindowMs,
      };
      existing[cat] = merged;

      const r = await this.getRedis();
      if (r) {
        try {
          await r.hset(OVERRIDE_KEY(accountId), cat, JSON.stringify(merged));
        } catch {
          // ignore
        }
      }
    }

    this.customOverrides.set(accountId, existing);

    const effective: Record<string, LineCategoryLimit> = {};
    for (const cat of ALL_LINE_OP_CATEGORIES) {
      effective[cat] = await this.getEffectiveLimit(accountId, cat, accountType);
    }
    return effective as Record<LineOpCategory, LineCategoryLimit>;
  }

  /**
   * Check whether an operation is allowed for `accountId` + `category`.
   */
  public async checkLimits(
    accountId: number,
    category: LineOpCategory = 'message',
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
    limits: LineCategoryLimit;
  }> {
    const limits = await this.getEffectiveLimit(accountId, category, accountType);
    const r = await this.getRedis();
    if (r) {
      return this.checkRedis(r, accountId, category, limits);
    }
    return this.checkMemory(accountId, category, limits);
  }

  private checkMemory(
    accountId: number,
    category: LineOpCategory,
    limits: LineCategoryLimit,
  ): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
    limits: LineCategoryLimit;
  } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return {
        allowed: false,
        reason: `Đã đạt giới hạn chống khóa tài khoản LINE: tối đa ${limits.daily} thao tác (${category})/ngày`,
        limits,
      };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(key) || []).filter(
      (t) => now - t < limits.burstWindowMs,
    );
    this.recentSends.set(key, recent);

    if (recent.length >= limits.burst) {
      const oldest = recent[0] ?? now;
      const retryAfterMs = Math.max(1000, limits.burstWindowMs - (now - oldest));
      const windowSec = Math.round(limits.burstWindowMs / 1000);
      return {
        allowed: false,
        reason: `Thao tác LINE (${category}) quá nhanh: tối đa ${limits.burst} lần mỗi ${windowSec}s để tránh bị khóa (TalkException Code 35)`,
        retryAfterMs,
        limits,
      };
    }

    return { allowed: true, limits };
  }

  private async checkRedis(
    r: Redis,
    accountId: number,
    category: LineOpCategory,
    limits: LineCategoryLimit,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
    limits: LineCategoryLimit;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dailyKey = DAILY_KEY(accountId, category);
      const dailyVal = await r.hget(dailyKey, today);
      const dailyCount = dailyVal ? parseInt(dailyVal, 10) : 0;

      if (dailyCount >= limits.daily) {
        return {
          allowed: false,
          reason: `Đã đạt giới hạn chống khóa tài khoản LINE: tối đa ${limits.daily} thao tác (${category})/ngày`,
          limits,
        };
      }

      const burstKey = BURST_KEY(accountId, category);
      const now = Date.now();
      await r.zremrangebyscore(burstKey, '-inf', String(now - limits.burstWindowMs));
      const burstCount = await r.zcard(burstKey);
      if (burstCount >= limits.burst) {
        const windowSec = Math.round(limits.burstWindowMs / 1000);
        return {
          allowed: false,
          reason: `Thao tác LINE (${category}) quá nhanh: tối đa ${limits.burst} lần mỗi ${windowSec}s để tránh bị khóa (TalkException Code 35)`,
          retryAfterMs: limits.burstWindowMs,
          limits,
        };
      }

      return { allowed: true, limits };
    } catch {
      return this.checkMemory(accountId, category, limits);
    }
  }

  /**
   * Record a successful operation for daily + burst accounting.
   */
  public async recordOperation(
    accountId: number,
    category: LineOpCategory = 'message',
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<void> {
    const limits = await this.getEffectiveLimit(accountId, category, accountType);
    const r = await this.getRedis();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = DAILY_KEY(accountId, category);
        await r.hincrby(dailyKey, today, 1);
        await r.expire(dailyKey, 86400 * 2);

        const burstKey = BURST_KEY(accountId, category);
        const now = Date.now();
        await r.zadd(burstKey, String(now), `${now}-${Math.random().toString(36).slice(2, 7)}`);
        await r.pexpire(burstKey, Math.max(limits.burstWindowMs * 2, 120_000));
        return;
      } catch {
        // fall through to in-memory
      }
    }

    const key = `${accountId}:${category}`;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const recent = (this.recentSends.get(key) || []).filter(
      (t) => now - t < limits.burstWindowMs,
    );
    recent.push(now);
    this.recentSends.set(key, recent);

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today) {
      daily.count++;
    } else {
      this.dailyCounts.set(key, { count: 1, date: today });
    }
  }

  /**
   * Convenience helper: check limits and record operation if allowed, or throw HTTP 429 Error.
   */
  public async consumeOrThrow(
    accountId: number,
    category: LineOpCategory,
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<void> {
    const check = await this.checkLimits(accountId, category, accountType);
    if (!check.allowed) {
      const err: any = new Error(
        check.reason || `Vượt giới hạn tần suất thao tác LINE (${category})`,
      );
      err.statusCode = 429;
      err.code = 'LINE_RATE_LIMIT_EXCEEDED';
      err.retryAfterMs = check.retryAfterMs;
      throw err;
    }
    await this.recordOperation(accountId, category, accountType);
  }

  /**
   * Monthly Quota Guardrail for LINE Official Accounts (`OA`).
   * Evaluates `monthly_consumption` vs `monthly_quota`.
   * Even at 100% exhaustion, free `reply_token` replies remain allowed (`allowFreeReplyToken: true`).
   */
  public checkOaQuotaGuardrail(account: {
    monthly_quota?: number | null;
    monthly_consumption?: number | null;
  }): LineOaQuotaGuardrailResult {
    const monthlyQuota =
      typeof account.monthly_quota === 'number' && account.monthly_quota > 0
        ? account.monthly_quota
        : null;
    const monthlyConsumption =
      typeof account.monthly_consumption === 'number' && account.monthly_consumption >= 0
        ? account.monthly_consumption
        : 0;

    const usagePct = monthlyQuota
      ? Number(((monthlyConsumption / monthlyQuota) * 100).toFixed(2))
      : 0;

    let status: LineOaQuotaStatus = 'OK';
    if (monthlyQuota) {
      if (usagePct >= 100) {
        status = 'EXHAUSTED_100';
      } else if (usagePct >= 95) {
        status = 'CRITICAL_95';
      } else if (usagePct >= 80) {
        status = 'WARN_80';
      }
    }

    return {
      status,
      usagePct,
      monthlyQuota,
      monthlyConsumption,
      allowPush: usagePct < 100,
      allowFreeReplyToken: true,
    };
  }

  /**
   * Return full rate-limit usage & limit summary for an account across all categories.
   */
  public async getAccountLimitSummary(
    accountId: number,
    accountType: LineAccountType = 'PERSONAL',
  ): Promise<{
    accountId: number;
    accountType: LineAccountType;
    categories: Record<
      LineOpCategory,
      {
        dailyUsed: number;
        dailyLimit: number;
        burstUsed: number;
        burstLimit: number;
        burstWindowMs: number;
      }
    >;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const r = await this.getRedis();
    const categories = {} as Record<
      LineOpCategory,
      {
        dailyUsed: number;
        dailyLimit: number;
        burstUsed: number;
        burstLimit: number;
        burstWindowMs: number;
      }
    >;

    for (const cat of ALL_LINE_OP_CATEGORIES) {
      const limit = await this.getEffectiveLimit(accountId, cat, accountType);
      let dailyUsed = 0;
      let burstUsed = 0;

      if (r) {
        try {
          const dVal = await r.hget(DAILY_KEY(accountId, cat), today);
          dailyUsed = dVal ? parseInt(dVal, 10) : 0;
          await r.zremrangebyscore(
            BURST_KEY(accountId, cat),
            '-inf',
            String(now - limit.burstWindowMs),
          );
          burstUsed = await r.zcard(BURST_KEY(accountId, cat));
        } catch {
          // fallback to memory
        }
      } else {
        const key = `${accountId}:${cat}`;
        const d = this.dailyCounts.get(key);
        dailyUsed = d && d.date === today ? d.count : 0;
        const recent = (this.recentSends.get(key) || []).filter(
          (t) => now - t < limit.burstWindowMs,
        );
        burstUsed = recent.length;
      }

      categories[cat] = {
        dailyUsed,
        dailyLimit: limit.daily,
        burstUsed,
        burstLimit: limit.burst,
        burstWindowMs: limit.burstWindowMs,
      };
    }

    return {
      accountId,
      accountType,
      categories,
    };
  }
}

export const lineRateLimiter = new LineRateLimiter();
