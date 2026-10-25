/**
 * zalo-listener-factory.ts — sets up zca-js listener events for one Zalo account.
 *
 * Ported from ZaloCRM listener-factory.ts (1000 lines) → single-org, Int IDs.
 * Covers all CRM event categories: message, friend_event, group_event, undo,
 * typing, seen_messages, delivered_messages, reaction, old_messages, old_reactions.
 *
 * Adaptations from ZaloCRM:
 *   - No Socket.IO io → emits stubbed to log only
 *   - No orgId/ownerUserId/privacyMode → single-org, no scope needed
 *   - No emitChatMessage / notifyNewInboundMessage → log only
 *   - No consumeReactionEcho → skipped
 *   - No handleMessageUndo → lazy import or stub
 *   - No resolveContact / upsertContact → no Contact model
 *   - Int IDs (ZaloAccount.id is Int), snake_case Prisma fields
 *   - resolveZaloName: getUserInfo API → 5-min in-memory cache (copied from CRM)
 *   - resolveGroupInfo: getGroupInfo API (copied from CRM)
 *   - extractZaloMentions: 2-channel mention extraction (copied from CRM)
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { emitToAccount } from '../../shared/realtime/socket-singleton';
import { zaloPool } from './zalo-pool';
import { detectContentType, extractAlbumInfo, updateContactAvatar } from './zalo-message-helpers';
import { handleFriendEvent } from './friend-event-handler';
import type { IncomingMessage } from './types/zalo.types';

const log = createLogger('ZaloListener');

// ─── Reaction emoji map (from ZaloCRM) ─────────────────────────────────────
const ZALO_REACTION_DISPLAY: Record<string, string> = {
  '/-heart': '❤️',
  '/-strong': '👍',
  ':>': '😆',
  ':o': '😮',
  ':-(': '😭',
  ':-h': '😡',
  '/-rose': '🌹',
  '/-break': '💔',
  '/-weak': '👎',
};

// ─── User info cache (5-min TTL) — ported from ZaloCRM resolveZaloName ────
interface UserInfoCacheEntry {
  zaloName: string;
  avatar: string;
  phone?: string;
  globalId: string;
  username: string;
  gender?: unknown;
  sdob?: unknown;
  status?: unknown;
  cover?: unknown;
  lastActionTime?: unknown;
  isExtensionAccount?: unknown;
  cachedAt: number;
}

const USER_INFO_CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveZaloName(
  api: any,
  uid: string,
  cache: Map<string, UserInfoCacheEntry>,
): Promise<{
  zaloName: string; avatar: string; globalId: string; username: string;
  phone: string; gender: unknown; sdob: unknown;
  status: unknown; cover: unknown; lastActionTime: unknown; isExtensionAccount: unknown;
}> {
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.cachedAt < USER_INFO_CACHE_TTL_MS) {
    return {
      zaloName: cached.zaloName, avatar: cached.avatar, globalId: cached.globalId,
      username: cached.username, phone: cached.phone ?? '', gender: cached.gender ?? null,
      sdob: cached.sdob ?? null, status: cached.status ?? null, cover: cached.cover ?? null,
      lastActionTime: cached.lastActionTime ?? null, isExtensionAccount: cached.isExtensionAccount ?? null,
    };
  }
  try {
    const result = await api.getUserInfo(uid);
    const profiles = result?.changed_profiles || {};
    const profile = profiles[uid] || profiles[`${uid}_0`];
    if (profile) {
      const entry: UserInfoCacheEntry = {
        zaloName: profile.zaloName || profile.zalo_name || profile.displayName || profile.display_name || '',
        avatar: profile.avatar || '',
        phone: profile.phoneNumber || '',
        globalId: String(profile.globalId || ''),
        username: String(profile.username || ''),
        gender: profile.gender ?? null,
        sdob: profile.sdob ?? null,
        status: profile.status ?? null,
        cover: profile.cover ?? null,
        lastActionTime: profile.lastActionTime ?? null,
        isExtensionAccount: profile.isExtensionAccount ?? null,
        cachedAt: Date.now(),
      };
      cache.set(uid, entry);
      return {
        zaloName: entry.zaloName, avatar: entry.avatar, globalId: entry.globalId,
        username: entry.username, phone: entry.phone ?? '', gender: entry.gender ?? null,
        sdob: entry.sdob ?? null, status: entry.status ?? null, cover: entry.cover ?? null,
        lastActionTime: entry.lastActionTime ?? null, isExtensionAccount: entry.isExtensionAccount ?? null,
      };
    }
  } catch (err) {
    log.warn('getUserInfo failed', { uid, error: String(err) });
  }
  return {
    zaloName: '', avatar: '', globalId: '', username: '',
    phone: '', gender: null, sdob: null,
    status: null, cover: null, lastActionTime: null, isExtensionAccount: null,
  };
}

// ─── Group info resolver ────────────────────────────────────────────────────
interface ResolvedGroup { name: string; avatar: string; membersCount: number | null; }

async function resolveGroupInfo(api: any, groupId: string): Promise<ResolvedGroup> {
  try {
    const result = await api.getGroupInfo(groupId);
    const info = result?.gridInfoMap?.[groupId];
    const members = info?.memVerList || info?.memList || info?.members;
    return {
      name: info?.name || '',
      avatar: info?.avt || info?.fullAvt || info?.avatar || '',
      membersCount: Array.isArray(members) ? members.length : (info?.totalMember ?? null),
    };
  } catch (err) {
    log.warn('getGroupInfo failed', { groupId, error: String(err) });
    return { name: '', avatar: '', membersCount: null };
  }
}

// ─── Zalo mention extractor (2-channel: direct + propertyExt.ext) ──────────
function extractZaloMentions(
  messageData: any,
): Array<{ uid: string; pos: number; len: number; type: 0 | 1 }> | undefined {
  const direct = messageData?.mentions;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct.map((m: any) => ({
      uid: String(m.uid ?? ''), pos: Number(m.pos ?? 0),
      len: Number(m.len ?? 0), type: (m.type === 1 ? 1 : 0) as 0 | 1,
    })).filter((m) => m.uid && m.len > 0);
  }
  try {
    let ext = messageData?.propertyExt?.ext;
    if (typeof ext === 'string') ext = JSON.parse(ext);
    const ms = ext?.mentions;
    if (Array.isArray(ms) && ms.length > 0) {
      return ms.map((m: any) => ({
        uid: String(m.uid ?? ''), pos: Number(m.pos ?? 0),
        len: Number(m.len ?? 0), type: (m.type === 1 ? 1 : 0) as 0 | 1,
      })).filter((m) => m.uid && m.len > 0);
    }
  } catch { /* ignore */ }
  return undefined;
}

