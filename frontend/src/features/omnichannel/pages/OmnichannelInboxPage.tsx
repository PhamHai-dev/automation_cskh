import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import type { ZaloAccount } from '../../zalo/types/zalo.types';
import type { LineAccount, LineConversation, LineMessage } from '../../line/types/line.types';
import { ZaloChatPage } from '../../zalo/pages/ZaloChatPage';
import { LineChatPage } from '../../line/pages/LineChatPage';
import { useToast } from '../../../components/ui/Toast';
import { useSocket } from '../../../hooks/useSocket';
import {
  MessageSquare,
  Send,
  RefreshCw,
  Search,
  Users,
  User,
  Sparkles,
  Bot,
  Smartphone,
  Layers,
  Clock,
  ShieldCheck,
} from 'lucide-react';

type WorkspaceMode = 'UNIFIED' | 'ZALO' | 'LINE';
type PlatformFilter = 'ALL' | 'ZALO' | 'LINE';
type ThreadFilter = 'all' | 'unread' | 'user' | 'group';

interface UnifiedConversationItem {
  uidKey: string;
  platform: 'ZALO' | 'LINE';
  accountId: number;
  accountName: string;
  accountTypeLabel: string;
  externalThreadId: string;
  threadType: 'user' | 'group';
  displayName: string;
  avatarUrl: string | null;
  unreadCount: number;
  lastMessageText: string;
  lastMessageAt: string | null;
  replyTokenExpiresAt?: string | null;
}

interface UnifiedMessageItem {
  id: string | number;
  senderUid: string;
  senderName: string | null;
  isSelf: boolean;
  content: string;
  contentType: string;
  sentVia?: string;
  timestamp: string;
}

