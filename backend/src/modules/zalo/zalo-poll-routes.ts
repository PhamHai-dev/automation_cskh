/**
 * zalo-poll-routes.ts — Group poll endpoints.
 *
 * POST /accounts/:accountId/conversations/:threadId/polls — create poll
 * POST /accounts/:accountId/conversations/:threadId/polls/:pollId/vote — vote
 * GET  /accounts/:accountId/conversations/:threadId/polls/:pollId — get poll
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloPolls');
const router = Router();

// ─── Helper: resolve account + conversation ──────────────────────────────
async function resolveConversation(accountId: number, threadId: string, userId: number, _isAdmin?: boolean) {
  const account = await prisma.zaloAccount.findUnique({ where: { id: accountId } });
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });
  if (account.cs_id !== userId) {
    throw Object.assign(new Error('Không có quyền truy cập tài khoản Zalo của người dùng khác'), { status: 403 });
  }

  const conversation = await prisma.conversation.findFirst({
    where: { zalo_account_id: accountId, external_thread_id: threadId },
  });
  if (!conversation) throw Object.assign(new Error('Conversation not found'), { status: 404 });

  return { account, conversation };
}

// ─── Create poll ─────────────────────────────────────────────────────────
router.post('/accounts/:accountId/conversations/:threadId/polls', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { question, options, allowMulti = false, anonymous = false, expireMs } = req.body as {
    question?: string;
    options?: string[];
    allowMulti?: boolean;
    anonymous?: boolean;
    expireMs?: number;
  };

  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (!options || options.length < 2) {
    return res.status(400).json({ error: 'at least 2 options are required' });
  }

  try {
    const { account } = await resolveConversation(accountId, threadId, user.id, isAdmin);

    const client = zaloPool.getAccountClient(accountId);
    if (!client) {
      return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    }

    // Try SDK poll creation (if available)
    let sdkResult: any = null;
    try {
      if (typeof client.createPoll === 'function') {
        sdkResult = await client.createPoll(threadId, question.trim(), options.map((o) => o.trim()));
        log.info(`SDK poll created: ${sdkResult?.pollId || 'unknown'}`);
      } else {
        log.warn('SDK createPoll not available — storing locally only');
      }
    } catch (sdkErr: any) {
      log.warn(`SDK createPoll failed: ${sdkErr.message} — storing locally only`);
    }

    // Create poll as a special message in the conversation
    const pollId = sdkResult?.pollId || `local_poll_${Date.now()}`;
    const pollData = {
      id: pollId,
      question: question.trim(),
      options: options.map((o, idx) => ({
        id: idx,
        text: o.trim(),
        votes: 0,
        votedBySelf: false,
        voterUids: [] as string[],
      })),
      totalVotes: 0,
      allowMulti,
      anonymous,
      expiresAt: expireMs ? new Date(Date.now() + expireMs).toISOString() : null,
      createdBy: user.id.toString(),
    };

    const msg = await prisma.message.create({
      data: {
        conversation_id: (await resolveConversation(accountId, threadId, user.id, isAdmin)).conversation.id,
        zalo_msg_id: `poll_${Date.now()}`,
        sender_uid: 'self',
        sender_name: account.display_name || 'Me',
        sender_type: 'self',
        content: `📊 ${question.trim()}`,
        content_type: 'poll',
        attachments: [],
        is_self: true,
        sent_via: 'user',
        raw_content: pollData as any,
        timestamp: new Date(),
      },
    });

    return res.json({
      data: {
        pollId,
        messageId: msg.id,
        poll: pollData,
        sdkResult,
      },
    });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log.error('Create poll error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Vote on poll ────────────────────────────────────────────────────────
router.post('/accounts/:accountId/conversations/:threadId/polls/:pollId/vote', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId, pollId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { optionIds } = req.body as { optionIds?: number[] };

  if (!optionIds || !optionIds.length) {
    return res.status(400).json({ error: 'optionIds is required' });
  }

  try {
    const { account } = await resolveConversation(accountId, threadId, user.id, isAdmin);

    const client = zaloPool.getAccountClient(accountId);

    // Try SDK vote (if available)
    let sdkResult: any = null;
    if (client) {
      try {
        if (typeof client.votePoll === 'function') {
          sdkResult = await client.votePoll(threadId, pollId, optionIds);
          log.info(`SDK poll voted: ${pollId}`);
        }
      } catch (sdkErr: any) {
        log.warn(`SDK votePoll failed: ${sdkErr.message}`);
      }
    }

    // Find the poll message and update locally
    const pollMsg = await prisma.message.findFirst({
      where: {
        zalo_msg_id: { contains: 'poll_' },
        content_type: 'poll',
        raw_content: { path: ['id'], equals: pollId } as any,
        conversation: { zalo_account_id: accountId, external_thread_id: threadId },
      },
    });

    if (pollMsg && pollMsg.raw_content) {
      const pollData = pollMsg.raw_content as any;
      const selfUid = user.id.toString();

      // Update options with votes
      pollData.options = pollData.options.map((opt: any) => {
        if (optionIds.includes(opt.id)) {
          if (!opt.voterUids.includes(selfUid)) {
            opt.voterUids.push(selfUid);
            opt.votes++;
          }
          opt.votedBySelf = true;
        }
        return opt;
      });

      pollData.totalVotes = pollData.options.reduce((sum: number, opt: any) => sum + opt.votes, 0);

      await prisma.message.update({
        where: { id: pollMsg.id },
        data: { raw_content: pollData as any },
      });

      return res.json({ data: { poll: pollData, sdkResult } });
    }

    return res.json({ data: { poll: null, sdkResult, message: 'Poll message not found in DB' } });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    log.error('Vote poll error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as zaloPollRouter };
