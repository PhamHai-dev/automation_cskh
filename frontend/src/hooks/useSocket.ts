import { useEffect, useRef, useCallback, useState } from 'react';
import { getSocket, connectSocket } from '../lib/socket';
import type { Socket } from '../lib/socket';

/**
 * useSocket - React hook for Socket.IO.
 * Auto-connects on mount, provides on/off/emit + connected state.
 * Cleanup removes listeners registered via this hook; does NOT disconnect globally.
 */
export function useSocket() {
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(...args: any[]) => void>>>(new Map());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = connectSocket();
    socketRef.current = s;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    setConnected(s.connected);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      for (const [event, handlers] of listenersRef.current.entries()) {
        for (const h of handlers) s.off(event, h);
      }
      listenersRef.current.clear();
    };
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    const s = socketRef.current ?? getSocket();
    s.on(event, handler);
    let set = listenersRef.current.get(event);
    if (!set) { set = new Set(); listenersRef.current.set(event, set); }
    set.add(handler);
  }, []);

  const off = useCallback((event: string, handler: (...args: any[]) => void) => {
    const s = socketRef.current ?? getSocket();
    s.off(event, handler);
    listenersRef.current.get(event)?.delete(handler);
  }, []);

  const emit = useCallback((event: string, payload?: unknown) => {
    const s = socketRef.current ?? getSocket();
    s.emit(event, payload);
  }, []);

  return { socket: socketRef.current, connected, on, off, emit };
}

/**
 * useZaloAccountSocket - join/leave account room + subscribe to events.
 */
export function useZaloAccountSocket(accountId: number | null) {
  const { connected, on, off, emit } = useSocket();

  useEffect(() => {
    if (!accountId || !connected) return;
    emit('zalo:subscribe', { accountId });
    return () => { emit('zalo:unsubscribe', { accountId }); };
  }, [accountId, connected, emit]);

  return { connected, on, off, emit };
}
