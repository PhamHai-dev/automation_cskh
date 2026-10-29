/**
 * group-routes.ts — Group info, CRUD, and membership management.
 * Ported from ZaloCRM group-routes.ts (183 lines, 10.5KB) → Express, single-org Int IDs.
 *
 * Routes (BASE = /:accountId/groups):
 *   GET    /           — list all groups (enriched with name/memberCount)
 *   GET    /:groupId   — group detail info
 *   GET    /:groupId/members — group member list with profiles
 *   POST   /           — create group { name, memberIds }
 *   PATCH  /:groupId/name     — rename group { name }
 *   PATCH  /:groupId/settings — update group settings
 *   POST   /:groupId/members  — add members { userIds }
 *   DELETE /:groupId/members  — remove members { userIds }
 *   POST   /:groupId/deputies — add deputy { userId }
 *   DELETE /:groupId/deputies/:userId — remove deputy
 *   POST   /:groupId/transfer — transfer ownership { newOwnerId }
 *
 * Adaptations from ZaloCRM:
 *   - Fastify → Express Router/Request/Response
 *   - zaloOps.getAllGroups/getGroupInfo → client.api.getAllGroups/getGroupInfo
 *   - resolveAccount(accountId, request.user!.orgId) → resolveAccount(accountId, user.id, isAdmin)
 *   - No orgId/tenant — single-org
 *   - checkAccess helpers from zalo-route-helpers
 */
import { Router, Request, Response } from 'express';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers';

const log = createLogger('ZaloGroupRoutes');
const router = Router({ mergeParams: true });

/**
 * Helper: resolve account or throw 404 if not found / not owned.
 */
async function ensureAccount(accountId: number, userId: number, _isAdmin?: boolean) {
  const { prisma } = await import('../../prisma/client');
  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) throw Object.assign(new Error('Account not found'), { code: 'NOT_FOUND', statusCode: 404 });
  if (account.cs_id !== userId) {
    throw Object.assign(new Error('Không có quyền truy cập tài khoản Zalo của người dùng khác'), { code: 'FORBIDDEN', statusCode: 403 });
  }
  return account;
}

// ── Group Info ──────────────────────────────────────────────────────────────

/**
 * GET /:accountId/groups — list all Zalo groups (SDK, enriched with names).
 * zca-js getAllGroups() returns { gridVerMap:{id:ver}, gridInfoMap:{id:{...}} }
 * NOT an array. Normalize to [{id,name,totalMember}].
 * Missing names are fetched in chunks of 50 via getGroupInfo.
 */
router.get('/:accountId/groups', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });

    type GInfo = { name?: string; groupName?: string; totalMember?: number; memberCount?: number; memVerList?: unknown[] };
    const raw = await client.api.getAllGroups() as {
      gridVerMap?: Record<string, unknown>;
      gridInfoMap?: Record<string, GInfo>;
    } | null;
    const verMap = raw?.gridVerMap ?? {};
    const infoMap: Record<string, GInfo> = { ...(raw?.gridInfoMap ?? {}) };
    const ids = Object.keys(verMap).length ? Object.keys(verMap) : Object.keys(infoMap);

    // Enrich missing names via getGroupInfo (chunk 50 per call)
    const missing = ids.filter((id) => !(infoMap[id]?.name || infoMap[id]?.groupName));
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      try {
        const more = await client.api.getGroupInfo(chunk) as { gridInfoMap?: Record<string, GInfo> };
        Object.assign(infoMap, more?.gridInfoMap ?? {});
      } catch { /* keep id, name blank — still usable */ }
    }

    const groups = ids.map((id) => {
      const g = infoMap[id] ?? {};
      return {
        id,
        name: g.name || g.groupName || '',
        totalMember:
          g.totalMember ?? g.memberCount ?? (Array.isArray(g.memVerList) ? g.memVerList.length : 0),
      };
    });
    return res.json({ groups });
  } catch (err) {
    return handleError(res, err, 'getAllGroups');
  }
});

/**
 * GET /:accountId/groups/:groupId — single group info.
 */
