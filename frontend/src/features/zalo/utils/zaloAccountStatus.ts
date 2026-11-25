import type { ZaloAccount, ZaloAccountStatus } from '../types/zalo.types';

const STATUS_MAP: Record<string, ZaloAccountStatus> = {
  active: 'ACTIVE',
  connected: 'ACTIVE',
  not_logged_in: 'NOT_LOGGED_IN',
  disconnected: 'NOT_LOGGED_IN',
  qr_pending: 'QR_PENDING',
  connecting: 'CONNECTING',
  expired: 'EXPIRED',
  banned: 'BANNED',
  disabled: 'DISABLED',
  error: 'ERROR',
};

/** The HTTP API exposes pool names as well as persisted account enum values. */
export function normalizeZaloStatus(status: unknown): ZaloAccountStatus | null {
  return typeof status === 'string' ? STATUS_MAP[status.trim().toLowerCase()] ?? null : null;
}

export function normalizeZaloAccount(account: ZaloAccount): ZaloAccount {
  const status = normalizeZaloStatus(account.status) ?? 'ERROR';
  return {
    ...account,
    status,
    liveStatus: status === 'DISABLED' || status === 'BANNED'
      ? status
      : normalizeZaloStatus(account.liveStatus),
  };
}
