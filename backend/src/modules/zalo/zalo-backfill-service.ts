/**
 * zalo-backfill-service.ts — backfill Zalo message history for fresh accounts.
 * Ported from ZaloCRM zalo-history-backfill.ts (346 lines) → single-org, Int IDs.
 *
 * Adaptations:
 *   - No Contact model / resolveOrCreateContact → upsert Friend directly
 *   - No handleIncomingMessage → insert Message/Conversation via prisma direct
 *   - No tenantTransaction → prisma.$transaction
 *   - No detectContentType / extractAlbumInfo → inline stub (todo: import zalo-message-helpers)
 *   - api.* = zaloPool.getAccountClient(accountId).api.*
 *   - accountId is now number (Int)
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';
import { detectContentType, extractAlbumInfo } from './zalo-message-helpers';

const log = createLogger('ZaloBackfillService');

const MAX_GROUPS = 50;
const MESSAGES_PER_GROUP = 50;
const DM_MAX_PAGES = 50;
const DM_PAGE_TIMEOUT_MS = 15_000;

// ThreadType from zca-js: 0 = User (DM), 1 = Group
const THREAD_TYPE_USER = 0;

export interface BackfillResult {
  friendsSynced: number;
  groupsSynced: number;
  messagesBackfilled: number;
  dmPagesRequested: number;
  errors: number;
}

interface PumpStats {
  pagesRequested: number;
  messagesInserted: number;
  messagesReceived: number;
}

/**
 * Multi-cursor strategy ported from openzca CLI getRecentPageCursors.
 * Tries oldest-by-ts / last-in-array / first-in-array.
 */
function pickNextCursors(messages: any[]): string[] {
  const cursors: string[] = [];
  const seen = new Set<string>();
  const add = (c: string) => {
    const v = c.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    cursors.push(v);
  };
  const cursorOf = (m: any): string => String(m?.data?.msgId || m?.data?.actionId || m?.data?.cliMsgId || '');

  let oldest: any = null;
  for (const m of messages) {
    const ts = parseInt(m?.data?.ts || '0');
    if (!oldest || ts < parseInt(oldest?.data?.ts || '0')) oldest = m;
  }
  if (oldest) add(cursorOf(oldest));
  add(cursorOf(messages[messages.length - 1]));
  add(cursorOf(messages[0]));
  return cursors;
}

/**
 * Insert a single message into Conversation/Message (idempotent via unique constraint).
 * Returns true if inserted (not duplicate).
 */
async function upsertMessage(params: {
  accountId: number;
  senderUid: string;
  senderName: string;
  content: string;
  contentType: string;
  zaloMsgId: string;
  timestamp: number;
  isSelf: boolean;
  threadId: string;
  threadType: 'user' | 'group';
  displayName?: string;
  avatarUrl?: string;
  isBackfill?: boolean;
}): Promise<boolean> {
  const {
    accountId, senderUid, senderName, content, contentType,
    zaloMsgId, timestamp, isSelf, threadId, threadType, displayName, avatarUrl, isBackfill,
  } = params;

  if (!zaloMsgId || !threadId) return false;

  const isGroup = threadType === 'group';
  const resolvedName = displayName || (!isGroup && !isSelf && senderName ? senderName : undefined);

  // Upsert Conversation
  const conversation = await prisma.conversation.upsert({
    where: {
      zalo_account_id_external_thread_id: {
        zalo_account_id: accountId,
        external_thread_id: threadId,
      },
    },
    create: {
      zalo_account_id: accountId,
      external_thread_id: threadId,
      thread_type: threadType,
      display_name: resolvedName ?? threadId,
      avatar_url: avatarUrl ?? null,
      group_name: isGroup ? (resolvedName ?? null) : null,
      group_avatar_url: isGroup ? (avatarUrl ?? null) : null,
      last_message_at: new Date(timestamp),
    },
    update: {
      last_message_at: new Date(timestamp),
      ...(resolvedName ? { display_name: resolvedName, ...(isGroup ? { group_name: resolvedName } : {}) } : {}),
      ...(avatarUrl ? { avatar_url: avatarUrl, ...(isGroup ? { group_avatar_url: avatarUrl } : {}) } : {}),
    },
  });

  // Idempotent insert (unique constraint on conversation_id + zalo_msg_id)
  try {
    await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        zalo_msg_id: zaloMsgId,
        sender_uid: senderUid,
        sender_name: senderName || (isSelf ? 'Me' : senderUid),
        sender_type: isSelf ? 'self' : 'other',
        content,
        content_type: contentType,
        is_self: isSelf,
        is_backfill: isBackfill ?? false,
        timestamp: new Date(timestamp),
      },
    });
    return true;
  } catch {
    // Duplicate — already exists
    return false;
  }
}

