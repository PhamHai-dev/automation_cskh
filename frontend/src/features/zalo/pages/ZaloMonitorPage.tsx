import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../../../hooks/useSocket';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Wifi, WifiOff, Trash2, Pause, Play } from 'lucide-react';

interface MonitorEvent {
  id: number;
  timestamp: Date;
  event: string;
  payload: unknown;
  color: string;
}

const EVENT_COLORS: Record<string, string> = {
  'zalo:status': 'bg-emerald-500',
  'zalo:qr': 'bg-amber-500',
  'zalo:message': 'bg-blue-500',
  'zalo:typing': 'bg-purple-500',
  'zalo:friend-update': 'bg-yellow-500',
  'zalo:group-update': 'bg-indigo-500',
  'zalo:undo': 'bg-red-400',
  'zalo:sync-complete': 'bg-cyan-500',
};

function formatEventName(event: string): string {
  return event.replace('zalo:', '').replace(/-/g, ' ').toUpperCase();
}

export const ZaloMonitorPage: React.FC = () => {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const logEndRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);
  const { connected, on, off, emit } = useSocket();

  const handleAnyEvent = useCallback(
    (event: string, data: unknown) => {
      if (paused) return;
      const payload = (data ?? {}) as Record<string, unknown>;
      const accountId = payload.accountId;
      if (accountFilter !== 'all' && String(accountId) !== accountFilter) return;

      counterRef.current += 1;
      const entry: MonitorEvent = {
        id: counterRef.current,
        timestamp: new Date(),
        event,
        payload: data,
        color: EVENT_COLORS[event] || 'bg-gray-400',
      };
      setEvents((prev) => [...prev.slice(-499), entry]);
    },
    [paused, accountFilter],
  );

  useEffect(() => {
    const events_: string[] = [
      'zalo:status', 'zalo:qr', 'zalo:message', 'zalo:typing',
      'zalo:friend-update', 'zalo:group-update', 'zalo:undo', 'zalo:sync-complete',
    ];
    const handlers = new Map<string, (data: unknown) => void>();
    for (const e of events_) {
      const handler = (data: unknown) => handleAnyEvent(e, data);
      handlers.set(e, handler);
      on(e, handler);
    }
    return () => {
      for (const [e, h] of handlers.entries()) off(e, h);
    };
  }, [handleAnyEvent, on, off]);

  // Auto-scroll
  useEffect(() => {
    if (!paused) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, paused]);

  const clearEvents = () => setEvents([]);

  const uniqueAccounts = Array.from(
    new Set(
      events
        .map((e) => String((e.payload as Record<string, unknown>)?.accountId ?? ''))
        .filter(Boolean),
    ),
  );

  return (
    <PageContainer>
      <PageHeader
        title="Zalo Real-time Monitor"
        description="Live Socket.IO event stream — subscribe to all zalo:* events for debugging"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => emit('zalo:test-ping', { ts: Date.now() })}
              leftIcon={<Wifi className="w-3.5 h-3.5" />}
            >
              Test Ping
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPaused((p) => !p)}
              leftIcon={paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearEvents}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Clear
            </Button>
          </div>
        }
      />

      {/* Status bar */}
      <div className="flex items-center gap-4 mb-4">
        <span
          className={
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ' +
            (connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')
          }
        >
          {connected ? (
            <Wifi className="w-3 h-3 animate-pulse" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {connected ? 'Socket Connected' : 'Socket Disconnected'}
        </span>
        <span className="text-xs text-gray-500">{events.length} events captured</span>

        {/* Account filter */}
        {uniqueAccounts.length > 0 && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
          >
            <option value="all">All accounts</option>
            {uniqueAccounts.map((id) => (
              <option key={id} value={id}>
                Account #{id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Event log */}
      <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
        <div className="max-h-[600px] overflow-y-auto font-mono text-xs p-4 space-y-1">
          {events.length === 0 && (
            <div className="text-gray-500 text-center py-8">
              Waiting for events... Connect to a Zalo account to see activity.
            </div>
          )}
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-start gap-2 group hover:bg-gray-800 px-2 py-0.5 rounded"
            >
              <span className="text-gray-500 shrink-0 w-[70px]">
                {e.timestamp.toLocaleTimeString('vi-VN')}
              </span>
              <span
                className={
                  e.color + ' text-white px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0'
                }
              >
                {formatEventName(e.event)}
              </span>
              <span className="text-gray-300 break-all">{JSON.stringify(e.payload)}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </PageContainer>
  );
};