export const OmnichannelInboxPage: React.FC<{ initialMode?: WorkspaceMode }> = ({
  initialMode,
}) => {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const socket = useSocket();

  const resolvedInitialMode = useMemo<WorkspaceMode>(() => {
    if (initialMode) return initialMode;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    if (ch === 'ZALO') return 'ZALO';
    if (ch === 'LINE') return 'LINE';
    return 'UNIFIED';
  }, [initialMode, searchParams]);

  const [mode, setMode] = useState<WorkspaceMode>(resolvedInitialMode);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('ALL');
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [conversations, setConversations] = useState<UnifiedConversationItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [selectedConv, setSelectedConv] = useState<UnifiedConversationItem | null>(null);
  const [messages, setMessages] = useState<UnifiedMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  const loadUnifiedConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const [zAccs, lAccs] = await Promise.all([
        zaloApi.listAccounts().catch(() => [] as ZaloAccount[]),
        lineApi.listAccounts().catch(() => [] as LineAccount[]),
      ]);
      setZaloAccounts(zAccs);
      setLineAccounts(lAccs);

      const activeZalo = zAccs.filter((a) => a.status === 'ACTIVE');
      const activeLine = lAccs.filter((a) => a.status === 'ACTIVE');

      const zaloPromises = activeZalo.map(async (acc) => {
        try {
          const res = await zaloApi.getConversations(acc.id, { limit: 40 });
          const items = res.items ?? [];
          return items.map((c: any): UnifiedConversationItem => ({
            uidKey: `ZALO:${acc.id}:${c.externalThreadId}`,
            platform: 'ZALO',
            accountId: acc.id,
            accountName: acc.display_name || `Zalo #${acc.id}`,
            accountTypeLabel: 'Zalo Personal',
            externalThreadId: String(c.externalThreadId || ''),
            threadType: c.threadType === 'group' ? 'group' : 'user',
            displayName: String(c.groupName || c.displayName || c.externalThreadId || ''),
            avatarUrl: c.groupAvatarUrl || c.avatarUrl || null,
            unreadCount: c.unreadCount ?? 0,
            lastMessageText: c.lastMessage?.content || '',
            lastMessageAt: c.lastMessageAt || null,
          }));
        } catch {
          return [] as UnifiedConversationItem[];
        }
      });

      const linePromises = activeLine.map(async (acc) => {
        try {
          const res = await lineApi.listConversations(acc.id, { limit: 40 });
          const items = res.items ?? [];
          return items.map((c: LineConversation): UnifiedConversationItem => {
            const lastMsg = (c as any).messages?.[0];
            const extId = String(c.external_thread_id || '');
            return {
              uidKey: `LINE:${acc.id}:${extId}`,
              platform: 'LINE',
              accountId: acc.id,
              accountName: acc.display_name || `LINE #${acc.id}`,
              accountTypeLabel: acc.account_type === 'OA' ? 'LINE OA' : 'LINE Personal',
              externalThreadId: extId,
              threadType: c.thread_type === 'group' ? 'group' : 'user',
              displayName: String(c.group_name || c.display_name || extId),
              avatarUrl: c.group_avatar_url || c.avatar_url || null,
              unreadCount: c.unread_count ?? 0,
              lastMessageText: lastMsg?.content || '',
              lastMessageAt: c.last_message_at || null,
              replyTokenExpiresAt: c.reply_token_expires_at || null,
            };
          });
        } catch {
          return [] as UnifiedConversationItem[];
        }
      });

      const allNested = await Promise.all([...zaloPromises, ...linePromises]);
      const merged = allNested.flat().sort((a: UnifiedConversationItem, b: UnifiedConversationItem) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      });

      setConversations(merged);
      if (!selectedConv && merged.length > 0) {
        setSelectedConv(merged[0]);
      }
    } finally {
      setLoadingList(false);
    }
  }, [selectedConv]);

  useEffect(() => {
    if (mode === 'UNIFIED') {
      loadUnifiedConversations();
    }
  }, [mode, loadUnifiedConversations]);

  const loadMessagesForSelected = useCallback(async (conv: UnifiedConversationItem) => {
    setLoadingMessages(true);
    try {
      if (conv.platform === 'ZALO') {
        const res = await zaloApi.getMessages(conv.accountId, conv.externalThreadId, {
          limit: 60,
        });
        const items: UnifiedMessageItem[] = (res.items ?? []).map((m: any) => ({
          id: m.id,
          senderUid: String(m.senderUid || ''),
          senderName: m.senderName || null,
          isSelf: Boolean(m.isSelf),
          content: m.content,
          contentType: m.contentType || 'text',
          sentVia: 'zalo_sdk',
          timestamp: m.timestamp,
        }));
        setMessages(items);
        if (conv.unreadCount > 0) {
          zaloApi.markConversationRead(conv.accountId, conv.externalThreadId).catch(() => {});
        }
      } else {
        const res = await lineApi.listMessages(conv.accountId, conv.externalThreadId, {
          limit: 60,
        });
        const items: UnifiedMessageItem[] = (res.items ?? []).map((m: LineMessage) => ({
          id: m.id,
          senderUid: String(m.sender_uid || ''),
          senderName: m.sender_name || null,
          isSelf: Boolean(m.is_self),
          content: m.content,
          contentType: m.content_type || 'text',
          sentVia: m.sent_via,
          timestamp: m.timestamp,
        }));
        setMessages(items);
        if (conv.unreadCount > 0) {
          lineApi.markRead(conv.accountId, conv.externalThreadId).catch(() => {});
        }
      }
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (mode === 'UNIFIED' && selectedConv) {
      loadMessagesForSelected(selectedConv);
    }
  }, [mode, selectedConv, loadMessagesForSelected]);

  // Real-time Socket.IO subscription for both Zalo & LINE
  useEffect(() => {
    if (!socket || mode !== 'UNIFIED') return;
    const handleIncoming = () => {
      loadUnifiedConversations();
      if (selectedConv) {
        loadMessagesForSelected(selectedConv);
      }
    };
    socket.on('zalo:message', handleIncoming);
    socket.on('line:message', handleIncoming);
    return () => {
      socket.off('zalo:message', handleIncoming);
      socket.off('line:message', handleIncoming);
    };
  }, [socket, mode, selectedConv, loadUnifiedConversations, loadMessagesForSelected]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (platformFilter !== 'ALL' && c.platform !== platformFilter) return false;
      if (threadFilter === 'unread' && c.unreadCount <= 0) return false;
      if (threadFilter === 'user' && c.threadType !== 'user') return false;
      if (threadFilter === 'group' && c.threadType !== 'group') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.displayName.toLowerCase().includes(q) ||
          c.accountName.toLowerCase().includes(q) ||
          c.externalThreadId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [conversations, platformFilter, threadFilter, searchQuery]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConv || !composerText.trim() || sending) return;
    setSending(true);
    try {
      const text = composerText.trim();
      setComposerText('');
      if (selectedConv.platform === 'ZALO') {
        await zaloApi.sendMessage(
          selectedConv.accountId,
          selectedConv.externalThreadId,
          text,
        );
      } else {
        await lineApi.sendMessage(selectedConv.accountId, selectedConv.externalThreadId, text);
      }
      await loadMessagesForSelected(selectedConv);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error || err?.message || 'Không thể gửi tin nhắn (kiểm tra hạn mức)',
      );
    } finally {
      setSending(false);
    }
  };

  const hasFreeReplyToken = useMemo(() => {
    if (!selectedConv?.replyTokenExpiresAt) return false;
    return new Date(selectedConv.replyTokenExpiresAt).getTime() > Date.now();
  }, [selectedConv]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
      {/* Top Omnichannel Mode Switcher Bar */}
      <div className="px-4 py-2.5 bg-surface border-b border-border flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center shadow-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary leading-tight">
              Hộp thư Đa kênh (Omnichannel Inbox)
            </h1>
            <p className="text-[11px] text-text-muted">
              Hợp nhất hội thoại Zalo Personal, LINE Official Account & LINE Personal E2EE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setMode('UNIFIED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              mode === 'UNIFIED'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Luồng Hợp nhất (Zalo + LINE)
          </button>
          <button
            onClick={() => setMode('ZALO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              mode === 'ZALO'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Không gian Zalo (Reactions / Polls / Nhãn)
          </button>
          <button
            onClick={() => setMode('LINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              mode === 'LINE'
                ? 'bg-[#06C755] text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Không gian LINE (OA / E2EE)
          </button>
        </div>
      </div>

      {/* Mode Content */}
      {mode === 'ZALO' ? (
        <div className="flex-1 overflow-hidden">
          <ZaloChatPage />
        </div>
      ) : mode === 'LINE' ? (
        <div className="flex-1 overflow-hidden">
          <LineChatPage />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: Unified Conversation Stream */}
          <div className="w-80 sm:w-96 border-r border-border bg-surface flex flex-col shrink-0">
            <div className="p-3 border-b border-border space-y-2.5">
              {/* Platform Filter Pills */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-lg flex-1">
                  {(['ALL', 'ZALO', 'LINE'] as PlatformFilter[]).map((pf) => (
                    <button
                      key={pf}
                      onClick={() => setPlatformFilter(pf)}
                      className={`flex-1 py-1 rounded-md text-[11px] font-bold transition-colors ${
                        platformFilter === pf
                          ? pf === 'ZALO'
                            ? 'bg-blue-600 text-white'
                            : pf === 'LINE'
                              ? 'bg-[#06C755] text-white'
                              : 'bg-surface text-text-primary shadow-2xs'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {pf === 'ALL'
                        ? `Tất cả (${conversations.length})`
                        : pf === 'ZALO'
                          ? `Zalo (${zaloAccounts.filter((a) => a.status === 'ACTIVE').length} nick)`
                          : `LINE (${lineAccounts.filter((a) => a.status === 'ACTIVE').length} kênh)`}
                    </button>
                  ))}
                </div>
                <button
                  onClick={loadUnifiedConversations}
                  className="p-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-muted"
                  title="Làm mới hội thoại"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên HV, nhóm lớp, tài khoản..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Thread Type Tabs */}
              <div className="flex items-center gap-1 text-[11px]">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'unread', label: 'Chưa đọc' },
                  { id: 'user', label: 'Cá nhân 1-1' },
                  { id: 'group', label: 'Nhóm lớp' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setThreadFilter(t.id as ThreadFilter)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      threadFilter === t.id
                        ? 'bg-primary-soft text-primary font-semibold'
                        : 'text-text-muted hover:bg-surface-muted'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/60">
              {loadingList && conversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-muted">
                  Đang đồng bộ hội thoại Zalo & LINE...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-xs text-text-muted">
                  Chưa có hội thoại nào khớp bộ lọc.
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = selectedConv?.uidKey === conv.uidKey;
                  return (
                    <button
                      key={conv.uidKey}
                      onClick={() => setSelectedConv(conv)}
                      className={`w-full text-left p-3 flex items-start gap-3 transition-colors ${
                        isSelected ? 'bg-primary-soft/60' : 'hover:bg-surface-muted/60'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-surface-muted border border-border flex items-center justify-center overflow-hidden text-xs font-bold text-text-secondary">
                          {conv.avatarUrl ? (
                            <img
                              src={conv.avatarUrl}
                              alt={conv.displayName}
                              className="w-full h-full object-cover"
                            />
                          ) : conv.threadType === 'group' ? (
                            <Users className="w-5 h-5 text-text-muted" />
                          ) : (
                            <User className="w-5 h-5 text-text-muted" />
                          )}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 px-1 py-0.2 rounded text-[9px] font-bold text-white shadow-2xs ${
                            conv.platform === 'ZALO' ? 'bg-blue-600' : 'bg-[#06C755]'
                          }`}
                        >
                          {conv.platform}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-text-primary truncate">
                            {conv.displayName}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-text-secondary truncate mt-0.5">
                          {conv.lastMessageText || 'Chưa có tin nhắn'}
                        </p>

                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-text-muted truncate">
                            {conv.accountName}
                          </span>
                          {conv.lastMessageAt && (
                            <span className="text-[10px] text-text-muted shrink-0">
                              {new Date(conv.lastMessageAt).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Center Pane: Active Thread */}
          <div className="flex-1 flex flex-col bg-surface-subtle/30">
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-text-muted">
                <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm font-medium">Chọn một hội thoại Zalo hoặc LINE để bắt đầu</p>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div className="h-14 px-4 bg-surface border-b border-border flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold text-white ${
                        selectedConv.platform === 'ZALO' ? 'bg-blue-600' : 'bg-[#06C755]'
                      }`}
                    >
                      {selectedConv.accountTypeLabel}
                    </span>
                    <div className="truncate">
                      <div className="font-bold text-sm text-text-primary truncate">
                        {selectedConv.displayName}
                      </div>
                      <div className="text-[11px] text-text-muted truncate">
                        Tài khoản: {selectedConv.accountName} · ID: {selectedConv.externalThreadId}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedConv.platform === 'LINE' && (
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          hasFreeReplyToken
                            ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {hasFreeReplyToken
                          ? 'Reply Token miễn phí (0 Quota) khả dụng'
                          : 'Push API / E2EE (Có kiểm soát Quota)'}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-muted text-[11px] text-text-secondary">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Rate-Limit Active
                    </span>
                    <button
                      onClick={() => setMode(selectedConv.platform)}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-surface-muted text-text-secondary"
                    >
                      Mở công cụ chuyên sâu {selectedConv.platform}
                    </button>
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {loadingMessages ? (
                    <div className="text-center py-8 text-xs text-text-muted">
                      Đang tải lịch sử tin nhắn...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-xs text-text-muted">
                      Chưa có tin nhắn trong cuộc trò chuyện này.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex flex-col ${m.isSelf ? 'items-end' : 'items-start'}`}
                      >
                        {!m.isSelf && m.senderName && (
                          <span className="text-[10px] text-text-muted mb-0.5 px-1">
                            {m.senderName}
                          </span>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs shadow-2xs ${
                            m.isSelf
                              ? selectedConv.platform === 'ZALO'
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#06C755] text-white'
                              : 'bg-surface border border-border text-text-primary'
                          }`}
                        >
                          <div className="whitespace-pre-wrap break-words">{m.content}</div>
                          <div
                            className={`text-[10px] mt-1 flex items-center justify-end gap-1.5 ${
                              m.isSelf ? 'text-white/80' : 'text-text-muted'
                            }`}
                          >
                            {m.sentVia === 'reply_token' && (
                              <span className="underline">0đ ReplyToken</span>
                            )}
                            <span>
                              {new Date(m.timestamp).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Composer */}
                <form
                  onSubmit={handleSend}
                  className="p-3 bg-surface border-t border-border flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={`Nhập tin nhắn gửi qua ${selectedConv.accountName} (${selectedConv.platform})...`}
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-border bg-surface-muted/50 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="submit"
                    disabled={sending || !composerText.trim()}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-50 ${
                      selectedConv.platform === 'ZALO'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-[#06C755] hover:bg-emerald-600'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sending ? 'Đang gửi...' : 'Gửi'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
