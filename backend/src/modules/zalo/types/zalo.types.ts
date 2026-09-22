/**
 * Shared types for the Zalo module.
 * Covers: pool, QR, sessions, listeners, friends, groups, delivery.
 */

// ─── Zalo Session (what zca-js stores) ──────────────────────────────────────

export interface ZaloSessionData {
  cookies: Record<string, string>;
  gtoken?: string;
  oa_token?: string;
  imei?: string;
  userAgent?: string;
  secretKey?: string;
  [key: string]: unknown; // allow future zca-js fields
}

// ─── Pool ───────────────────────────────────────────────────────────────────

export enum PoolAccountStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  RECONNECTING = 'RECONNECTING',
  EXPIRED = 'EXPIRED',
  BANNED = 'BANNED',
  ERROR = 'ERROR',
}

export interface PoolAccount {
  accountId: number;
  csId: number;
  zaloUid?: string;
  displayName?: string;
  status: PoolAccountStatus;
  client: unknown; // zca-js API instance — typed as unknown to avoid hard dep
  lastActiveAt?: Date;
  lastConnectedAt?: Date;
  proxyUrl?: string;
}

export interface PoolEvent {
  type: 'qr:generated' | 'qr:scanned' | 'session:connected' | 'session:expired'
    | 'session:banned' | 'session:error' | 'message:received' | 'friend:added'
    | 'group:updated';
  accountId: number;
  data?: unknown;
}

// ─── QR ─────────────────────────────────────────────────────────────────────

export interface QrResult {
  qrDataUrl: string; // data:image/png;base64,...
  qrTimeoutMs: number;
  accountId: number;
}

// ─── Message (incoming/outgoing) ────────────────────────────────────────────

export enum MessageChannel {
  ZALO_PERSONAL = 'ZALO_PERSONAL',
  ZALO_GROUP = 'ZALO_GROUP',
  LINE = 'LINE',
}

export interface IncomingMessage {
  accountId: number;
  threadId: string; // sender uid or group id
  uidFrom: string;
  displayName: string;
  content: string;
  timestamp: Date;
  isGroup: boolean;
}

export interface OutgoingMessage {
  accountId: number;
  threadId: string;
  content: string;
  channel: MessageChannel;
}

// ─── Friend sync ────────────────────────────────────────────────────────────

export interface ZaloFriend {
  uid: string;
  displayName: string;
  avatar?: string;
  isFriend: boolean;
  status: 'FRIEND' | 'STRANGER' | 'BLOCKED';
}

// ─── Group sync ─────────────────────────────────────────────────────────────

export interface ZaloGroupInfo {
  groupId: string;
  name: string;
  avatar?: string;
  memberCount: number;
  ownerUid?: string;
}

export interface ZaloGroupMember {
  uid: string;
  displayName: string;
  avatar?: string;
}

// ─── Rate limiter ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max messages per account per minute */
  maxPerMinute: number;
  /** Max messages per account per hour */
  maxPerHour: number;
  /** Delay between consecutive sends (ms) */
  sendDelayMs: number;
  /** Max concurrent connections in pool */
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxPerMinute: 10,
  maxPerHour: 200,
  sendDelayMs: 1500,
  maxConcurrent: 5,
};
