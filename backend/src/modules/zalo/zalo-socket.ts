/**
 * zalo-socket.ts — Zalo Socket.IO event handlers.
 * Ported from ZaloCRM zalo-socket.ts (64 lines) → single-org, Int IDs.
 *
 * Requires the authenticated account owner; Zalo uses `account:<id>` rooms.
 * LINE has its own room namespace. 'org:join' is retained as a no-op.
 */
import type { Server, Socket } from 'socket.io';
import { createLogger } from '../../shared/logger/logger';
import { prisma } from '../../prisma/client';

const log = createLogger('ZaloSocket');

export function registerZaloSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // DEPRECATED no-op: single-org nên không cần join org room theo client.
    socket.on('org:join', () => {
      /* no-op — server bỏ qua orgId client gửi */
    });

    // Subscribe QR/status của một Zalo account.
    // Account existence and ownership are both required.
    socket.on('zalo:subscribe', async (data: { accountId?: string | number }) => {
      if (!data?.accountId) return;
      const accountId = Number(data.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) return;
      try {
        const account = await prisma.zaloAccount.findUnique({
          where: { id: accountId },
          select: { id: true, cs_id: true },
        });
        if (!account) {
          log.warn(`[zalo-socket] từ chối subscribe account ${accountId} — không tồn tại`);
          return;
        }
        if (!socket.data?.userId || account.cs_id !== socket.data.userId) {
          log.warn(`[zalo-socket] từ chối subscribe account ${accountId} — không thuộc user ${socket.data.userId}`);
          return;
        }
        socket.join(`account:${accountId}`);
        log.debug(`Socket ${socket.id} joined account:${accountId}`);
      } catch (err) {
        log.error('[zalo-socket] zalo:subscribe error', { error: String(err) });
      }
    });

    // Unsubscribe — leave room luôn an toàn (không lộ dữ liệu).
    socket.on('zalo:unsubscribe', (data: { accountId?: string | number }) => {
      if (!data?.accountId) return;
      const accountId = Number(data.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) return;
      socket.leave(`account:${accountId}`);
      log.debug(`Socket ${socket.id} left account:${accountId}`);
    });
  });
}
