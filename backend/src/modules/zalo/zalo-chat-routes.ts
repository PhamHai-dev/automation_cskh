/**
 * zalo-chat-routes.ts — Express Router: Zalo conversation & message REST API.
 *
 * Endpoints (aligned with ZaloCRM chat-routes.ts patterns):
 *   GET    /:accountId/conversations                  — paginated conversation list
 *   GET    /:accountId/conversations/counts            — unread/unreplied counts per tab
 *   GET    /:accountId/conversations/:threadId/messages — paginated message history
 *   POST   /:accountId/conversations/:threadId/messages — send new message (SDK + persist)
 *   POST   /:accountId/conversations/:threadId/mark-read — mark conversation as read
 *   DELETE /:accountId/conversations/:threadId          — soft delete conversation
 *   POST   /:accountId/conversations/:threadId/restore  — restore soft-deleted conversation
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { zaloRateLimiter } from './zalo-rate-limiter';
import { checkAccess, resolveAccount, handleError } from './zalo-route-helpers';

const log = createLogger('ZaloChatRoutes');
const router = Router({ mergeParams: true });

// ─── GET /:accountId/conversations — paginated conversation list ────────────

/**
 * GET /:accountId/conversations
 * Query: page, limit, search, threadType (user|group|all), tab (main|other|all)
 * Aligned with ZaloCRM: excludes soft-deleted, includes tab/unread/group metadata.
 */
router.get('/accounts/:accountId/conversations', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const {
    page = '1',
    limit = '50',
    search = '',
    threadType = 'all',
    tab = 'all',
  } = req.query as Record<string, string>;

  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      zalo_account_id: accountId,
      deleted_at: null,
    };

    if (tab && tab !== 'all') {
      where.tab = tab;
    }

    if (threadType && threadType !== 'all') {
      where.thread_type = threadType;
    }

    if (search.trim()) {
      const q = search.trim();
      where.OR = [
        { display_name: { contains: q, mode: 'insensitive' } },
        { group_name: { contains: q, mode: 'insensitive' } },
        { external_thread_id: { contains: q } },
      ];
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { last_message_at: 'desc' },
        skip,
        take: limitNum,
        include: {
          _count: { select: { messages: true } },
        },
      }),
      prisma.conversation.count({ where }),
    ]);

    const convIds = conversations.map((c) => c.id);
    let lastMsgRows: any[] = [];
    if (convIds.length > 0) {
      lastMsgRows = await prisma.$queryRaw<any[]>`
        SELECT m.conversation_id, m.sender_uid, m.sender_name, m.sender_type,
               m.content, m.content_type, m.timestamp, m.is_self
        FROM messages m
        INNER JOIN (
          SELECT conversation_id, MAX(timestamp) AS max_ts
          FROM messages
          WHERE conversation_id IN (${convIds.join(',')})
          GROUP BY conversation_id
        ) latest ON m.conversation_id = latest.conversation_id AND m.timestamp = latest.max_ts
      `.catch(() => []);
    }

    const lastMsgMap = new Map<number, any>();
    for (const row of lastMsgRows) {
      lastMsgMap.set(row.conversation_id, row);
    }

    // ─── Resolve DM names/avatars from Friend table ────────────────────────
    const userIds = conversations
      .filter((c) => c.thread_type === 'user')
      .map((c) => c.external_thread_id);

    let friendMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
    if (userIds.length > 0) {
      const friends = await prisma.friend.findMany({
        where: { zalo_account_id: accountId, zalo_uid_in_nick: { in: userIds } },
        select: { zalo_uid_in_nick: true, zalo_display_name: true, zalo_avatar_url: true },
      });
      for (const f of friends) {
        if (f.zalo_display_name) {
          friendMap.set(f.zalo_uid_in_nick, {
            displayName: f.zalo_display_name,
            avatarUrl: f.zalo_avatar_url || null,
          });
        }
      }
    }

    // ─── Resolve group avatars from ZaloGroup table (fallback) ──────────────
    const groupThreadsMissing = conversations
      .filter((c) => c.thread_type === 'group' && !c.group_avatar_url)
      .map((c) => c.external_thread_id);

    const groupAvatarMap = new Map<string, string | null>();
    if (groupThreadsMissing.length > 0) {
      const zaloGroups = await prisma.zaloGroup.findMany({
        where: { zalo_account_id: accountId, zalo_group_id: { in: groupThreadsMissing } },
        select: { zalo_group_id: true, avatar_url: true },
      });
      for (const g of zaloGroups) {
        if (g.avatar_url) groupAvatarMap.set(g.zalo_group_id, g.avatar_url);
      }
    }

    const result = conversations.map((c) => {
      // For user (DM) conversations, resolve name from Friend table first, then Contact table
      let resolvedName = c.display_name;
      let resolvedAvatar: string | null = c.avatar_url || null;

      if (c.thread_type === 'user') {
        const friendInfo = friendMap.get(c.external_thread_id);
        if (friendInfo) {
          resolvedName = friendInfo.displayName;
          resolvedAvatar = friendInfo.avatarUrl;
        } else if (
          !resolvedName || resolvedName === c.external_thread_id || resolvedName.startsWith('uid_')
        ) {
          resolvedName = c.external_thread_id; // final fallback
        }
      } else {
        // group: prefer group_name > display_name
        resolvedName = c.group_name || c.display_name || c.external_thread_id;
        resolvedAvatar = c.group_avatar_url || groupAvatarMap.get(c.external_thread_id) || null;
      }

      return {
        id: c.id,
        externalThreadId: c.external_thread_id,
        threadType: c.thread_type,
        displayName: resolvedName,
        avatarUrl: resolvedAvatar,
        groupName: c.group_name,
        groupAvatarUrl: c.group_avatar_url || groupAvatarMap.get(c.external_thread_id) || null,
        groupMembersCount: c.group_members_count,
        tab: c.tab,
        unreadCount: c.unread_count,
        isReplied: c.is_replied,
        lastMessageAt: c.last_message_at,
        messageCount: c._count.messages,
        lastMessage: lastMsgMap.get(c.id)
          ? {
              content: lastMsgMap.get(c.id).content,
              contentType: lastMsgMap.get(c.id).content_type,
              senderUid: lastMsgMap.get(c.id).sender_uid,
              senderName: lastMsgMap.get(c.id).sender_name,
              senderType: lastMsgMap.get(c.id).sender_type,
              timestamp: lastMsgMap.get(c.id).timestamp,
              isSelf: lastMsgMap.get(c.id).is_self,
            }
          : null,
      };
    });

    return res.json({
      success: true,
      items: result,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    return handleError(res, err, 'conversation-list');
  }
});

