/**
 * socket-singleton.ts — Socket.IO server singleton.
 * Provides getIo() for modules that need to emit real-time events.
 * Lazy-initialized: import kahon server không mở kết nối.
 *
 * setupIo(httpServer) must be called once from server.ts after http.createServer.
 */
import { Server as HttpServer } from 'node:http';
import { Server, type ServerOptions } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { createLogger } from '../logger/logger';

const log = createLogger('SocketSingleton');

let io: Server | null = null;

/**
 * Initialize the Socket.IO server attached to the given HTTP server.
 * Safe to call multiple times — only the first call takes effect.
 */
export function setupIo(httpServer: HttpServer, opts?: Partial<ServerOptions>): Server {
  if (io) {
    log.warn('setupIo called but already initialized — returning existing instance');
    return io;
  }
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    ...opts,
  });

  // Extract authenticated userId from handshake token if provided and join user room
  io.use((socket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      (typeof socket.handshake.headers?.authorization === 'string' &&
      socket.handshake.headers.authorization.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : undefined);
    if (rawToken && typeof rawToken === 'string') {
      try {
        const decoded = jwt.verify(rawToken, env.JWT_SECRET) as { id?: number };
        if (decoded?.id) {
          socket.data.userId = Number(decoded.id);
          socket.join(`user:${decoded.id}`);
        }
      } catch {
        // Invalid/expired token — socket.data.userId remains undefined
      }
    }
    next();
  });

  log.info('Socket.IO server initialized');
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Returns null if not yet initialized (safe for modules imported before server start).
 */
export function getIo(): Server | null {
  return io;
}

/**
 * Emit to a specific account room. No-op if io not ready.
 * Usage: emitToAccount(accountId, 'zalo:qr', { qrUrl });
 */
export function emitToAccount(accountId: number | string, event: string, data: unknown): void {
  io?.to(`account:${accountId}`).emit(event, data);
}

/**
 * Emit to a specific user room. No-op if io not ready.
 * Usage: emitToUser(userId, 'zalo:access-changed', { ... });
 */
export function emitToUser(userId: number | string, event: string, data: unknown): void {
  io?.to(`user:${userId}`).emit(event, data);
}

/**
 * Shutdown Socket.IO gracefully.
 */
export async function closeIo(): Promise<void> {
  if (io) {
    await io.close();
    io = null;
    log.info('Socket.IO server closed');
  }
}
