/**
 * line-repository.ts — Prisma access layer for Hybrid LINE entities:
 *   - LineAccount
 *   - LineContactRelation
 *   - LineGroup & LineGroupMember
 *   - LineFriend
 *   - LineConversation & LineMessage
 */

import { prisma } from '../../prisma/client';
import type {
  LineAccountStatus,
  LineAccountType,
  ZaloContactRelationStatus,
} from '@prisma/client';

export class LineRepository {
  // ─── LineAccount ──────────────────────────────────────────────────────────

  async findAccountById(id: number) {
    return prisma.lineAccount.findUnique({
      where: { id },
      include: {
        cs: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            friends: true,
            line_groups: true,
            conversations: true,
            line_contact_relations: true,
          },
        },
      },
    });
  }

  async findAccountByLineMid(lineMid: string) {
    return prisma.lineAccount.findUnique({ where: { line_mid: lineMid } });
  }

  async findAllAccounts(csId?: number) {
    return prisma.lineAccount.findMany({
      where: {
        archived_at: null,
        ...(csId ? { cs_id: csId } : {}),
      },
      include: {
        cs: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            friends: true,
            line_groups: true,
            conversations: true,
            line_contact_relations: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findActiveAccounts() {
    return prisma.lineAccount.findMany({
      where: {
        archived_at: null,
        status: { notIn: ['DISABLED', 'BANNED'] },
        encrypted_session_data: { not: null },
      },
    });
  }

  async createAccount(data: {
    cs_id: number;
    account_type: LineAccountType;
    line_mid?: string | null;
    basic_id?: string | null;
    display_name?: string | null;
    line_phone?: string | null;
    status: LineAccountStatus;
    encrypted_session_data?: string | null;
    webhook_secret?: string | null;
    monthly_quota?: number | null;
    monthly_consumption?: number | null;
    avatar_url?: string | null;
    proxy_url?: string | null;
    last_connected_at?: Date | null;
    last_login_at?: Date | null;
  }) {
    return prisma.lineAccount.create({
      data,
      include: {
        cs: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async updateAccount(
    id: number,
    data: Partial<{
      account_type: LineAccountType;
      line_mid: string | null;
      basic_id: string | null;
      display_name: string | null;
      line_phone: string | null;
      status: LineAccountStatus;
      encrypted_session_data: string | null;
      qr_code: string | null;
      pin_code: string | null;
      webhook_secret: string | null;
      monthly_quota: number | null;
      monthly_consumption: number | null;
      last_connected_at: Date | null;
      last_login_at: Date | null;
      last_active_at: Date | null;
      proxy_url: string | null;
      archived_by_id: number | null;
      archived_at: Date | null;
      disconnect_reason: string | null;
      disconnected_at: Date | null;
      qr_pending_at: Date | null;
      session_epoch: number | null;
      last_sync_error: string | null;
      last_sync_at: Date | null;
      avatar_url: string | null;
    }>,
  ) {
    return prisma.lineAccount.update({
      where: { id },
      data,
      include: {
        cs: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async disableAccount(id: number, archivedById?: number) {
    return prisma.lineAccount.update({
      where: { id },
      data: {
        status: 'DISABLED',
        encrypted_session_data: null,
        qr_code: null,
        pin_code: null,
        archived_at: new Date(),
        ...(archivedById ? { archived_by_id: archivedById } : {}),
      },
    });
  }

  // ─── LineFriend ───────────────────────────────────────────────────────────

  async upsertFriend(
    lineAccountId: number,
    lineUidInNick: string,
    data: {
      friendship_status?: string;
      relationship_kind?: string;
      alias_in_nick?: string | null;
      phone_from_sdk?: string | null;
      line_display_name?: string | null;
      line_avatar_url?: string | null;
      status_message?: string | null;
      became_friend_at?: Date | null;
      has_conversation?: boolean;
    },
  ) {
    return prisma.lineFriend.upsert({
      where: {
        line_account_id_line_uid_in_nick: {
          line_account_id: lineAccountId,
          line_uid_in_nick: lineUidInNick,
        },
      },
      create: {
        line_account_id: lineAccountId,
        line_uid_in_nick: lineUidInNick,
        friendship_status: data.friendship_status ?? 'friend',
        relationship_kind: data.relationship_kind ?? 'friend',
        alias_in_nick: data.alias_in_nick ?? null,
        phone_from_sdk: data.phone_from_sdk ?? null,
        line_display_name: data.line_display_name ?? null,
        line_avatar_url: data.line_avatar_url ?? null,
        status_message: data.status_message ?? null,
        became_friend_at: data.became_friend_at ?? new Date(),
        has_conversation: data.has_conversation ?? false,
      },
      update: {
        ...(data.friendship_status !== undefined ? { friendship_status: data.friendship_status } : {}),
        ...(data.relationship_kind !== undefined ? { relationship_kind: data.relationship_kind } : {}),
        ...(data.alias_in_nick !== undefined ? { alias_in_nick: data.alias_in_nick } : {}),
        ...(data.phone_from_sdk !== undefined ? { phone_from_sdk: data.phone_from_sdk } : {}),
        ...(data.line_display_name !== undefined ? { line_display_name: data.line_display_name } : {}),
        ...(data.line_avatar_url !== undefined ? { line_avatar_url: data.line_avatar_url } : {}),
        ...(data.status_message !== undefined ? { status_message: data.status_message } : {}),
        ...(data.has_conversation !== undefined ? { has_conversation: data.has_conversation } : {}),
      },
    });
  }

  async findFriendsByAccount(
    lineAccountId: number,
    opts?: { search?: string; kind?: string; page?: number; limit?: number },
  ) {
    const q = opts?.search?.trim();
    const kind = opts?.kind?.trim();
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 100));
    const skip = (page - 1) * limit;

    const where: any = {
      line_account_id: lineAccountId,
      ...(kind && kind !== 'all' ? { friendship_status: kind } : {}),
      ...(q
        ? {
            OR: [
              { line_display_name: { contains: q } },
              { alias_in_nick: { contains: q } },
              { phone_from_sdk: { contains: q } },
              { line_uid_in_nick: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.lineFriend.findMany({
        where,
        orderBy: { updated_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.lineFriend.count({ where }),
    ]);

    return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  // ─── LineGroup & LineGroupMember ──────────────────────────────────────────

  async upsertGroup(data: {
    line_group_id: string;
    line_account_id: number;
    name?: string | null;
    avatar_url?: string | null;
    member_count?: number | null;
    owner_line_uid?: string | null;
  }) {
    const now = new Date();
    return prisma.lineGroup.upsert({
      where: { line_group_id: data.line_group_id },
      create: {
        line_group_id: data.line_group_id,
        line_account_id: data.line_account_id,
        name: data.name ?? `LINE Group ${data.line_group_id.slice(0, 8)}`,
        avatar_url: data.avatar_url ?? null,
        member_count: data.member_count ?? 0,
        owner_line_uid: data.owner_line_uid ?? null,
        last_synced_at: now,
      },
      update: {
        line_account_id: data.line_account_id,
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
        ...(data.member_count !== undefined ? { member_count: data.member_count } : {}),
        ...(data.owner_line_uid !== undefined ? { owner_line_uid: data.owner_line_uid } : {}),
        last_synced_at: now,
      },
    });
  }

  async upsertGroupMember(data: {
    group_id: number;
    line_uid: string;
    display_name?: string | null;
    avatar_url?: string | null;
    is_admin?: boolean;
  }) {
    return prisma.lineGroupMember.upsert({
      where: {
        group_id_line_uid: {
          group_id: data.group_id,
          line_uid: data.line_uid,
        },
      },
      create: {
        group_id: data.group_id,
        line_uid: data.line_uid,
        display_name: data.display_name ?? null,
        avatar_url: data.avatar_url ?? null,
        is_admin: data.is_admin ?? false,
        joined_at: new Date(),
      },
      update: {
        ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
        ...(data.is_admin !== undefined ? { is_admin: data.is_admin } : {}),
      },
    });
  }

  async removeGroupMember(groupId: number, lineUid: string) {
    return prisma.lineGroupMember.deleteMany({
      where: { group_id: groupId, line_uid: lineUid },
    });
  }

  async findGroupsByAccount(lineAccountId: number) {
    return prisma.lineGroup.findMany({
      where: { line_account_id: lineAccountId },
      include: {
        line_account: {
          select: {
            id: true,
            display_name: true,
            account_type: true,
            basic_id: true,
            status: true,
          },
        },
        _count: { select: { members: true } },
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  async findAllActiveGroups(csId?: number) {
    return prisma.lineGroup.findMany({
      where: {
        line_account: {
          archived_at: null,
          status: { notIn: ['DISABLED', 'BANNED'] },
          ...(csId ? { cs_id: csId } : {}),
        },
      },
      include: {
        line_account: {
          select: {
            id: true,
            display_name: true,
            account_type: true,
            basic_id: true,
            status: true,
          },
        },
        _count: { select: { members: true } },
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  // ─── LineConversation & LineMessage ───────────────────────────────────────

  async upsertConversation(data: {
    line_account_id: number;
    external_thread_id: string;
    thread_type: 'user' | 'group';
    display_name?: string | null;
    avatar_url?: string | null;
    group_name?: string | null;
    group_avatar_url?: string | null;
    group_members_count?: number | null;
    reply_token?: string | null;
    reply_token_expires_at?: Date | null;
    last_message_at?: Date | null;
    incrementUnread?: boolean;
    is_replied?: boolean;
  }) {
    const existing = await prisma.lineConversation.findUnique({
      where: {
        line_account_id_external_thread_id: {
          line_account_id: data.line_account_id,
          external_thread_id: data.external_thread_id,
        },
      },
    });

    if (existing) {
      return prisma.lineConversation.update({
        where: { id: existing.id },
        data: {
          ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
          ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
          ...(data.group_name !== undefined ? { group_name: data.group_name } : {}),
          ...(data.group_avatar_url !== undefined ? { group_avatar_url: data.group_avatar_url } : {}),
          ...(data.group_members_count !== undefined
            ? { group_members_count: data.group_members_count }
            : {}),
          ...(data.reply_token !== undefined ? { reply_token: data.reply_token } : {}),
          ...(data.reply_token_expires_at !== undefined
            ? { reply_token_expires_at: data.reply_token_expires_at }
            : {}),
          ...(data.last_message_at !== undefined ? { last_message_at: data.last_message_at } : {}),
          ...(data.is_replied !== undefined ? { is_replied: data.is_replied } : {}),
          ...(data.incrementUnread ? { unread_count: { increment: 1 } } : {}),
          deleted_at: null,
        },
      });
    }

    return prisma.lineConversation.create({
      data: {
        line_account_id: data.line_account_id,
        external_thread_id: data.external_thread_id,
        thread_type: data.thread_type,
        display_name: data.display_name ?? null,
        avatar_url: data.avatar_url ?? null,
        group_name: data.group_name ?? null,
        group_avatar_url: data.group_avatar_url ?? null,
        group_members_count: data.group_members_count ?? null,
        reply_token: data.reply_token ?? null,
        reply_token_expires_at: data.reply_token_expires_at ?? null,
        last_message_at: data.last_message_at ?? new Date(),
        unread_count: data.incrementUnread ? 1 : 0,
        is_replied: data.is_replied ?? true,
      },
    });
  }

  async saveMessage(data: {
    conversation_id: number;
    line_msg_id: string;
    quote_token?: string | null;
    sender_uid: string;
    sender_name?: string | null;
    sender_type: 'self' | 'other';
    content: string;
    content_type?: string;
    attachments?: any;
    quote?: any;
    mentions?: any;
    is_self: boolean;
    sent_via?: string;
    replied_by_user_id?: number | null;
    raw_content?: any;
    timestamp?: Date;
  }) {
    return prisma.lineMessage.upsert({
      where: {
        conversation_id_line_msg_id: {
          conversation_id: data.conversation_id,
          line_msg_id: data.line_msg_id,
        },
      },
      create: {
        conversation_id: data.conversation_id,
        line_msg_id: data.line_msg_id,
        quote_token: data.quote_token ?? null,
        sender_uid: data.sender_uid,
        sender_name: data.sender_name ?? null,
        sender_type: data.sender_type,
        content: data.content,
        content_type: data.content_type ?? 'text',
        attachments: data.attachments ?? [],
        quote: data.quote ?? undefined,
        mentions: data.mentions ?? undefined,
        is_self: data.is_self,
        sent_via: data.sent_via ?? 'user',
        replied_by_user_id: data.replied_by_user_id ?? null,
        raw_content: data.raw_content ?? undefined,
        timestamp: data.timestamp ?? new Date(),
      },
      update: {
        content: data.content,
        ...(data.quote_token !== undefined ? { quote_token: data.quote_token } : {}),
      },
    });
  }

  async findConversationsByAccount(
    lineAccountId: number,
    opts?: { search?: string; threadType?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
    const skip = (page - 1) * limit;
    const q = opts?.search?.trim();

    const where: any = {
      line_account_id: lineAccountId,
      deleted_at: null,
      ...(opts?.threadType && opts.threadType !== 'all'
        ? { thread_type: opts.threadType }
        : {}),
      ...(q
        ? {
            OR: [
              { display_name: { contains: q } },
              { group_name: { contains: q } },
              { external_thread_id: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.lineConversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 1,
          },
          _count: { select: { messages: true } },
        },
        orderBy: { last_message_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.lineConversation.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findConversationByThread(lineAccountId: number, externalThreadId: string) {
    return prisma.lineConversation.findUnique({
      where: {
        line_account_id_external_thread_id: {
          line_account_id: lineAccountId,
          external_thread_id: externalThreadId,
        },
      },
    });
  }

  async findMessagesByConversation(conversationId: number, page = 1, limit = 50) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(200, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      prisma.lineMessage.findMany({
        where: { conversation_id: conversationId, is_deleted: false },
        orderBy: { timestamp: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.lineMessage.count({
        where: { conversation_id: conversationId, is_deleted: false },
      }),
    ]);

    return { items: items.reverse(), total, page: safePage, limit: safeLimit };
  }

  async markConversationRead(conversationId: number) {
    return prisma.lineConversation.update({
      where: { id: conversationId },
      data: { unread_count: 0 },
    });
  }

  // ─── LineContactRelation (Student ↔ LINE Linking) ─────────────────────────

  async findContactRelationByLinkCode(linkCode: string) {
    return prisma.lineContactRelation.findUnique({
      where: { link_code: linkCode },
      include: {
        student: true,
        line_account: true,
      },
    });
  }

  async upsertContactRelation(
    studentId: number,
    lineAccountId: number,
    data: {
      relation_status?: ZaloContactRelationStatus;
      display_name?: string | null;
      avatar_url?: string | null;
      friend_line_uid?: string | null;
      link_code?: string | null;
      last_checked_at?: Date | null;
    },
  ) {
    return prisma.lineContactRelation.upsert({
      where: {
        student_id_line_account_id: {
          student_id: studentId,
          line_account_id: lineAccountId,
        },
      },
      create: {
        student_id: studentId,
        line_account_id: lineAccountId,
        relation_status: data.relation_status ?? 'UNKNOWN',
        display_name: data.display_name ?? null,
        avatar_url: data.avatar_url ?? null,
        friend_line_uid: data.friend_line_uid ?? null,
        link_code: data.link_code ?? null,
        last_checked_at: data.last_checked_at ?? new Date(),
      },
      update: {
        ...(data.relation_status !== undefined ? { relation_status: data.relation_status } : {}),
        ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
        ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
        ...(data.friend_line_uid !== undefined ? { friend_line_uid: data.friend_line_uid } : {}),
        ...(data.link_code !== undefined ? { link_code: data.link_code } : {}),
        last_checked_at: data.last_checked_at ?? new Date(),
      },
      include: {
        student: { select: { id: true, full_name: true, phone: true, email: true, line_uid: true } },
        line_account: {
          select: { id: true, display_name: true, account_type: true, basic_id: true, line_mid: true },
        },
      },
    });
  }
}

export const lineRepository = new LineRepository();
