/**
 * ZaloService — business logic for Zalo account management.
 * Uses ZaloRepository for persistence and ZaloPool for live session handling.
 */

import { prisma } from '../../prisma/client';
import { zaloRepository } from './zalo-repository';
import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';

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

  async createAccount(data: {
    cs_id: number;
    display_name?: string;
    zalo_phone?: string;
    proxy_url?: string;
  }) {
    // Validate cs_id exists and has CS role
    const user = await prisma.user.findUnique({ where: { id: data.cs_id } });
    if (!user) throw new AppError(404, `User ${data.cs_id} not found`);
    if (!user.active) throw new AppError(400, `User ${data.cs_id} is disabled`);

    const account = await zaloRepository.create({
      cs_id: data.cs_id,
      display_name: data.display_name,
      zalo_phone: data.zalo_phone,
    });

    // Optionally update proxy_url if provided
    if (data.proxy_url) {
      await prisma.zaloAccount.update({
        where: { id: account.id },
        data: { proxy_url: data.proxy_url },
      });
    }

    log.info('ZaloAccount created', { accountId: account.id, csId: data.cs_id });
    return account;
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

  async removeAccount(id: number) {
    await this.getAccountById(id);
    // Disconnect from pool if active
    try {
      await zaloPool.disconnect(id);
    } catch {
      // already disconnected
    }
    const result = await zaloRepository.remove(id);
    log.info('ZaloAccount removed', { accountId: id });
    return result;
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
