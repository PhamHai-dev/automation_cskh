import React, { useEffect, useState, useCallback, useRef } from 'react';
import { zaloApi } from '../api/zalo.api';
import type { ZaloAccount, ZaloSocketMessageEvent } from '../types/zalo.types';
import { Button } from '../../../components/ui/Button';
import { FriendAvatar } from '../components/FriendAvatar';
import { useSocket } from '../../../hooks/useSocket';
import { ReactionPicker } from '../components/ReactionPicker';
import { ReactionDisplay } from '../components/ReactionDisplay';
import { ReactionDetailPopup } from '../components/ReactionDetailPopup';
import { ReplyPreviewBar } from '../components/ReplyPreviewBar';
import { PollCreateDialog } from '../components/PollCreateDialog';
import { PollVoter } from '../components/PollVoter';
import type { QuoteRef, ReactionView, PollView } from '../types/zalo.types';
import {
  Search, Send, MessageSquare, Users, ArrowLeft, RefreshCw,
  Mail, X, Info, Hash, Inbox, Bell, Clock, Reply, BarChart3, User,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = 'chat' | 'contacts';

interface Conversation {
  id: number;
  externalThreadId: string;
  threadType: string;
  displayName: string;
  avatarUrl?: string | null;
  groupName?: string | null;
  groupAvatarUrl?: string | null;
  groupMembersCount?: number | null;
  tab?: string;
  unreadCount?: number;
  isReplied?: boolean;
  lastMessageAt: string;
  messageCount: number;
  lastMessage: {
    content: string;
    contentType: string;
    senderUid: string;
    senderName?: string | null;
    senderType?: string;
    timestamp: string;
    isSelf: boolean;
  } | null;
}

interface Message {
  id: number;
  zaloMsgId: string;
  senderUid: string;
  senderName?: string | null;
  senderType?: string;
  content: string;
  contentType: string;
  attachments?: any;
  quote?: QuoteRef | null;
  mentions?: any;
  reactions?: Record<string, string[]> | null;
  rawContent?: any; // poll data when contentType === 'poll'
  isSelf: boolean;
  isBackfill: boolean;
  isDeleted?: boolean;
  deliveredAt?: string | null;
  seenAt?: string | null;
  timestamp: string;
}

interface ConvCounts {
  total: number;
  unread: number;
  unreplied: number;
  userCount: number;
  groupCount: number;
}

type FilterTab = 'all' | 'unread' | 'unreplied' | 'user' | 'group';

// ─── Constants ──────────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string; icon: React.FC<any> }[] = [
  { key: 'all', label: 'Tất cả', icon: Inbox },
  { key: 'unread', label: 'Chưa đọc', icon: Bell },
  { key: 'unreplied', label: 'Chưa rep', icon: Mail },
  { key: 'user', label: 'Cá nhân', icon: Users },
  { key: 'group', label: 'Nhóm', icon: Hash },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export const ZaloChatPage: React.FC = () => {
  // ─── State ──────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [_allAccountIds, setAllAccountIds] = useState<number[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [convCounts, setConvCounts] = useState<ConvCounts>({ total: 0, unread: 0, unreplied: 0, userCount: 0, groupCount: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Active chat
  const [activeThread, setActiveThread] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Reply-quote
  const [replyQuote, setReplyQuote] = useState<QuoteRef | null>(null);

  // Reactions
  const [_hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [reactionDetail, setReactionDetail] = useState<{ open: boolean; reactions: ReactionView[] }>({ open: false, reactions: [] });

  // Polls
  const [showPollCreate, setShowPollCreate] = useState(false);

  // Contact panel
  const [showContactPanel, setShowContactPanel] = useState(true);

  // View mode: chat list or contacts list
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { on, off } = useSocket();

  // ─── Fetch accounts ─────────────────────────────────────────────────────
  useEffect(() => {
    zaloApi.listAccounts().then((accs) => {
      setAccounts(accs);
      setAllAccountIds(accs.map((a) => a.id));
      if (accs.length > 0) setSelectedAccountId(accs[0].id);
    }).catch(() => {});
  }, []);

  // ─── Fetch conversations ────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoadingConvs(true);
    try {
      const threadType = activeTab === 'user' || activeTab === 'group' ? activeTab : 'all';
      const res = await zaloApi.getConversations(selectedAccountId, {
        limit: 100,
        search: searchInput,
        threadType,
      });
      setConversations(res.items || []);
    } catch {
      setConversations([]);
    } finally {
      setLoadingConvs(false);
    }
  }, [selectedAccountId, searchInput, activeTab]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ─── Fetch counts ──────────────────────────────────────────────────────
  const fetchCounts = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await zaloApi.getConversationCounts(selectedAccountId);
      setConvCounts(res.data || { total: 0, unread: 0, unreplied: 0, userCount: 0, groupCount: 0 });
    } catch { /* non-critical */ }
  }, [selectedAccountId]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // ─── Filtered conversations by tab ─────────────────────────────────────
  const filteredConversations = conversations.filter((c) => {
    if (activeTab === 'unread') return (c.unreadCount || 0) > 0;
    if (activeTab === 'unreplied') return c.isReplied === false;
    return true;
  });

  // ─── Contacts (Danh bạ) ───────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoadingContacts(true);
    try {
      const res = await zaloApi.getFriendsDb(selectedAccountId, {
        kind: 'all',
        page: 1,
        limit: 200,
        search: contactSearch,
        sortBy: 'recent',
      });
      setContacts(res.friends || []);
    } catch {
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [selectedAccountId, contactSearch]);

  useEffect(() => {
    if (viewMode === 'contacts') fetchContacts();
  }, [viewMode, fetchContacts]);

  const filteredContacts = contacts;

  const handleContactClick = async (f: any) => {
    if (!selectedAccountId) return;
    const threadId = f.zalo_uid_in_nick;
    // Try to find existing conversation first
    const existing = conversations.find((c) => c.externalThreadId === threadId);
    if (existing) {
      setViewMode('chat');
      handleSelectConv(existing);
      return;
    }
    // Open chat with temp conversation — auto-created on first message
    const tempConv: Conversation = {
      id: -Date.now(),
      externalThreadId: threadId,
      threadType: 'user',
      displayName: f.alias_in_nick || f.zalo_display_name || threadId,
      avatarUrl: f.zalo_avatar_url || null,
      lastMessageAt: new Date().toISOString(),
      messageCount: 0,
      lastMessage: null,
    };
    setViewMode('chat');
    setActiveThread(tempConv);
    setMobileShowChat(true);
  };

  // ─── Fetch messages ────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!selectedAccountId || !activeThread) return;
    setLoadingMsgs(true);
    try {
      const res = await zaloApi.getMessages(selectedAccountId, activeThread.externalThreadId, {
        limit: 100,
      });
      setMessages(res.items || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, [selectedAccountId, activeThread]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // ─── Auto-scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Live messages via socket ──────────────────────────────────────────
  const handleLiveMessage = useCallback((evt: ZaloSocketMessageEvent) => {
    if (!activeThread || evt.accountId !== selectedAccountId) return;
    if (evt.threadId === activeThread.externalThreadId) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          zaloMsgId: `live_${Date.now()}`,
          senderUid: evt.senderUid,
          content: evt.content,
          contentType: evt.contentType || 'text',
          isSelf: false,
          isBackfill: false,
          timestamp: evt.timestamp,
        },
      ]);
    }
    fetchConversations();
  }, [activeThread, selectedAccountId, fetchConversations]);

  useEffect(() => {
    on('zalo:message', handleLiveMessage);
    return () => { off('zalo:message', handleLiveMessage); };
  }, [on, off, handleLiveMessage]);

  // ─── Send message (with optional reply-quote) ─────────────────────────
  const handleSend = async () => {
    if (!newMsg.trim() || !activeThread || !selectedAccountId) return;
    setSending(true);
    try {
      const sent = await zaloApi.sendMessage(selectedAccountId, activeThread.externalThreadId, newMsg.trim());
      setMessages((prev) => [...prev, {
        id: sent.id || Date.now(),
        zaloMsgId: sent.zaloMsgId || `local_${Date.now()}`,
        senderUid: 'self',
        content: newMsg.trim(),
        contentType: 'text',
        quote: replyQuote,
        isSelf: true,
        isBackfill: false,
        timestamp: sent.timestamp || new Date().toISOString(),
      }]);
      setNewMsg('');
      setReplyQuote(null);
      fetchConversations();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Gửi tin nhắn thất bại');
    } finally {
      setSending(false);
    }
  };

  // ─── Reply to message ────────────────────────────────────────────────
  const handleReply = (m: Message) => {
    setReplyQuote({
      msgId: m.zaloMsgId,
      senderName: m.senderName || undefined,
      content: m.content,
      contentType: m.contentType,
    });
  };

  // ─── Reaction toggle ─────────────────────────────────────────────────
  const handleReaction = async (m: Message, emoji: string) => {
    if (!selectedAccountId) return;
    try {
      const res = await zaloApi.toggleReaction(selectedAccountId, m.zaloMsgId, emoji);
      setMessages((prev) => prev.map((msg) =>
        msg.zaloMsgId === m.zaloMsgId ? { ...msg, reactions: res.reactions } : msg,
      ));
    } catch {
      /* ignore */
    }
  };

  // ─── Parse reactions into ReactionView[] ─────────────────────────────
  const getReactionViews = (reactions: Record<string, string[]> | null | undefined): ReactionView[] => {
    if (!reactions) return [];
    const selfUid = 'self';
    return Object.entries(reactions)
      .filter(([, uids]) => uids.length > 0)
      .map(([emoji, uids]) => ({
        emoji,
        count: uids.length,
        reactedBySelf: uids.includes(selfUid),
      }));
  };

  // ─── Poll create ─────────────────────────────────────────────────────
  const handleCreatePoll = async (data: { question: string; options: string[]; allowMulti?: boolean; anonymous?: boolean; expireMs?: number }) => {
    if (!selectedAccountId || !activeThread) return;
    try {
      await zaloApi.createPoll(selectedAccountId, activeThread.externalThreadId, data);
      fetchMessages();
    } catch { /* ignore */ }
  };

  // ─── Poll vote ───────────────────────────────────────────────────────
  const handleVotePoll = async (pollId: string, optionIds: number[]) => {
    if (!selectedAccountId || !activeThread) return;
    try {
      await zaloApi.votePoll(selectedAccountId, activeThread.externalThreadId, pollId, optionIds);
      fetchMessages();
    } catch { /* ignore */ }
  };

  // ─── Select conversation + mark read ───────────────────────────────────
  const handleSelectConv = async (c: Conversation) => {
    setActiveThread(c);
    setMobileShowChat(true);
    // mark read
    if ((c.unreadCount || 0) > 0 && selectedAccountId) {
      zaloApi.markConversationRead(selectedAccountId, c.externalThreadId).catch(() => {});
      setConversations((prev) => prev.map((x) => x.id === c.id ? { ...x, unreadCount: 0 } : x));
      fetchCounts();
    }
  };

  // ─── Delete conversation ───────────────────────────────────────────────
  const handleDeleteConv = async (c: Conversation) => {
    if (!selectedAccountId) return;
    if (!confirm(`Xóa đoạn chat "${c.displayName || c.groupName || c.externalThreadId}"?`)) return;
    try {
      await zaloApi.deleteConversation(selectedAccountId, c.externalThreadId);
      if (activeThread?.id === c.id) { setActiveThread(null); setMobileShowChat(false); }
      fetchConversations();
    } catch { /* ignore */ }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────
  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatConvTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return formatTime(ts);
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return d.toLocaleDateString('vi-VN', { weekday: 'short' });
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '…' : s;

  const tabCount = (tab: FilterTab) => {
    if (tab === 'all') return convCounts.total;
    if (tab === 'unread') return convCounts.unread;
    if (tab === 'unreplied') return convCounts.unreplied;
    if (tab === 'user') return convCounts.userCount;
    if (tab === 'group') return convCounts.groupCount;
    return 0;
  };

  const currentAccount = accounts.find((a) => a.id === selectedAccountId);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
      {/* ═══════ COL 1: Account Sidebar (80px) ═══════ */}
      <div className="w-[80px] min-w-[80px] bg-gray-900 flex flex-col items-center py-3 gap-2 shrink-0 hidden md:flex">
        {/* Current account */}
        <div className="relative mb-2">
          <FriendAvatar
            url={(currentAccount as any)?.avatar_url || null}
            name={currentAccount?.display_name || `#${selectedAccountId}`}
            size={44}
            rounded="rounded-2xl"
            className="ring-2 ring-blue-500"
          />
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${
            (currentAccount?.liveStatus || currentAccount?.status) === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-500'
          }`} />
        </div>

        {/* Other accounts */}
        <div className="w-10 h-px bg-gray-700 my-1" />
        <div className="flex-1 overflow-y-auto flex flex-col items-center gap-1.5 py-1">
          {accounts.filter((a) => a.id !== selectedAccountId).map((a) => (
            <button
              key={a.id}
              onClick={() => { setSelectedAccountId(a.id); setActiveThread(null); setMobileShowChat(false); }}
              className="relative group"
              title={a.display_name || `Nick #${a.id}`}
            >
              <FriendAvatar
                url={(a as any).avatar_url || null}
                name={a.display_name || `#${a.id}`}
                size={36}
                rounded="rounded-xl"
                className="opacity-60 group-hover:opacity-100 transition-opacity"
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                (a.liveStatus || a.status) === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-600'
              }`} />
            </button>
          ))}
        </div>

        {/* Bottom badge */}
        <div className="mt-auto text-[10px] text-gray-500 text-center">
          {accounts.length} nick
        </div>
      </div>

      {/* ═══════ COL 2: Filter Tabs + Conversation List (380px) ═══════ */}
      <div className={`w-full md:w-[380px] min-w-[320px] bg-white border-r border-gray-200 flex flex-col shrink-0 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          {/* View mode toggle */}
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setViewMode('chat')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'chat'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Hội thoại
            </button>
            <button
              onClick={() => setViewMode('contacts')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'contacts'
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Danh bạ
            </button>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-900">
              {viewMode === 'chat' ? 'Đoạn chat' : 'Danh bạ Zalo'}
            </h2>
            <div className="flex items-center gap-1">
              {/* Mobile account selector */}
              <select
                value={selectedAccountId || ''}
                onChange={(e) => { setSelectedAccountId(parseInt(e.target.value) || 0); setActiveThread(null); }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 md:hidden bg-gray-50"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name || `Nick #${a.id}`} {(a.liveStatus || a.status) === 'ACTIVE' ? '🟢' : '⚪'}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost" size="sm"
                onClick={() => { viewMode === 'chat' ? (fetchConversations(), fetchCounts()) : fetchContacts(); }}
                title="Làm mới"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Filter tabs — only show in chat view */}
          {viewMode === 'chat' && (
            <div className="flex gap-1 mb-3">
              {FILTER_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    activeTab === key
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                  {tabCount(key) > 0 && (
                    <span className={`px-1 py-0 rounded-full text-[9px] font-bold ${
                      activeTab === key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tabCount(key)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder={viewMode === 'chat' ? 'Tìm đoạn chat...' : 'Tìm tên, SĐT...'}
              value={viewMode === 'chat' ? searchInput : contactSearch}
              onChange={(e) => viewMode === 'chat' ? setSearchInput(e.target.value) : setContactSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* ═══ Chat list or Contact list ═══ */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'chat' ? (
            /* ─── Conversation list ─── */
            loadingConvs ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Chưa có đoạn chat nào</p>
                <p className="text-xs text-gray-400 mt-1">Nhắn tin từ Contacts hoặc Groups</p>
              </div>
            ) : (
              filteredConversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectConv(c)}
                  onContextMenu={(e) => { e.preventDefault(); handleDeleteConv(c); }}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-blue-50/40 transition-colors relative ${
                    activeThread?.id === c.id ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : 'border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <FriendAvatar
                        url={c.threadType === 'group' ? c.groupAvatarUrl : (c.avatarUrl || null)}
                        name={c.displayName || c.groupName || c.externalThreadId}
                        size={44}
                        rounded={c.threadType === 'group' ? 'rounded-xl' : 'rounded-full'}
                      />
                      {c.threadType !== 'group' && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-gray-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${(c.unreadCount || 0) > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {c.displayName || c.groupName || c.externalThreadId}
                        </span>
                        <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                          {c.lastMessageAt ? formatConvTime(c.lastMessageAt) : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-xs truncate ${(c.unreadCount || 0) > 0 ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {c.lastMessage
                            ? `${c.lastMessage.isSelf ? 'Bạn: ' : ''}${truncate(c.lastMessage.content, 45)}`
                            : `${c.messageCount} tin nhắn`}
                        </p>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {c.threadType === 'group' && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">
                              {c.groupMembersCount || ''} TN
                            </span>
                          )}
                          {!c.isReplied && c.threadType === 'user' && (c.unreadCount || 0) === 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Chưa rep" />
                          )}
                          {(c.unreadCount || 0) > 0 && (
                            <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )
          ) : (
            /* ─── Contact list ─── */
            loadingContacts ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="py-12 text-center">
                <User className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Không có danh bạ nào</p>
              </div>
            ) : (
              filteredContacts.map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => handleContactClick(f)}
                  className="w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <FriendAvatar
                        url={f.zalo_avatar_url || null}
                        name={f.alias_in_nick || f.zalo_display_name || f.zalo_uid_in_nick}
                        size={40}
                        rounded="rounded-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {f.alias_in_nick || f.zalo_display_name || f.zalo_uid_in_nick}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        UID: {f.zalo_uid_in_nick}
                        {f.friendship_status === 'friend' ? ' · Bạn bè' : ''}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <MessageSquare className="w-4 h-4 text-blue-400" />
                    </div>
                  </div>
                </button>
              ))
            )
          )}
        </div>
      </div>

      {/* ═══════ COL 3: Message Thread ═══════ */}
      <div className={`flex-1 flex flex-col min-w-0 bg-gray-50 ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
        {!activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-400">Chọn đoạn chat</h3>
              <p className="text-sm text-gray-400 mt-1">Chọn một đoạn chat bên trái</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-3 shrink-0">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setMobileShowChat(false)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>

              <FriendAvatar
                url={activeThread.threadType === 'group' ? activeThread.groupAvatarUrl : (activeThread.avatarUrl || null)}
                name={activeThread.displayName || activeThread.groupName || '?'}
                size={40}
                rounded={activeThread.threadType === 'group' ? 'rounded-xl' : 'rounded-full'}
              />

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-gray-900 truncate">
                  {activeThread.displayName || activeThread.groupName || activeThread.externalThreadId}
                </h3>
                <p className="text-[11px] text-gray-400">
                  {activeThread.threadType === 'group' ? 'Nhóm' : 'Cá nhân'}
                  {activeThread.groupMembersCount ? ` · ${activeThread.groupMembersCount} thành viên` : ''}
                  {' · '}{activeThread.messageCount} tin nhắn
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setShowContactPanel(!showContactPanel)} title="Thông tin liên hệ">
                  <Info className={`w-4 h-4 ${showContactPanel ? 'text-blue-500' : 'text-gray-400'}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { fetchMessages(); }} title="Tải lại tin nhắn">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {loadingMsgs ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-gray-400">Chưa có tin nhắn nào</p>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => (
                    <div key={m.id || i} className={`flex ${m.isSelf ? 'justify-end' : 'justify-start'} group/msg`}>
                      <div className="max-w-[70%] relative">
                        {/* Action buttons on hover */}
                        {!m.isDeleted && (
                          <div className={`absolute -top-3 z-30 flex items-center gap-0.5 bg-white rounded-full shadow-md border border-gray-100 px-1 py-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity ${
                            m.isSelf ? 'right-0' : 'left-0'
                          }`}>
                            <button
                              onClick={() => handleReply(m)}
                              className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                              title="Trả lời"
                            >
                              <Reply className="w-3.5 h-3.5" />
                            </button>
                            <ReactionPicker
                              isSelf={m.isSelf}
                              onPick={(emoji) => handleReaction(m, emoji)}
                              onClose={() => setHoveredMsgId(null)}
                            />
                          </div>
                        )}

                        <div className={`rounded-2xl px-3.5 py-2 shadow-sm ${
                          m.isSelf
                            ? 'bg-blue-500 text-white rounded-br-sm'
                            : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                        }`}>
                          {/* Reply-quote preview */}
                          {m.quote && (
                            <div className={`text-[11px] mb-1.5 pl-2 border-l-2 ${
                              m.isSelf ? 'border-blue-300 text-blue-100' : 'border-blue-400 text-gray-500'
                            }`}>
                              <span className="font-semibold">{m.quote.senderName || 'Unknown'}</span>
                              <p className="truncate opacity-80">{m.quote.content || '...'}</p>
                            </div>
                          )}

                          {/* Sender name in groups */}
                          {!m.isSelf && activeThread.threadType === 'group' && (
                            <p className="text-[10px] font-semibold text-blue-500 mb-0.5">{m.senderName || m.senderUid}</p>
                          )}

                          {/* Poll message */}
                          {m.contentType === 'poll' && m.rawContent ? (
                            <PollVoter
                              poll={m.rawContent as PollView}
                              isSelf={m.isSelf}
                              onVote={handleVotePoll}
                            />
                          ) : m.isDeleted ? (
                            <p className="text-sm italic opacity-60">Tin nhắn đã bị thu hồi</p>
                          ) : (
                            /* Normal text message with mention tags */
                            <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                          )}

                          {/* Timestamp + read receipts */}
                          <div className="flex items-center gap-1 mt-1">
                            <p className={`text-[10px] ${m.isSelf ? 'text-blue-200' : 'text-gray-400'}`}>
                              {formatTime(m.timestamp)}
                              {m.isBackfill && ' · sync'}
                            </p>
                            {m.isSelf && m.seenAt && (
                              <span className="text-[10px] text-blue-200">Đã xem</span>
                            )}
                            {m.isSelf && !m.seenAt && m.deliveredAt && (
                              <span className="text-[10px] text-blue-200">Đã nhận</span>
                            )}
                          </div>
                        </div>

                        {/* Reaction display below bubble */}
                        <ReactionDisplay
                          reactions={getReactionViews(m.reactions)}
                          isSelf={m.isSelf}
                          onOpenDetail={() => setReactionDetail({
                            open: true,
                            reactions: getReactionViews(m.reactions),
                          })}
                        />
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Composer */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 shrink-0">
              {/* Reply preview bar */}
              {replyQuote && (
                <ReplyPreviewBar
                  quote={replyQuote}
                  onCancel={() => setReplyQuote(null)}
                />
              )}

              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
                {/* Poll button */}
                <button
                  type="button"
                  onClick={() => setShowPollCreate(true)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                  title="Tạo bình chọn"
                >
                  <BarChart3 className="w-4.5 h-4.5" />
                </button>

                <input
                  type="text"
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  placeholder={replyQuote ? `Trả lời ${replyQuote.senderName || '...'}...` : 'Nhập tin nhắn...'}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={sending}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={sending || !newMsg.trim()}
                  className="rounded-full px-4 py-2.5"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ═══════ COL 4: Contact / Info Panel (350px, toggle) ═══════ */}
      {showContactPanel && activeThread && (
        <div className="w-[350px] min-w-[300px] bg-white border-l border-gray-200 flex-col shrink-0 hidden lg:flex">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold text-gray-900">Thông tin hội thoại</h3>
            <button onClick={() => setShowContactPanel(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Contact info */}
          <div className="flex-1 overflow-y-auto">
            {/* Avatar + name */}
            <div className="px-4 py-5 text-center border-b border-gray-100">
              <FriendAvatar
                url={activeThread.threadType === 'group' ? activeThread.groupAvatarUrl : null}
                name={activeThread.groupName || activeThread.displayName || '?'}
                size={72}
                rounded={activeThread.threadType === 'group' ? 'rounded-2xl' : 'rounded-full'}
                className="mx-auto"
              />
              <h4 className="text-sm font-bold text-gray-900 mt-3 truncate">
                {activeThread.groupName || activeThread.displayName}
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeThread.threadType === 'group' ? 'Nhóm Zalo' : 'Liên hệ Zalo'}
              </p>
            </div>

            {/* Details */}
            <div className="px-4 py-3 space-y-3">
              {activeThread.threadType === 'group' && (
                <div className="flex items-center gap-3 py-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs font-medium text-gray-900">{activeThread.groupMembersCount || '?'} thành viên</p>
                    <p className="text-[10px] text-gray-400">Số lượng thành viên nhóm</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 py-2">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-900">{activeThread.messageCount} tin nhắn</p>
                  <p className="text-[10px] text-gray-400">Tổng số tin nhắn đã lưu</p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-900">
                    {activeThread.lastMessageAt ? new Date(activeThread.lastMessageAt).toLocaleString('vi-VN') : 'N/A'}
                  </p>
                  <p className="text-[10px] text-gray-400">Hoạt động gần nhất</p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-2">
                <Hash className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs font-medium text-gray-900 font-mono truncate">{activeThread.externalThreadId}</p>
                  <p className="text-[10px] text-gray-400">Thread ID</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-gray-100 space-y-2">
              <button
                onClick={() => { fetchMessages(); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-400" /> Tải lại tin nhắn
              </button>
              <button
                onClick={() => handleDeleteConv(activeThread)}
                className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Xóa đoạn chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <PollCreateDialog
        open={showPollCreate}
        onClose={() => setShowPollCreate(false)}
        onSubmit={handleCreatePoll}
      />

      <ReactionDetailPopup
        open={reactionDetail.open}
        onClose={() => setReactionDetail({ open: false, reactions: [] })}
        reactions={reactionDetail.reactions}
        userMap={{}}
        totalUsers={[]}
      />

    </div>
  );
};
