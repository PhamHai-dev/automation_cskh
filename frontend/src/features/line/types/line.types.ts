/**
 * Shared types for the LINE Hybrid frontend feature (OA + Personal).
 * Mirrors backend `/api/v1/line` routes and Prisma models.
 */

export type LineAccountType = 'OA' | 'PERSONAL';

export type LineAccountStatus =
  | 'QR_PENDING'
  | 'PIN_REQUIRED'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'NOT_LOGGED_IN'
  | 'EXPIRED'
  | 'BANNED'
  | 'DISABLED';

export interface LineAccount {
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
  account_type: LineAccountType;
  line_mid: string | null;
  basic_id: string | null;
  display_name: string | null;
  line_phone: string | null;
  avatar_url: string | null;
  status: LineAccountStatus;
  qr_code: string | null;
  pin_code: string | null;
  webhook_secret: string | null;
  monthly_quota: number | null;
  monthly_consumption: number | null;
  proxy_url: string | null;
  last_connected_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  last_sync_error: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  liveStatus?: LineAccountStatus | null;
}

export interface CreateLineAccountDTO {
  cs_id?: number;
  account_type: LineAccountType;
  display_name?: string;
  line_phone?: string;
  proxy_url?: string;
  // OA fields
  basic_id?: string;
  channel_id?: string;
  channel_secret?: string;
  channel_access_token?: string;
}

export interface UpdateOaCredentialsDTO {
  display_name?: string;
  basic_id?: string;
  channel_id?: string;
  channel_secret?: string;
  channel_access_token?: string;
}

export interface LineQrLoginResult {
  accountId: number;
  qrDataUrl?: string | null;
  qrUrl?: string | null;
  pinCode?: string | null;
  status?: LineAccountStatus;
}

export interface LineFriend {
  id: number;
  line_account_id: number;
  line_uid_in_nick: string;
  friendship_status: string;
  relationship_kind: string;
  alias_in_nick: string | null;
  has_conversation: boolean;
  phone_from_sdk: string | null;
  line_display_name: string | null;
  line_avatar_url: string | null;
  status_message: string | null;
  first_message_at?: string | null;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
  total_inbound?: number;
  total_outbound?: number;
  became_friend_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineGroupInfo {
  id: number;
  line_group_id: string;
  name: string | null;
  avatar_url: string | null;
  member_count: number | null;
  owner_line_uid: string | null;
  line_account_id: number;
  last_synced_at: string | null;
  created_at?: string;
  updated_at?: string;
  line_account?: {
    id: number;
    display_name: string | null;
    account_type: LineAccountType;
    basic_id?: string | null;
  };
}

export interface LineConversation {
  id: number;
  line_account_id?: number;
  external_thread_id?: string;
  externalThreadId?: string;
  thread_type?: string;
  threadType?: string;
  display_name?: string | null;
  displayName?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  group_name?: string | null;
  groupName?: string | null;
  group_avatar_url?: string | null;
  groupAvatarUrl?: string | null;
  group_members_count?: number | null;
  groupMembersCount?: number | null;
  reply_token?: string | null;
  replyToken?: string | null;
  reply_token_expires_at?: string | null;
  replyTokenExpiresAt?: string | null;
  last_message_at?: string | null;
  lastMessageAt?: string | null;
  unread_count?: number;
  unreadCount?: number;
  is_replied?: boolean;
  isReplied?: boolean;
  tab?: string;
  lastMessage?: {
    content: string;
    contentType?: string;
    content_type?: string;
    senderUid?: string;
    sender_uid?: string;
    senderName?: string | null;
    sender_name?: string | null;
    timestamp: string;
    isSelf?: boolean;
    is_self?: boolean;
  } | null;
}

export interface LineMessage {
  id: number;
  conversation_id?: number;
  line_msg_id?: string;
  lineMsgId?: string;
  quote_token?: string | null;
  sender_uid?: string;
  senderUid?: string;
  sender_name?: string | null;
  senderName?: string | null;
  sender_type?: string;
  senderType?: string;
  content: string;
  content_type?: string;
  contentType?: string;
  attachments?: any;
  quote?: any;
  mentions?: any;
  reactions?: any;
  is_self?: boolean;
  isSelf?: boolean;
  is_deleted?: boolean;
  isDeleted?: boolean;
  sent_via?: string;
  sentVia?: string;
  timestamp: string;
  created_at?: string;
}

export interface LineStudentLink {
  id: number;
  student_id: number;
  line_account_id: number;
  relation_status: 'FRIEND' | 'STRANGER' | 'UNKNOWN' | 'BLOCKED';
  display_name: string | null;
  avatar_url: string | null;
  friend_line_uid: string | null;
  link_code: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  student?: {
    id: number;
    full_name: string;
    phone?: string | null;
    email?: string | null;
    line_uid?: string | null;
    enrollments?: any[];
  };
  line_account?: {
    id: number;
    display_name: string | null;
    account_type: LineAccountType;
    basic_id?: string | null;
    avatar_url?: string | null;
  };
}

export interface LineSuggestLinkItem {
  student: { id: number; full_name: string; phone: string };
  friend: {
    line_uid: string;
    line_uid_in_nick?: string;
    display_name: string | null;
    line_display_name?: string | null;
    phone_from_sdk: string | null;
    line_account_id: number;
    avatar_url?: string | null;
  };
  lineAccount?: { id: number; display_name: string | null; account_type?: LineAccountType };
  alreadyLinked?: boolean;
}

export interface LineDeepLinkResult {
  linkCode: string;
  deepLinkUrl: string;
  basicId?: string | null;
  relation?: LineStudentLink;
}

export const LINE_STATUS_LABELS: Record<LineAccountStatus, string> = {
  NOT_LOGGED_IN: 'Chưa đăng nhập',
  QR_PENDING: 'Đang chờ quét QR',
  PIN_REQUIRED: 'Nhập mã PIN 6 số',
  CONNECTING: 'Đang kết nối',
  ACTIVE: 'Đang hoạt động',
  EXPIRED: 'Phiên hết hạn',
  BANNED: 'Bị hạn chế',
  DISABLED: 'Vô hiệu hóa',
};

export const LINE_STATUS_COLORS: Record<LineAccountStatus, string> = {
  NOT_LOGGED_IN: 'bg-gray-100 text-gray-600',
  QR_PENDING: 'bg-yellow-100 text-yellow-700',
  PIN_REQUIRED: 'bg-amber-100 text-amber-800 border border-amber-300',
  CONNECTING: 'bg-blue-100 text-blue-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
  BANNED: 'bg-red-100 text-red-700',
  DISABLED: 'bg-gray-100 text-gray-400',
};

// ── Socket.IO realtime events for LINE ───────────────────────────────────────

export interface LineSocketQrEvent {
  accountId: number;
  qrDataUrl?: string;
  qrUrl?: string;
}

export interface LineSocketPinEvent {
  accountId: number;
  pinCode: string;
}

export interface LineSocketStatusEvent {
  accountId: number;
  status: LineAccountStatus;
  reason?: string;
  pinCode?: string | null;
}

export interface LineSocketMessageEvent {
  accountId: number;
  threadId: string;
  senderUid: string;
  displayName?: string;
  content: string;
  timestamp: string;
  isGroup?: boolean;
  contentType?: string;
  replyTokenExpiresAt?: string | null;
}