/**
 * Drive Zalo requestOldMessages pagination and persist each batch.
 */
async function pumpOldMessages(api: any, threadType: number, accountId: number): Promise<PumpStats> {
  return new Promise((resolve) => {
    const stats: PumpStats = { pagesRequested: 0, messagesInserted: 0, messagesReceived: 0 };
    const requestedCursors = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      try { api.listener?.off?.('old_messages', onPage); } catch { /* */ }
      if (timer) clearTimeout(timer);
      resolve(stats);
    };

    const resetIdleTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finish, DM_PAGE_TIMEOUT_MS);
    };

    const requestPage = (cursor: string | null): boolean => {
      const c = (cursor ?? '').trim();
      if (c && requestedCursors.has(c)) return false;
      if (c) requestedCursors.add(c);
      try {
        api.listener?.requestOldMessages?.(threadType, c || null);
        stats.pagesRequested++;
        resetIdleTimer();
        return true;
      } catch (err) {
        log.warn(`[backfill:${accountId}] requestOldMessages failed:`, { error: String(err) });
        return false;
      }
    };

    const onPage = async (messages: any[], type: number) => {
      if (finished) return;
      if (type !== threadType) return;
      if (!Array.isArray(messages) || messages.length === 0) { finish(); return; }

      stats.messagesReceived += messages.length;
      log.info(`[backfill:${accountId}] DM page: ${messages.length} msg(s), total=${stats.messagesReceived}`);

      for (const m of messages) {
        try {
          const isSelf = Boolean(m?.isSelf);
          const senderUid = String(m?.data?.uidFrom || '');
          const threadId = String(m?.threadId || (isSelf ? m?.data?.idTo : senderUid) || '');
          if (!threadId) continue;

          const rawContent = m?.data?.content;
          const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
          const contentType = detectContentType(m?.data?.msgType, rawContent);
          const album = extractAlbumInfo(contentType, rawContent);

          const inserted = await upsertMessage({
            accountId,
            senderUid,
            senderName: m?.data?.dName || '',
            content,
            contentType,
            zaloMsgId: String(m?.data?.msgId || m?.data?.cliMsgId || ''),
            timestamp: parseInt(m?.data?.ts || String(Date.now())),
            isSelf,
            threadId,
            threadType: threadType === THREAD_TYPE_USER ? 'user' : 'group',
            isBackfill: true,
          });
          if (inserted) stats.messagesInserted++;
        } catch (err) {
          log.warn(`[backfill:${accountId}] DM insert failed:`, { error: String(err) });
        }
      }

      if (stats.pagesRequested >= DM_MAX_PAGES) { finish(); return; }

      const candidates = pickNextCursors(messages);
      let requested = false;
      for (const c of candidates) {
        if (requestPage(c)) { requested = true; break; }
      }
      if (!requested) finish();
    };

    api.listener?.on?.('old_messages', onPage);
    if (!requestPage(null)) finish();
  });
}

/**
 * Full backfill: friends → groups → DM history.
 * Idempotent: re-running is safe — unique constraints prevent duplicates.
 */
