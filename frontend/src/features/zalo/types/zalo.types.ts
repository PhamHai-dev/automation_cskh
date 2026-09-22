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
    username: string;
    full_name: string;
    role: string;
  };
  zalo_uid: string | null;
  display_name: string | null;
  zalo_phone: string | null;
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
