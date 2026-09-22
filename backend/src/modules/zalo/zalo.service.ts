/**
 * ZaloService — business logic for Zalo account management.
 * Uses ZaloRepository for persistence and ZaloPool for live session handling.
 */

import { prisma } from '../../prisma/client';
import { zaloRepository } from './zalo-repository';
import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { backfillIfEmpty } from './zalo-backfill-service';

const log = createLogger('ZaloService');

export class ZaloService {
  async getPoolStatus() {
    const accounts = await zaloRepository.findAll();
    const poolStatus = zaloPool.getPoolStatus();
    const poolMap = new Map(poolStatus.map((p) => [p.accountId, p]));

    return accounts.map((a) => {
      const live = poolMap.get(a.id);
      return {
        id: a.id,
        cs_id: a.cs_id,
        cs: (a as any).cs,
        zalo_uid: a.zalo_uid,
        display_name: a.display_name,
        zalo_phone: a.zalo_phone,
        status: a.status,
        last_connected_at: a.last_connected_at,
        last_login_at: a.last_login_at,
        last_active_at: a.last_active_at,
        proxy_url: a.proxy_url,
        liveStatus: live?.status ?? null,
        created_at: a.created_at,
        updated_at: a.updated_at,
      };
    });
  }

  async getAccountById(id: number) {
    const account = await zaloRepository.findById(id);
    if (!account) throw new AppError(404, `ZaloAccount ${id} not found`);
    return account;
  }

  /**
   * Create account with anti-ghost-dedup + ghost reuse transaction.
   * Race-safe: 2 parallel POST with same phone → only 1 record created.
   * Uses Serializable isolation so 1 tx aborts (P2034) → auto-retry sees ghost/dup.
   */
  async createAccount(data: {
    cs_id: number;
    display_name?: string;
    zalo_phone?: string;
    proxy_url?: string;
  }) {
    const user = await prisma.user.findUnique({ where: { id: data.cs_id } });
    if (!user) throw new AppError(404, `User ${data.cs_id} not found`);
    if (!user.active) throw new AppError(400, `User ${data.cs_id} is disabled`);

    const phone = (data.zalo_phone ?? '').trim().replace(/[\s.\-()]/g, '');

    type CreateResult =
      | { kind: 'dup_self'; rec: any }
      | { kind: 'dup_other'; ownerName: string | null }
      | { kind: 'reused_ghost'; rec: any }
      | { kind: 'created'; rec: any };

    const runCreate = async (): Promise<CreateResult> =>
      await prisma.$transaction(
        async (tx) => {
          // (1) Check phone duplicate — only when phone is non-empty
          if (phone) {
            const dup = await (tx as any).zaloAccount.findFirst({
              where: { zalo_phone: phone, archived_at: null },
              select: { id: true, display_name: true, status: true, cs_id: true, cs: { select: { name: true } } },
            });
            if (dup) {
              if (dup.cs_id === data.cs_id) return { kind: 'dup_self', rec: dup };
              return { kind: 'dup_other', ownerName: (dup as any).cs?.name ?? null };
            }
          }
          // (2) Reuse ghost: qr_pending chưa connect của chính owner (zalo_uid=null).
          const ghost = await (tx as any).zaloAccount.findFirst({
            where: { cs_id: data.cs_id, zalo_uid: null, status: 'QR_PENDING', archived_at: null },
            orderBy: { created_at: 'asc' },
            select: { id: true },
          });
          if (ghost) {
            const reused = await (tx as any).zaloAccount.update({
              where: { id: ghost.id },
              data: {
                ...(phone ? { zalo_phone: phone } : {}),
                ...(data.display_name ? { display_name: data.display_name } : {}),
                ...(data.proxy_url !== undefined ? { proxy_url: data.proxy_url ?? null } : {}),
              },
              select: { id: true, display_name: true, status: true, cs_id: true, zalo_phone: true },
            });
            return { kind: 'reused_ghost', rec: reused };
          }
          // (3) Create new nick + auto-grant owner admin access
          const acc = await (tx as any).zaloAccount.create({
            data: {
              cs_id: data.cs_id,
              display_name: data.display_name ?? null,
              zalo_phone: phone || null,
              proxy_url: data.proxy_url ?? null,
              status: 'QR_PENDING',
            },
          });
          await (tx as any).zaloAccountAccess.create({
            data: { zalo_account_id: acc.id, user_id: data.cs_id, permission: 'admin' },
          });
          return { kind: 'created', rec: acc };
        },
        { isolationLevel: 'Serializable' },
      );

    let result: CreateResult;
    try {
      result = await runCreate();
    } catch (err: any) {
      // P2034 = serialization conflict (2 POST race). Retry 1 lần → reuse/dup instead.
      if (err?.code === 'P2034') {
        result = await runCreate();
      } else {
        throw err;
      }
    }

    switch (result.kind) {
      case 'dup_self':
        log.info('Duplicate phone — same owner, reusing', { csId: data.cs_id, phone });
        return { ...result.rec, reused: true };
      case 'dup_other':
        throw new AppError(409, `Nick này đang do ${result.ownerName ?? 'nhân viên khác'} quản lý.`);
      case 'reused_ghost':
        log.info('Reused ghost qr_pending nick', { csId: data.cs_id });
        return { ...result.rec, reused: true, reusedGhost: true };
      case 'created':
        log.info('ZaloAccount created', { accountId: result.rec.id, csId: data.cs_id });
        return result.rec;
    }
  }

