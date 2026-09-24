import { useEffect, useState, useCallback, useRef } from 'react';
import { zaloApi } from '../api/zalo.api';

const POLL_INTERVAL_MS = 30_000; // 30s

interface AccountConnectionState {
  accountId: number;
  isConnected: boolean;
  liveStatus: string | null;
  dbStatus: string;
}

interface UseZaloConnectionResult {
  /** Map of accountId → connection state */
  connections: Map<number, AccountConnectionState>;
  /** Whether at least one account is connected */
  hasAnyConnected: boolean;
  /** Number of connected accounts */
  connectedCount: number;
  /** Re-poll immediately */
  refresh: () => void;
}

/**
 * Polls account connection status every 30s.
 * Returns a Map<accountId, { isConnected, liveStatus }> for all active accounts.
 */
export function useZaloConnection(): UseZaloConnectionResult {
  const [connections, setConnections] = useState<Map<number, AccountConnectionState>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const accounts = await zaloApi.listAccounts();
      const next = new Map<number, AccountConnectionState>();
      for (const a of accounts) {
        const live = (a.liveStatus || a.status) as string | null;
        next.set(a.id, {
          accountId: a.id,
          isConnected: live === 'ACTIVE',
          liveStatus: live,
          dbStatus: a.status,
        });
      }
      setConnections(next);
    } catch {
      // silently ignore — next poll will retry
    }
  }, []);

  // Initial poll + interval
  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const connectedCount = Array.from(connections.values()).filter((c) => c.isConnected).length;

  return {
    connections,
    hasAnyConnected: connectedCount > 0,
    connectedCount,
    refresh: poll,
  };
}

/**
 * Get connection state for a single account from the hook result.
 */
export function getAccountConnection(
  connections: Map<number, AccountConnectionState>,
  accountId: number,
): AccountConnectionState | undefined {
  return connections.get(accountId);
}
