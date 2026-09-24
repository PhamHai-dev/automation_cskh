import { io, type Socket } from 'socket.io-client';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api/v1';
const SOCKET_URL =
  (import.meta.env.VITE_SOCKET_URL as string) ||
  API_URL.replace(/\/api\/v\d+\/?$/, '') ||
  'http://localhost:3000';

let socket: Socket | null = null;

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
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}

export type { Socket };
