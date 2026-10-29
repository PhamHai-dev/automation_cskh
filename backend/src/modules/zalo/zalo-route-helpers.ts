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
export async function resolveAccount(accountId: number, userId: number, _isAdmin?: boolean) {
  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new ZaloOpError('Account not found', 'NOT_FOUND', 404);
  // Strict per-user isolation: every user (including ADMIN & MANAGE) only accesses their own Zalo accounts
  if (account.cs_id !== userId) {
    throw new ZaloOpError('Không có quyền truy cập tài khoản Zalo của người dùng khác', 'FORBIDDEN', 403);
  }
  return account;
}

/**
 * Check user has sufficient permission on the Zalo account.
 * Returns true if allowed; sends 403 and returns false if denied.
 *
 * Strict per-user isolation: user must own the account (cs_id = userId).
 */
export async function checkAccess(
  req: Request,
  res: Response,
  accountId: number,
  _minPermission: Permission,
): Promise<boolean> {
  const user = req.user!;

  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { cs_id: true },
    });
    if (!account || account.cs_id !== user.id) {
      res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo của người dùng khác' });
      return false;
    }
    return true;
  } catch {
    res.status(500).json({ error: 'Internal error checking access' });
    return false;
  }
}

/**
 * Get all Zalo account IDs current user has access to.
 * Strict per-user isolation: only accounts owned by user (cs_id = user.id).
 */
export async function getAccessibleZaloAccountIds(user: {
  id: number;
  roles: string[];
}): Promise<number[]> {
  const ownedRows = await prisma.zaloAccount.findMany({
    where: { cs_id: user.id },
    select: { id: true },
  });
  return ownedRows.map((r) => r.id);
}

/** Map ZaloOpError to Express JSON response, fallback 500 for unknown errors. */
export function handleError(res: Response, err: unknown, op: string) {
  if (err instanceof ZaloOpError) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }
  log.error(`[zalo-routes] ${op} failed`, { error: String(err) });
  return res.status(500).json({ error: 'Internal server error' });
}
