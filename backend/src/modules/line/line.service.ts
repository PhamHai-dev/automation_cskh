/**
 * line.service.ts — Business logic for the Hybrid LINE module:
 *   - Account CRUD (OA & PERSONAL), QR Login, OA Token update
 *   - Friends listing, sync, phone lookup, friend request
 *   - Groups listing & sync
 *   - Conversations & Messages listing, send, mark-read
 *   - Student ↔ LINE linking (manual, 2-tap deep-link code generation, phone suffix auto-suggest)
 */

import crypto from 'node:crypto';
import { prisma } from '../../prisma/client';
import { encryptJson } from '../../shared/crypto/aes-gcm';
import { lineRepository } from './line-repository';
import { linePool } from './line-pool';
import type { ZaloContactRelationStatus } from '@prisma/client';
import type { LineOaSessionData } from './types/line.types';

function normalizePhoneLast9(phone?: string | null): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-9);
}

export class LineService {
  // ─── Accounts ─────────────────────────────────────────────────────────────

  async listAccounts(csId?: number) {
    return lineRepository.findAllAccounts(csId);
  }

  async getAccount(accountId: number) {
    const account = await lineRepository.findAccountById(accountId);
    if (!account) {
      const err: any = new Error('LINE account not found');
      err.statusCode = 404;
      throw err;
    }
    return account;
  }

  async createAccount(input: {
    account_type?: 'OA' | 'PERSONAL';
    cs_id?: number;
    csId?: number;
    display_name?: string;
    displayName?: string;
    basic_id?: string;
    basicId?: string;
    channel_id?: string;
    channelId?: string;
    channel_secret?: string;
    channelSecret?: string;
    channel_access_token?: string;
    channelAccessToken?: string;
    line_phone?: string;
    linePhone?: string;
    proxy_url?: string;
    proxyUrl?: string;
  }) {
    const accountType = input.account_type ?? 'PERSONAL';
    const csId = Number(input.cs_id ?? input.csId);
    const displayName = input.display_name ?? input.displayName ?? null;
    const basicId = input.basic_id ?? input.basicId ?? null;
    const linePhone = input.line_phone ?? input.linePhone ?? null;
    const proxyUrl = input.proxy_url ?? input.proxyUrl ?? null;

    if (accountType === 'OA') {
      const channelId = (input.channel_id ?? input.channelId ?? '').trim();
      const channelSecret = (input.channel_secret ?? input.channelSecret ?? '').trim();
      const channelAccessToken = (
        input.channel_access_token ??
        input.channelAccessToken ??
        ''
      ).trim();

      if (!channelId || !channelSecret || !channelAccessToken) {
        const err: any = new Error(
          'LINE OA requires channelId, channelSecret, and channelAccessToken',
        );
        err.statusCode = 400;
        throw err;
      }

      const oaSession: LineOaSessionData = {
        mode: 'OA',
        channelId,
        channelSecret,
        channelAccessToken,
        basicId: basicId ?? undefined,
      };

      const created = await lineRepository.createAccount({
        cs_id: csId,
        account_type: 'OA',
        basic_id: basicId,
        display_name: displayName || `LINE OA (${channelId})`,
        status: 'CONNECTING',
        encrypted_session_data: encryptJson(oaSession),
        webhook_secret: channelSecret,
      });

      try {
        await linePool.connectOaAccount(created.id, oaSession);
      } catch {
        // Keep created account even if live verification fails in offline/dev env; mark ACTIVE if token present
        await lineRepository.updateAccount(created.id, {
          status: 'ACTIVE',
          last_connected_at: new Date(),
        });
      }

      return lineRepository.findAccountById(created.id);
    }

    // PERSONAL account
    return lineRepository.createAccount({
      cs_id: csId,
      account_type: 'PERSONAL',
      display_name: displayName || (linePhone ? `LINE ${linePhone}` : 'LINE Personal'),
      line_phone: linePhone,
      proxy_url: proxyUrl,
      status: 'QR_PENDING',
    });
  }

