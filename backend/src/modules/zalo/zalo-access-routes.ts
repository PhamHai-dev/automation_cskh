/**
 * zalo-access-routes.ts — Manage per-user permissions on Zalo accounts.
 * Ported from ZaloCRM zalo-access-routes.ts (189 lines) → Express, single-org, Int IDs.
 *
 * Routes (all mount under /api/v1/zalo prefix via zalo.routes.ts):
 *   GET    /:id/access              — list users with access to this account
 *   POST   /:id/access              — grant access { userId, permission } (owner/admin only)
 *   PUT    /:id/access/:accessId    — update permission (owner/admin only)
 *   DELETE /:id/access/:accessId    — revoke access (owner/admin only)
 *
 * Permission levels: read (view) < chat (send) < admin (manage)
 *
 * Adaptations:
 *   - Fastify → Express Router
 *   - No orgId → single-org
 *   - String IDs → Int IDs
 *   - ownerUserId → cs_id ownership check
 *   - user.role → user.roles[] array
 *   - getIo() from event-buffer → socket-singleton emitToUser()
 *   - randomUUID() id → autoincrement (Int)
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { emitToUser } from '../../shared/realtime/socket-singleton';

const log = createLogger('ZaloAccessRoutes');
const router = Router({ mergeParams: true });

const VALID_PERMISSIONS = ['read', 'chat', 'admin'] as const;
type Permission = (typeof VALID_PERMISSIONS)[number];

/**
 * Notify affected user via socket — client refetches nick list without F5.
 * Emits to room `user:${userId}`.
 */
function notifyAccessChanged(
  userId: number,
  zaloAccountId: number,
  action: string,
  permission: string | null,
): void {
  emitToUser(userId, 'zalo:access-changed', { zaloAccountId, action, permission });
}

/**
 * Owner/admin guard: check if current user is owner of nick or admin/MANAGE.
 * Returns true if allowed, sends 403/404 and returns false if denied.
 */
async function isOwnerOrAdmin(req: Request, res: Response, accountId: number): Promise<boolean> {
  const user = req.user!;

  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { cs_id: true },
  });
  if (!account) {
    res.status(404).json({ error: 'Zalo account not found' });
    return false;
  }
  if (account.cs_id === user.id) return true;

  res.status(403).json({ error: 'Không có quyền truy cập tài khoản Zalo của người dùng khác' });
  return false;
}

// GET /:id/access — list users with access to this account
router.get('/:id/access', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.id, 10);
  if (Number.isNaN(accountId)) return res.status(404).json({ error: 'Zalo account not found' });

  if (!(await isOwnerOrAdmin(req, res, accountId))) return;

  const accessList = await prisma.zaloAccountAccess.findMany({
    where: { zalo_account_id: accountId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { created_at: 'asc' },
  });

  return res.json({ access: accessList });
});

// POST /:id/access — grant access { userId, permission } (owner/admin only)
router.post('/:id/access', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.id, 10);
  if (Number.isNaN(accountId)) return res.status(404).json({ error: 'Zalo account not found' });

  if (!(await isOwnerOrAdmin(req, res, accountId))) return;

  const { userId, permission = 'read' } = req.body as { userId?: number; permission?: string };

  if (!userId || !Number.isInteger(userId)) {
    return res.status(400).json({ error: 'userId là bắt buộc' });
  }
  if (!VALID_PERMISSIONS.includes(permission as Permission)) {
    return res.status(400).json({ error: 'permission phải là read, chat hoặc admin' });
  }

  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: 'Zalo account not found' });

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  try {
    const access = await prisma.zaloAccountAccess.create({
      data: { zalo_account_id: accountId, user_id: userId, permission },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    log.info(`Zalo access granted: user ${userId} → account ${accountId} (${permission}) by user ${req.user!.id}`);
    notifyAccessChanged(userId, accountId, 'granted', permission);
    return res.status(201).json(access);
  } catch {
    // Unique constraint violation — access already exists
    return res.status(409).json({ error: 'User đã có quyền truy cập tài khoản này' });
  }
});

// PUT /:id/access/:accessId — update permission (owner/admin only)
router.put('/:id/access/:accessId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.id, 10);
  const accessId = parseInt(req.params.accessId, 10);
  if (Number.isNaN(accountId) || Number.isNaN(accessId)) {
    return res.status(404).json({ error: 'Access record not found' });
  }

  if (!(await isOwnerOrAdmin(req, res, accountId))) return;

  const { permission } = req.body as { permission?: string };
  if (!VALID_PERMISSIONS.includes(permission as Permission)) {
    return res.status(400).json({ error: 'permission phải là read, chat hoặc admin' });
  }

  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: 'Zalo account not found' });

  try {
    const access = await prisma.zaloAccountAccess.update({
      where: { id: accessId },
      data: { permission: permission! },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    // Ensure access belongs to this account
    if (access.zalo_account_id !== accountId) {
      return res.status(404).json({ error: 'Access record not found' });
    }
    log.info(`Zalo access updated: accessId ${accessId} → ${permission} by user ${req.user!.id}`);
    notifyAccessChanged(access.user_id, accountId, 'updated', permission!);
    return res.json(access);
  } catch {
    return res.status(404).json({ error: 'Access record not found' });
  }
});

// DELETE /:id/access/:accessId — revoke access (owner/admin only)
router.delete('/:id/access/:accessId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.id, 10);
  const accessId = parseInt(req.params.accessId, 10);
  if (Number.isNaN(accountId) || Number.isNaN(accessId)) {
    return res.status(404).json({ error: 'Access record not found' });
  }

  if (!(await isOwnerOrAdmin(req, res, accountId))) return;

  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) return res.status(404).json({ error: 'Zalo account not found' });

  try {
    const deleted = await prisma.zaloAccountAccess.delete({ where: { id: accessId } });
    if (deleted.zalo_account_id !== accountId) {
      return res.status(404).json({ error: 'Access record not found' });
    }
    log.info(`Zalo access revoked: accessId ${accessId} by user ${req.user!.id}`);
    notifyAccessChanged(deleted.user_id, accountId, 'revoked', null);
    return res.status(204).send();
  } catch {
    return res.status(404).json({ error: 'Access record not found' });
  }
});

export { router as zaloAccessRouter };
