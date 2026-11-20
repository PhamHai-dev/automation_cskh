import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import { useAccountSubscriptions, useSocket } from '../../../hooks/useSocket';
import { InboxWorkspace, InboxToolbar, InboxConversation, InboxState, type InboxReadStatus, type InboxThreadType } from '../components/InboxWorkspace';
import { InboxThread } from '../components/InboxThread';
import { toInboxConversation, type InboxAccount, type InboxConversationItem, type InboxPlatform } from '../utils/inbox';

type InitialMode = 'UNIFIED' | 'ZALO' | 'LINE';

export const OmnichannelInboxPage: React.FC<{ initialMode?: InitialMode }> = ({ initialMode }) => {
  const [params] = useSearchParams();
  const initialPlatform = initialMode === 'ZALO' || initialMode === 'LINE' ? initialMode
    : ['ZALO', 'LINE'].includes(params.get('channel') || '') ? params.get('channel') as InboxPlatform : 'ALL';
  const [platform, setPlatform] = useState<InboxPlatform>(initialPlatform);
  const [accountFilter, setAccountFilter] = useState('ALL');
  const [threadType, setThreadType] = useState<InboxThreadType>('ALL');
  const [readStatus, setReadStatus] = useState<InboxReadStatus>('ALL');
  const [search, setSearch] = useState('');
  const [accounts, setAccounts] = useState<InboxAccount[]>([]);
  const [conversations, setConversations] = useState<InboxConversationItem[]>([]);
  const [selected, setSelected] = useState<InboxConversationItem | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const listVersion = useRef(0);
  const deepLinkHandled = useRef(false);
  const socket = useSocket();
  useAccountSubscriptions('zalo', accounts.filter((a) => a.platform === 'ZALO').map((a) => a.id));
  useAccountSubscriptions('line', accounts.filter((a) => a.platform === 'LINE').map((a) => a.id));

  useEffect(() => {
    deepLinkHandled.current = false;
    setPlatform(initialPlatform); setAccountFilter('ALL'); setThreadType('ALL'); setReadStatus('ALL'); setSearch('');
    setSelected(null); setShowThread(false);
  }, [initialPlatform, params]);

  const loadConversations = useCallback(async (silent = false) => {
    const version = ++listVersion.current;
    if (!silent) setLoading(true);
    setError('');
    try {
      // A provider failure must not hide the other provider's conversations.
      const [zaloResult, lineResult] = await Promise.allSettled([zaloApi.listAccounts(), lineApi.listAccounts()]);
      if (version !== listVersion.current) return;
      const loadedAccounts: InboxAccount[] = [
        ...(zaloResult.status === 'fulfilled' ? zaloResult.value.map((a): InboxAccount => ({ key: `ZALO:${a.id}`, platform: 'ZALO', id: a.id, name: a.display_name || `Zalo #${a.id}`, type: 'PERSONAL', status: a.liveStatus || a.status })) : []),
        ...(lineResult.status === 'fulfilled' ? lineResult.value.map((a): InboxAccount => ({ key: `LINE:${a.id}`, platform: 'LINE', id: a.id, name: a.display_name || `LINE #${a.id}`, type: a.account_type, status: a.liveStatus || a.status })) : []),
      ];
      setAccounts(loadedAccounts);
      const failures: string[] = [];
      if (zaloResult.status === 'rejected') failures.push('tài khoản Zalo');
      if (lineResult.status === 'rejected') failures.push('tài khoản LINE');
      const lists = await Promise.all(loadedAccounts.map(async (account) => {
        try {
          const result = account.platform === 'ZALO' ? await zaloApi.getConversations(account.id, { limit: 100 })
            : await lineApi.listConversations(account.id, { limit: 100 });
          return (result.items || []).map((c: any) => toInboxConversation(account, c));
        } catch { failures.push(account.name); return []; }
      }));
      if (version !== listVersion.current) return;
      const merged = lists.flat().sort((a, b) => (Date.parse(b.lastMessageAt || '') || 0) - (Date.parse(a.lastMessageAt || '') || 0));
      setConversations(merged);
      setSelected((current) => current ? merged.find((c) => c.key === current.key) || current : null);
      if (failures.length) setError(`Chưa tải được: ${failures.join(', ')}. Bạn có thể thử lại.`);
      if (!deepLinkHandled.current) {
        const requestedAccount = Number(params.get('accountId'));
        const requestedThread = params.get('threadId');
        const requestedChannel = initialMode === 'ZALO' || initialMode === 'LINE' ? initialMode : params.get('channel');
        const found = requestedThread ? merged.find((c) => c.threadId === requestedThread && (!requestedAccount || c.account.id === requestedAccount) && (!requestedChannel || c.account.platform === requestedChannel)) : null;
        if (requestedAccount) {
          const account = loadedAccounts.find((a) => a.id === requestedAccount && (!requestedChannel || a.platform === requestedChannel));
          if (account) setAccountFilter(account.key);
        }
        if (found) { setSelected(found); setShowThread(true); }
        // A failed provider load should still allow the deep link to resolve on retry.
        if (!failures.length || found) deepLinkHandled.current = true;
      }
    } finally { if (version === listVersion.current) setLoading(false); }
  }, [params, initialMode]);
  useEffect(() => { void loadConversations(); return () => { listVersion.current++; }; }, [loadConversations]);
  useEffect(() => {
    if (!socket) return;
    const incoming = () => { void loadConversations(true); };
    socket.on('zalo:message', incoming); socket.on('line:message', incoming);
    return () => { socket.off('zalo:message', incoming); socket.off('line:message', incoming); };
  }, [socket, loadConversations]);

  const availableAccounts = accounts.filter((a) => platform === 'ALL' || a.platform === platform);
  const filtered = useMemo(() => conversations.filter((c) => {
    if (platform !== 'ALL' && c.account.platform !== platform) return false;
    if (accountFilter !== 'ALL' && c.account.key !== accountFilter) return false;
    if (readStatus === 'unread' && c.unread <= 0) return false;
    if (readStatus === 'read' && c.unread > 0) return false;
    if (readStatus === 'unreplied' && c.isReplied !== false) return false;
    if (threadType === 'group' && !c.group) return false;
    if (threadType === 'user' && c.group) return false;
    return !search.trim() || `${c.name} ${c.account.name} ${c.threadId}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [conversations, platform, accountFilter, readStatus, threadType, search]);
  const clearSelection = () => { setSelected(null); setShowThread(false); };
  const markRead = useCallback((key: string) => { setConversations((items) => items.map((c) => c.key === key ? { ...c, unread: 0 } : c)); }, []);

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface p-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-5 w-5 shrink-0 text-primary" />
          <div><h1 className="text-base font-semibold text-text-primary">Hộp thư đa kênh</h1><p className="text-xs text-text-muted">Quản lý hội thoại và phản hồi qua Zalo, LINE</p></div>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <InboxWorkspace showThread={showThread} listHeader={
          <InboxToolbar accounts={[{ value: 'ALL', label: 'Tất cả tài khoản' }, ...availableAccounts.map((a) => ({ value: a.key, label: `${a.name} · ${a.platform === 'ZALO' ? 'Zalo' : a.type === 'OA' ? 'LINE OA' : 'LINE cá nhân'}` }))]}
            accountId={accountFilter} onAccountChange={(value) => { setAccountFilter(value); clearSelection(); }} search={search} onSearchChange={setSearch}
            platform={platform} onPlatformChange={(value) => { setPlatform(value); setAccountFilter('ALL'); clearSelection(); }}
            threadType={threadType} onThreadTypeChange={setThreadType} readStatus={readStatus} onReadStatusChange={setReadStatus}
            onReset={() => { setPlatform('ALL'); setAccountFilter('ALL'); setThreadType('ALL'); setReadStatus('ALL'); setSearch(''); clearSelection(); }}
            onRefresh={() => void loadConversations()} loading={loading} count={filtered.length} />
        } list={<>
          {error && <InboxState error={error} onRetry={() => void loadConversations()} />}
          {loading && !conversations.length ? <InboxState loading /> : !filtered.length && !error ? <InboxState title={search || readStatus !== 'ALL' || threadType !== 'ALL' ? 'Không có hội thoại phù hợp bộ lọc' : 'Chưa có hội thoại'} />
            : filtered.map((c) => <InboxConversation key={c.key} name={c.name} avatar={c.avatar} group={c.group} platform={c.account.platform === 'ZALO' ? 'Zalo' : 'LINE'} accountName={c.account.name}
              preview={c.preview} timestamp={c.lastMessageAt} unread={c.unread} selected={selected?.key === c.key} onClick={() => { setSelected(c); setShowThread(true); }} />)}
        </>}>
          {selected ? <InboxThread key={selected.key} conversation={selected} onBack={clearSelection} onRead={markRead} onChanged={() => void loadConversations(true)}
            onDeleted={(key) => { setConversations((items) => items.filter((c) => c.key !== key)); clearSelection(); }} /> : <InboxState />}
        </InboxWorkspace>
      </div>
    </div>
  );
};
