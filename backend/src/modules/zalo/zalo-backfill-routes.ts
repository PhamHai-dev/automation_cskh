/**
 * zalo-backfill-routes.ts — Express Router: backfill Zalo message history.
 * Ported from ZaloCRM zalo-backfill-routes.ts → single-org, Int IDs.
 *
 * Adaptations:
 *   - Fastify → Express
 *   - No orgId/withTenant/runSystemQuery → single-org auth via req.user!
 *   - No MessageSyncCursor model → use ZaloAccount.last_backfill_at + prisma.message.count
 *   - Int IDs (accountId, userId)
 *   - handleError/handleAccess/ensureAccount from zalo-route-helpers
 *   - Uses zaloBackfillService (ported separately in zalo-backfill-service.ts)
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { checkAccess, resolveAccount, handleError } from './zalo-route-helpers';
import { backfillAccountHistory } from './zalo-backfill-service';

const log = createLogger('ZaloBackfillRoutes');
const router = Router({ mergeParams: true });

/**
 * POST /:accountId/backfill/start — start backfill job.
 * Body: { conversationIds?: number[]; maxDays?: number; overwrite?: boolean }
 */
router.post('/:accountId/backfill', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    const result = await backfillAccountHistory(client, accountId);
    return res.status(202).json({ result });
  } catch (err) {
    return handleError(res, err, 'backfill');
  }
});

/**
 * GET /:accountId/backfill/status — backfill progress.
 */
router.get('/:accountId/backfill/status', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const [convCount, msgCount, friendsCount] = await prisma.$transaction([
      prisma.conversation.count({ where: { zalo_account_id: accountId } }),
      prisma.message.count({ where: { conversation: { zalo_account_id: accountId } } }),
      prisma.friend.count({ where: { zalo_account_id: accountId } }),
    ]);
    return res.json({ accountId, conversations: convCount, messages: msgCount, friends: friendsCount });
  } catch (err) {
    return handleError(res, err, 'backfill-status');
  }
});

/**
 * POST /:accountId/backfill/cancel — cancel running backfill.
 */
router.post('/:accountId/backfill/cancel', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    // Backfill không phải job nền — chạy trực tiếp, không có gì để cancel.
    return res.json({ cancelled: false, message: 'Backfill chạy trực tiếp, không có job nền để hủy' });
  } catch (err) {
    return handleError(res, err, 'backfill-cancel');
  }
});

export { router as zaloBackfillRouter };