// ─── GET /:accountId/conversations/counts — unread/unreplied counts ────────

/**
 * GET /:accountId/conversations/counts
 * Returns unread counts per threadType and tab for badge display.
 */
router.get('/accounts/:accountId/conversations/counts', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { tab = 'all' } = req.query as Record<string, string>;

  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const baseWhere: any = {
      zalo_account_id: accountId,
      deleted_at: null,
    };

    if (tab && tab !== 'all') {
      baseWhere.tab = tab;
    }

    const [total, unread, unreplied, userCount, groupCount] = await Promise.all([
      prisma.conversation.count({ where: baseWhere }),
      prisma.conversation.count({ where: { ...baseWhere, unread_count: { gt: 0 } } }),
      prisma.conversation.count({ where: { ...baseWhere, is_replied: false } }),
      prisma.conversation.count({ where: { ...baseWhere, thread_type: 'user' } }),
      prisma.conversation.count({ where: { ...baseWhere, thread_type: 'group' } }),
    ]);

    return res.json({
      success: true,
      data: { total, unread, unreplied, userCount, groupCount },
    });
  } catch (err) {
    return handleError(res, err, 'conversation-counts');
  }
});

// ─── GET /:accountId/conversations/:threadId/messages — message history ─────

/**
 * GET /:accountId/conversations/:threadId/messages
 * Query: page, limit, before (timestamp cursor for older messages)
 */