  async updateAccount(
    id: number,
    data: { display_name?: string; zalo_phone?: string; proxy_url?: string; status?: string },
  ) {
    await this.getAccountById(id);
    const updated = await prisma.zaloAccount.update({
      where: { id },
      data: {
        ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
        ...(data.zalo_phone !== undefined ? { zalo_phone: data.zalo_phone } : {}),
        ...(data.proxy_url !== undefined ? { proxy_url: data.proxy_url } : {}),
        ...(data.status ? { status: data.status as any } : {}),
      },
    });
    log.info('ZaloAccount updated', { accountId: id });
    return updated;
  }

  /**
   * Soft-delete: chỉ ẩn — GIỮ sessionData + zaloUid để revive.
   * Nhả uid (purge) sinh nick mới mồ côi → đã gỡ.
   */
  async removeAccount(id: number, archivedById?: number) {
    await this.getAccountById(id);
    try {
      zaloPool.disconnect(id);
    } catch {
      // already disconnected
    }
    const updated = await prisma.zaloAccount.update({
      where: { id },
      data: { archived_at: new Date(), status: 'DISABLED' as any, archived_by_id: archivedById ?? null } as any,
    });
    log.info('ZaloAccount soft-deleted', { accountId: id, archivedById });
    return updated;
  }

  /** Khôi phục nick đã xóa mềm — clear archived_at + archived_by_id */
  async restoreAccount(id: number) {
    const account = await this.getAccountById(id);
    if (!account.archived_at) throw new AppError(400, 'Account is not archived — nothing to restore');
    const updated = await prisma.zaloAccount.update({
      where: { id },
      data: { archived_at: null, archived_by_id: null, status: 'NOT_LOGGED_IN' as any } as any,
    });
    log.info('ZaloAccount restored', { accountId: id });
    return updated;
  }

