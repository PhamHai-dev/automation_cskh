/**
 * profile-routes.ts — REST API for Zalo account profile management.
 * Ported from ZaloCRM profile-routes.ts (154 lines) → Express, single-org, Int IDs.
 *
 * Routes (scoped to /:accountId/profile):
 *   GET    /           — get Zalo account info
 *   PATCH  /           — update name / gender / birthday
 *   GET    /last-online/:userId — get REAL last online via Zalo SDK
 *   GET    /avatars    — list all avatars
 *   PATCH  /avatar     — change avatar (upload by file path)
 *   DELETE /avatars/:avatarId — delete an avatar
 *   POST   /avatars/:avatarId/reuse — reuse a previous avatar
 *   PUT    /status     — set online/offline status
 *
 * Adaptations from ZaloCRM:
 *   - Fastify → Express Router
 *   - zaloOps → zaloPool.getApi() direct calls
 *   - No orgId/tenant → single-org
 *   - zaloOps.getAccountInfo → client.api.getAccountInfo()
 *   - zaloOps.changeAccountAvatar → client.api.changeAccountAvatar()
 *   - zaloOps.setOnlineStatus → client.api.setOnlineStatus()
 */
import { Router, Request, Response } from 'express';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers';
import { updateProfile, listAvatars, deleteAvatar, reuseAvatar } from './profile-operations';
import type { Gender } from './profile-operations';

const log = createLogger('ProfileRoutes');
const router = Router({ mergeParams: true });

// GET /:accountId/profile — get Zalo account info
router.get('/:accountId/profile', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const api = zaloPool.getApi(accountId);
    if (!api) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await api.getAccountInfo();
    return res.json({ profile: result });
  } catch (err) {
    return handleError(res, err, 'getAccountInfo');
  }
});

// PATCH /:accountId/profile — update name / gender / birthday
router.patch('/:accountId/profile', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { name, gender, dob } = req.body ?? {};
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    const result = await updateProfile(accountId, {
      name,
      gender: gender as Gender | undefined,
      dob,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'updateProfile');
  }
});

// GET /:accountId/profile/last-online/:userId — get REAL last online via Zalo SDK
router.get('/:accountId/profile/last-online/:userId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const userId = req.params.userId;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const { getPresence } = await import('./presence-service');
    const entry = await getPresence(accountId, userId);
    if (!entry) {
      return res.json({ lastOnline: null, showStatus: false, isOnline: false, fetchedAt: Date.now() });
    }
    const isOnline = entry.lastOnline !== null && Date.now() - entry.lastOnline < 5 * 60_000;
    return res.json({
      lastOnline: entry.lastOnline,
      showStatus: entry.showStatus,
      isOnline,
      fetchedAt: entry.fetchedAt,
    });
  } catch (err) {
    return handleError(res, err, 'getLastOnline');
  }
});

// GET /:accountId/profile/avatars — list all avatars
router.get('/:accountId/profile/avatars', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const avatars = await listAvatars(accountId);
    return res.json({ avatars });
  } catch (err) {
    return handleError(res, err, 'listAvatars');
  }
});

// PATCH /:accountId/profile/avatar — change avatar (upload by file path)
router.patch('/:accountId/profile/avatar', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { filePath } = req.body as { filePath?: string };
  if (!filePath) return res.status(400).json({ error: 'filePath is required' });
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    const api = zaloPool.getApi(accountId);
    if (!api) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await api.changeAccountAvatar(filePath);
    return res.json({ success: true, result });
  } catch (err) {
    return handleError(res, err, 'changeAccountAvatar');
  }
});

// DELETE /:accountId/profile/avatars/:avatarId — delete an avatar
router.delete('/:accountId/profile/avatars/:avatarId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const avatarId = req.params.avatarId;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    const result = await deleteAvatar(accountId, avatarId);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'deleteAvatar');
  }
});

// POST /:accountId/profile/avatars/:avatarId/reuse — reuse a previous avatar
router.post('/:accountId/profile/avatars/:avatarId/reuse', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const avatarId = req.params.avatarId;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    const result = await reuseAvatar(accountId, avatarId);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'reuseAvatar');
  }
});

// PUT /:accountId/profile/status — set online/offline status
router.put('/:accountId/profile/status', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { status } = req.body as { status?: string };
  if (status !== 'online' && status !== 'offline') {
    return res.status(400).json({ error: "status must be 'online' or 'offline'" });
  }
  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    const api = zaloPool.getApi(accountId);
    if (!api) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    await api.setOnlineStatus(status === 'online');
    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'setOnlineStatus');
  }
});

export { router as profileRoutes };
