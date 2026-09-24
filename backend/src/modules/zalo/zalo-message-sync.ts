/**
 * zalo-message-sync.ts — Polling backup cho group message history.
 * Runs periodically per connected account, calls getGroupChatHistory()
 * cho active groups, va insert cac message con thieu trong DB.
 *
 * Ported from ZaloCRM zalo-message-sync.ts (139 lines, 5.2KB).
 *
 * Day la safety net — primary sync path la selfListen + old_messages (listener).
 *
 * Adaptations from ZaloCRM:
 *   - handleIncomingMessage (chat/message-handler) -> direct insert Message
 *     bang detectContentType + extractAlbumInfo (da co trong zalo-message-helpers).
 *   - Conversation.last_message_at update inline sau khi insert tin moi.
 *   - No withTenant/runSystemQuery/orgId -> single-org, Int IDs, snake_case.
 *
 * Batch dedup: query existing zalo_msg_id trong conversation truoc (1 query/group),
 * chi insert nhung id con thieu. isBackfill=true cho moi tin tu polling.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { detectContentType, extractAlbumInfo } from './zalo-message-helpers';

const log = createLogger('ZaloMessageSync');

const SYNC_INTERVAL_MS = 5 * 60_000; // 5 phút
const MAX_GROUPS_PER_SYNC = 20;
const MESSAGES_PER_GROUP = 50;

// Track active sync intervals per account
const syncIntervals = new Map<number, ReturnType<typeof setInterval>>();

/**
 * Sync recent group messages cho 1 account.
 * Returns so tin moi duoc insert.
 */
async function syncGroupMessages(api: any, accountId: number): Promise<number> {
  // Nhung group conversation moi nhat (top N) cua nick
  const groupConvs = await prisma.conversation.findMany({
    where: { zalo_account_id: accountId, thread_type: 'group' },
    select: { id: true, external_thread_id: true, display_name: true, group_name: true },
    take: MAX_GROUPS_PER_SYNC,
    orderBy: { last_message_at: 'desc' },
  });

  let synced = 0;

  for (const conv of groupConvs) {
    try {
      // ─── Backfill group display_name if still raw ID ────────────────────
      if (!conv.group_name || conv.group_name === conv.external_thread_id) {
        try {
          const infoRes: any = await api.getGroupInfo?.(conv.external_thread_id);
          const info = infoRes?.gridInfoMap?.[conv.external_thread_id]
            ?? Object.values(infoRes?.gridInfoMap ?? {})[0];
          if (info) {
            const newName = info.name || info.groupName || null;
            const newAvatar = info.fullAvt || info.avt || null;
            if (newName) {
              await prisma.conversation.update({
                where: { id: conv.id },
                data: { group_name: newName, display_name: newName, group_avatar_url: newAvatar },
              });
            }
          }
        } catch { /* non-critical */ }
      }

      const history = await api.getGroupChatHistory(conv.external_thread_id, MESSAGES_PER_GROUP);
      const messages = history?.groupMsgs || history?.data?.groupMsgs || [];

      // Collect all msgIds cho batch dedup check
      const msgIdMap = new Map<string, any>();
      for (const msg of messages) {
        const zaloMsgId = String(msg.data?.msgId || msg.data?.cliMsgId || '');
        if (zaloMsgId) msgIdMap.set(zaloMsgId, msg);
      }
      if (msgIdMap.size === 0) continue;

      // Batch existence check — single query per group
      const existing = await prisma.message.findMany({
        where: { conversation_id: conv.id, zalo_msg_id: { in: [...msgIdMap.keys()] } },
        select: { zalo_msg_id: true },
      });
      const existingIds = new Set(existing.map((m) => m.zalo_msg_id));

      // Batch-resolve sender UIDs → display names from GroupMember table
      const senderUids = new Set<string>();
      for (const [, msg] of msgIdMap) {
        const uid = String(msg.data?.uidFrom || '');
        if (uid) senderUids.add(uid);
      }
      let memberNameMap = new Map<string, string>();
      if (senderUids.size > 0) {
        const members = await prisma.groupMember.findMany({
          where: { zalo_account_id: accountId, group_id: conv.external_thread_id, member_uid: { in: [...senderUids] } },
          select: { member_uid: true, display_name: true, zalo_name: true },
        });
        for (const m of members) {
          memberNameMap.set(m.member_uid, m.display_name || m.zalo_name || '');
        }
      }

      let groupInserted = 0;
      let lastTs: Date | null = null;

      for (const [zaloMsgId, msg] of msgIdMap) {
        if (existingIds.has(zaloMsgId)) continue;

        const rawContent = msg.data?.content;
        const content =
          typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
        const contentType = detectContentType(msg.data?.msgType, rawContent);
        const album = extractAlbumInfo(contentType, rawContent);
        const ts = new Date(parseInt(msg.data?.ts || String(Date.now())));
        const senderUid = String(msg.data?.uidFrom || '');

        try {
          await prisma.message.create({
            data: {
              conversation_id: conv.id,
              zalo_msg_id: zaloMsgId,
              sender_uid: senderUid,
              sender_name: memberNameMap.get(senderUid) || (msg.isSelf ? 'Me' : senderUid),
              sender_type: msg.isSelf ? 'self' : 'other',
              content,
              content_type: contentType,
              album_key: album.albumKey,
              album_index: album.albumIndex,
              album_total: album.albumTotal,
              is_self: Boolean(msg.isSelf || false),
              is_backfill: true,
              raw_content: msg.data ? (msg.data as any) : undefined,
              timestamp: ts,
            },
          });
          groupInserted++;
          if (!lastTs || ts > lastTs) lastTs = ts;
        } catch (err) {
          log.warn(`[sync:${accountId}] Insert msg ${zaloMsgId} failed`, { error: String(err) });
        }
      }

      if (lastTs) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { last_message_at: lastTs },
        });
      }

      synced += groupInserted;
    } catch (err) {
      log.warn(`[sync:${accountId}] Group ${conv.external_thread_id} failed`, { error: String(err) });
    }
  }

  return synced;
}

/** Start periodic group sync cho 1 account. Idempotent per account. */
export function startMessageSync(api: any, accountId: number): void {
  if (syncIntervals.has(accountId)) return;

  const interval = setInterval(async () => {
    try {
      const count = await syncGroupMessages(api, accountId);
      if (count > 0) {
        log.info(`[sync:${accountId}] Backfilled ${count} group messages`);
      }
    } catch (err) {
      log.warn(`[sync:${accountId}] Sync error`, { error: String(err) });
    }
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  log.info(`[sync:${accountId}] Started group message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

/** Stop periodic sync cho 1 account (dung cho test cleanup / account disconnect). */
export function stopMessageSync(accountId: number): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    log.info(`[sync:${accountId}] Stopped group message sync`);
  }
}

/** Dọn tất cả interval khi server shutdown. */
export function stopAllMessageSyncs(): void {
  for (const [accountId, interval] of syncIntervals) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
  }
  log.info('[sync] All group message syncs stopped');
}