  /** Liệt kê nick đã ẩn (tab "Nick đã xóa") — admin thấy tất cả, sale chỉ thấy nick mình */
  async getArchivedAccounts(requesterId: number) {
    const requester = await prisma.user.findUnique({ where: { id: requesterId } });
    const isAdmin = requester && Array.isArray(requester.roles)
      ? (requester.roles as string[]).some((r) => ['ADMIN', 'MANAGE'].includes(r))
      : false;
    const rows = await prisma.zaloAccount.findMany({
      where: {
        archived_at: { not: null },
        ...(isAdmin ? {} : { cs_id: requesterId }),
      },
      select: {
        id: true, display_name: true, zalo_uid: true, zalo_phone: true,
        cs_id: true, archived_at: true, last_connected_at: true, disconnect_reason: true,
        cs: { select: { name: true, email: true } },
        _count: { select: { conversations: true, friends: true } },
      } as any,
      orderBy: { archived_at: 'desc' },
    });
    const archiverIds = [...new Set(rows.map((r: any) => r.archived_by_id).filter((x: any): x is number => !!x))];
    const archivers: any[] = archiverIds.length
      ? await prisma.user.findMany({ where: { id: { in: archiverIds } }, select: { id: true, name: true, email: true } })
      : [];
    const archiverMap = new Map(archivers.map((u: any) => [u.id, u.name || u.email]));
    return rows.map((r: any) => ({
      id: r.id,
      display_name: r.display_name,
      zalo_uid: r.zalo_uid,
      zalo_phone: r.zalo_phone,
      ownerName: r.cs?.name || r.cs?.email || null,
      archived_at: r.archived_at,
      last_connected_at: r.last_connected_at,
      disconnect_reason: r.disconnect_reason,
      archivedByName: r.archived_by_id ? (archiverMap.get(r.archived_by_id) || 'Không rõ') : null,
      conversations: r._count.conversations,
      friends: r._count.friends,
      revivable: !!r.zalo_uid,
    }));
  }

  /** XÓA HẲN thẻ ma RỖNG (0 conv + 0 friend) — an toàn cascade vì không có data để mất */
  async purgeEmptyAccount(id: number) {
    const account = await prisma.zaloAccount.findUnique({
      where: { id },
      select: { archived_at: true, _count: { select: { conversations: true, friends: true } } },
    });
    if (!account) throw new AppError(404, `ZaloAccount ${id} not found`);
    if (!account.archived_at) throw new AppError(400, 'Chỉ xóa hẳn nick đã ẩn (đã xóa mềm)');
    const counts = account as any;
    if (counts._count.conversations > 0 || counts._count.friends > 0)
      throw new AppError(409, 'Nick còn dữ liệu (hội thoại/bạn bè) — không xóa hẳn được, chỉ khôi phục');
    zaloPool.disconnect(id);
    await prisma.zaloAccountAccess.deleteMany({ where: { zalo_account_id: id } });
    await prisma.zaloAccount.delete({ where: { id } });
    log.info('ZaloAccount purged (thẻ ma rỗng)', { accountId: id });
    return { message: 'Đã xóa hẳn nick (thẻ ma rỗng).' };
  }

  /**
   * Reconnect dùng session lưu sẵn.
   * Manual disconnect → 409 needsQR (session đã đóng, reconnect ngầm sẽ fail im lặng).
   */
  async reconnectAccount(id: number) {
    const account = await prisma.zaloAccount.findUnique({
      where: { id },
      select: { encrypted_session_data: true, proxy_url: true, disconnect_reason: true },
    });
    if (!account) throw new AppError(404, `ZaloAccount ${id} not found`);
    if (account.disconnect_reason === 'manual')
      throw new AppError(409, 'Nick này đã ngắt thủ công — vui lòng quét QR mới để đăng nhập lại.');
    const session = account.encrypted_session_data as any;
    if (!session) throw new AppError(400, 'No saved session — please login with QR first');
    const sessionData = typeof session === 'string' ? JSON.parse(session) : session;
    if (!sessionData?.cookie?.imei && !sessionData?.imei)
      throw new AppError(400, 'No valid session — please login with QR first');
    zaloPool.reconnect(id, sessionData).catch(() => {});
    return { message: 'Reconnect initiated' };
  }

