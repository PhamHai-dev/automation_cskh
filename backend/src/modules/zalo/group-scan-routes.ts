/**
 * group-scan-routes.ts — REST API for batch group scanning (E1).
 * Ported from ZaloCRM group-scan-routes.ts (157 lines) → Express, single-org, Int IDs.
 *
 * Routes (mount under /api/v1/zalo/ via zalo.routes.ts):
 *   POST /:accountId/group-scans          — create scan (selected|all) + enqueue
 *   GET  /:accountId/group-scans/:scanId  — scan status
 *   GET  /:accountId/group-scans/:scanId/members — roster (filter isFriend, paginated)
 *
 * Adaptations:
 *   - Fastify → Express Router
 *   - orgId → bypass (single-org)
 *   - String accountId → Int accountId
 *   - zaloOps.getAllGroups → zaloPool.getApi(accountId).getAllGroups()
 *   - resolveAccount/checkAccess/handleError from zalo-route-helpers
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers';
import { enqueueGroupScan } from './group-scan-queue';

const log = createLogger('GroupScanRoutes');
const router = Router({ mergeParams: true });

const MAX_GROUPS_PER_SCAN = 5000;

// POST /:accountId/group-scans — create scan (selected|all) + enqueue
router.post('/:accountId/group-scans', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { groupIds, all } = req.body as { groupIds?: string[]; all?: boolean };

  if (!all && (!Array.isArray(groupIds) || groupIds.length === 0)) {
    return res.status(400).json({ error: 'groupIds array is required when all is not set' });
  }
  if (Array.isArray(groupIds) && groupIds.length > MAX_GROUPS_PER_SCAN) {
    return res.status(400).json({ error: `too many groupIds (max ${MAX_GROUPS_PER_SCAN})` });
  }

  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;

    // Dedup in-flight: 1 nick chỉ 1 scan đang chạy
    const inFlight = await prisma.groupScan.findFirst({
      where: { zalo_account_id: accountId, state: { in: ['queued', 'running'] } },
      orderBy: { created_at: 'desc' },
    });
    if (inFlight) {
      return res.status(409).json({ error: 'a scan is already running for this account', scan: inFlight });
    }

    let ids: string[];
    let scope: string;
    if (all) {
      const api = zaloPool.getApi(accountId);
      if (!api) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
      const result = (await api.getAllGroups()) as { gridVerMap?: Record<string, string> };
      ids = Object.keys(result?.gridVerMap ?? {});
      scope = 'all';
    } else {
      ids = [...new Set(groupIds!.map(String))];
      scope = 'selected';
    }

    const scan = await prisma.groupScan.create({
      data: {
        zalo_account_id: accountId,
        scope,
        group_ids: ids,
        state: 'queued',
        total_groups: ids.length,
      },
    });

    await enqueueGroupScan(scan.id);
    return res.status(201).json({ scan });
  } catch (err) {
    return handleError(res, err, 'createGroupScan');
  }
});

// GET /:accountId/group-scans/:scanId — scan status
router.get('/:accountId/group-scans/:scanId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const scanId = parseInt(req.params.scanId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;

    const scan = await prisma.groupScan.findFirst({
      where: { id: scanId, zalo_account_id: accountId },
    });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });
    return res.json({ scan });
  } catch (err) {
    return handleError(res, err, 'getGroupScan');
  }
});

// GET /:accountId/group-scans/:scanId/members — roster (filter isFriend, paginated)
router.get('/:accountId/group-scans/:scanId/members', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const scanId = parseInt(req.params.scanId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { isFriend, page, limit } = req.query as { isFriend?: string; page?: string; limit?: string };

  try {
    await resolveAccount(accountId, user.id, isAdmin);
    if (!(await checkAccess(req, res, accountId, 'read'))) return;

    const scan = await prisma.groupScan.findFirst({
      where: { id: scanId, zalo_account_id: accountId },
      select: { group_ids: true },
    });
    if (!scan) return res.status(404).json({ error: 'Scan not found' });

    const groupIds: string[] = Array.isArray(scan.group_ids)
      ? (scan.group_ids as unknown[]).map(String)
      : [];

    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));

    const where: {
      zalo_account_id: number;
      group_id: { in: string[] };
      is_friend?: boolean;
    } = { zalo_account_id: accountId, group_id: { in: groupIds } };
    if (isFriend === 'true') where.is_friend = true;
    else if (isFriend === 'false') where.is_friend = false;

    const [members, total] = await Promise.all([
      prisma.groupMember.findMany({
        where,
        orderBy: { last_seen_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.groupMember.count({ where }),
    ]);

    return res.json({ members, total, page: pageNum, limit: limitNum });
  } catch (err) {
    return handleError(res, err, 'getGroupScanMembers');
  }
});

export { router as groupScanRouter };
