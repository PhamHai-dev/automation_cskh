import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { zaloApi } from '../api/zalo.api';
import type { ZaloAccount } from '../types/zalo.types';
import { Button } from '../../../components/ui/Button';
import { FriendAvatar } from '../components/FriendAvatar';
import {
  RefreshCw, MessageSquare, Search, ChevronLeft, ChevronRight,
  Users,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface FriendRow {
  id: number;
  zalo_account_id: number;
  zalo_uid_in_nick: string;
  contact_id?: number | null;
  zalo_global_id?: string | null;
  zalo_display_name?: string | null;
  zalo_avatar_url?: string | null;
  zalo_username?: string | null;
  friendship_status: string;
  relationship_kind: string;
  alias_in_nick: string | null;
  has_conversation: boolean;
  phone_from_sdk: string | null;
  became_friend_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  all: 'Tất cả',
  friend: 'Bạn bè',
  stranger: 'Không rõ',
  sent: 'Đã gửi KNB',
  received: 'Nhận lời mời',
  blocked: 'Bị chặn',
  none: 'Chưa rõ',
};

const KIND_COLORS: Record<string, string> = {
  friend: 'bg-emerald-100 text-emerald-700',
  stranger: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  none: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<string, string> = {
  none: 'Bình thường',
  friend: 'Bạn bè',
  pending_sent: 'Đã gửi KNB',
  pending_received: 'Nhận lời mời',
  accepted: 'Đã chấp nhận',
  rejected: 'Bị từ chối',
  removed: 'Đã xóa',
};

// ─── Main Component ─────────────────────────────────────────────────────────

export const ZaloContactsPage: React.FC = () => {
  // ── State ───────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sendTarget, setSendTarget] = useState<FriendRow | null>(null);
  const [nickSearch, setNickSearch] = useState('');
  const [perNickCounts, setPerNickCounts] = useState<Record<number, number>>({});

  // ── Load accounts ───────────────────────────────────────────────────────
  useEffect(() => {
    zaloApi.listAccounts().then((accs) => {
      setAccounts(accs);
      if (accs.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accs[0].id);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced search ────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Fetch friends for selected nick ─────────────────────────────────────
  const fetchFriends = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const res = await zaloApi.getFriendsDb(selectedAccountId, {
        kind: kindFilter,
        page,
        limit: 50,
        search,
        sortBy: 'recent',
      });
      setFriends(res.friends || []);
      setCounts(res.counts || {});
      setTotal(res.total || 0);
      setPages(res.totalPages || 1);

      // Track per-nick total for sidebar display
      const totalForNick = Object.values(res.counts || {}).reduce((a: number, b: any) => a + (b || 0), 0);
      setPerNickCounts((prev) => ({ ...prev, [selectedAccountId]: totalForNick }));
    } catch {
      setFriends([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, kindFilter, page, search]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // ── Sync friends ────────────────────────────────────────────────────────
  const handleSync = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      await zaloApi.syncFriends(selectedAccountId);
      fetchFriends();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const currentAccount = accounts.find((a) => a.id === selectedAccountId);
  const isActive = currentAccount && (currentAccount.liveStatus || currentAccount.status) === 'ACTIVE';
  const totalFriendsAll = Object.values(perNickCounts).reduce((a, b) => a + b, 0);

  const filteredAccounts = useMemo(() => {
    const q = nickSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a => {
      const hay = `${a.display_name || ''} ${a.zalo_phone || ''} ${a.zalo_uid || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [accounts, nickSearch]);

  const onlineCount = useMemo(
    () => accounts.filter(a => (a.liveStatus || a.status) === 'ACTIVE').length,
    [accounts],
  );

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50 overflow-hidden">
      {/* ═══════ COL 1: NickSidebar (260px) ═══════ */}
      <div className="w-[260px] min-w-[220px] bg-white border-r border-gray-200 flex flex-col shrink-0 hidden md:flex">
        {/* Header */}
        <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Nick Zalo của bạn
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              {accounts.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm nick..."
              value={nickSearch}
              onChange={(e) => setNickSearch(e.target.value)}
              className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-blue-400 transition-all"
            />
          </div>
        </div>

        {/* All nicks row */}
        <button
          onClick={() => {
            // "all" is not supported by single-nick API — select first nick
            if (accounts.length > 0) {
              setSelectedAccountId(accounts[0].id);
              setPage(1);
            }
          }}
          className="mx-2 mt-2 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
            ∑
          </div>
          <div className="text-left min-w-0">
            <div className="text-xs font-semibold text-gray-700 group-hover:text-blue-600 truncate">Tất cả nick</div>
            <div className="text-[10px] text-gray-400">Tổng hợp {accounts.length} nick</div>
          </div>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600">
            {totalFriendsAll || '—'}
          </span>
        </button>

        {/* Nick list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {filteredAccounts.map((a) => (
            <button
              key={a.id}
              onClick={() => { setSelectedAccountId(a.id); setPage(1); }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all text-left ${
                selectedAccountId === a.id
                  ? 'bg-blue-50 border-blue-400 shadow-sm'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <div className="relative shrink-0">
                <FriendAvatar
                  name={a.display_name || `#${a.id}`}
                  size={32}
                  className={selectedAccountId === a.id ? '' : 'opacity-70'}
                />
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  (a.liveStatus || a.status) === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-400'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 truncate">
                  {a.display_name || 'Nick chưa đặt tên'}
                </div>
                <div className="text-[10px] text-gray-400 truncate">
                  {a.zalo_phone || a.zalo_uid || '—'}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                selectedAccountId === a.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {perNickCounts[a.id] ?? '—'}
              </span>
            </button>
          ))}
          {filteredAccounts.length === 0 && (
            <div className="text-center text-[11px] text-gray-400 py-6">
              Không tìm thấy nick "{nickSearch}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-gray-100 flex items-center gap-1.5 text-[10px] text-gray-400">
          <div className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          <span>{onlineCount}/{accounts.length} online · Auto-sync</span>
        </div>
      </div>

      {/* ═══════ COL 2: Main Content (flex) ═══════ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h1 className="text-base font-bold text-gray-900">Danh bạ Zalo</h1>
            </div>
            {currentAccount && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold">
                <FriendAvatar name={currentAccount.display_name || ''} size={16} rounded="rounded" />
                <span className="truncate max-w-[120px]">{currentAccount.display_name || `Nick #${currentAccount.id}`}</span>
                <span className="text-blue-400">·</span>
                <span>{total} bạn</span>
              </span>
            )}

            <div className="flex-1" />

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm tên, SĐT, nick Zalo..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-blue-400 transition-all"
              />
            </div>
            <Button
              onClick={handleSync}
              variant="outline"
              size="sm"
              isLoading={syncing}
              disabled={!isActive}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              title="Auto-sync mỗi 15 phút. Click để refresh ngay lập tức."
            >
              Làm mới ngay
            </Button>
          </div>
        </div>

        {/* ── Stats Bar ────────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-4 text-[12px] text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Đã KB: <strong className="text-gray-800">{counts.friend ?? 0}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Đang chờ: <strong className="text-gray-800">{counts.pending_friend ?? 0}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Đang nhắn lạ: <strong className="text-gray-800">{counts.chatting_stranger ?? 0}</strong>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Đã ngắt: <strong className="text-gray-800">{counts.ghost ?? 0}</strong>
          </span>
        </div>

        {/* ── Filter Tabs ──────────────────────────────────────────────── */}
        <div className="px-5 py-2 bg-white border-b border-gray-100 flex items-center gap-1.5">
          {['all', 'friend', 'stranger', 'none'].map((k) => (
            <button
              key={k}
              onClick={() => { setKindFilter(k); setPage(1); }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                kindFilter === k
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              {KIND_LABELS[k] || k}
              {k !== 'all' && counts[k] ? ` (${counts[k]})` : ''}
            </button>
          ))}
        </div>

        {/* ── Friends Table ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Đang tải...
              </div>
            </div>
          ) : friends.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Users className="w-10 h-10 mb-2 opacity-40" />
              <span className="text-sm">Không có bạn bè nào.</span>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5">Bạn bè</th>
                  <th className="text-left px-3 py-2.5">Loại</th>
                  <th className="text-left px-3 py-2.5">Trạng thái</th>
                  <th className="text-left px-3 py-2.5 hidden lg:table-cell">SĐT</th>
                  <th className="text-left px-3 py-2.5 hidden xl:table-cell">Kết bạn từ</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {friends.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <FriendAvatar
                          url={f.zalo_avatar_url}
                          name={f.alias_in_nick || f.zalo_display_name || f.zalo_uid_in_nick}
                          size={36}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {f.alias_in_nick || f.zalo_display_name || f.zalo_uid_in_nick}
                          </div>
                          <div className="text-[11px] text-gray-400 truncate">
                            UID: {f.zalo_uid_in_nick}
                            {f.zalo_username ? ` · @${f.zalo_username}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${KIND_COLORS[f.relationship_kind] || KIND_COLORS.none}`}>
                        {KIND_LABELS[f.relationship_kind] || f.relationship_kind}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-gray-600">
                        {STATUS_LABELS[f.friendship_status] || f.friendship_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <span className="text-xs text-gray-500">{f.phone_from_sdk || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 hidden xl:table-cell">
                      {f.became_friend_at ? (
                        <span className="text-xs text-gray-500">
                          {new Date(f.became_friend_at).toLocaleDateString('vi-VN')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setSendTarget(f); }}
                        title="Nhắn tin"
                      >
                        <MessageSquare className="w-4 h-4 text-blue-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ───────────────────────────────────────────────── */}
        {pages > 1 && (
          <div className="px-5 py-2.5 bg-white border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Trang {page}/{pages} — {total} liên hệ</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-3 h-3" /> Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Sau <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ Send Message Dialog ═══════ */}
      {sendTarget && (
        <SendMsgDialog
          accountId={selectedAccountId}
          threadId={sendTarget.zalo_uid_in_nick}
          threadName={sendTarget.alias_in_nick || sendTarget.zalo_uid_in_nick}
          onClose={() => setSendTarget(null)}
        />
      )}
    </div>
  );
};

// ─── SendMsgDialog (inline sub-component) ───────────────────────────────────

const SendMsgDialog: React.FC<{
  accountId: number;
  threadId: string;
  threadName: string;
  onClose: () => void;
}> = ({ accountId, threadId, threadName, onClose }) => {
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<'ok' | 'err' | null>(null);

  const handleSend = async () => {
    if (!msg.trim()) return;
    setSending(true);
    try {
      await zaloApi.sendMessage(accountId, threadId, msg.trim());
      setResult('ok');
      setTimeout(onClose, 1500);
    } catch {
      setResult('err');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Gửi tin nhắn đến {threadName}</h3>
          <p className="text-[11px] text-gray-500 mt-1">UID: {threadId}</p>
        </div>
        <div className="p-5">
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Nhập nội dung tin nhắn..."
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {result === 'ok' && <p className="text-emerald-600 text-xs mt-2">✅ Gửi thành công!</p>}
          {result === 'err' && <p className="text-red-600 text-xs mt-2">❌ Gửi thất bại.</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button variant="primary" onClick={handleSend} disabled={sending || !msg.trim()}>
            {sending ? 'Đang gửi...' : 'Gửi tin nhắn'}
          </Button>
        </div>
      </div>
    </div>
  );
};