// ─── Handle types ───────────────────────────────────────────────────────────
export type MessageHandler = (msg: IncomingMessage) => Promise<void>;
export type GroupUpdateHandler = (accountId: number, groupId: string) => Promise<void>;
export type FriendEventHandler = (accountId: number, uid: string) => Promise<void>;

let messageHandler: MessageHandler | null = null;
let groupHandler: GroupUpdateHandler | null = null;
let friendHandler: FriendEventHandler | null = null;

export function onIncomingMessage(handler: MessageHandler): void { messageHandler = handler; }
export function onGroupUpdate(handler: GroupUpdateHandler): void { groupHandler = handler; }
export function onFriendEvent(handler: FriendEventHandler): void { friendHandler = handler; }

// ─── Normalize incoming message payload ─────────────────────────────────────
function normalizeIncomingMessage(accountId: number, payload: any): IncomingMessage | null {
  if (!payload) return null;
  const data = payload.data ?? payload;
  const threadId: string = data.threadId ?? data.groupId ?? data.uidFrom ?? data.senderId ?? '';
  if (!threadId) return null;
  const isGroup = Boolean(data.isGroup ?? data.groupId);
  const uidFrom: string = data.uidFrom ?? data.senderId ?? data.fromUid ?? threadId;
  const displayName: string = data.displayName ?? data.dName ?? uidFrom;
  const content: string = extractTextContent(data);
  const timestamp: Date = data.timestamp ? new Date(Number(data.timestamp)) : new Date();
  return { accountId, threadId, uidFrom, displayName, content, timestamp, isGroup };
}

function extractTextContent(data: any): string {
  if (typeof data.content === 'string') return data.content;
  if (typeof data.msg === 'string') return data.msg;
  if (typeof data.message === 'string') return data.message;
  if (data.content?.title) return data.content.title;
  if (data.content?.description) return data.content.description ?? '';
  return '';
}