router.get('/accounts/:accountId/conversations/:threadId/messages', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { page = '1', limit = '50', before } = req.query as Record<string, string>;

  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const where: any = {
      conversation_id: conversation.id,
      is_deleted: false,
    };
    if (before) {
      where.timestamp = { lt: new Date(before) };
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limitNum,
    });

    messages.reverse();

    return res.json({
      success: true,
      items: messages.map((m) => ({
        id: m.id,
        zaloMsgId: m.zalo_msg_id,
        senderUid: m.sender_uid,
        senderName: m.sender_name,
        senderType: m.sender_type,
        content: m.content,
        contentType: m.content_type,
        attachments: m.attachments,
        quote: m.quote,
        mentions: m.mentions,
        albumKey: m.album_key,
        albumIndex: m.album_index,
        albumTotal: m.album_total,
        isSelf: m.is_self,
        isBackfill: m.is_backfill,
        isDeleted: m.is_deleted,
        deliveredAt: m.delivered_at,
        seenAt: m.seen_at,
        timestamp: m.timestamp,
      })),
      hasMore: messages.length === limitNum,
      threadId,
    });
  } catch (err) {
    return handleError(res, err, 'message-history');
  }
});

// ─── POST /:accountId/conversations/:threadId/messages — send message ───────

/**
 * POST /:accountId/conversations/:threadId/messages
 * Body: { content, contentType?, attachments?, quote? }
 * Sends via Zalo SDK + persists to DB.
 */
router.post('/accounts/:accountId/conversations/:threadId/messages', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  const { content, contentType = 'text', attachments = [], quote = null } = req.body as {
    content?: string;
    contentType?: string;
    attachments?: Array<{ url: string; name: string; mime: string; size: number }>;
    quote?: any;
  };

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    const account = await resolveAccount(accountId, user.id, isAdmin);

    let client = zaloPool.getAccountClient(accountId);
    if (!client) {
      const recovered = await zaloPool.tryReconnect(accountId);
      if (recovered) client = zaloPool.getAccountClient(accountId);
    }
    if (!client) {
      return res.status(503).json({ error: 'Nick chưa kết nối Zalo' });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      const threadType = threadId.startsWith('group_') ? 'group' : 'user';
      let resolvedName = threadId;
      let resolvedAvatar: string | null = null;

      // Try to resolve name from Friend table
      const friendRow = await prisma.friend.findFirst({
        where: { zalo_account_id: accountId, zalo_uid_in_nick: threadId },
        select: { zalo_display_name: true, zalo_avatar_url: true },
      });
      if (friendRow) {
        resolvedName = friendRow.zalo_display_name || threadId;
        resolvedAvatar = friendRow.zalo_avatar_url || null;
      } else if (threadType === 'group') {
        // Try SDK for group name
        try {
          const sdkRes: any = await client.getGroupInfo?.(threadId);
          const info = sdkRes?.gridInfoMap?.[threadId] ?? Object.values(sdkRes?.gridInfoMap ?? {})[0];
          resolvedName = info?.name || info?.groupName || threadId;
          resolvedAvatar = info?.fullAvt || info?.avt || null;
        } catch { /* fallback to threadId */ }
      } else {
        // Try SDK for DM name
        try {
          const sdkRes: any = await client.getUserInfo?.(threadId);
          const profile = sdkRes?.changed_profiles?.[threadId] || sdkRes?.changed_profiles?.[`${threadId}_0`];
          resolvedName = profile?.zaloName || profile?.displayName || threadId;
          resolvedAvatar = profile?.avatar || null;
        } catch { /* fallback to threadId */ }
      }

      conversation = await prisma.conversation.create({
        data: {
          zalo_account_id: accountId,
          external_thread_id: threadId,
          thread_type: threadType,
          display_name: resolvedName,
          avatar_url: resolvedAvatar,
          last_message_at: new Date(),
        },
      });
    }

    const isGroup = conversation.thread_type === 'group';
    let sendResult: any;

    const limitCheck = await zaloRateLimiter.checkLimits(accountId, 'message');
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: limitCheck.reason,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    }

    try {
      // zca-js SDK: sendMessage(message, threadId, type?) where type: 0=User, 1=Group
      const threadType = isGroup ? 1 : 0;
      sendResult = await client.sendMessage(content.trim(), threadId, threadType);
    } catch (sdkErr: any) {
      log.warn(`SDK send failed for thread ${threadId}: ${sdkErr.message}`);
      return res.status(502).json({ error: 'Gửi tin nhắn thất bại từ Zalo SDK', detail: sdkErr.message });
    }

    await zaloRateLimiter.recordSend(accountId, 'message');

    const msg = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        zalo_msg_id: sendResult?.msgId || `local_${Date.now()}`,
        sender_uid: 'self',
        sender_name: account.display_name || 'Me',
        sender_type: 'self',
        content: content.trim(),
        content_type: contentType,
        attachments: attachments as any,
        quote: quote as any,
        is_self: true,
        sent_via: 'user',
        timestamp: new Date(),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        last_message_at: new Date(),
        is_replied: true,
      },
    });

    log.info(`Message sent: accountId=${accountId} thread=${threadId} msgId=${msg.zalo_msg_id}`);

    return res.status(201).json({
      success: true,
      data: {
        id: msg.id,
        zaloMsgId: msg.zalo_msg_id,
        senderUid: msg.sender_uid,
        senderName: msg.sender_name,
        senderType: msg.sender_type,
        content: msg.content,
        contentType: msg.content_type,
        attachments: msg.attachments,
        quote: msg.quote,
        isSelf: msg.is_self,
        timestamp: msg.timestamp,
      },
    });
  } catch (err) {
    return handleError(res, err, 'send-message');
  }
});

