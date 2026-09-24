/**
 * zalo-route-helpers.ts — Shared helpers for Zalo Express route handlers.
 * Ported from ZaloCRM zalo-route-helpers.ts (96 lines, 3.7KB).
 *
 * Adaptations from ZaloCRM:
 *   - FastifyRequest/FastifyReply -> Express Request/Response
 *   - No orgId/tenant context -> single-org
 *   - ZaloOpError: custom error class (ported separately since CRM puts it in
 *     shared/zalo-operations.ts which we simplified to just OpCategory types).
 *   - Account.id is Int (not String).
 *   - user.id is Int (from AuthUser in auth.middleware.ts).
 *   - user.roles: string[] (JSON array in User model), checked via requireRoles middleware.
 *   - ZaloAccount.cs_id = user.id (ownership) — no ownerUserId field.
 *   - ZaloAccountAccess.permission hierarchy: read < chat < admin.
 */
import type { Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloRouteHelpers');

// ─── ZaloOpError ────────────────────────────────────────────────────────────
/**
 * Custom error class for Zalo operations — maps to HTTP status codes.
 * Ported from ZaloCRM shared/zalo-operations.ts ZaloOpError.
 */
export class ZaloOpError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string = 'OPERATION_FAILED', statusCode: number = 500) {
    super(message);
    this.name = 'ZaloOpError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ─── Permission hierarchy ───────────────────────────────────────────────────
export type Permission = 'read' | 'chat' | 'admin';
const hierarchy: Record<Permission, number> = { read: 1, chat: 2, admin: 3 };

/**
 * Validate accountId exists and user owns it (cs_id = user.id for non-admin).
 * Throws ZaloOpError 404 if not found.
 */
export async function resolveAccount(accountId: number, userId: number, isAdmin: boolean) {
  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new ZaloOpError('Account not found', 'NOT_FOUND', 404);
  // Non-admin must own the account (cs_id = userId)
  if (!isAdmin && account.cs_id !== userId) {
    throw new ZaloOpError('Account not found', 'NOT_FOUND', 404);
  }
  return account;
}

/**
 * Check user has sufficient permission on the Zalo account.
 * Returns true if allowed; sends 403 and returns false if denied.
 *
 * Ownership check: user must own the account (cs_id = userId) OR have explicit
 * ZaloAccountAccess row with sufficient permission level.
 * Admin roles bypass ownership check.
 */
export async function checkAccess(
  req: Request,
  res: Response,
  accountId: number,
  minPermission: Permission,
): Promise<boolean> {
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    // Admin/MANAGE: allow all accounts (single-org — no orgId filter needed)
    if (!isAdmin) {
      // Check ownership first (cs_id)
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { cs_id: true },
      });
      if (!account) {
        res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo này' });
        return false;
      }
      // Owner has implicit full access
      if (account.cs_id === user.id) return true;

      // Otherwise check ZaloAccountAccess explicit ACL
      const access = await prisma.zaloAccountAccess.findUnique({
        where: { zalo_account_id_user_id: { zalo_account_id: accountId, user_id: user.id } },
      });
      if (!access) {
        res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo này' });
        return false;
      }
      const userLevel = hierarchy[access.permission as Permission] ?? 0;
      if (userLevel < hierarchy[minPermission]) {
        res.status(403).json({ error: 'Không đủ quyền' });
        return false;
      }
    }
  } catch {
    res.status(500).json({ error: 'Internal error checking access' });
    return false;
  }
  return true;
}

/**
 * Get all Zalo account IDs current user has access to.
 * Owner/admin: all accounts in system (single-org).
 * Non-admin: union explicit ACL + owned accounts (cs_id = user.id).
 *
 * Used by cross-nick aggregate endpoints (e.g. friends-db/all-nicks).
 */
export async function getAccessibleZaloAccountIds(user: {
  id: number;
  roles: string[];
}): Promise<number[]> {
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  if (isAdmin) {
    const accounts = await prisma.zaloAccount.findMany({
      select: { id: true },
    });
    return accounts.map((a) => a.id);
  }

  // Non-admin: union explicit ACL + owned
  const [accessRows, ownedRows] = await Promise.all([
    prisma.zaloAccountAccess.findMany({
      where: { user_id: user.id },
      select: { zalo_account_id: true },
    }),
    prisma.zaloAccount.findMany({
      where: { cs_id: user.id },
      select: { id: true },
    }),
  ]);

  return [
    ...new Set([
      ...accessRows.map((r) => r.zalo_account_id),
      ...ownedRows.map((r) => r.id),
    ]),
  ];
}

/** Map ZaloOpError to Express JSON response, fallback 500 for unknown errors. */
export function handleError(res: Response, err: unknown, op: string) {
  if (err instanceof ZaloOpError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  log.error(`[zalo-routes] ${op} failed`, { error: String(err) });
  return res.status(500).json({ error: 'Internal server error' });
}
