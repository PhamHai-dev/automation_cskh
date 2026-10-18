/**
 * line-webhook.handler.ts — Webhook Processor for LINE Official Accounts (`@line/bot-sdk`).
 *
 * Handles:
 *   - Synthetic verify ping (`replyToken === '00000000000000000000000000000000'`)
 *   - `follow` / `unfollow`: syncs `LineFriend` & `LineConversation`
 *   - `join` / `leave`: Bot invited to / removed from a Class Group -> syncs `LineGroup`
 *   - `memberJoined` / `memberLeft`: updates `LineGroupMember`
 *   - `message`:
 *       - Caches `event.replyToken` with `reply_token_expires_at = Date.now() + 50_000` (50s window)
 *       - Persists `LineMessage` & emits Socket.IO `line:message`
 *       - **2-Tap Deep-Link Student Binding (`LK-xxxxxx`)**: links `LineContactRelation` + `Student.line_uid`
 *         and replies immediately via `replyToken` (0 quota!)
 *       - **Group Command `/link <CLASS_CODE>`**: syncs group & replies with confirmation via `replyToken`
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { lineRepository } from './line-repository';
import { linePool } from './line-pool';
import { LineOaAdapter } from './line-oa.adapter';
import {
  emitLineFriendUpdate,
  emitLineGroupUpdate,
  emitLineMessage,
} from './line-socket';

const log = createLogger('LineWebhook');

const VERIFY_REPLY_TOKENS = new Set([
  '00000000000000000000000000000000',
  'ffffffffffffffffffffffffffffffff',
]);

const DEEP_LINK_CODE_REGEX = /^(?:\/bind\s+)?(LK-[A-Z0-9]{4,16})$/i;
const GROUP_LINK_CMD_REGEX = /^\/(?:link|connect)(?:\s+(.+))?$/i;

export class LineWebhookHandler {
  /**
   * Process incoming webhook payload for a specific `accountId` or resolved by `destination` (`line_mid`).
   */
  async handleWebhook(params: {
    accountId?: number;
    rawBody?: string | Buffer;
    signature?: string;
    body: { destination?: string; events?: any[] };
    skipSignatureCheck?: boolean;
  }): Promise<{ processed: number; accountId: number | null }> {
    const events = Array.isArray(params.body?.events) ? params.body.events : [];

    // 1. Resolve target LineAccount
    let account = params.accountId
      ? await lineRepository.findAccountById(params.accountId)
      : null;

    if (!account && params.body?.destination) {
      account = (await lineRepository.findAccountByLineMid(params.body.destination)) as any;
    }

    if (!account) {
      log.warn('[LineWebhook] No matching LINE OA account found', {
        accountId: params.accountId,
        destination: params.body?.destination,
      });
      return { processed: 0, accountId: null };
    }

    await linePool.ensureAccountReady(account.id);
    const oaAdapter = linePool.getOaAdapter(account.id);

    // 2. Verify X-Line-Signature when signature and secret are provided
    if (!params.skipSignatureCheck && params.signature && account.webhook_secret && params.rawBody) {
      const valid = LineOaAdapter.verifyWebhookSignature(
        params.rawBody,
        params.signature,
        account.webhook_secret,
      );
      if (!valid) {
        const err: any = new Error('Invalid X-Line-Signature');
        err.statusCode = 401;
        throw err;
      }
    }

    let processed = 0;

    for (const event of events) {
      if (event?.replyToken && VERIFY_REPLY_TOKENS.has(event.replyToken)) {
        continue;
      }

      try {
        await this.processEvent(account.id, oaAdapter, event);
        processed++;
      } catch (err) {
        log.error(`[LineWebhook] Error processing event type=${event?.type}`, {
          accountId: account.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { processed, accountId: account.id };
  }

  private async processEvent(
    accountId: number,
    oaAdapter: LineOaAdapter | undefined,
    event: any,
  ): Promise<void> {
    const type: string = event?.type;
    const source = event?.source ?? {};
    const userId: string | undefined = source.userId;
    const groupId: string | undefined = source.groupId || source.roomId;
    const replyToken: string | undefined = event?.replyToken;
    const eventTime = event?.timestamp ? new Date(event.timestamp) : new Date();

    switch (type) {
      case 'follow': {
        if (!userId) return;
        let displayName: string | null = null;
        let avatarUrl: string | null = null;
        let statusMessage: string | null = null;

        if (oaAdapter) {
          try {
            const profile = await oaAdapter.getUserProfile(userId);
            displayName = profile.displayName ?? null;
            avatarUrl = profile.pictureUrl ?? null;
            statusMessage = profile.statusMessage ?? null;
          } catch {
            // ignore profile fetch error
          }
        }

        await lineRepository.upsertFriend(accountId, userId, {
          friendship_status: 'friend',
          relationship_kind: 'follower',
          line_display_name: displayName,
          line_avatar_url: avatarUrl,
          status_message: statusMessage,
          became_friend_at: eventTime,
        });

        await lineRepository.upsertConversation({
          line_account_id: accountId,
          external_thread_id: userId,
          thread_type: 'user',
          display_name: displayName,
          avatar_url: avatarUrl,
          ...(replyToken
            ? {
                reply_token: replyToken,
                reply_token_expires_at: new Date(Date.now() + 50_000),
              }
            : {}),
          last_message_at: eventTime,
        });

        emitLineFriendUpdate({
          accountId,
          friendUid: userId,
          displayName,
          avatarUrl,
          friendshipStatus: 'follower',
          timestamp: eventTime.toISOString(),
        });
        break;
      }

      case 'unfollow': {
        if (!userId) return;
        await lineRepository.upsertFriend(accountId, userId, {
          friendship_status: 'blocked',
          relationship_kind: 'blocked',
        });
        emitLineFriendUpdate({
          accountId,
          friendUid: userId,
          friendshipStatus: 'blocked',
          timestamp: eventTime.toISOString(),
        });
        break;
      }

      case 'join': {
        if (!groupId) return;
        let groupName = `LINE Group ${groupId.slice(0, 8)}`;
        let pictureUrl: string | undefined;
        let memberCount = 0;

        if (oaAdapter) {
          try {
            const info = await oaAdapter.getGroupInfo(groupId);
            groupName = info.groupName || groupName;
            pictureUrl = info.pictureUrl;
            memberCount = info.memberCount;
          } catch {
            // fallback
          }
        }

        const savedGroup = await lineRepository.upsertGroup({
          line_group_id: groupId,
          line_account_id: accountId,
          name: groupName,
          avatar_url: pictureUrl ?? null,
          member_count: memberCount,
        });

        await lineRepository.upsertConversation({
          line_account_id: accountId,
          external_thread_id: groupId,
          thread_type: 'group',
          group_name: savedGroup.name,
          group_avatar_url: savedGroup.avatar_url,
          group_members_count: savedGroup.member_count,
          ...(replyToken
            ? {
                reply_token: replyToken,
                reply_token_expires_at: new Date(Date.now() + 50_000),
              }
            : {}),
          last_message_at: eventTime,
        });

        emitLineGroupUpdate({
          accountId,
          lineGroupId: groupId,
          name: savedGroup.name,
          memberCount: savedGroup.member_count,
          avatarUrl: savedGroup.avatar_url,
          action: 'joined',
          timestamp: eventTime.toISOString(),
        });
        break;
      }

      case 'memberJoined': {
        if (!groupId) return;
        const group = await lineRepository.upsertGroup({
          line_group_id: groupId,
          line_account_id: accountId,
        });
        const joinedMembers: Array<{ userId: string }> = event?.joined?.members ?? [];
        for (const m of joinedMembers) {
          if (!m?.userId) continue;
          let displayName: string | null = null;
          let avatarUrl: string | null = null;
          if (oaAdapter) {
            try {
              const prof = await oaAdapter.getGroupMemberProfile(groupId, m.userId);
              displayName = prof.displayName ?? null;
              avatarUrl = prof.pictureUrl ?? null;
            } catch {
              // ignore
            }
          }
          await lineRepository.upsertGroupMember({
            group_id: group.id,
            line_uid: m.userId,
            display_name: displayName,
            avatar_url: avatarUrl,
          });
        }
        break;
      }

      case 'memberLeft': {
        if (!groupId) return;
        const group = await lineRepository.upsertGroup({
          line_group_id: groupId,
          line_account_id: accountId,
        });
        const leftMembers: Array<{ userId: string }> = event?.left?.members ?? [];
        for (const m of leftMembers) {
          if (m?.userId) {
            await lineRepository.removeGroupMember(group.id, m.userId);
          }
        }
        break;
      }

      case 'message': {
        const isGroup = Boolean(groupId);
        const externalThreadId = groupId || userId;
        if (!externalThreadId) return;

        const msg = event.message ?? {};
        const lineMsgId = String(msg.id ?? `msg_${Date.now()}`);
        const quoteToken: string | null = msg.quoteToken ?? null;
        const text =
          msg.type === 'text'
            ? String(msg.text ?? '')
            : `[${String(msg.type ?? 'media').toUpperCase()}]`;

        let senderName: string | null = null;
        let senderAvatar: string | null = null;

        if (userId && oaAdapter) {
          try {
            const prof = isGroup
              ? await oaAdapter.getGroupMemberProfile(groupId!, userId)
              : await oaAdapter.getUserProfile(userId);
            senderName = prof?.displayName ?? null;
            senderAvatar = prof?.pictureUrl ?? null;
          } catch {
            // ignore
          }
        }

        if (!isGroup && userId) {
          await lineRepository.upsertFriend(accountId, userId, {
            friendship_status: 'friend',
            relationship_kind: 'follower',
            ...(senderName ? { line_display_name: senderName } : {}),
            ...(senderAvatar ? { line_avatar_url: senderAvatar } : {}),
            has_conversation: true,
          });
        }

        if (isGroup && groupId) {
          const group = await lineRepository.upsertGroup({
            line_group_id: groupId,
            line_account_id: accountId,
          });
          if (userId) {
            await lineRepository.upsertGroupMember({
              group_id: group.id,
              line_uid: userId,
              display_name: senderName,
              avatar_url: senderAvatar,
            });
          }
        }

        const replyTokenExpiresAt = replyToken ? new Date(Date.now() + 50_000) : undefined;

        const conv = await lineRepository.upsertConversation({
          line_account_id: accountId,
          external_thread_id: externalThreadId,
          thread_type: isGroup ? 'group' : 'user',
          ...(!isGroup && senderName ? { display_name: senderName } : {}),
          ...(!isGroup && senderAvatar ? { avatar_url: senderAvatar } : {}),
          ...(replyToken
            ? {
                reply_token: replyToken,
                reply_token_expires_at: replyTokenExpiresAt,
              }
            : {}),
          last_message_at: eventTime,
          incrementUnread: true,
          is_replied: false,
        });

        const savedMsg = await lineRepository.saveMessage({
          conversation_id: conv.id,
          line_msg_id: lineMsgId,
          quote_token: quoteToken,
          sender_uid: userId ?? externalThreadId,
          sender_name: senderName,
          sender_type: 'other',
          content: text,
          content_type: String(msg.type ?? 'text'),
          is_self: false,
          sent_via: 'user',
          raw_content: msg,
          timestamp: eventTime,
        });

        emitLineMessage({
          accountId,
          conversationId: conv.id,
          externalThreadId,
          threadType: isGroup ? 'group' : 'user',
          message: {
            id: savedMsg.id,
            lineMsgId: savedMsg.line_msg_id,
            quoteToken: savedMsg.quote_token,
            senderUid: savedMsg.sender_uid,
            senderName: savedMsg.sender_name,
            senderType: 'other',
            content: savedMsg.content,
            contentType: savedMsg.content_type,
            isSelf: false,
            sentVia: savedMsg.sent_via,
            timestamp: savedMsg.timestamp.toISOString(),
          },
        });

        // ─── Special Pattern 1: 2-Tap Student Deep-Link Binding (`LK-xxxxxx`) ───
        const bindMatch = text.trim().match(DEEP_LINK_CODE_REGEX);
        if (bindMatch && userId) {
          const linkCode = bindMatch[1].toUpperCase();
          await this.handleStudentDeepLinkBinding({
            accountId,
            oaAdapter,
            conversationId: conv.id,
            userId,
            senderName,
            senderAvatar,
            linkCode,
            replyToken,
          });
          return;
        }

        // ─── Special Pattern 2: Group `/link <CLASS_NAME_OR_CODE>` Command ───
        const groupCmdMatch = isGroup ? text.trim().match(GROUP_LINK_CMD_REGEX) : null;
        if (groupCmdMatch && groupId) {
          const classLabel = groupCmdMatch[1]?.trim();
          await this.handleGroupLinkCommand({
            accountId,
            oaAdapter,
            conversationId: conv.id,
            groupId,
            classLabel,
            replyToken,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  private async handleStudentDeepLinkBinding(params: {
    accountId: number;
    oaAdapter: LineOaAdapter | undefined;
    conversationId: number;
    userId: string;
    senderName: string | null;
    senderAvatar: string | null;
    linkCode: string;
    replyToken?: string;
  }): Promise<void> {
    const relation = await lineRepository.findContactRelationByLinkCode(params.linkCode);
    if (!relation) return;

    await prisma.$transaction([
      prisma.lineContactRelation.update({
        where: { id: relation.id },
        data: {
          relation_status: 'FRIEND',
          friend_line_uid: params.userId,
          display_name: params.senderName ?? relation.display_name,
          avatar_url: params.senderAvatar ?? relation.avatar_url,
          last_checked_at: new Date(),
        },
      }),
      prisma.student.update({
        where: { id: relation.student_id },
        data: { line_uid: params.userId },
      }),
    ]);

    const confirmationText = `Đã liên kết thành công tài khoản LINE với học viên ${relation.student.full_name}!`;

    if (params.oaAdapter && params.replyToken) {
      await prisma.lineConversation
        .update({
          where: { id: params.conversationId },
          data: { reply_token: null, reply_token_expires_at: null },
        })
        .catch(() => undefined);

      try {
        await params.oaAdapter.replyText(params.replyToken, confirmationText);
      } catch (err) {
        log.warn('[LineWebhook] Failed to send deep-link confirmation reply', {
          error: String(err),
        });
      }
    }
  }

  private async handleGroupLinkCommand(params: {
    accountId: number;
    oaAdapter: LineOaAdapter | undefined;
    conversationId: number;
    groupId: string;
    classLabel?: string;
    replyToken?: string;
  }): Promise<void> {
    let groupName: string | undefined;
    let pictureUrl: string | undefined;
    let memberCount: number | undefined;

    if (params.oaAdapter) {
      try {
        const info = await params.oaAdapter.getGroupInfo(params.groupId);
        groupName = info.groupName;
        pictureUrl = info.pictureUrl;
        memberCount = info.memberCount;
      } catch {
        // ignore
      }
    }

    const updatedGroup = await lineRepository.upsertGroup({
      line_group_id: params.groupId,
      line_account_id: params.accountId,
      name: groupName || (params.classLabel ? `Nhóm ${params.classLabel}` : undefined),
      avatar_url: pictureUrl,
      member_count: memberCount,
    });

    emitLineGroupUpdate({
      accountId: params.accountId,
      lineGroupId: params.groupId,
      name: updatedGroup.name,
      memberCount: updatedGroup.member_count,
      avatarUrl: updatedGroup.avatar_url,
      action: 'linked',
      timestamp: new Date().toISOString(),
    });

    if (params.oaAdapter && params.replyToken) {
      await prisma.lineConversation
        .update({
          where: { id: params.conversationId },
          data: { reply_token: null, reply_token_expires_at: null },
        })
        .catch(() => undefined);

      const replyMsg = `Đã đồng bộ nhóm LINE "${updatedGroup.name}" (ID: ${params.groupId}) vào hệ thống CSKH!`;
      await params.oaAdapter.replyText(params.replyToken, replyMsg).catch(() => undefined);
    }
  }
}

export const lineWebhookHandler = new LineWebhookHandler();
