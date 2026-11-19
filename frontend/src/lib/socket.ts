import { io, type Socket } from 'socket.io-client';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api/v1';
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string) ||
  API_URL.replace(/\/api\/v\d+\/?$/, '') ||
  'http://localhost:3000';

let socket: Socket | null = null;
const accountSubscriptions = new Map<string, { platform: 'zalo' | 'line'; accountId: number; count: number }>();

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
    reconnectionAttempts: 30,
    auth: (cb) => {
      const token = localStorage.getItem('accessToken');
      cb(token ? { token } : {});
    },
  });
  socket.on('connect', () => {
    for (const { platform, accountId } of accountSubscriptions.values()) {
      socket?.emit(`${platform}:subscribe`, { accountId });
    }
  });
  return socket;
}

export function subscribeAccount(platform: 'zalo' | 'line', accountId: number): () => void {
  const key = `${platform}:${accountId}`;
  const existing = accountSubscriptions.get(key);
  if (existing) existing.count += 1;
  else {
    accountSubscriptions.set(key, { platform, accountId, count: 1 });
    if (getSocket().connected) getSocket().emit(`${platform}:subscribe`, { accountId });
  }
  return () => {
    const current = accountSubscriptions.get(key);
    if (!current || --current.count > 0) return;
    accountSubscriptions.delete(key);
    if (socket?.connected) socket.emit(`${platform}:unsubscribe`, { accountId });
  };
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

export type { Socket };