  /** Mask proxy URL credentials for safe display (không lộ password). */
  static maskProxyUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) parsed.password = '****';
      return parsed.toString();
    } catch {
      return '****';
    }
  }

  // ─── QR flow ──────────────────────────────────────────────────────────

  async generateQr(accountId: number, requesterId: number) {
    const account = await this.getAccountById(accountId);
    // Scope check: CS can only QR for own accounts; ADMIN/MANAGE can QR for any
    const requester = await prisma.user.findUnique({ where: { id: requesterId } });
    const isPrivileged =
      requester && Array.isArray(requester.roles)
        ? (requester.roles as string[]).some((r: string) => ['ADMIN', 'MANAGE'].includes(r))
        : false;
    if (!isPrivileged && account.cs_id !== requesterId) {
      throw new AppError(403, 'Forbidden: not your Zalo account');
    }

    const result = await zaloPool.generateQr(accountId, account.cs_id);

    // Persist QR to DB for frontend polling
    await prisma.zaloAccount.update({
      where: { id: accountId },
      data: { qr_code: result.qrDataUrl, status: 'QR_PENDING' },
    });

    log.info('QR generated', { accountId, requesterId });
    return result;
  }

  async completeQrLogin(
    accountId: number,
    data: { zalo_uid?: string; display_name?: string; session_data?: string },
  ) {
    const account = await this.getAccountById(accountId);

    if (data.session_data) {
      // If client sent encrypted session directly (e.g. from zca-js in browser), store it
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          encrypted_session_data: data.session_data,
          ...(data.zalo_uid ? { zalo_uid: data.zalo_uid } : {}),
          ...(data.display_name ? { display_name: data.display_name } : {}),
          status: 'ACTIVE' as any,
          last_connected_at: new Date(),
          last_login_at: new Date(),
          qr_code: null,
        },
      });
      // Also notify pool
      try {
        const sessionData = JSON.parse(data.session_data);
        await zaloPool.completeQrLogin(accountId, sessionData);
      } catch {
        // Pool complete may fail if zca-js not available — DB state is still ACTIVE
        log.warn('Pool completeQrLogin failed (zca-js unavailable)', { accountId });
      }
    } else {
      // No session_data: just update display fields
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          ...(data.zalo_uid ? { zalo_uid: data.zalo_uid } : {}),
          ...(data.display_name ? { display_name: data.display_name } : {}),
        },
      });
    }

    const updated = await zaloRepository.findById(accountId);
    log.info('QR login completed', { accountId });

    // Fire-and-forget: backfill initial history if first login (no conversations yet)
    const api = zaloPool.getAccountClient(accountId);
    if (api) {
      backfillIfEmpty(api, accountId).catch((err) =>
        log.warn('Post-login backfill failed (non-critical)', { accountId, error: String(err) }),
      );
    }

    return updated;
  }

  // ─── Friends / Groups ─────────────────────────────────────────────────

  async getFriends(accountId: number) {
    await this.getAccountById(accountId);
    return zaloRepository.findContactsForAccount(accountId);
  }

  async getGroups(accountId: number) {
    await this.getAccountById(accountId);
    return zaloRepository.findGroupsForAccount(accountId);
  }

  async refreshGroups(accountId: number) {
    await this.getAccountById(accountId);

    const client = zaloPool.getAccountClient(accountId) as any;
    if (!client) {
      throw new AppError(400, `Account ${accountId} is not connected — cannot refresh groups`);
    }

    // Try to fetch groups via zca-js
    try {
      const groups: any[] = (await client.getAllGroups?.()) ?? (await client.getGroupList?.()) ?? [];
      let synced = 0;
      for (const g of groups) {
        const groupId: string = g.groupId ?? g.grid ?? g.id ?? '';
        if (!groupId) continue;
        const group = await zaloRepository.upsertGroup(groupId, accountId, {
          name: g.name ?? g.groupName ?? null,
          avatar_url: g.avatar ?? g.thumb ?? null,
          member_count: g.memberCount ?? g.totalMember ?? null,
          owner_zalo_uid: g.ownerId ?? g.creatorId ?? null,
        });
        // Sync members if available
        const members: any[] = g.members ?? g.memberIds ?? [];
        if (Array.isArray(members)) {
          for (const m of members) {
            const uid: string = typeof m === 'string' ? m : (m.uid ?? m.id ?? '');
            if (!uid) continue;
            await zaloRepository.upsertGroupMember(group.id, uid, {
              display_name: typeof m === 'object' ? (m.displayName ?? m.dName ?? null) : null,
              avatar_url: typeof m === 'object' ? (m.avatar ?? null) : null,
            });
          }
        }
        synced++;
      }
      log.info('Groups refreshed', { accountId, synced });
      return { synced, total: groups.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Group refresh failed', { accountId, error: msg });
      throw new AppError(500, `Group refresh failed: ${msg}`);
    }
  }
}
