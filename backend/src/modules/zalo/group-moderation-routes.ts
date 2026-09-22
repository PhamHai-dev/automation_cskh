/**
 * group-moderation-routes.ts — Express Router: group moderation, links, polls, lifecycle.
 * Ported from ZaloCRM group-moderation-routes.ts (179 lines, 9.9KB) → single-org, Int IDs, Express.
 *
 * Adaptations:
 *   - Fastify/FastifyRequest/FastifyReply → Express Router/Request/Response
 *   - request.user!.orgId → req.user!.id + roles via checkAccess/resolveAccount
 *   - zaloOps.getGroupInfo/getGroupMembersInfo/listGroups → zaloPool.client.api.*
 *   - No orgId/withTenant → direct prisma, Int accountId
 *   - handleError(reply, ...) → handleError(res, ...)
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { checkAccess, resolveAccount, handleError } from './zalo-route-helpers';

const log = createLogger('GroupModerationRoutes');
const router = Router({ mergeParams: true });

/**
 * GET /:accountId/groups/:groupId — group info (SDK live).
 */
router.get('/:accountId/groups/:groupId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, user.roles.includes('ADMIN') || user.roles.includes('MANAGE'));
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getGroupInfo(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'getGroupInfo');
  }
});

/**
 * POST /:accountId/groups/:groupId/block — block member { userId }.
 */
router.post('/:accountId/groups/:groupId/block', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { userId } = req.body as { userId?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.blockGroupMember(groupId, userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'blockGroupMember');
  }
});

/**
 * DELETE /:accountId/groups/:groupId/block/:userId — unblock member.
 */
router.delete('/:accountId/groups/:groupId/block/:userId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId, userId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.unblockGroupMember(groupId, userId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'unblockGroupMember');
  }
});

/**
 * GET /:accountId/groups/:groupId/blocked — blocked members list.
 */
router.get('/:accountId/groups/:groupId/blocked', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getGroupBlockedMembers(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'getGroupBlockedMembers');
  }
});

/**
 * GET /:accountId/groups/:groupId/pending — pending members list.
 */
router.get('/:accountId/groups/:groupId/pending', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getPendingGroupMembers(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'getPendingGroupMembers');
  }
});

// ── Group Links ─────────────────────────────────────────────────────────────

/**
 * GET /:accountId/groups/:groupId/link — group link detail.
 */
router.get('/:accountId/groups/:groupId/link', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getGroupLinkDetail(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'getGroupLinkDetail');
  }
});

/**
 * POST /:accountId/groups/:groupId/link/enable — enable group link.
 */
router.post('/:accountId/groups/:groupId/link/enable', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.enableGroupLink(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'enableGroupLink');
  }
});

/**
 * POST /:accountId/groups/:groupId/link/disable — disable group link.
 */
router.post('/:accountId/groups/:groupId/link/disable', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.disableGroupLink(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'disableGroupLink');
  }
});

/**
 * POST /:accountId/groups/join-link — join group by link { linkId }.
 */
router.post('/:accountId/groups/join-link', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { linkId } = req.body as { linkId?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!linkId) return res.status(400).json({ error: 'linkId is required' });
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.joinGroupByLink(linkId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'joinGroupByLink');
  }
});

// ── Group Lifecycle ─────────────────────────────────────────────────────────

/**
 * POST /:accountId/groups/:groupId/leave — leave group.
 */
router.post('/:accountId/groups/:groupId/leave', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.leaveGroup(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'leaveGroup');
  }
});

/**
 * POST /:accountId/groups/:groupId/disperse — disperse group.
 */
router.post('/:accountId/groups/:groupId/disperse', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.disperseGroup(groupId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'disperseGroup');
  }
});

// ── Polls ───────────────────────────────────────────────────────────────────

/**
 * POST /:accountId/groups/:groupId/polls — create poll.
 * Body { question, options[], multi?, anonymous?, expireMs? }
 */
router.post('/:accountId/groups/:groupId/polls', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const { question, options, multi, anonymous, expireMs } = req.body as {
    question?: string;
    options?: string[];
    multi?: boolean;
    anonymous?: boolean;
    expireMs?: number;
  };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'question and at least 2 options are required' });
  }
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.createPoll(groupId, { question, options, multi, anonymous, expireMs });
    return res.status(201).json({ data });
  } catch (err) {
    return handleError(res, err, 'createPoll');
  }
});

/**
 * GET /:accountId/groups/:groupId/polls/:pollId — poll detail.
 */
router.get('/:accountId/groups/:groupId/polls/:pollId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { pollId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.getPollDetail(pollId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'getPollDetail');
  }
});

/**
 * POST /:accountId/groups/:groupId/polls/:pollId/vote — vote poll.
 * Body { optionIds: number[] }
 */
router.post('/:accountId/groups/:groupId/polls/:pollId/vote', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { pollId } = req.params;
  const { optionIds } = req.body as { optionIds?: number[] };
  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return res.status(400).json({ error: 'optionIds array is required' });
  }
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.votePoll(pollId, optionIds);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'votePoll');
  }
});

/**
 * POST /:accountId/groups/:groupId/polls/:pollId/lock — lock poll.
 */
router.post('/:accountId/groups/:groupId/polls/:pollId/lock', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { pollId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.lockPoll(pollId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'lockPoll');
  }
});

/**
 * POST /:accountId/groups/:groupId/polls/:pollId/share — share poll.
 */
router.post('/:accountId/groups/:groupId/polls/:pollId/share', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { pollId } = req.params;
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const data = await client.api.sharePoll(pollId);
    return res.json({ data });
  } catch (err) {
    return handleError(res, err, 'sharePoll');
  }
});

export { router as zaloGroupModerationRouter };
