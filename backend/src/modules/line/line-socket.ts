/**
 * line-socket.ts — LINE Socket.IO event handlers & emitter helpers.
 */

import type { Server, Socket } from 'socket.io';
import { createLogger } from '../../shared/logger/logger';
import { prisma } from '../../prisma/client';
import { getIo } from '../../shared/realtime/socket-singleton';
import type {
  LineStatusSocketPayload,
  LineQrSocketPayload,
  LinePinSocketPayload,
  LineMessageSocketPayload,
  LineFriendUpdateSocketPayload,
  LineGroupUpdateSocketPayload,
} from './types/line.types';

const log = createLogger('LineSocket');

export function registerLineSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    socket.on('line:subscribe', async (data: { accountId?: string | number }) => {
      if (!data?.accountId) return;
      const accountId = Number(data.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) return;

      try {
        const account = await prisma.lineAccount.findUnique({
          where: { id: accountId },
          select: { id: true },
        });
        if (!account) {
          log.warn(`[line-socket] rejected subscribe for non-existent LINE account ${accountId}`);
          return;
        }
        socket.join(`line:${accountId}`);
        socket.join(`account:${accountId}`);
        log.debug(`Socket ${socket.id} joined line:${accountId}`);
      } catch (err) {
        log.error('[line-socket] line:subscribe error', { error: String(err) });
      }
    });

    socket.on('line:unsubscribe', (data: { accountId?: string | number }) => {
      if (!data?.accountId) return;
      const accountId = Number(data.accountId);
      if (!Number.isInteger(accountId) || accountId <= 0) return;
      socket.leave(`line:${accountId}`);
      socket.leave(`account:${accountId}`);
      log.debug(`Socket ${socket.id} left line:${accountId}`);
    });
  });
}

function emitLineEvent(accountId: number, event: string, payload: unknown): void {
  const io = getIo();
  if (!io) return;
  io.to(`line:${accountId}`).to(`account:${accountId}`).emit(event, payload);
}

export function emitLineStatus(payload: LineStatusSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:status', payload);
}

export function emitLineQr(payload: LineQrSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:qr', payload);
}

export function emitLinePin(payload: LinePinSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:pin', payload);
}

export function emitLineMessage(payload: LineMessageSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:message', payload);
}

export function emitLineFriendUpdate(payload: LineFriendUpdateSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:friend-update', payload);
}

export function emitLineGroupUpdate(payload: LineGroupUpdateSocketPayload): void {
  emitLineEvent(payload.accountId, 'line:group-update', payload);
}