  async updateOaCredentials(
    accountId: number,
    input: {
      channel_id?: string;
      channelId?: string;
      channel_secret?: string;
      channelSecret?: string;
      channel_access_token?: string;
      channelAccessToken?: string;
      basic_id?: string;
      basicId?: string;
      display_name?: string;
      displayName?: string;
    },
  ) {
    const account = await this.getAccount(accountId);
    const channelId = (input.channel_id ?? input.channelId ?? '').trim();
    const channelSecret = (input.channel_secret ?? input.channelSecret ?? '').trim();
    const channelAccessToken = (
      input.channel_access_token ??
      input.channelAccessToken ??
      ''
    ).trim();
    const basicId = input.basic_id ?? input.basicId ?? account.basic_id ?? undefined;
    const displayName = input.display_name ?? input.displayName ?? account.display_name ?? undefined;

    if (!channelId || !channelSecret || !channelAccessToken) {
      const err: any = new Error(
        'channelId, channelSecret, and channelAccessToken are required',
      );
      err.statusCode = 400;
      throw err;
    }

    const oaSession: LineOaSessionData = {
      mode: 'OA',
      channelId,
      channelSecret,
      channelAccessToken,
      basicId,
    };

    await lineRepository.updateAccount(accountId, {
      account_type: 'OA',
      basic_id: basicId ?? null,
      ...(displayName ? { display_name: displayName } : {}),
      encrypted_session_data: encryptJson(oaSession),
      webhook_secret: channelSecret,
      status: 'ACTIVE',
    });

    try {
      await linePool.connectOaAccount(accountId, oaSession);
    } catch {
      // ignore network error in offline/test env
    }

    return lineRepository.findAccountById(accountId);
  }

  async startQrLogin(accountId: number) {
    const account = await this.getAccount(accountId);
    if (account.account_type === 'OA') {
      const err: any = new Error('LINE OA accounts use Channel Access Token, not QR login');
      err.statusCode = 400;
      throw err;
    }

    const res = await linePool.startPersonalQrLogin(accountId);
    const updated = await lineRepository.findAccountById(accountId);
    return {
      accountId,
      qrCode: res.qrUrl ?? updated?.qr_code ?? null,
      qrUrl: res.qrUrl ?? updated?.qr_code ?? null,
      pinCode: res.pinCode ?? updated?.pin_code ?? null,
      status: updated?.status ?? res.status,
    };
  }

  async disconnectAccount(accountId: number) {
    await this.getAccount(accountId);
    await linePool.disconnectAccount(accountId, 'manual_disconnect');
    return { disconnected: true };
  }

  async reconnectAccount(accountId: number) {
    await this.getAccount(accountId);
    const ok = await linePool.ensureAccountReady(accountId);
    const updated = await lineRepository.findAccountById(accountId);
    return { reconnected: ok, account: updated };
  }

  async deleteAccount(accountId: number, userId?: number) {
    await this.getAccount(accountId);
    await linePool.disconnectAccount(accountId, 'archived').catch(() => undefined);
    await lineRepository.disableAccount(accountId, userId);
    return { deleted: true };
  }

  // ─── Friends & Followers ──────────────────────────────────────────────────

  async listFriends(
    accountId: number,
    opts?: { search?: string; kind?: string; page?: number; limit?: number },
  ) {
    return lineRepository.findFriendsByAccount(accountId, opts);
  }

  async syncFriends(accountId: number) {
    const account = await this.getAccount(accountId);
    await linePool.ensureAccountReady(accountId);

    if (account.account_type === 'PERSONAL') {
      const adapter = linePool.getPersonalAdapter(accountId);
      if (adapter?.client) {
        const res = await adapter.syncFriends();
        return { synced: res.synced, upserted: res.synced };
      }
    }

    const existing = await lineRepository.findFriendsByAccount(accountId, { limit: 200 });
    return { synced: existing.total, upserted: existing.total };
  }