// ─── Handle reactions (ported from ZaloCRM handleZaloReaction) ──────────────
async function handleZaloReaction(accountId: number, reaction: any): Promise<void> {
  try {
    const data = reaction?.data;
    const threadId = reaction?.threadId;
    if (!data || !threadId) return;

    const reactorZaloUid: string = String(data.uidFrom || '');
    const rawIcon: string = String(data.content?.rIcon || '');
    const rType: number = Number(data.content?.rType || 0);
    const targetZaloMsgId: string = String(data.content?.rMsg?.[0]?.gMsgID || data.msgId || '');
    if (!targetZaloMsgId || !reactorZaloUid) return;

    // Find conversation
    const conversation = await prisma.conversation.findFirst({
      where: { zalo_account_id: accountId, external_thread_id: threadId },
      select: { id: true },
    });
    if (!conversation) return;

    const message = await prisma.message.findFirst({
      where: { conversation_id: conversation.id, zalo_msg_id: targetZaloMsgId },
      select: { id: true, sender_uid: true, is_self: true, created_at: true },
    });
    if (!message) return;

    const displayEmoji = ZALO_REACTION_DISPLAY[rawIcon] || rawIcon || '👍';
    const isAddAction = !!rawIcon && rType >= 0;

    log.info('Reaction event', {
      accountId, conversationId: conversation.id, messageId: message.id,
      reactor: reactorZaloUid, emoji: displayEmoji, action: isAddAction ? 'add' : 'remove',
    });
  } catch (err) {
    log.warn('Reaction handler error', { accountId, error: String(err) });
  }
}

