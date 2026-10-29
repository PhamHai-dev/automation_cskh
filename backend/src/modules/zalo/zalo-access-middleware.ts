/**
 * zalo-access-middleware.ts — Permission check for Zalo account access.
 * Ported from ZaloCRM zalo-access-middleware.ts (108 lines) → Express, single-org, Int IDs.
 *
 * Permission hierarchy: admin > chat > read
 * Owner/admin roles bypass the check (access to all accounts).
 * Owner of account (cs_id = userId) always has full permission.
 *
 * Adaptations:
 *   - FastifyRequest/FastifyReply → Express Request/Response
 *   - orgId → bypass (single-org)
 *   - ownerUserId → cs_id (single-org ownership)
 *   - String accountId → Int accountId
 *   - user.role → user.roles[] (JSON array in User model)
 */
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../prisma/client';

export type Permission = 'read' | 'chat' | 'admin';

const hierarchy: Record<Permission, number> = { read: 1, chat: 2, admin: 3 };

export type ZaloAccessResult = 'ok' | 'no_grant' | 'insufficient';

/**
 * Core access check logic — pure, no HTTP dependency.
 * Returns 'ok', 'no_grant', or 'insufficient'.
 */
export async function checkZaloAccess(args: {
  userId: number;
  roles: string[];
  zaloAccountId: number;
  minPermission: Permission;
}): Promise<ZaloAccessResult> {
  const { userId, zaloAccountId } = args;

  // Strict per-user ownership isolation: only the user who logged in the account (cs_id === userId) can access it
  const account = await prisma.zaloAccount.findUnique({
    where: { id: zaloAccountId },
    select: { cs_id: true },
  });
  if (account?.cs_id === userId) return 'ok';
  return 'no_grant';
}

/**
 * Boolean convenience — returns true if user has sufficient access.
 */
export async function hasZaloAccess(args: {
  userId: number;
  roles: string[];
  zaloAccountId: number;
  minPermission: Permission;
}): Promise<boolean> {
  return (await checkZaloAccess(args)) === 'ok';
}

/**
 * Express middleware factory: requireZaloAccess(minPermission)
 * Resolves accountId from route params and checks strict per-user ownership.
 */
export function requireZaloAccess(minPermission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user!;
    const accountId = parseInt(req.params.accountId || req.params.id, 10);

    if (!accountId || Number.isNaN(accountId)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    try {
      const result = await checkZaloAccess({
        userId: user.id,
        roles: user.roles,
        zaloAccountId: accountId,
        minPermission,
      });
      if (result !== 'ok') {
        res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo của người dùng khác' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'Internal error checking access' });
    }
  };
}
