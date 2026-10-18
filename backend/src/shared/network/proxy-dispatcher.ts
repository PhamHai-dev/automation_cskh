/**
 * proxy-dispatcher.ts — Shared persistent per-account proxy dispatcher & anti-ban network helpers.
 *
 * Solves the proxy IP-leak bug where mutating process.env.HTTP_PROXY only during login
 * caused subsequent HTTP/WebSocket calls to leak the server's real IP.
 *
 * Uses undici's ProxyAgent cached by normalized proxyUrl so each account routes all
 * SDK HTTP traffic through its dedicated proxy without global env race conditions.
 */

import { createLogger } from '../logger/logger';

const log = createLogger('ProxyDispatcher');

// Lazy-load undici ProxyAgent (bundled in Node 18+/20+ or node_modules)
let UndiciProxyAgent: any = null;
let undiciFetch: typeof fetch | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const undici = require('undici');
  UndiciProxyAgent = undici.ProxyAgent ?? null;
  undiciFetch = undici.fetch ?? null;
} catch {
  log.warn('undici not available — falling back to globalThis.fetch');
}

const dispatcherCache = new Map<string, any>();

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.internal',
  '100.100.100.200',
  '0.0.0.0',
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks5h:', 'socks4:', 'socks:']);

export interface ProxyValidationResult {
  valid: boolean;
  normalized?: string;
  masked?: string;
  error?: string;
}

/**
 * Validate a proxy URL (`http://`, `https://`, `socks5://`), block SSRF to cloud metadata
 * endpoints (`169.254.169.254`, etc.), and return normalized + masked strings.
 * Empty / null / undefined proxyUrl is considered valid (means "no proxy / direct connection").
 */
export function validateProxyUrl(proxyUrl?: string | null): ProxyValidationResult {
  if (proxyUrl === undefined || proxyUrl === null || proxyUrl.trim() === '') {
    return { valid: true, normalized: '', masked: '' };
  }

  const trimmed = proxyUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'URL proxy không hợp lệ (cần dạng http://user:pass@host:port hoặc socks5://host:port)' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      valid: false,
      error: `Giao thức proxy không được hỗ trợ: ${parsed.protocol} (chỉ hỗ trợ http://, https://, socks5://)`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { valid: false, error: 'Thiếu hostname trong URL proxy' };
  }

  // Block SSRF to cloud metadata IPs and link-local 169.254.x.x
  if (
    BLOCKED_HOSTS.has(hostname) ||
    hostname.startsWith('169.254.') ||
    hostname === '[::1]' ||
    hostname === 'localhost' ||
    hostname.startsWith('127.')
  ) {
    return {
      valid: false,
      error: `Địa chỉ proxy bị chặn vì lý do bảo mật (SSRF protection): ${hostname}`,
    };
  }

  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: `Cổng proxy không hợp lệ: ${parsed.port}` };
    }
  }

  const normalized = parsed.toString().replace(/\/$/, '');
  const masked = maskProxyUrl(trimmed);

  return {
    valid: true,
    normalized,
    masked,
  };
}

/**
 * Mask credentials in a proxy URL for safe logging and UI responses (`http://***:***@host:port`).
 */
export function maskProxyUrl(proxyUrl?: string | null): string {
  if (!proxyUrl || !proxyUrl.trim()) return '';
  try {
    const parsed = new URL(proxyUrl.trim());
    const hasAuth = Boolean(parsed.username || parsed.password);
    const hostPart = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    const authPart = hasAuth ? '***:***@' : '';
    return `${parsed.protocol}//${authPart}${hostPart}`;
  } catch {
    return '****';
  }
}

/**
 * Get or create a cached undici ProxyAgent for a given proxy URL.
 */
export function getOrCreateProxyDispatcher(proxyUrl: string): any | null {
  if (!UndiciProxyAgent) return null;
  let dispatcher = dispatcherCache.get(proxyUrl);
  if (!dispatcher) {
    try {
      dispatcher = new UndiciProxyAgent({
        uri: proxyUrl,
        connectTimeout: 30_000,
      });
      dispatcherCache.set(proxyUrl, dispatcher);
    } catch (err) {
      log.warn('Failed to create Undici ProxyAgent', { proxy: maskProxyUrl(proxyUrl), error: String(err) });
      return null;
    }
  }
  return dispatcher;
}

/**
 * Create a custom `fetch` bound to a persistent `ProxyAgent` when `proxyUrl` is provided.
 * When `proxyUrl` is null/empty, returns `globalThis.fetch`.
 *
 * Compatible with `zca-js` `new Zalo({ polyfill: createProxyFetch(proxyUrl) })` so every
 * SDK HTTP call routes through the account's dedicated proxy without mutating global env.
 */
export function createProxyFetch(proxyUrl?: string | null): typeof fetch {
  if (!proxyUrl || !proxyUrl.trim()) {
    return globalThis.fetch.bind(globalThis);
  }

  const validation = validateProxyUrl(proxyUrl);
  if (!validation.valid || !validation.normalized) {
    log.warn('Invalid proxyUrl passed to createProxyFetch, using default fetch', {
      error: validation.error,
    });
    return globalThis.fetch.bind(globalThis);
  }

  const normalizedUrl = validation.normalized;
  const dispatcher = getOrCreateProxyDispatcher(normalizedUrl);
  const baseFetch: typeof fetch = (undiciFetch ?? globalThis.fetch).bind(globalThis);

  const proxyFetch = ((input: any, init?: any) => {
    const mergedInit = dispatcher
      ? { ...(init ?? {}), dispatcher }
      : { ...(init ?? {}) };
    return baseFetch(input, mergedInit);
  }) as typeof fetch;

  // Attach metadata for inspection/testing
  (proxyFetch as any).__proxyUrl = normalizedUrl;
  (proxyFetch as any).__maskedProxyUrl = validation.masked;
  (proxyFetch as any).__hasDispatcher = Boolean(dispatcher);

  return proxyFetch;
}

/**
 * Clear cached ProxyAgent dispatchers (useful for tests or proxy rotation).
 */
export function clearProxyDispatcherCache(): void {
  dispatcherCache.clear();
}

/**
 * Compute a realistic human typing delay based on message length + random jitter.
 * Helps prevent Zalo/LINE anti-spam detection on automated or rapid CS replies.
 */
export function computeHumanTypingDelayMs(
  text: string,
  minMs: number = 900,
  maxMs: number = 3500,
): number {
  const safeMin = Math.max(0, Math.min(minMs, maxMs));
  const safeMax = Math.max(safeMin, maxMs);
  const charCount = (text ?? '').trim().length;
  // Base ~35ms per character + random jitter in [0, 450]ms, clamped to [safeMin, safeMax]
  const rawDelay = safeMin + charCount * 35 + Math.floor(Math.random() * 450);
  return Math.min(safeMax, Math.max(safeMin, rawDelay));
}

/**
 * Sleep for a randomized duration in `[minMs, maxMs]` to simulate human pacing.
 */
export function sleepWithJitter(minMs: number, maxMs: number): Promise<void> {
  const lo = Math.max(0, Math.min(minMs, maxMs));
  const hi = Math.max(lo, maxMs);
  const delay = lo + Math.floor(Math.random() * (hi - lo + 1));
  return new Promise((resolve) => setTimeout(resolve, delay));
}
