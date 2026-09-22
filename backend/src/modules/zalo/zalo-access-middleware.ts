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
  const { userId, roles, zaloAccountId, minPermission } = args;

  // Admin/MANAGE → full access to all accounts (single-org)
  if (roles.includes('ADMIN') || roles.includes('MANAGE')) return 'ok';

  // Owner of account (cs_id = userId) → full access
  const account = await prisma.zaloAccount.findUnique({
    where: { id: zaloAccountId },
    select: { cs_id: true },
  });
  if (account?.cs_id === userId) return 'ok';

  // Check explicit ZaloAccountAccess row
  const access = await prisma.zaloAccountAccess.findUnique({
    where: { zalo_account_id_user_id: { zalo_account_id: zaloAccountId, user_id: userId } },
  });
  if (!access) return 'no_grant';

  const userLevel = hierarchy[access.permission as Permission] ?? 0;
  return userLevel >= hierarchy[minPermission] ? 'ok' : 'insufficient';
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
 * Resolves accountId from route params and checks access.
 */
export function requireZaloAccess(minPermission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user!;
    const accountId = parseInt(req.params.accountId || req.params.id, 10);

    // Owner/admin bypass — full access to all accounts
    if (user.roles.includes('ADMIN') || user.roles.includes('MANAGE')) {
      return next();
    }

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
      if (result === 'no_grant') {
        res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo này' });
        return;
      }
      if (result === 'insufficient') {
        res.status(403).json({ error: 'Không đủ quyền' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ error: 'Internal error checking access' });
    }
  };
}