// ─── POST /:accountId/conversations/:threadId/mark-read ────────────────────

/**
 * POST /:accountId/conversations/:threadId/mark-read
 * Resets unread_count to 0 and sets is_replied = true.
 */
router.post('/accounts/:accountId/conversations/:threadId/mark-read', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unread_count: 0, is_replied: true },
    });

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'mark-read');
  }
});

// ─── DELETE /:accountId/conversations/:threadId — soft delete ───────────────

/**
 * DELETE /:accountId/conversations/:threadId
 * Sets deleted_at = now(). Messages are NOT deleted physically.
 */
router.delete('/accounts/:accountId/conversations/:threadId', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { deleted_at: new Date() },
    });

    log.info(`Conversation soft-deleted: accountId=${accountId} thread=${threadId}`);

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'delete-conversation');
  }
});

// ─── POST /:accountId/conversations/:threadId/restore ──────────────────────

/**
 * POST /:accountId/conversations/:threadId/restore
 * Clears deleted_at = null to restore a soft-deleted conversation.
 */
router.post('/accounts/:accountId/conversations/:threadId/restore', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { threadId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    if (!(await checkAccess(req, res, accountId, 'chat'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { deleted_at: null },
    });

    log.info(`Conversation restored: accountId=${accountId} thread=${threadId}`);

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'restore-conversation');
  }
});

// ─── POST /:accountId/groups/:groupId/ensure-conversation ────────────────

/**
 * POST /:accountId/groups/:groupId/ensure-conversation
 * Ensures a conversation exists for a given Zalo group ID.
 * Used when opening chat from GroupsView: ensures the conversation
 * is created in DB so we can navigate to /chat/:convId.
 */
router.post('/accounts/:accountId/groups/:groupId/ensure-conversation', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const { groupId } = req.params;
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');

  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const threadId = groupId; // group ID is the external thread ID

    let conversation = await prisma.conversation.findFirst({
      where: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    });

    if (!conversation) {
      // Try to fetch group name from SDK for display
      let displayName = threadId;
      try {
        const client = zaloPool.getAccountClient(accountId);
        if (client) {
          const groupInfo = await client.getGroupInfo(groupId) as any;
          const grid = groupInfo?.gridInfoMap?.[groupId] ?? Object.values(groupInfo?.gridInfoMap ?? {})[0];
          displayName = grid?.name || grid?.groupName || threadId;
        }
      } catch { /* use groupId as fallback */ }

      conversation = await prisma.conversation.create({
        data: {
          zalo_account_id: accountId,
          external_thread_id: threadId,
          thread_type: 'group',
          display_name: displayName,
          group_name: displayName,
          last_message_at: new Date(),
        },
      });
    }

    return res.json({
      success: true,
      data: { conversationId: String(conversation.id) },
    });
  } catch (err) {
    return handleError(res, err, 'ensure-conversation');
  }
});

export { router as zaloChatRouter };