export async function backfillAccountHistory(api: any, accountId: number): Promise<BackfillResult> {
  const result: BackfillResult = {
    friendsSynced: 0,
    groupsSynced: 0,
    messagesBackfilled: 0,
    dmPagesRequested: 0,
    errors: 0,
  };

  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  if (!account) {
    log.warn(`[backfill:${accountId}] Account not found`);
    return result;
  }

  // ── 1. Sync friends → Friend rows ─────────────────────────────────────
  try {
    const friendsRaw = await api.getAllFriends();
    const friends: Record<string, unknown>[] = Array.isArray(friendsRaw)
      ? (friendsRaw as Record<string, unknown>[])
      : (Object.values((friendsRaw || {}) as Record<string, unknown>) as Record<string, unknown>[]);
    for (const friend of friends as any[]) {
      const uid = String(friend?.userId || friend?.uid || '');
      if (!uid) continue;
      try {
        await prisma.friend.upsert({
          where: {
            zalo_account_id_zalo_uid_in_nick: {
              zalo_account_id: accountId,
              zalo_uid_in_nick: uid,
            },
          },
          create: {
            zalo_account_id: accountId,
            zalo_uid_in_nick: uid,
            friendship_status: 'accepted',
            relationship_kind: 'friend',
          },
          update: {},
        });
        result.friendsSynced++;
      } catch (err) {
        result.errors++;
        log.warn(`[backfill:${accountId}] Friend ${uid} upsert failed:`, { error: String(err) });
      }
    }
  } catch (err) {
    result.errors++;
    log.warn(`[backfill:${accountId}] getAllFriends failed:`, { error: String(err) });
  }

  // ── 2. Sync groups → conversations + history ─────────────────────────
  let groupsRaw: any = null;
  try {
    groupsRaw = await api.getAllGroups();
  } catch (err) {
    result.errors++;
    log.warn(`[backfill:${accountId}] getAllGroups failed:`, { error: String(err) });
  }

  const dbGroups = await prisma.zaloGroup.findMany({
    where: { zalo_account_id: accountId },
    select: { zalo_group_id: true, name: true, avatar_url: true, member_count: true },
  }).catch(() => []);
  const dbGroupMap = new Map(dbGroups.map((g) => [g.zalo_group_id, g]));

  const verIds = Object.keys(groupsRaw?.gridVerMap ?? {});
  const infoMap: Record<string, any> = groupsRaw?.gridInfoMap ?? {};
  const infoIds = Object.keys(infoMap);
  const dbIds = dbGroups.map((g) => g.zalo_group_id);
  const allGroupIds = Array.from(new Set([...verIds, ...infoIds, ...dbIds])).filter(Boolean);

  const groupSubset = allGroupIds.slice(0, MAX_GROUPS);
  for (const groupId of groupSubset) {
    if (!groupId) continue;

    try {
      const rawGroup = infoMap[groupId];
      const dbGroup = dbGroupMap.get(groupId);
      const groupName: string =
        rawGroup?.name || rawGroup?.groupName || dbGroup?.name || groupId;
      const groupAvatar: string | undefined =
        rawGroup?.fullAvt || rawGroup?.avt || rawGroup?.avatar || dbGroup?.avatar_url || undefined;
      const groupMembersCount: number | undefined =
        typeof rawGroup?.totalMember === 'number'
          ? rawGroup.totalMember
          : (dbGroup?.member_count ?? undefined);

      // Ensure Conversation row exists for this group even if chat history is empty
      await prisma.conversation.upsert({
        where: {
          zalo_account_id_external_thread_id: {
            zalo_account_id: accountId,
            external_thread_id: groupId,
          },
        },
        create: {
          zalo_account_id: accountId,
          external_thread_id: groupId,
          thread_type: 'group',
          display_name: groupName,
          group_name: groupName,
          avatar_url: groupAvatar ?? null,
          group_avatar_url: groupAvatar ?? null,
          group_members_count: groupMembersCount ?? null,
        },
        update: {
          thread_type: 'group',
          ...(groupName && groupName !== groupId
            ? { display_name: groupName, group_name: groupName }
            : {}),
          ...(groupAvatar ? { avatar_url: groupAvatar, group_avatar_url: groupAvatar } : {}),
          ...(groupMembersCount != null ? { group_members_count: groupMembersCount } : {}),
        },
      });

      if (typeof api.getGroupChatHistory === 'function') {
        const history = await api.getGroupChatHistory(groupId, MESSAGES_PER_GROUP);
        const messages = history?.groupMsgs || history?.data?.groupMsgs || [];

        for (const msg of messages as any[]) {
          try {
            const zaloMsgId = String(msg?.data?.msgId || msg?.data?.cliMsgId || '');
            if (!zaloMsgId) continue;

            const rawContent = msg?.data?.content;
            const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
            const contentType = detectContentType(msg?.data?.msgType, rawContent);

            const inserted = await upsertMessage({
              accountId,
              senderUid: String(msg?.data?.uidFrom || ''),
              senderName: msg?.data?.dName || '',
              content,
              contentType,
              zaloMsgId,
              timestamp: parseInt(msg?.data?.ts || String(Date.now())),
              isSelf: Boolean(msg?.isSelf),
              threadId: groupId,
              threadType: 'group',
              displayName: groupName !== groupId ? groupName : undefined,
              avatarUrl: groupAvatar,
              isBackfill: true,
            });
            if (inserted) result.messagesBackfilled++;
          } catch (err) {
            result.errors++;
            log.warn(`[backfill:${accountId}] Group ${groupId} msg insert failed:`, { error: String(err) });
          }
        }
      }
      result.groupsSynced++;
    } catch (err) {
      result.errors++;
      log.warn(`[backfill:${accountId}] Group ${groupId} history fetch failed:`, { error: String(err) });
    }
  }

  // ── 3. DM & Group history via requestOldMessages pagination ──────────
  try {
    if (api?.listener?.requestOldMessages) {
      const dmStats = await pumpOldMessages(api, THREAD_TYPE_USER, accountId);
      result.dmPagesRequested = dmStats.pagesRequested;
      result.messagesBackfilled += dmStats.messagesReceived;

      const groupStats = await pumpOldMessages(api, 1, accountId);
      result.dmPagesRequested += groupStats.pagesRequested;
      result.messagesBackfilled += groupStats.messagesReceived;
    } else {
      log.warn(`[backfill:${accountId}] requestOldMessages unavailable — skipping history pump`);
    }
  } catch (err) {
    result.errors++;
    log.warn(`[backfill:${accountId}] History pump failed:`, { error: String(err) });
  }

  // Sanity check
  const [convCount, msgCount] = await prisma.$transaction([
    prisma.conversation.count({ where: { zalo_account_id: accountId } }),
    prisma.message.count({ where: { conversation: { zalo_account_id: accountId } } }),
  ]).catch(() => [0, 0] as [number, number]);

  log.info(
    `[backfill:${accountId}] Done — friends=${result.friendsSynced} groups=${result.groupsSynced} ` +
    `dmPages=${result.dmPagesRequested} errors=${result.errors} ` +
    `| DB: ${convCount} conversations, ${msgCount} messages`,
  );
  return result;
}

/**
 * Backfill only if account has no messages yet in DB (first-time login or empty message history).
 */
export async function backfillIfEmpty(api: any, accountId: number): Promise<boolean> {
  const existingMessages = await prisma.message.count({
    where: { conversation: { zalo_account_id: accountId } },
  });
  if (existingMessages > 0) return false;

  log.info(`[backfill:${accountId}] Empty message set — starting initial backfill`);
  await backfillAccountHistory(api, accountId);
  return true;
}
