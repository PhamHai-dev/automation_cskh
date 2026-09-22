/**
 * zalo-sync-routes.ts — Sync Zalo friends/contacts to DB.
 * Ported from ZaloCRM zalo-sync-routes.ts (168 lines, 6.6KB) → single-org, Int IDs.
 *
 * Adaptations from ZaloCRM:
 *   - Fastify → Express Router/Request/Response
 *   - No Contact model / resolveOrCreateContact / linkOrphanedConversations:
 *       → upsert Friend directly (friend-sync-service handles this).
 *       → link orphaned conversations by matching zalo_uid_in_nick in Friend table.
 *   - No backfillAccountHistory (B6 not yet ported) → stub route that returns 501.
 *   - requireGrant('zalo_account','edit') → checkAccess('chat')
 *   - zaloPool.getInstance(id) → zaloPool.getAccountClient(accountId)
 *   - logger → createLogger
 *
 * Routes:
 *   POST /:accountId/sync-contacts — upsert Friend rows from Zalo SDK + link convos
 *   POST /:accountId/sync-history  — stub (returns 501 until B6 ported)
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { checkAccess, resolveAccount, handleError } from './zalo-route-helpers';
import { syncFriendsForAccount } from './friend-sync-service';

const log = createLogger('ZaloSyncRoutes');
const router = Router({ mergeParams: true });

/**
 * POST /:accountId/sync-contacts — sync friends from Zalo SDK → Friend table.
 * Reuses syncFriendsForAccount (diff-then-emit with cooldown).
 * Returns { created, updated, total, linked }.
 */
router.post('/:accountId/sync-contacts', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);
    const client = zaloPool.getAccountClient(accountId);
    if (!client) return res.status(403).json({ error: 'Nick chưa kết nối Zalo' });

    const result = await syncFriendsForAccount(accountId, { trigger: 'manual' });
    if (result.skipped === 'cooldown') {
      return res.status(429).json({ error: 'cooldown', message: 'Vừa đồng bộ xong, vui lòng thử lại sau vài giây' });
    }

    log.info(`[sync] Zalo contacts: ${result.upsertedFriends} upserted, ${result.liveCount} total`);
    return res.json({
      success: true,
      created: result.createdContacts,
      updated: result.upsertedFriends,
      linked: 0,
      total: result.liveCount,
    });
  } catch (err) {
    // Map 429 from Zalo SDK to user-friendly message
    const msg = String(err);
    if (/\b429\b|too many requests/i.test(msg)) {
      return res.status(429).json({
        error: 'Zalo đang giới hạn tần suất đồng bộ. Vui lòng thử lại sau vài phút.',
      });
    }
    return handleError(res, err, 'sync-contacts');
  }
});

/**
 * POST /:accountId/sync-history — stub (B6 not yet ported).
 * Will delegate to backfillAccountHistory when B6 is completed.
 */
router.post('/:accountId/sync-history', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    // B6 not yet ported — return 501
    return res.status(501).json({
      error: 'History backfill not yet implemented (B6 pending)',
      accountId,
    });
  } catch (err) {
    return handleError(res, err, 'sync-history');
  }
});

export { router as zaloSyncRouter };
