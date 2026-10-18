/**
 * zalo-friend-routes.ts — Express Router: Zalo friend REST API.
 * Ported from ZaloCRM friend-routes.ts (743 dòng, 34.9KB) → single-org Int IDs.
 *
 * Adaptations:
 *   - FastifyInstance/FastifyReply → Express Router/Request/Response
 *   - No orgId/withTenant/ownerUserId → single-org, Int IDs, snake_case
 *   - No Contact model / phoneSearchEvent / privacy-redact:
 *       `friends-db` returns raw Friend rows (no joined Contact, no redact).
 *       `lookup-by-phone` returns SDK result directly (no phoneSearchEvent log).
 *   - zaloPool.getAccountClient/checkAccess/resolveAccount from zalo-route-helpers
 *   - syncAccountFully from friend-sync-service (5s cooldown → 429)
 *   - Client via zaloPool.getAccountClient(accountId); api.* = SDK direct
 *   - Int accountId/cs_id; user.id/user.orgId from auth middleware
 *
 * Endpoints:
 *   GET    /:accountId/friends — friends list (SDK live, optional kind/page/search)
 *   GET    /:accountId/friends-db — DB friend list (paged, kind, counts)
 *   GET    /:accountId/friends/online — online friends via SDK
 *   GET    /:accountId/friends/recommendations — friend suggestions
 *   GET    /:accountId/friends/find?q= — find user by phone/name (SDK)
 *   GET    /:accountId/friends/aliases — custom aliases list (SDK)
 *   POST   /:accountId/friends-db/sync — force full sync (cooldown 5s)
 *   POST   /:accountId/friends/:userId/alias — set alias
 *   DELETE /:accountId/friends/:userId/alias — remove alias
 *   GET    /:accountId/friends/requests/sent — sent friend requests
 *   POST   /:accountId/friends/requests — send friend request
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { zaloRateLimiter } from './zalo-rate-limiter';
import { resolveAccount, checkAccess, handleError, ZaloOpError } from './zalo-route-helpers';
import { syncFriendsForAccount } from './friend-sync-service';

const log = createLogger('ZaloFriendRoutes');
const router = Router({ mergeParams: true });

// ─── GET /:accountId/friends — friends list (SDK live) ─────────────────────

/**
 * GET /:accountId/friends — list friends via Zalo SDK (live, paginated).
 * Optional query: kind, page, limit, search.
 */
router.get('/:accountId/friends', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { kind, page = '1', limit = '25', search = '' } = req.query as Record<string, string>;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const data = await client.api.listFriends({ kind, page: pageNum, limit: limitNum, search: search.trim() });
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-list');
  }
});

/**
 * GET /:accountId/friends-db — friend list from DB (paged, counts by kind).
 * Optional query: kind, page, limit, search (name/uid), sortBy.
 */
router.get('/:accountId/friends-db', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { kind = 'all', page = '1', limit = '25', search = '', sortBy = 'recent' } = req.query as Record<string, string>;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));

    const where: any = { zalo_account_id: accountId };
    if (kind && kind !== 'all') where.relationship_kind = kind;
    if (search.trim()) {
      const q = search.trim();
      const normalizedPhone = q.replace(/[^\d]/g, '');
      where.OR = [
        { zalo_uid_in_nick: { contains: q } },
        { alias_in_nick: { contains: q, mode: 'insensitive' } },
        { zalo_display_name: { contains: q, mode: 'insensitive' } },
        ...(normalizedPhone.length >= 9 ? [{ phone_from_sdk: { contains: normalizedPhone } }] as any : []),
      ];
    }

    const orderBy = buildFriendOrderBy(sortByMap(sortBy));

    const [friends, total, countsRaw] = await Promise.all([
      prisma.friend.findMany({ where, orderBy, skip: (pageNum - 1) * limitNum, take: limitNum }),
      prisma.friend.count({ where }),
      prisma.friend.groupBy({
        by: ['relationship_kind'],
        where: { zalo_account_id: accountId },
        _count: true,
      }),
    ]);
    const counts = Object.fromEntries(countsRaw.map((g) => [g.relationship_kind, g._count]));

    return res.json({ friends, total, counts, page: pageNum, limit: limitNum });
  } catch (err) {
    return handleError(res, err, 'friend-db-list');
  }
});

/**
 * POST /:accountId/friends-db/sync — manual force-refresh (cooldown 5s).
 */
