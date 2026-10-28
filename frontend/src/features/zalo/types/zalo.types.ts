/**
 * Shared types for the Zalo frontend feature.
 * Mirrors backend zalo.types.ts.
 */

export type ZaloAccountStatus =
  | 'NOT_LOGGED_IN'
  | 'QR_PENDING'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'BANNED'
  | 'DISABLED'
  | 'ERROR';

export interface ZaloAccount {
  id: number;
  cs_id: number;
  cs?: {
    id: number;
    username?: string;
    full_name?: string;
    name?: string;
    code?: string;
    staff_code?: string;
    email?: string;
    role?: string;
  };
  zalo_uid: string | null;
  display_name: string | null;
  zalo_phone: string | null;
  avatar_url: string | null;
  status: ZaloAccountStatus;
  proxy_url: string | null;
  last_connected_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  qr_code: string | null;
  created_at: string;
  updated_at: string;
  // Live pool status (may differ from DB status)
  liveStatus: ZaloAccountStatus | null;
}

export interface CreateZaloAccountDTO {
  cs_id: number;
  display_name?: string;
  zalo_phone?: string;
  proxy_url?: string;
}

export interface UpdateZaloAccountDTO {
  display_name?: string;
  zalo_phone?: string;
  proxy_url?: string;
  status?: ZaloAccountStatus;
}

export interface QrLoginResult {
  qrDataUrl: string;
  qrTimeoutMs: number;
  accountId: number;
}

export interface ZaloFriend {
  uid: string;
  displayName: string;
  avatar?: string;
  isFriend: boolean;
  status: 'FRIEND' | 'STRANGER' | 'BLOCKED';
}

export interface ZaloGroupInfo {
  groupId: string;
  name: string;
  avatar?: string;
  memberCount: number;
  ownerUid?: string;
}

export const ZALO_STATUS_LABELS: Record<ZaloAccountStatus, string> = {
  NOT_LOGGED_IN: 'Chưa đăng nhập',
  QR_PENDING: 'Đang quét QR',
  CONNECTING: 'Đang kết nối',
  ACTIVE: 'Đã kết nối',
  EXPIRED: 'Hết hạn',
  BANNED: 'Bị khóa',
  DISABLED: 'Vô hiệu hóa',
  ERROR: 'Lỗi',
};

export const ZALO_STATUS_COLORS: Record<ZaloAccountStatus, string> = {
  NOT_LOGGED_IN: 'bg-gray-100 text-gray-600',
  QR_PENDING: 'bg-yellow-100 text-yellow-700',
  CONNECTING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
  BANNED: 'bg-red-100 text-red-700',
  DISABLED: 'bg-gray-100 text-gray-400',
  ERROR: 'bg-red-100 text-red-700',
};

// ── Socket.IO realtime event payloads (backed by backend zalo-pool/listener emits) ──

export interface ZaloSocketStatusEvent {
  accountId: number;
  status: string; // ACTIVE | EXPIRED | ERROR | NOT_LOGGED_IN | QR_PENDING
  reason?: string; // disconnect | circuit_breaker | manual | ...
}

export interface ZaloSocketQrEvent {
  accountId: number;
  qrDataUrl: string;
}

export interface ZaloSocketMessageEvent {
  accountId: number;
  threadId: string;
  senderUid: string;
  displayName: string;
  content: string;
  timestamp: string;
  isGroup: boolean;
  contentType?: string;
}

export interface ZaloSocketTypingEvent {
  accountId: number;
  threadId: string;
  uidFrom: string;
  ts: number;
}

export interface ZaloSocketFriendEvent {
  accountId: number;
  type: number | string;
  threadId?: string;
  uid?: string;
  newStatus?: string;
  alias?: string | null;
}

export interface ZaloSocketGroupEvent {
  accountId: number;
  type: string;
  groupId: string;
}

export interface ZaloSocketUndoEvent {
  accountId: number;
  globalMsgId: string;
  cliMsgId?: string;
}

export interface ZaloSocketSyncEvent {
  accountId: number;
  trigger: string;
  liveCount: number;
  upsertedFriends: number;
  emittedCount: number;
  errors: number;
  durationMs: number;
  skipped: string | null;
}

/** Union of all zalo:* events a client can receive. */
export type ZaloSocketEvent =
  | { event: 'zalo:status'; data: ZaloSocketStatusEvent }
  | { event: 'zalo:qr'; data: ZaloSocketQrEvent }
  | { event: 'zalo:message'; data: ZaloSocketMessageEvent }
  | { event: 'zalo:typing'; data: ZaloSocketTypingEvent }
  | { event: 'zalo:friend-update'; data: ZaloSocketFriendEvent }
  | { event: 'zalo:group-update'; data: ZaloSocketGroupEvent }
  | { event: 'zalo:undo'; data: ZaloSocketUndoEvent }
  | { event: 'zalo:sync-complete'; data: ZaloSocketSyncEvent };

// ── Deferred features: reactions / polls / mentions / reply-quote ─────────

export interface ReactionEntry {
  rType: string; // emoji unicode e.g. "❤️"
  uids: string[]; // userIds who reacted
}

export interface ReactionView {
  emoji: string;
  count: number;
  reactedBySelf: boolean;
}

export interface ReactionDetailUser {
  uid: string;
  name?: string;
  avatarUrl?: string | null;
}

export interface PollOption {
  id: number;
  text: string;
  votes: number;
  votedBySelf: boolean;
  voterUids?: string[];
}

export interface PollView {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  allowMulti: boolean;
  anonymous: boolean;
  expiresAt?: string | null;
  createdBy?: string;
}

export interface MentionMeta {
  uid: string;
  pos: number;
  len: number;
  type: number; // 0 = user
}

export interface QuoteRef {
  msgId: string;
  senderName?: string;
  content?: string;
  contentType?: string;
}