router.get('/:accountId/groups/:groupId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const group = await client.api.getGroupInfo(groupId);
    return res.json({ group });
  } catch (err) {
    return handleError(res, err, 'getGroupInfo');
  }
});

/**
 * GET /:accountId/groups/:groupId/members — group member list with profiles.
 * 1) getGroupInfo → memVerList ("uid_ver"); 2) getGroupMembersInfo(uids) → profile.
 */
router.get('/:accountId/groups/:groupId/members', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });

    const info = await client.api.getGroupInfo(groupId) as any;
    const grid = info?.gridInfoMap?.[groupId] ?? Object.values(info?.gridInfoMap ?? {})[0];
    const rawIds: string[] = Array.isArray(grid?.memVerList) ? grid.memVerList : [];
    const uids = [...new Set(rawIds.map((k: string) => String(k).split('_')[0]).filter(Boolean))];
    if (uids.length === 0) return res.json({ members: [] });

    const prof = await client.api.getGroupMembersInfo(uids) as any;
    const profiles = prof?.profiles ?? {};
    const members = Object.values(profiles).map((p: any) => ({
      uid: p.id,
      displayName: p.displayName || p.zaloName || p.id,
      avatar: p.avatar ?? null,
    }));
    return res.json({ members });
  } catch (err) {
    return handleError(res, err, 'getGroupMembersInfo');
  }
});

// ── Group CRUD ──────────────────────────────────────────────────────────────

/**
 * POST /:accountId/groups — create group { name, memberIds }.
 */
router.post('/:accountId/groups', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { name, memberIds } = req.body as { name?: string; memberIds?: string[] };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'name and memberIds are required' });
  }
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const group = await client.api.createGroup({ name, memberIds });
    return res.status(201).json({ group });
  } catch (err) {
    return handleError(res, err, 'createGroup');
  }
});

/**
 * PATCH /:accountId/groups/:groupId/name — rename group { name }.
 */
router.patch('/:accountId/groups/:groupId/name', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { name } = req.body as { name?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.renameGroup(name, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'renameGroup');
  }
});

/**
 * PATCH /:accountId/groups/:groupId/settings — update group settings.
 */
router.patch('/:accountId/groups/:groupId/settings', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.updateGroupSettings(req.body ?? {}, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'updateGroupSettings');
  }
});

// ── Membership ──────────────────────────────────────────────────────────────

/**
 * POST /:accountId/groups/:groupId/members — add members { userIds }.
 */
router.post('/:accountId/groups/:groupId/members', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { userIds } = req.body as { userIds?: string[] };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.addUserToGroup(userIds, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'addUserToGroup');
  }
});

/**
 * DELETE /:accountId/groups/:groupId/members — remove members { userIds }.
 */
router.delete('/:accountId/groups/:groupId/members', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { userIds } = req.body as { userIds?: string[] };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.removeUserFromGroup(userIds, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'removeUserFromGroup');
  }
});

// ── Deputies & Ownership ───────────────────────────────────────────────────

/**
 * POST /:accountId/groups/:groupId/deputies — add deputy { userId }.
 */
router.post('/:accountId/groups/:groupId/deputies', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { userId } = req.body as { userId?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.addGroupDeputy(userId, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'addGroupDeputy');
  }
});

/**
 * DELETE /:accountId/groups/:groupId/deputies/:userId — remove deputy.
 */
router.delete('/:accountId/groups/:groupId/deputies/:userId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId, userId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.removeGroupDeputy(userId, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'removeGroupDeputy');
  }
});

/**
 * POST /:accountId/groups/:groupId/transfer — transfer ownership { newOwnerId }.
 */
router.post('/:accountId/groups/:groupId/transfer', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { newOwnerId } = req.body as { newOwnerId?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!newOwnerId) return res.status(400).json({ error: 'newOwnerId is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await ensureAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await client.api.changeGroupOwner(newOwnerId, groupId);
    return res.json({ result });
  } catch (err) {
    return handleError(res, err, 'changeGroupOwner');
  }
});

export { router as zaloGroupRouter };