router.post('/:accountId/friends-db/sync', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const result = await syncFriendsForAccount(accountId, { trigger: 'manual' });
    if (result.skipped === 'cooldown') {
      return res.status(429).json({ error: 'cooldown', message: 'Vừa đồng bộ xong, vui lòng thử lại sau vài giây' });
    }
    return res.json({ data: result });
  } catch (err) {
    return handleError(res, err, 'friend-sync');
  }
});

/**
 * GET /:accountId/friends/online — online friends via SDK.
 */
router.get('/:accountId/friends/online', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getFriendOnlines();
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-online');
  }
});

/**
 * GET /:accountId/friends/recommendations — friend suggestions.
 */
router.get('/:accountId/friends/recommendations', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getFriendRecommendations();
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-recommend');
  }
});

/**
 * GET /:accountId/friends/find?q= — find user by phone/name (SDK).
 */
router.get('/:accountId/friends/find', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { q } = req.query as { q?: string };
  if (!q) return res.status(400).json({ error: 'Query param q is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const limitCheck = await zaloRateLimiter.checkLimits(accountId, 'friend_lookup');
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.reason, code: 'RATE_LIMIT_EXCEEDED' });
    }
    const fn = client.findUser ?? client.api?.findUser;
    const data = await fn.call(client.api ?? client, q);
    await zaloRateLimiter.recordSend(accountId, 'friend_lookup');
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-find');
  }
});

/**
 * GET /:accountId/friends/aliases — custom aliases list (SDK).
 */
router.get('/:accountId/friends/aliases', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getAliasList();
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-alias');
  }
});

/**
 * POST /:accountId/friends/lookup-by-phone — phone → UID discovery (SDK).
 * Body { phone }
 */
router.post('/:accountId/friends/lookup-by-phone', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { phone } = req.body as { phone?: string };
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const limitCheck = await zaloRateLimiter.checkLimits(accountId, 'friend_lookup');
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.reason, code: 'RATE_LIMIT_EXCEEDED' });
    }
    const fn = client.findUser ?? client.api?.findUser;
    const data = await fn.call(client.api ?? client, phone);
    await zaloRateLimiter.recordSend(accountId, 'friend_lookup');
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-lookup-by-phone');
  }
});

// ─── Friend ops: requests / alias ───────────────────────────────────────────

/**
 * POST /:accountId/friends/:userId/alias — set custom alias.
 */
router.put('/:accountId/friends/:userId/alias', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  const { alias } = req.body as { alias?: string };
  if (!alias) return res.status(400).json({ error: 'alias is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.changeFriendAlias(userId, alias);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-alias');
  }
});

/**
 * DELETE /:accountId/friends/:userId/alias — remove custom alias.
 */
router.delete('/:accountId/friends/:userId/alias', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.removeFriendAlias(userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-op');
  }
});

/**
 * POST /:accountId/friends/requests — send friend request { userId, message? }.
 */
router.post('/:accountId/friends/requests', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId, message = '' } = req.body as { userId: string; message?: string };
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const limitCheck = await zaloRateLimiter.checkLimits(accountId, 'friend_action');
    if (!limitCheck.allowed) {
      return res.status(429).json({ error: limitCheck.reason, code: 'RATE_LIMIT_EXCEEDED' });
    }
    const fn = client.sendFriendRequest ?? client.api?.sendFriendRequest;
    const data = await fn.call(client.api ?? client, userId, message);
    await zaloRateLimiter.recordSend(accountId, 'friend_action');
    await prisma.friend.updateMany({
      where: { zalo_account_id: accountId, zalo_uid_in_nick: userId },
      data: { friendship_status: 'pending_sent' },
    });
    return res.status(201).json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-send');
  }
});

/**
 * GET /:accountId/friends/requests/sent — list sent friend requests.
 */
router.get('/:accountId/friends/requests/sent', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getSentFriendRequests();
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-sent');
  }
});

/**
 * DELETE /:accountId/friends/requests/:userId — cancel a sent friend request.
 */
router.delete('/:accountId/friends/requests/:userId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.cancelFriendRequest(userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-cancel-request');
  }
});

/**
 * GET /:accountId/friends/requests/:userId/status — check friend request status.
 */
router.get('/:accountId/friends/requests/:userId/status', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getFriendRequestStatus(userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-status');
  }
});

/**
 * POST /:accountId/friends/requests/:userId/accept — accept friend request.
 */
