/**
 * zalo-security-network.test.ts — Unit tests for shared proxy/anti-ban network utilities,
 * safe SDK rate limits (`friend_lookup` anti-ban bounds), and per-account rate-limiter enforcement.
 */

jest.mock('../../../prisma/client', () => ({
  prisma: {
    sdkLimit: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../../shared/queue/redis-connection', () => ({
  getRedisClient: jest.fn(() => null),
}));

import {
  validateProxyUrl,
  maskProxyUrl,
  createProxyFetch,
  computeHumanTypingDelayMs,
  sleepWithJitter,
  clearProxyDispatcherCache,
} from '../../../shared/network/proxy-dispatcher';
import {
  DEFAULT_SDK_LIMITS,
  getEffectiveLimit,
  getAllEffectiveLimits,
  upsertAccountLimit,
  invalidateLimitCache,
} from '../sdk-limit.service';
import { ZaloRateLimiter, RateLimitExceededError } from '../zalo-rate-limiter';
import { prisma } from '../../../prisma/client';

describe('Shared Network & Proxy Dispatcher (proxy-dispatcher.ts)', () => {
  afterEach(() => {
    clearProxyDispatcherCache();
  });

  test('validateProxyUrl accepts valid http, https, and socks5 proxy URLs and masks credentials', () => {
    const res1 = validateProxyUrl('http://user1:secretPass@103.45.67.89:8080');
    expect(res1.valid).toBe(true);
    expect(res1.normalized).toBe('http://user1:secretPass@103.45.67.89:8080');
    expect(res1.masked).toBe('http://***:***@103.45.67.89:8080');

    const res2 = validateProxyUrl('socks5://proxy.example.com:1080');
    expect(res2.valid).toBe(true);
    expect(res2.masked).toBe('socks5://proxy.example.com:1080');

    const emptyRes = validateProxyUrl('');
    expect(emptyRes.valid).toBe(true);
    expect(emptyRes.normalized).toBe('');
  });

  test('validateProxyUrl blocks SSRF to cloud metadata IPs and invalid protocols', () => {
    const awsMeta = validateProxyUrl('http://169.254.169.254:80');
    expect(awsMeta.valid).toBe(false);
    expect(awsMeta.error).toContain('SSRF');

    const localhostProxy = validateProxyUrl('http://127.0.0.1:8888');
    expect(localhostProxy.valid).toBe(false);

    const badProtocol = validateProxyUrl('ftp://103.45.67.89:21');
    expect(badProtocol.valid).toBe(false);

    const malformed = validateProxyUrl('not-a-valid-url');
    expect(malformed.valid).toBe(false);
  });

  test('maskProxyUrl hides username and password', () => {
    expect(maskProxyUrl('http://admin:p@ss@203.0.113.5:3128')).toBe('http://***:***@203.0.113.5:3128');
    expect(maskProxyUrl(null)).toBe('');
  });

  test('createProxyFetch returns bound fetch with proxy metadata when valid proxyUrl is given', () => {
    const directFetch = createProxyFetch(null);
    expect(typeof directFetch).toBe('function');
    expect((directFetch as any).__proxyUrl).toBeUndefined();

    const proxiedFetch = createProxyFetch('http://u:p@203.0.113.10:8080');
    expect(typeof proxiedFetch).toBe('function');
    expect((proxiedFetch as any).__proxyUrl).toBe('http://u:p@203.0.113.10:8080');
    expect((proxiedFetch as any).__maskedProxyUrl).toBe('http://***:***@203.0.113.10:8080');
  });

  test('computeHumanTypingDelayMs clamps delay within [minMs, maxMs] and scales with text length', () => {
    const shortDelay = computeHumanTypingDelayMs('Hi', 900, 3500);
    expect(shortDelay).toBeGreaterThanOrEqual(900);
    expect(shortDelay).toBeLessThanOrEqual(3500);

    const longText = 'Xin chào anh/chị, trung tâm Edura gửi lịch học tuần này cho bé ạ!'.repeat(3);
    const longDelay = computeHumanTypingDelayMs(longText, 900, 3500);
    expect(longDelay).toBe(3500);
  });

  test('sleepWithJitter resolves within expected window', async () => {
    const start = Date.now();
    await sleepWithJitter(5, 15);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(3);
  });
});

describe('SDK Limit Service (sdk-limit.service.ts)', () => {
  beforeEach(() => {
    invalidateLimitCache();
    jest.clearAllMocks();
  });

  test('DEFAULT_SDK_LIMITS enforces safe anti-ban bounds for friend_lookup', () => {
    expect(DEFAULT_SDK_LIMITS.friend_lookup).toEqual({
      daily: 60,
      burst: 4,
      burstWindowMs: 300_000,
    });
    expect(DEFAULT_SDK_LIMITS.stranger_message).toBeDefined();
  });

  test('getAllEffectiveLimits returns all categories with nick overrides prioritized', async () => {
    (prisma.sdkLimit.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.category === 'message') {
        return [
          { zalo_account_id: null, daily_limit: 200, burst_limit: 20, burst_window_ms: 30_000 },
          { zalo_account_id: 42, daily_limit: 120, burst_limit: 10, burst_window_ms: 45_000 },
        ];
      }
      return [];
    });

    const all = await getAllEffectiveLimits(42);
    expect(all.message).toEqual({ daily: 120, burst: 10, burstWindowMs: 45_000 });
    expect(all.friend_lookup).toEqual({ daily: 60, burst: 4, burstWindowMs: 300_000 });
  });

  test('upsertAccountLimit creates or updates limit and invalidates cache', async () => {
    (prisma.sdkLimit.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.sdkLimit.create as jest.Mock).mockResolvedValueOnce({
      id: 1,
      zalo_account_id: 7,
      category: 'friend_lookup',
      daily_limit: 40,
      burst_limit: 3,
      burst_window_ms: 300_000,
    });

    const res = await upsertAccountLimit(7, 'friend_lookup', {
      daily_limit: 40,
      burst_limit: 3,
      burst_window_ms: 300_000,
    });

    expect(res.daily_limit).toBe(40);
    expect(prisma.sdkLimit.create).toHaveBeenCalledTimes(1);
  });
});