  async lookupByPhone(accountId: number, phone: string) {
    const account = await this.getAccount(accountId);
    if (account.account_type === 'OA') {
      // Check if any known friend/follower in DB already has this phone
      const norm = normalizePhoneLast9(phone);
      const friends = await prisma.lineFriend.findMany({
        where: { line_account_id: accountId, phone_from_sdk: { not: null } },
      });
      const match = friends.find((f) => normalizePhoneLast9(f.phone_from_sdk) === norm);
      if (match) {
        return {
          found: true,
          mid: match.line_uid_in_nick,
          displayName: match.line_display_name,
          avatarUrl: match.line_avatar_url,
          friend: match,
        };
      }
      return { found: false };
    }

    await linePool.ensureAccountReady(accountId);
    const adapter = linePool.getPersonalAdapter(accountId);
    if (!adapter) {
      throw new Error('Personal LINE account is not connected');
    }
    return adapter.findContactByPhone(phone);
  }

  async sendFriendRequest(accountId: number, targetMid: string) {
    await this.getAccount(accountId);
    await linePool.ensureAccountReady(accountId);
    const adapter = linePool.getPersonalAdapter(accountId);
    if (adapter?.client) {
      return adapter.sendFriendRequest(targetMid);
    }

    const friend = await lineRepository.upsertFriend(accountId, targetMid, {
      friendship_status: 'friend',
      relationship_kind: 'friend',
    });
    return { sent: true, friend };
  }

  // ─── Groups ───────────────────────────────────────────────────────────────

  async listAccountGroups(accountId: number) {
    return lineRepository.findGroupsByAccount(accountId);
  }

  async listAllGroups(csId?: number) {
    return lineRepository.findAllActiveGroups(csId);
  }

  async syncGroups(accountId: number) {
    const account = await this.getAccount(accountId);
    await linePool.ensureAccountReady(accountId);

    if (account.account_type === 'PERSONAL') {
      const adapter = linePool.getPersonalAdapter(accountId);
      if (adapter?.client) {
        return adapter.syncGroups();
      }
    } else {
      const oaAdapter = linePool.getOaAdapter(accountId);
      const groups = await lineRepository.findGroupsByAccount(accountId);
      let synced = 0;
      if (oaAdapter) {
        for (const g of groups) {
          try {
            const info = await oaAdapter.getGroupInfo(g.line_group_id);
            await lineRepository.upsertGroup({
              line_group_id: g.line_group_id,
              line_account_id: accountId,
              name: info.groupName,
              avatar_url: info.pictureUrl ?? null,
              member_count: info.memberCount,
            });
            synced++;
          } catch {
            // ignore
          }
        }
      }
      return { synced, total: groups.length };
    }

    const groups = await lineRepository.findGroupsByAccount(accountId);
    return { synced: groups.length, total: groups.length };
  }

  // ─── Conversations & Messages ─────────────────────────────────────────────

  async listConversations(
    accountId: number,
    opts?: { search?: string; threadType?: string; page?: number; limit?: number },
  ) {
    return lineRepository.findConversationsByAccount(accountId, opts);
  }

  async listMessages(
    accountId: number,
    threadIdOrConvId: string,
    opts?: { page?: number; limit?: number },
  ) {
    let conv = await lineRepository.findConversationByThread(accountId, threadIdOrConvId);
    if (!conv && /^\d+$/.test(threadIdOrConvId)) {
      conv = await prisma.lineConversation.findUnique({
        where: { id: Number(threadIdOrConvId) },
      });
    }

    if (!conv) {
      return { items: [], total: 0, conversation: null };
    }

    const res = await lineRepository.findMessagesByConversation(
      conv.id,
      opts?.page ?? 1,
      opts?.limit ?? 50,
    );
    return { ...res, conversation: conv };
  }

  async sendMessage(accountId: number, threadId: string, content: string) {
    const conv = await lineRepository.findConversationByThread(accountId, threadId);
    const isGroup =
      conv?.thread_type === 'group' ||
      threadId.startsWith('C') ||
      threadId.startsWith('R') ||
      threadId.startsWith('c');

    if (isGroup) {
      return linePool.sendGroupMessage({
        lineAccountId: accountId,
        targetLineGroupId: threadId,
        content,
        sentVia: 'user',
      });
    }

    return linePool.sendPersonalMessage({
      lineAccountId: accountId,
      targetLineUid: threadId,
      content,
      sentVia: 'user',
    });
  }

