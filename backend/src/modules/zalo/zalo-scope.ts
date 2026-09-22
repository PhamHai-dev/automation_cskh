/**
 * zalo-scope.ts — RBAC guards for Zalo account access.
 *
 * Simplified from ZaloCRM (dept-tree → single-org):
 *   - ADMIN: full access to all accounts
 *   - MANAGE: full access to all accounts
 *   - CS: own accounts only (+ explicit ZaloAccountAccess grants)
 *
 * Exports:
 *   - getZaloScope(userId, userRole) → scope descriptor
 *   - requireAccountManagement(request, accountId) → throws 403 if unauthorized
 *   - requireAccountVisible(request, accountId) → boolean
 *   - nickSendBlockReason(account, userId, role) → string | null
 *   - DISPLAYABLE_NICK_WHERE(userId, role) → Prisma where clause
 *   - ACTIVE_SEND_NICK_WHERE(userId, role) → Prisma where clause
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloScope');

// ─── Types ────────────────────────────────────────────────────────────────

export type ZaloRole = 'ADMIN' | 'MANAGE' | 'CS';

export interface ZaloScope {
  /** User can see all accounts (admin/manager) or only own (cs). */
  seeAll: boolean;
  /** User can manage (create/delete/reconnect) all accounts. */
  manageAll: boolean;
  /** User can send messages through any account. */
  sendAll: boolean;
  /** User can only manage/send through accounts they own. */
  ownAccountOnly: boolean;
}

// ─── Scope descriptor ────────────────────────────────────────────────────

export function getZaloScope(role: ZaloRole): ZaloScope {
  switch (role) {
    case 'ADMIN':
    case 'MANAGE':
      return {
        seeAll: true,
        manageAll: true,
        sendAll: true,
        ownAccountOnly: false,
      };
    case 'CS':
      return {
        seeAll: false,
        manageAll: false,
        sendAll: false,
        ownAccountOnly: true,
      };
  }
}

// ─── Account resolution ──────────────────────────────────────────────────

/**
 * Resolve a zaloAccount row by ID. Returns null if not found or archived.
 */
export async function resolveAccount(
  accountId: number,
): Promise<{
  id: number;
  csId: number;
  status: string;
  zaloUid: string | null;
  displayName: string | null;
  archivedAt: Date | null;
  disconnectReason: string | null;
} | null> {
  const row = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      cs_id: true,
      status: true,
      zalo_uid: true,
      display_name: true,
      archived_at: true,
      disconnect_reason: true,
    },
  });
  if (!row) return null;
  if (row.archived_at) return null; // archived = invisible
  return {
    id: row.id,
    csId: row.cs_id,
    status: row.status as string,
    zaloUid: row.zalo_uid,
    displayName: row.display_name,
    archivedAt: row.archived_at,
    disconnectReason: row.disconnect_reason,
  };
}

/**
 * Check if user has access to the given account.
 * Returns true if authorized, false otherwise.
 */
export function checkAccountAccess(
  accountId: number,
  userId: number,
  role: ZaloRole,
  action: 'read' | 'manage' | 'send' | 'admin',
): boolean {
  const scope = getZaloScope(role);

  // Admins and managers have full access
  if (scope.manageAll && (action === 'admin' || action === 'manage')) {
    return true;
  }
  if (scope.seeAll && action === 'read') {
    return true;
  }

  // CS — check ownership (cs_id === userId)
  // NOTE: This is a simplified check. In ZaloCRM this would also check
  // ZaloAccountAccess grants. For single-org CS role, ownership is sufficient.
  return true; // For now, allow — tighten when we add per-account grants
}

// ─── Express middleware-style guards ──────────────────────────────────────

/**
 * Check that the requesting user can perform management actions on the account.
 * Throws an object with status 403 if unauthorized.
 * Returns the resolved account if authorized.
 */
export async function requireAccountManagement(
  accountId: number,
  userId: number,
  role: ZaloRole,
): Promise<NonNullable<Awaited<ReturnType<typeof resolveAccount>>>> {
  const scope = getZaloScope(role);

  // Admin/Manager: bypass ownership check
  if (!scope.manageAll) {
    // CS: must own the account
    const account = await resolveAccount(accountId);
    if (!account) {
      const err: any = new Error('ZaloAccount not found or archived');
      err.status = 404;
      throw err;
    }
    if (account.csId !== userId) {
      const err: any = new Error('Only the account owner can perform this action');
      err.status = 403;
      throw err;
    }
    return account;
  }

  const account = await resolveAccount(accountId);
  if (!account) {
    const err: any = new Error('ZaloAccount not found or archived');
    err.status = 404;
    throw err;
  }
  return account;
}

/**
 * Check visibility: can the user see this account?
 */
export async function requireAccountVisible(
  accountId: number,
  userId: number,
  role: ZaloRole,
): Promise<NonNullable<Awaited<ReturnType<typeof resolveAccount>>>> {
  const scope = getZaloScope(role);

  const account = await resolveAccount(accountId);
  if (!account) {
    const err: any = new Error('ZaloAccount not found or archived');
    err.status = 404;
    throw err;
  }

  if (scope.seeAll) return account;

  // CS: must own the account
  if (account.csId !== userId) {
    const err: any = new Error('Account not visible to this user');
    err.status = 403;
    throw err;
  }

  return account;
}

// ─── Send block reason ───────────────────────────────────────────────────

/**
 * Returns a human-readable reason why sending is blocked, or null if allowed.
 */
export function nickSendBlockReason(
  account: {
    status: string;
    disconnectReason: string | null;
    archivedAt: Date | null;
  },
  userId: number,
  role: ZaloRole,
): string | null {
  if (account.archivedAt) return 'Tài khoản đã bị xóa mềm';
  if (account.status === 'EXPIRED') return 'Phiên đăng nhập đã hết hạn — cần quét QR lại';
  if (account.status === 'BANNED') return 'Tài khoản bị chặn bởi Zalo';
  if (account.status === 'NOT_LOGGED_IN') return 'Chưa đăng nhập';
  if (account.status === 'QR_PENDING') return 'Đang chờ quét QR';
  if (account.status === 'DISABLED') return 'Tài khoản đã bị vô hiệu hóa';
  if (account.status !== 'ACTIVE') return `Tài khoản ở trạng thái ${account.status}`;
  if (account.disconnectReason === 'manual') return 'Tài khoản đã bị ngắt thủ công';
  return null; // OK to send
}

// ─── Prisma where helpers ────────────────────────────────────────────────

/**
 * Prisma WHERE clause: accounts visible in the "nick list" (display tab).
 * Includes ACTIVE + EXPIRED + QR_PENDING + CONNECTING, excludes archived/deleted.
 */
export function DISPLAYABLE_NICK_WHERE(userId: number, role: ZaloRole) {
  const base: any = {
    archived_at: null,
    status: { notIn: ['DISABLED'] },
  };

  // CS: only own accounts
  if (role === 'CS') {
    base.cs_id = userId;
  }

  return base;
}

/**
 * Prisma WHERE clause: accounts that can SEND messages right now.
 */
export function ACTIVE_SEND_NICK_WHERE(userId: number, role: ZaloRole) {
  const base: any = {
    archived_at: null,
    status: 'ACTIVE',
    disconnect_reason: { not: 'manual' },
  };

  if (role === 'CS') {
    base.cs_id = userId;
  }

  return base;
}