describe('ZaloRateLimiter (zalo-rate-limiter.ts)', () => {
  let limiter: ZaloRateLimiter;

  beforeEach(() => {
    invalidateLimitCache();
    (prisma.sdkLimit.findMany as jest.Mock).mockResolvedValue([]);
    limiter = new ZaloRateLimiter();
  });

  test('blocks friend_lookup when burst limit (4 per 300s) is reached', async () => {
    const accountId = 101;
    for (let i = 0; i < 4; i++) {
      const check = await limiter.checkLimits(accountId, 'friend_lookup');
      expect(check.allowed).toBe(true);
      await limiter.recordSend(accountId, 'friend_lookup');
    }

    const fifth = await limiter.checkLimits(accountId, 'friend_lookup');
    expect(fifth.allowed).toBe(false);
    expect(fifth.reason).toContain('Quá nhanh');
  });

  test('consumeOrThrow throws 429 RateLimitExceededError when burst or daily limit exceeded', async () => {
    const accountId = 202;
    (prisma.sdkLimit.findMany as jest.Mock).mockResolvedValue([
      { zalo_account_id: accountId, daily_limit: 2, burst_limit: 2, burst_window_ms: 60_000 },
    ]);

    await limiter.consumeOrThrow(accountId, 'message');
    await limiter.consumeOrThrow(accountId, 'message');

    await expect(limiter.consumeOrThrow(accountId, 'message')).rejects.toThrow(
      RateLimitExceededError,
    );

    try {
      await limiter.consumeOrThrow(accountId, 'message');
    } catch (err: any) {
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    }
  });

  test('getAccountRateLimitSummary computes usedToday, remainingToday, and usagePct', async () => {
    const accountId = 303;
    await limiter.recordSend(accountId, 'friend_lookup');
    await limiter.recordSend(accountId, 'friend_lookup');
    await limiter.recordSend(accountId, 'friend_lookup');

    const summary = await limiter.getAccountRateLimitSummary(accountId);
    const lookupItem = summary.find((s) => s.category === 'friend_lookup');
    expect(lookupItem).toBeDefined();
    expect(lookupItem!.usedToday).toBe(3);
    expect(lookupItem!.dailyLimit).toBe(60);
    expect(lookupItem!.remainingToday).toBe(57);
    expect(lookupItem!.usagePct).toBe(5);
  });
});
