/**
 * zalo-reaction-routes.ts — Reaction + mark-read endpoints for chat messages.
 *
 * POST /accounts/:accountId/messages/:msgId/reactions — toggle reaction
 * GET  /accounts/:accountId/messages/:msgId/reactions — get reactions for a message
 * POST /accounts/:accountId/messages/:msgId/mark-read  — mark message as seen
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloReactions');
const router = Router();

// ─── Helper: resolve account ─────────────────────────────────────────────
async function resolveAccount(accountId: number, userId: number, _isAdmin?: boolean) {
  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });
  if (account.cs_id !== userId) {
    throw Object.assign(new Error('Không có quyền truy cập tài khoản Zalo của người dùng khác'), { status: 403 });
  }
  return account;
}

// ─── Toggle reaction ─────────────────────────────────────────────────────
router.post('/accounts/:accountId/messages/:msgId/reactions', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { msgId } = req.params;
  const { emoji } = req.body as { emoji?: string };
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  if (!emoji) {
    return res.status(400).json({ error: 'emoji is required' });
  }

  try {
    await resolveAccount(accountId, user.id, isAdmin);

    const client = zaloPool.getAccountClient(accountId);
    if (!client) {
      return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    }

    // Find the message in our DB
    const message = await prisma.message.findFirst({
      where: {
        zalo_msg_id: msgId,
        conversation: { zalo_account_id: accountId },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Try SDK reaction (if available)
    let sdkResult: any = null;
    try {
      // zca-js may have addReaction / removeReaction
      if (typeof client.api.addReaction === 'function') {
        sdkResult = await client.api.addReaction(message.zalo_msg_id, emoji);
        log.info(`SDK reaction added: ${msgId} → ${emoji}`);
      } else {
        log.warn('SDK addReaction not available — storing locally only');
      }
    } catch (sdkErr: any) {
      log.warn(`SDK reaction failed: ${sdkErr.message} — storing locally only`);
    }

    // Store reaction locally in message.reactions (JSON field)
    const reactions = (message.reactions as any) || {};
    const existing: string[] = reactions[emoji] || [];
    const selfUid = user.id.toString();

    if (existing.includes(selfUid)) {
      // Remove reaction
      existing.splice(existing.indexOf(selfUid), 1);
      if (existing.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = existing;
      }
    } else {
      // Add reaction
      reactions[emoji] = [...existing, selfUid];
    }

    await prisma.message.update({
      where: { id: message.id },
      data: { reactions: reactions as any },
    });

    return res.json({
      data: {
        emoji,
        added: !existing.includes(selfUid),
        reactions,
        sdkResult,
      },
    });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log.error('Toggle reaction error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get reactions for a message ─────────────────────────────────────────
router.get('/accounts/:accountId/messages/:msgId/reactions', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { msgId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    await resolveAccount(accountId, user.id, isAdmin);

    const message = await prisma.message.findFirst({
      where: {
        zalo_msg_id: msgId,
        conversation: { zalo_account_id: accountId },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.json({ data: { reactions: message.reactions || {} } });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log.error('Get reactions error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Mark message as read / seen ─────────────────────────────────────────
router.post('/accounts/:accountId/messages/:msgId/mark-read', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { msgId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    await resolveAccount(accountId, user.id, isAdmin);

    const message = await prisma.message.findFirst({
      where: {
        zalo_msg_id: msgId,
        conversation: { zalo_account_id: accountId },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Update seen_at if not already set
    if (!message.seen_at) {
      await prisma.message.update({
        where: { id: message.id },
        data: { seen_at: new Date() },
      });
    }

    return res.json({ data: { ok: true } });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log.error('Mark read error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as zaloReactionRouter };