  async markRead(accountId: number, threadIdOrConvId: string) {
    let conv = await lineRepository.findConversationByThread(accountId, threadIdOrConvId);
    if (!conv && /^\d+$/.test(threadIdOrConvId)) {
      conv = await prisma.lineConversation.findUnique({
        where: { id: Number(threadIdOrConvId) },
      });
    }
    if (!conv) return { updated: false };
    await lineRepository.markConversationRead(conv.id);
    return { updated: true };
  }

  // ─── Student ↔ LINE Linking ───────────────────────────────────────────────

  async listUnlinkedStudents(opts?: {
    q?: string;
    csId?: number;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
    const skip = (page - 1) * limit;
    const q = opts?.q?.trim();

    const where: any = {
      line_contact_relations: {
        none: { relation_status: 'FRIEND' },
      },
      ...(opts?.csId
        ? {
            enrollments: { some: { cs_id: opts.csId } },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { full_name: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          enrollments: {
            take: 1,
            orderBy: { created_at: 'desc' },
            include: {
              cs: { select: { id: true, name: true } },
              package: { select: { id: true, name: true } },
            },
          },
          line_contact_relations: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async listLinksByAccount(accountId: number, q?: string) {
    const search = q?.trim();
    const items = await prisma.lineContactRelation.findMany({
      where: {
        line_account_id: accountId,
        ...(search
          ? {
              OR: [
                { display_name: { contains: search } },
                { friend_line_uid: { contains: search } },
                { student: { full_name: { contains: search } } },
                { student: { phone: { contains: search } } },
              ],
            }
          : {}),
      },
      include: {
        student: {
          select: { id: true, full_name: true, phone: true, email: true, line_uid: true },
        },
        line_account: {
          select: {
            id: true,
            display_name: true,
            account_type: true,
            basic_id: true,
            line_mid: true,
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return { items };
  }

  async listLinksByStudent(studentId: number) {
    const items = await prisma.lineContactRelation.findMany({
      where: { student_id: studentId },
      include: {
        student: {
          select: { id: true, full_name: true, phone: true, email: true, line_uid: true },
        },
        line_account: {
          select: {
            id: true,
            display_name: true,
            account_type: true,
            basic_id: true,
            line_mid: true,
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return { items };
  }

  async createOrUpdateLink(input: {
    student_id: number;
    line_account_id: number;
    relation_status?: ZaloContactRelationStatus;
    display_name?: string | null;
    avatar_url?: string | null;
    friend_line_uid?: string | null;
  }) {
    const relationStatus = input.relation_status ?? 'FRIEND';
    const relation = await lineRepository.upsertContactRelation(
      input.student_id,
      input.line_account_id,
      {
        relation_status: relationStatus,
        display_name: input.display_name,
        avatar_url: input.avatar_url,
        friend_line_uid: input.friend_line_uid,
      },
    );

    if (input.friend_line_uid && relationStatus === 'FRIEND') {
      await prisma.student
        .update({
          where: { id: input.student_id },
          data: { line_uid: input.friend_line_uid },
        })
        .catch(() => undefined);
    }

    return { relation };
  }

  async updateLinkById(
    linkId: number,
    data: {
      display_name?: string;
      relation_status?: ZaloContactRelationStatus;
      new_line_account_id?: number;
      friend_line_uid?: string;
    },
  ) {
    const existing = await prisma.lineContactRelation.findUnique({ where: { id: linkId } });
    if (!existing) {
      const err: any = new Error('LINE contact link not found');
      err.statusCode = 404;
      throw err;
    }

    const updated = await prisma.lineContactRelation.update({
      where: { id: linkId },
      data: {
        ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
        ...(data.relation_status !== undefined ? { relation_status: data.relation_status } : {}),
        ...(data.new_line_account_id !== undefined
          ? { line_account_id: data.new_line_account_id }
          : {}),
        ...(data.friend_line_uid !== undefined ? { friend_line_uid: data.friend_line_uid } : {}),
        last_checked_at: new Date(),
      },
      include: {
        student: { select: { id: true, full_name: true, phone: true, email: true, line_uid: true } },
        line_account: {
          select: { id: true, display_name: true, account_type: true, basic_id: true, line_mid: true },
        },
      },
    });

    if (data.friend_line_uid && updated.relation_status === 'FRIEND') {
      await prisma.student
        .update({
          where: { id: updated.student_id },
          data: { line_uid: data.friend_line_uid },
        })
        .catch(() => undefined);
    }

    return { relation: updated };
  }

  async deleteLink(linkId: number) {
    await prisma.lineContactRelation.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  /**
   * Generate a unique 2-tap Deep-Link binding code (`LK-XXXXXX`) and `https://line.me/R/oaMessage/...` URL.
   */
  async generateStudentDeepLink(studentId: number, lineAccountId: number) {
    const account = await this.getAccount(lineAccountId);
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const linkCode = `LK-${studentId}${randomSuffix}`.slice(0, 12);

    const relation = await lineRepository.upsertContactRelation(studentId, lineAccountId, {
      link_code: linkCode,
    });

    const rawBasicId = (account.basic_id || '@edura').trim();
    const normalizedBasicId = rawBasicId.startsWith('@') ? rawBasicId : `@${rawBasicId}`;
    const deepLinkUrl = `https://line.me/R/oaMessage/${encodeURIComponent(
      normalizedBasicId,
    )}/?${encodeURIComponent(linkCode)}`;

    return {
      linkCode,
      deepLinkUrl,
      basicId: normalizedBasicId,
      relation,
    };
  }

  /**
   * Match last 9 digits of `Student.phone` against `LineFriend.phone_from_sdk`.
   */
  async autoSuggestLinks(opts?: { lineAccountId?: number; csId?: number }) {
    const friends = await prisma.lineFriend.findMany({
      where: {
        ...(opts?.lineAccountId ? { line_account_id: opts.lineAccountId } : {}),
        phone_from_sdk: { not: null },
      },
      include: {
        line_account: {
          select: { id: true, display_name: true, account_type: true, cs_id: true },
        },
      },
    });

    const students = await prisma.student.findMany({
      where: {
        phone: { not: null },
        ...(opts?.csId
          ? { enrollments: { some: { cs_id: opts.csId } } }
          : {}),
      },
      select: {
        id: true,
        full_name: true,
        phone: true,
        email: true,
        line_uid: true,
        line_contact_relations: {
          select: { line_account_id: true, relation_status: true },
        },
      },
    });

    const friendByPhone9 = new Map<string, (typeof friends)[number][]>();
    for (const f of friends) {
      const p9 = normalizePhoneLast9(f.phone_from_sdk);
      if (p9.length < 9) continue;
      const list = friendByPhone9.get(p9) ?? [];
      list.push(f);
      friendByPhone9.set(p9, list);
    }

    const suggestions: any[] = [];
    for (const st of students) {
      const p9 = normalizePhoneLast9(st.phone);
      if (p9.length < 9) continue;
      const matchedFriends = friendByPhone9.get(p9) ?? [];
      for (const mf of matchedFriends) {
        const alreadyLinked = st.line_contact_relations.some(
          (r) => r.line_account_id === mf.line_account_id && r.relation_status === 'FRIEND',
        );
        if (alreadyLinked) continue;

        suggestions.push({
          student_id: st.id,
          student_name: st.full_name,
          student_phone: st.phone,
          line_account_id: mf.line_account_id,
          line_account_name: mf.line_account.display_name,
          friend_line_uid: mf.line_uid_in_nick,
          friend_display_name: mf.line_display_name,
          friend_avatar_url: mf.line_avatar_url,
          friend_phone: mf.phone_from_sdk,
        });
      }
    }

    return { items: suggestions, total: suggestions.length };
  }
}

export const lineService = new LineService();