router.post('/:accountId/friends/requests/:userId/accept', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  let acceptUid = userId;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });

    // Resolve actual pending UID: conv UID có thể là old friendship, còn pending
    // invite nằm trên Friend row sibling khác (Zalo re-request → UID mới).
    try {
      const convFriend = await prisma.friend.findUnique({
        where: { zalo_account_id_zalo_uid_in_nick: { zalo_account_id: accountId, zalo_uid_in_nick: userId } },
        select: { friendship_status: true },
      });
      if (convFriend?.friendship_status !== 'pending_received') {
        const pendingSibling = await prisma.friend.findFirst({
          where: {
            zalo_account_id: accountId,
            friendship_status: 'pending_received',
            zalo_uid_in_nick: { not: userId },
          },
          orderBy: { created_at: 'desc' },
          select: { zalo_uid_in_nick: true },
        });
        if (pendingSibling?.zalo_uid_in_nick) acceptUid = pendingSibling.zalo_uid_in_nick;
      }
    } catch { /* use original UID */ }

    const data = await client.api.acceptFriendRequest(acceptUid);
    await prisma.friend.updateMany({
      where: { zalo_account_id: accountId, friendship_status: 'pending_received' },
      data: { friendship_status: 'accepted' },
    });
    return res.json({ data, acceptUid, originalUid: userId });
  } catch (err) {
    return handleError(res, err, 'friend-accept');
  }
});

/**
 * POST /:accountId/friends/requests/:userId/reject — reject friend request.
 */
router.post('/:accountId/friends/requests/:userId/reject', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  let rejectUid = userId;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });

    // Resolve actual pending UID (tương tự accept — reject lời mời PENDING đúng).
    try {
      const convFriend = await prisma.friend.findUnique({
        where: { zalo_account_id_zalo_uid_in_nick: { zalo_account_id: accountId, zalo_uid_in_nick: userId } },
        select: { friendship_status: true },
      });
      if (convFriend?.friendship_status !== 'pending_received') {
        const pendingSibling = await prisma.friend.findFirst({
          where: {
            zalo_account_id: accountId,
            friendship_status: 'pending_received',
            zalo_uid_in_nick: { not: userId },
          },
          orderBy: { created_at: 'desc' },
          select: { zalo_uid_in_nick: true },
        });
        if (pendingSibling?.zalo_uid_in_nick) rejectUid = pendingSibling.zalo_uid_in_nick;
      }
    } catch { /* use original UID */ }

    const data = await client.api.rejectFriendRequest(rejectUid);
    await prisma.friend.updateMany({
      where: { zalo_account_id: accountId, friendship_status: 'pending_received' },
      data: { friendship_status: 'rejected' },
    });
    return res.json({ data, rejectUid, originalUid: userId });
  } catch (err) {
    return handleError(res, err, 'friend-reject');
  }
});

// ─── Friend management: remove / block ──────────────────────────────────────

/**
 * DELETE /:accountId/friends/:userId — remove friend.
 */
router.delete('/:accountId/friends/:userId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.removeFriend(userId);
    await prisma.friend.updateMany({
      where: { zalo_account_id: accountId, zalo_uid_in_nick: userId },
      data: { friendship_status: 'removed', removed_at: new Date() },
    });
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-remove');
  }
});

/**
 * POST /:accountId/friends/:userId/block — block user.
 */
router.post('/:accountId/friends/:userId/block', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.blockUser(userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-block');
  }
});

/**
 * DELETE /:accountId/friends/:userId/block — unblock user.
 */
router.delete('/:accountId/friends/:userId/block', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.unblockUser(userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-unblock');
  }
});

/**
 * POST /:accountId/friends/:userId/block-feed — block user from viewing feed.
 */
router.post('/:accountId/friends/:userId/block-feed', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.blockViewFeed(userId, true);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-block-feed');
  }
});

/**
 * DELETE /:accountId/friends/:userId/block-feed — unblock user from viewing feed.
 */
router.delete('/:accountId/friends/:userId/block-feed', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { userId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.blockViewFeed(userId, false);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'friend-unblock-feed');
  }
});

// ─── Helper: orderBy builder ─────────────────────────────────────────────────

function buildFriendOrderBy(sortBy: string): any[] {
  const tieBreak = [{ created_at: 'desc' as const }, { id: 'asc' as const }];
  switch (sortBy) {
    case 'az':
      return [{ alias_in_nick: { sort: 'asc' as const, nulls: 'last' as const } }, ...tieBreak];
    case 'recent':
    default:
      return [{ updated_at: 'desc' as const }, ...tieBreak];
  }
}

function sortByMap(sortBy: string): string {
  return ['az', 'recent'].includes(sortBy) ? sortBy : 'recent';
}

export { router as zaloFriendRouter };