// ─── Attach listeners for a specific account ────────────────────────────────
export function attachListenersForAccount(accountId: number): void {
  const client = zaloPool.getAccountClient(accountId) as any;
  if (!client) {
    log.warn('Cannot attach listeners — no client', { accountId });
    return;
  }

  const api = client.api ?? client;
  const listener = client.listener ?? client;
  const userInfoCache = new Map<string, UserInfoCacheEntry>();

  // ─── connected ───────────────────────────────────────────────────────────
  listener.on('connected', () => {
    log.info('Listener connected', { accountId });
  });

  // ─── typing ──────────────────────────────────────────────────────────────
  listener.on('typing', async (typing: any) => {
    try {
      log.debug('Typing event', {
        accountId, threadId: typing?.threadId,
        threadType: typing?.type === 1 ? 'group' : 'user',
        ts: typing?.data?.ts ? Number(typing.data.ts) : Date.now(),
      });
      // Real-time: emit to subscribed clients
      emitToAccount(accountId, 'zalo:typing', {
        accountId,
        threadId: typing?.threadId ?? '',
        uidFrom: String(typing?.data?.uidFrom ?? ''),
        ts: typing?.data?.ts ? Number(typing.data.ts) : Date.now(),
      });
    } catch (err) {
      log.warn('Typing event error', { accountId, error: String(err) });
    }
  });

  // ─── seen_messages ───────────────────────────────────────────────────────
  // v3 2026-05-29: sweep-to-anchor — KH đọc msg N → mark all self msg ≤ N
  listener.on('seen_messages', async (messages: any[]) => {
    try {
      if (!messages?.length) return;
      const now = new Date();
      for (const m of messages) {
        const anchorMsgId = String(m?.data?.msgId || '');
        if (!anchorMsgId) continue;
        const anchor = await prisma.message.findFirst({
          where: { zalo_msg_id: anchorMsgId },
          select: { id: true, conversation_id: true, created_at: true },
        });
        if (!anchor) continue;
        // No seen_at field in our Message model yet — log for observability
        log.debug('SEEN anchor', {
          accountId, anchorMsgId, conversationId: anchor.conversation_id,
        });
      }
    } catch (err) {
      log.warn('seen_messages error', { accountId, error: String(err) });
    }
  });

  // ─── delivered_messages ──────────────────────────────────────────────────
  // v2 (2026-05-29): handle merged delivered+seen events (seen=1 flag)
  listener.on('delivered_messages', async (messages: any[]) => {
    try {
      const deliveredIds: string[] = [];
      const seenIds: string[] = [];
      for (const m of messages || []) {
        const msgId = String(m?.data?.msgId || '');
        if (!msgId) continue;
        deliveredIds.push(msgId);
        const hasSeenFlag = m?.data?.seen === 1
          || m?.data?.seen === true
          || (Array.isArray(m?.data?.seenUids) && m.data.seenUids.length > 0);
        if (hasSeenFlag) seenIds.push(msgId);
      }
      if (!deliveredIds.length) return;
      log.debug('Delivered messages', {
        accountId, deliveredCount: deliveredIds.length, seenCount: seenIds.length,
      });
    } catch (err) {
      log.warn('delivered_messages error', { accountId, error: String(err) });
    }
  });

  // ─── disconnected (early warning) ────────────────────────────────────────
  listener.on('disconnected', (code: number, reason: string) => {
    log.warn('Listener disconnected (early)', { accountId, code, reason });
  });

  // ─── message ─────────────────────────────────────────────────────────────
  // Core handler — resolves sender info, group info, content type, album, mentions
  listener.on('message', async (message: any) => {
    try {
      const isGroup = message.type === 1;
      const senderUid = String(message.data?.uidFrom || '');

      // Resolve display name — prefer zaloName from API over dName
      let senderName: string = message.data?.dName || '';
      let recipientName = '';
      if (senderUid && api.getUserInfo) {
        const resolveUid = message.isSelf ? (message.threadId || '') : senderUid;
        if (resolveUid) {
          const userInfo = await resolveZaloName(api, resolveUid, userInfoCache);
          if (message.isSelf) {
            if (userInfo.zaloName) recipientName = userInfo.zaloName;
            if (userInfo.avatar && message.threadId) updateContactAvatar(message.threadId, userInfo.avatar);
          } else {
            if (userInfo.zaloName) senderName = userInfo.zaloName;
            if (userInfo.avatar) updateContactAvatar(senderUid, userInfo.avatar);
          }
        }
      }

      // Resolve group info for group threads
      let groupName: string | undefined;
      let groupAvatarUrl: string | undefined;
      let groupMembersCount: number | undefined;
      if (isGroup && message.threadId) {
        const groupInfo = await resolveGroupInfo(api, message.threadId);
        groupName = groupInfo.name || undefined;
        groupAvatarUrl = groupInfo.avatar || undefined;
        groupMembersCount = groupInfo.membersCount ?? undefined;
      }

      const rawContent = message.data?.content;
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
      const contentType = detectContentType(message.data?.msgType, rawContent);
      const album = extractAlbumInfo(contentType, rawContent);
      const mentions = extractZaloMentions(message.data);

      // Delegate to registered messageHandler (message-sync or automation engine)
      const incomingMsg: IncomingMessage = {
        accountId, threadId: message.threadId || '', uidFrom: senderUid,
        displayName: senderName, content,
        timestamp: message.data?.ts ? new Date(parseInt(message.data.ts)) : new Date(),
        isGroup,
      };
      if (messageHandler) {
        await messageHandler(incomingMsg);
      } else {
        log.debug('Message received (no handler)', {
          accountId, threadId: message.threadId, sender: senderName,
          isGroup, contentType, hasMentions: !!mentions,
        });
      }

      // Real-time: emit inbound message to subscribed clients
      emitToAccount(accountId, 'zalo:message', {
        accountId,
        threadId: message.threadId || '',
        senderUid: senderUid,
        displayName: senderName,
        content: content.slice(0, 2500),
        timestamp: incomingMsg.timestamp.toISOString(),
        isGroup,
        contentType,
      });
    } catch (err) {
      log.error('Message handler error', { accountId, error: String(err) });
    }
  });

  // ─── undo ────────────────────────────────────────────────────────────────
  // FIX 2026-05-21: globalMsgId is the Snowflake ID, not data.msgId
  listener.on('undo', async (data: any) => {
    try {
      const undoContent = data?.data?.content || {};
      const globalMsgId = undoContent.globalMsgId;
      const cliMsgIdNum = undoContent.cliMsgId;
      if (!globalMsgId && !cliMsgIdNum) {
        log.debug('Undo missing globalMsgId/cliMsgId', { accountId });
        return;
      }
      log.info('Undo event', { accountId, globalMsgId, cliMsgId: cliMsgIdNum });
      // Real-time: emit undo to subscribed clients
      emitToAccount(accountId, 'zalo:undo', {
        accountId, globalMsgId: String(globalMsgId ?? ''), cliMsgId: String(cliMsgIdNum ?? ''),
      });
      // TODO: Implement handleMessageUndo when message-sync module is ready
    } catch (err) {
      log.warn('Undo handler error', { accountId, error: String(err) });
    }
  });

  // ─── reaction ────────────────────────────────────────────────────────────
  listener.on('reaction', async (reaction: any) => {
    await handleZaloReaction(accountId, reaction);
  });

  // ─── old_reactions (backfill on reconnect) ───────────────────────────────
  listener.on('old_reactions', async (reactions: any[]) => {
    if (!Array.isArray(reactions)) return;
    log.info('Backfill old reactions', { accountId, count: reactions.length });
    for (const r of reactions) {
      await handleZaloReaction(accountId, r);
    }
  });

  // ─── friend_event ────────────────────────────────────────────────────────
  // Delegates to handleFriendEvent (A1) + emits coarse + granular patch events
  listener.on('friend_event', async (event: any) => {
    try {
      await handleFriendEvent(accountId, event);
      log.debug('Friend event processed', { accountId, type: event?.type, threadId: event?.threadId });
      // Real-time: broadcast friend event
      emitToAccount(accountId, 'zalo:friend-update', {
        accountId,
        type: event?.type ?? 'unknown',
        threadId: String(event?.threadId ?? ''),
      });
    } catch (err) {
      log.error('friend_event handler error', { accountId, error: String(err) });
    }
  });

  // ─── old_messages (backfill on reconnect) ────────────────────────────────
  // Ported from ZaloCRM: iterate each message, resolve names, delegate to handler
  listener.on('old_messages', async (messages: any[], type: number) => {
    const threadType = type === 1 ? 'group' : 'user';
    log.info('Received old messages', { accountId, count: messages?.length, threadType });

    for (const message of messages) {
      try {
        const senderUid = String(message.data?.uidFrom || '');
        const peerFallback = message.isSelf ? String(message.data?.idTo || '') : senderUid;
        const resolvedThreadId = String(message.threadId || peerFallback || '');

        let senderName = message.data?.dName || '';
        if (!message.isSelf && senderUid && api.getUserInfo) {
          const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
          if (userInfo.zaloName) senderName = userInfo.zaloName;
        }

        const incomingMsg: IncomingMessage = {
          accountId, threadId: resolvedThreadId, uidFrom: senderUid,
          displayName: senderName, content: extractTextContent(message.data),
          timestamp: message.data?.ts ? new Date(Number(message.data.ts)) : new Date(),
          isGroup: threadType === 'group',
        };
        if (messageHandler) {
          await messageHandler(incomingMsg);
        }
      } catch (err) {
        log.warn('old_messages processing error', { accountId, error: String(err) });
      }
    }
  });

  // ─── group_event ─────────────────────────────────────────────────────────
  // Immediate refresh for avatar/name/setting/create/join changes (skip 6h cron delay)
  listener.on('group_event', (event: any) => {
    const eventType = event?.type ?? 'unknown';
    const groupId = event?.groupId ?? event?.data?.groupId;
    log.info('Group event', { accountId, type: eventType, groupId, actorId: event?.actorId });

    void (async () => {
      try {
        if (groupId) {
          // Ensure group info is upserted in DB even for newly created/joined groups
          const groupInfo = await resolveGroupInfo(api, String(groupId));
          if (groupInfo.name || groupInfo.avatar || groupInfo.membersCount != null) {
            const { zaloRepository } = await import('./zalo-repository');
            await zaloRepository.upsertGroup(String(groupId), accountId, {
              name: groupInfo.name || undefined,
              avatar_url: groupInfo.avatar || undefined,
              member_count: groupInfo.membersCount ?? undefined,
            });
          }
          if (groupHandler) {
            await groupHandler(accountId, String(groupId));
          }
          // Real-time: broadcast group update
          emitToAccount(accountId, 'zalo:group-update', {
            accountId,
            type: eventType,
            groupId: String(groupId),
          });
        }

        const { syncAndMatchCareGroups } = await import('./student-care-group-matcher.service');
        await syncAndMatchCareGroups({
          triggeredBy: 'group_event',
          zaloAccountId: accountId,
          refreshLiveGroups: false,
        });
      } catch (err) {
        log.warn('group_event refresh/match failed', { accountId, error: String(err) });
      }
    })();
  });

  // ─── closed ──────────────────────────────────────────────────────────────
  listener.on('closed', (code: number, reason: string) => {
    log.warn('Listener closed', { accountId, code, reason });
  });

  // ─── error ───────────────────────────────────────────────────────────────
  listener.on('error', (err: any) => {
    log.error('Listener error', { accountId, error: String(err) });
  });

  log.info('Listeners attached', { accountId });
}

// ─── Detach all listeners ───────────────────────────────────────────────────
export function detachListenersForAccount(accountId: number): void {
  const client = zaloPool.getAccountClient(accountId) as any;
  if (!client) return;
  const listener = client.listener ?? client;
  try {
    if (listener.removeAllListeners) listener.removeAllListeners();
  } catch { /* ignore */ }
  log.info('Listeners detached', { accountId });
}

// ─── Wire pool events to listener lifecycle ─────────────────────────────────
export function wirePoolEvents(): void {
  zaloPool.on('session:connected', ({ accountId }: any) => {
    attachListenersForAccount(accountId);
  });
  zaloPool.on('session:expired', ({ accountId }: any) => {
    detachListenersForAccount(accountId);
  });
  log.info('Pool event wiring complete');
}
