import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { lineApi } from '../api/line.api';
import type {
  LineAccount,
  LineConversation,
  LineMessage,
  LineSocketMessageEvent,
} from '../types/line.types';
import { Button } from '../../../components/ui/Button';
import { useSocket } from '../../../hooks/useSocket';
import { useToast } from '../../../components/ui/Toast';
import {
  Search,
  Send,
  MessageSquare,
  Users,
  RefreshCw,
  Inbox,
  Bell,
  Hash,
  Sparkles,
  Bot,
  Smartphone,
  CheckCircle2,
} from 'lucide-react';

type FilterTab = 'all' | 'unread' | 'user' | 'group';

const FILTER_TABS: { key: FilterTab; label: string; icon: React.FC<any> }[] = [
  { key: 'all', label: 'Tất cả', icon: Inbox },
  { key: 'unread', label: 'Chưa đọc', icon: Bell },
  { key: 'user', label: 'Cá nhân', icon: Users },
  { key: 'group', label: 'Nhóm', icon: Hash },
];

export const LineChatPage: React.FC = () => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [conversations, setConversations] = useState<LineConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchInput, setSearchInput] = useState('');

  const [selectedThreadId, setSelectedThreadId] = useState<string>('');
  const [messages, setMessages] = useState<LineMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { on, off } = useSocket();

  useEffect(() => {
    lineApi
      .listAccounts()
      .then((accs) => {
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoadingConvs(true);
    try {
      const res = await lineApi.listConversations(selectedAccountId, { limit: 100 });
      setConversations(res.items);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    setSelectedThreadId('');
    setMessages([]);
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(
    async (threadId: string) => {
      if (!selectedAccountId || !threadId) return;
      setLoadingMsgs(true);
      try {
        const res = await lineApi.listMessages(selectedAccountId, threadId, { limit: 100 });
        setMessages(res.items);
        await lineApi.markRead(selectedAccountId, threadId).catch(() => {});
      } catch {
        setMessages([]);
      } finally {
        setLoadingMsgs(false);
      }
    },
    [selectedAccountId],
  );

  useEffect(() => {
    if (selectedThreadId) {
      fetchMessages(selectedThreadId);
    }
  }, [selectedThreadId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Socket.IO realtime incoming/outgoing messages
  const handleSocketMessage = useCallback(
    (evt: LineSocketMessageEvent) => {
      if (evt.accountId !== selectedAccountId) return;
      fetchConversations();
      if (evt.threadId === selectedThreadId) {
        fetchMessages(selectedThreadId);
      }
    },
    [selectedAccountId, selectedThreadId, fetchConversations, fetchMessages],
  );

  useEffect(() => {
    on('line:message', handleSocketMessage);
    return () => {
      off('line:message', handleSocketMessage);
    };
  }, [on, off, handleSocketMessage]);

  const getThreadId = (c: LineConversation) =>
    c.external_thread_id || c.externalThreadId || '';
  const getThreadType = (c: LineConversation) =>
    (c.thread_type || c.threadType || 'user').toLowerCase();
  const getThreadTitle = (c: LineConversation) =>
    c.group_name ||
    c.groupName ||
    c.display_name ||
    c.displayName ||
    getThreadId(c) ||
    'Hội thoại LINE';
  const getUnreadCount = (c: LineConversation) => c.unread_count ?? c.unreadCount ?? 0;
  const getReplyTokenExpiry = (c: LineConversation | undefined) => {
    if (!c) return null;
    const raw = c.reply_token_expires_at || c.replyTokenExpiresAt;
    if (!raw) return null;
    const dt = new Date(raw);
    return dt.getTime() > Date.now() ? dt : null;
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const tType = getThreadType(c);
      const unread = getUnreadCount(c);
      if (activeTab === 'unread' && unread <= 0) return false;
      if (activeTab === 'user' && tType === 'group') return false;
      if (activeTab === 'group' && tType !== 'group') return false;
      if (searchInput.trim()) {
        const q = searchInput.trim().toLowerCase();
        const name = getThreadTitle(c).toLowerCase();
        const tid = getThreadId(c).toLowerCase();
        return name.includes(q) || tid.includes(q);
      }
      return true;
    });
  }, [conversations, activeTab, searchInput]);

  const currentConversation = useMemo(
    () => conversations.find((c) => getThreadId(c) === selectedThreadId),
    [conversations, selectedThreadId],
  );

  const activeReplyTokenExpiresAt = getReplyTokenExpiry(currentConversation);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !selectedThreadId || !composerText.trim()) return;
    const text = composerText.trim();
    setSending(true);
    try {
      await lineApi.sendMessage(selectedAccountId, selectedThreadId, text);
      setComposerText('');
      await fetchMessages(selectedThreadId);
      fetchConversations();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể gửi tin nhắn LINE',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex bg-surface overflow-hidden">
      {/* Column 1: LINE Account Selector */}
      <div className="w-60 border-r border-border/80 bg-surface-subtle/40 flex flex-col shrink-0">
        <div className="p-3.5 border-b border-border/80 flex items-center justify-between">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Tài khoản LINE
          </span>
          <button
            onClick={fetchConversations}
            className="text-text-muted hover:text-primary p-1 rounded-lg"
            title="Làm mới"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {accounts.map((acc) => {
            const isSelected = acc.id === selectedAccountId;
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`w-full p-2.5 rounded-xl flex items-center gap-2.5 text-left transition-all ${
                  isSelected
                    ? 'bg-[#06C755]/15 text-emerald-950 ring-1 ring-[#06C755]/40 font-semibold'
                    : 'hover:bg-surface-muted text-text-secondary'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${
                    acc.account_type === 'OA' ? 'bg-[#06C755]' : 'bg-teal-600'
                  }`}
                >
                  {acc.account_type === 'OA' ? (
                    <Bot className="w-4 h-4" />
                  ) : (
                    <Smartphone className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">
                    {acc.display_name || `LINE #${acc.id}`}
                  </div>
                  <div className="text-[10px] text-text-muted truncate">
                    {acc.account_type === 'OA'
                      ? `OA ${acc.basic_id || ''}`
                      : acc.line_phone || 'Cá nhân (QR)'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Column 2: Conversation List */}
      <div className="w-80 border-r border-border/80 flex flex-col shrink-0 bg-white">
        <div className="p-3 border-b border-border/80 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm hội thoại LINE..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex gap-1">
            {FILTER_TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                    activeTab === t.key
                      ? 'bg-[#06C755] text-white'
                      : 'bg-surface-muted text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {loadingConvs ? (
            <div className="p-8 text-center text-xs text-text-muted">Đang tải hội thoại...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted">
              Chưa có cuộc trò chuyện LINE nào.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const tid = getThreadId(conv);
              const isSelected = tid === selectedThreadId;
              const unread = getUnreadCount(conv);
              const freeReply = getReplyTokenExpiry(conv);
              const isGroup = getThreadType(conv) === 'group';

              return (
                <button
                  key={conv.id || tid}
                  onClick={() => setSelectedThreadId(tid)}
                  className={`w-full p-3 flex items-start gap-3 text-left transition-colors ${
                    isSelected ? 'bg-emerald-50/80' : 'hover:bg-surface-muted/40'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isGroup
                        ? 'bg-teal-100 text-teal-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isGroup ? (
                      <Users className="w-4 h-4" />
                    ) : (
                      getThreadTitle(conv).charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-text-primary truncate">
                        {getThreadTitle(conv)}
                      </span>
                      {unread > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#06C755] text-white text-[10px] font-bold">
                          {unread}
                        </span>
                      )}
                    </div>
                    {(conv.lastMessage?.content || (conv as any).messages?.[0]?.content) && (
                      <p className="text-[11px] text-text-muted truncate mt-0.5">
                        {conv.lastMessage?.content || (conv as any).messages?.[0]?.content}
                      </p>
                    )}
                    {freeReply && (
                      <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                        <Sparkles className="w-2.5 h-2.5" />
                        Reply 0 quota
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Column 3: Message Thread & Composer */}
      <div className="flex-1 flex flex-col bg-slate-50/60">
        {!selectedThreadId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#06C755] flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Chọn một hội thoại LINE để bắt đầu nhắn tin
            </p>
            <p className="text-xs text-text-muted mt-1">
              Hỗ trợ tự động dùng Reply Token miễn phí (0 quota) khi học viên vừa nhắn đến LINE OA.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="h-15 px-5 border-b border-border/80 bg-white flex items-center justify-between shrink-0">
              <div>
                <div className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <span>
                    {currentConversation
                      ? getThreadTitle(currentConversation)
                      : selectedThreadId}
                  </span>
                  <span className="text-[11px] font-mono text-text-muted">
                    ({selectedThreadId})
                  </span>
                </div>
              </div>

              {activeReplyTokenExpiresAt && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#06C755]" />
                  Reply miễn phí (0 quota) khả dụng
                </div>
              )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {loadingMsgs ? (
                <div className="text-center py-10 text-xs text-text-muted">
                  Đang tải tin nhắn...
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-10 text-xs text-text-muted">
                  Chưa có tin nhắn nào trong hội thoại này.
                </div>
              ) : (
                messages.map((m) => {
                  const isSelf = m.is_self ?? m.isSelf ?? false;
                  const via = m.sent_via || m.sentVia;
                  return (
                    <div
                      key={m.id || m.line_msg_id || m.lineMsgId}
                      className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${
                          isSelf
                            ? 'bg-[#06C755] text-white rounded-br-sm'
                            : 'bg-white text-gray-900 border border-gray-200/80 rounded-bl-sm'
                        }`}
                      >
                        {!isSelf && (m.sender_name || m.senderName) && (
                          <div className="text-[10px] font-bold text-emerald-700 mb-0.5">
                            {m.sender_name || m.senderName}
                          </div>
                        )}
                        {m.content}
                      </div>
                      <div className="mt-1 text-[10px] text-gray-400 flex items-center gap-1.5 px-1">
                        <span>{new Date(m.timestamp).toLocaleTimeString('vi-VN')}</span>
                        {via && (
                          <span className="font-mono text-[9px] uppercase bg-gray-100 text-gray-500 px-1 rounded">
                            {via}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSend}
              className="p-3 bg-white border-t border-border/80 flex items-center gap-2 shrink-0"
            >
              <input
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder="Nhập tin nhắn LINE (Enter để gửi)..."
                className="flex-1 px-4 py-2.5 text-xs bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                isLoading={sending}
                disabled={!composerText.trim()}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                Gửi
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
