import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import type { ZaloAccount } from '../../zalo/types/zalo.types';
import type { LineAccount, LineFriend } from '../../line/types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  Smartphone,
  Bot,
  RefreshCw,
  Search,
  MessageSquare,
  UserPlus,
  Phone,
  Send,
  Inbox,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type ContactsChannelTab = 'ZALO' | 'LINE';

interface ZaloFriendRow {
  id: number;
  zalo_account_id: number;
  zalo_uid_in_nick: string;
  zalo_display_name?: string | null;
  zalo_avatar_url?: string | null;
  friendship_status: string;
  relationship_kind: string;
  alias_in_nick: string | null;
  phone_from_sdk: string | null;
}

const ZALO_KIND_LABELS: Record<string, string> = {
  all: 'Tất cả liên hệ',
  friend: 'Bạn bè',
  stranger: 'Người lạ',
  sent: 'Đã gửi lời mời',
  received: 'Chờ xác nhận',
};

export const OmnichannelContactsPage: React.FC<{ initialChannel?: ContactsChannelTab }> = ({
  initialChannel,
}) => {
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const resolvedInitial = useMemo<ContactsChannelTab>(() => {
    if (initialChannel) return initialChannel;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    return ch === 'LINE' ? 'LINE' : 'ZALO';
  }, [initialChannel, searchParams]);

  const [channel, setChannel] = useState<ContactsChannelTab>(resolvedInitial);

  // ── Zalo Contacts State ──────────────────────────────────────────────────
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [selectedZaloId, setSelectedZaloId] = useState<number>(0);
  const [zaloFriends, setZaloFriends] = useState<ZaloFriendRow[]>([]);
  const [zaloCounts, setZaloCounts] = useState<Record<string, number>>({});
  const [zaloTotal, setZaloTotal] = useState(0);
  const [zaloLoading, setZaloLoading] = useState(false);
  const [zaloSyncing, setZaloSyncing] = useState(false);
  const [zaloSearchInput, setZaloSearchInput] = useState('');
  const [zaloSearch, setZaloSearch] = useState('');
  const [zaloKindFilter, setZaloKindFilter] = useState('all');
  const [zaloPage, setZaloPage] = useState(1);
  const [zaloPages, setZaloPages] = useState(1);

  // ── LINE Contacts State ──────────────────────────────────────────────────
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<number>(0);
  const [lineFriends, setLineFriends] = useState<LineFriend[]>([]);
  const [lineTotal, setLineTotal] = useState(0);
  const [lineLoading, setLineLoading] = useState(false);
  const [lineSyncing, setLineSyncing] = useState(false);
  const [lineSearchInput, setLineSearchInput] = useState('');
  const [lineSearch, setLineSearch] = useState('');

  // Quick 1-1 Send Message Modal (Unified for Zalo & LINE)
  const [sendTarget, setSendTarget] = useState<{
    platform: 'ZALO' | 'LINE';
    accountId: number;
    targetUid: string;
    displayName: string;
  } | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // LINE Phone Lookup Modal
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupPhoneInput, setLookupPhoneInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    mid?: string;
    displayName?: string;
    avatarUrl?: string;
  } | null>(null);
  const [addingFriend, setAddingFriend] = useState(false);

  // Load Accounts on mount
  useEffect(() => {
    zaloApi
      .listAccounts()
      .then((accs) => {
        const list = Array.isArray(accs) ? accs : [];
        setZaloAccounts(list);
        if (list.length > 0 && !selectedZaloId) {
          setSelectedZaloId(list[0].id);
        }
      })
      .catch(() => {});

    lineApi
      .listAccounts()
      .then((accs) => {
        const list = Array.isArray(accs) ? accs : [];
        setLineAccounts(list);
        if (list.length > 0 && !selectedLineId) {
          setSelectedLineId(list[0].id);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search inputs
  useEffect(() => {
    const t = setTimeout(() => {
      setZaloSearch(zaloSearchInput);
      setZaloPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [zaloSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => setLineSearch(lineSearchInput), 300);
    return () => clearTimeout(t);
  }, [lineSearchInput]);

  // Fetch Zalo Friends
  const fetchZaloFriends = useCallback(async () => {
    if (!selectedZaloId) return;
    setZaloLoading(true);
    try {
      const res = await zaloApi.getFriendsDb(selectedZaloId, {
        kind: zaloKindFilter,
        page: zaloPage,
        limit: 50,
        search: zaloSearch || undefined,
        sortBy: 'recent',
      });
      setZaloFriends(res.friends || res.data?.friends || []);
      setZaloCounts(res.counts || res.data?.counts || {});
      setZaloTotal(res.total || res.data?.total || 0);
      setZaloPages(res.totalPages || res.data?.totalPages || 1);
    } catch {
      setZaloFriends([]);
    } finally {
      setZaloLoading(false);
    }
  }, [selectedZaloId, zaloKindFilter, zaloPage, zaloSearch]);

  useEffect(() => {
    if (channel === 'ZALO') {
      fetchZaloFriends();
    }
  }, [channel, fetchZaloFriends]);

  // Fetch LINE Friends
  const fetchLineFriends = useCallback(async () => {
    if (!selectedLineId) return;
    setLineLoading(true);
    try {
      const res = await lineApi.listFriends(selectedLineId, {
        search: lineSearch || undefined,
        limit: 200,
      });
      setLineFriends(res.items);
      setLineTotal(res.total);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh bạ LINE');
    } finally {
      setLineLoading(false);
    }
  }, [selectedLineId, lineSearch, toast]);

  useEffect(() => {
    if (channel === 'LINE') {
      fetchLineFriends();
    }
  }, [channel, fetchLineFriends]);

  const handleSyncZalo = async () => {
    if (!selectedZaloId) return;
    setZaloSyncing(true);
    try {
      await zaloApi.syncFriends(selectedZaloId);
      toast.success('Đã đồng bộ danh bạ Zalo mới nhất');
      fetchZaloFriends();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể đồng bộ danh bạ Zalo');
    } finally {
      setZaloSyncing(false);
    }
  };

  const handleSyncLine = async () => {
    if (!selectedLineId) return;
    setLineSyncing(true);
    try {
      const res = await lineApi.syncFriends(selectedLineId);
      toast.success(
        `Đã đồng bộ danh bạ LINE (${res?.synced ?? res?.upserted ?? 0} liên hệ)`,
      );
      fetchLineFriends();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể đồng bộ danh bạ LINE',
      );
    } finally {
      setLineSyncing(false);
    }
  };

  const handleSendDirectMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTarget || !messageText.trim()) return;
    setSendingMsg(true);
    try {
      if (sendTarget.platform === 'ZALO') {
        await zaloApi.sendMessage(
          sendTarget.accountId,
          sendTarget.targetUid,
          messageText.trim(),
        );
      } else {
        await lineApi.sendMessage(
          sendTarget.accountId,
          sendTarget.targetUid,
          messageText.trim(),
        );
      }
      toast.success(`Đã gửi tin nhắn tới ${sendTarget.displayName}`);
      setSendTarget(null);
      setMessageText('');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể gửi tin nhắn',
      );
    } finally {
      setSendingMsg(false);
    }
  };

  const handleLookupByPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLineId || !lookupPhoneInput.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await lineApi.lookupByPhone(selectedLineId, lookupPhoneInput.trim());
      setLookupResult({
        found: !!res?.found || !!res?.mid || !!res?.friend,
        mid: res?.mid || res?.friend?.line_uid_in_nick || res?.friend?.mid,
        displayName:
          res?.displayName || res?.friend?.line_display_name || res?.friend?.displayName,
        avatarUrl: res?.avatarUrl || res?.friend?.line_avatar_url,
      });
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không tìm thấy người dùng LINE với số điện thoại này',
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!selectedLineId || !lookupResult?.mid) return;
    setAddingFriend(true);
    try {
      await lineApi.sendFriendRequest(selectedLineId, lookupResult.mid);
      toast.success(
        `Đã gửi lời mời kết bạn LINE tới ${lookupResult.displayName || lookupResult.mid}`,
      );
      setLookupOpen(false);
      setLookupPhoneInput('');
      setLookupResult(null);
      fetchLineFriends();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể gửi lời mời kết bạn',
      );
    } finally {
      setAddingFriend(false);
    }
  };

  const selectedLineAccount = lineAccounts.find((a) => a.id === selectedLineId) || null;
  const selectedZaloAccount = zaloAccounts.find((a) => a.id === selectedZaloId) || null;

  return (
    <PageContainer>
      <PageHeader
        title="Danh bạ Bạn bè & Liên hệ (Zalo & LINE)"
        description="Quản lý tập trung danh sách bạn bè Zalo, người theo dõi kênh LINE Official Account và bạn bè LINE Cá nhân trên một màn hình duy nhất."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Native Top Channel Switcher */}
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => setChannel('ZALO')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  channel === 'ZALO'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Danh bạ Zalo
              </button>
              <button
                type="button"
                onClick={() => setChannel('LINE')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  channel === 'LINE'
                    ? 'bg-[#06C755] text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                Danh bạ LINE
              </button>
            </div>

            {channel === 'ZALO' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSyncZalo}
                isLoading={zaloSyncing}
                disabled={!selectedZaloId}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Đồng bộ Danh bạ Zalo
              </Button>
            ) : (
              <>
                {selectedLineAccount?.account_type === 'PERSONAL' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLookupResult(null);
                      setLookupPhoneInput('');
                      setLookupOpen(true);
                    }}
                    leftIcon={<UserPlus className="w-4 h-4 text-[#06C755]" />}
                  >
                    Tìm & Kết bạn qua SĐT
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSyncLine}
                  isLoading={lineSyncing}
                  disabled={!selectedLineId}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Đồng bộ Danh bạ LINE
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ZALO CONTACTS VIEW */}
      {channel === 'ZALO' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="p-4 bg-surface rounded-2xl border border-border shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-text-secondary">
                Tài khoản Zalo:
              </label>
              <select
                value={selectedZaloId}
                onChange={(e) => {
                  setSelectedZaloId(Number(e.target.value));
                  setZaloPage(1);
                }}
                className="px-3 py-2 text-xs font-semibold bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[240px]"
              >
                {zaloAccounts.length === 0 && (
                  <option value={0}>— Chưa có tài khoản Zalo —</option>
                )}
                {zaloAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.display_name || `Zalo #${acc.id}`}{' '}
                    {acc.zalo_phone ? `(${acc.zalo_phone})` : ''} —{' '}
                    {(acc.liveStatus || acc.status) === 'ACTIVE'
                      ? 'Đang kết nối'
                      : 'Chưa kết nối'}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'friend', 'stranger'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setZaloKindFilter(k);
                      setZaloPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      zaloKindFilter === k
                        ? 'bg-blue-600 text-white'
                        : 'bg-surface-muted text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {ZALO_KIND_LABELS[k] || k}
                    {k !== 'all' && zaloCounts[k] ? ` (${zaloCounts[k]})` : ''}
                  </button>
                ))}
              </div>

              <span className="text-xs text-text-muted">
                Tổng: <strong className="text-text-primary">{zaloTotal}</strong> liên hệ
              </span>
            </div>

            <div className="w-full sm:w-72">
              <Input
                placeholder="Tìm theo tên bạn bè, tên gợi nhớ, SĐT..."
                value={zaloSearchInput}
                onChange={(e) => setZaloSearchInput(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-text-muted" />}
              />
            </div>
          </div>

          {/* Zalo Friends List */}
          <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
            {zaloLoading ? (
              <div className="flex items-center justify-center py-14 text-text-muted text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Đang tải danh bạ Zalo...
              </div>
            ) : zaloFriends.length === 0 ? (
              <div className="text-center py-14 text-text-muted text-sm flex flex-col items-center gap-3">
                <Inbox className="w-10 h-10 text-text-muted/40" />
                <p>
                  Chưa có liên hệ nào khớp bộ lọc. Nhấn{' '}
                  <strong>Đồng bộ Danh bạ Zalo</strong> ở góc trên để tải danh sách mới nhất.
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border/60">
                  {zaloFriends.map((fr) => {
                    const name =
                      fr.alias_in_nick || fr.zalo_display_name || `Người dùng Zalo #${fr.id}`;
                    return (
                      <div
                        key={fr.id}
                        className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {fr.zalo_avatar_url ? (
                            <img
                              src={fr.zalo_avatar_url}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary flex items-center gap-2 truncate">
                              <span>{name}</span>
                              {fr.alias_in_nick &&
                                fr.zalo_display_name &&
                                fr.alias_in_nick !== fr.zalo_display_name && (
                                  <span className="text-xs text-text-muted font-normal">
                                    ({fr.zalo_display_name})
                                  </span>
                                )}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  fr.relationship_kind === 'friend'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {ZALO_KIND_LABELS[fr.relationship_kind] || 'Liên hệ'}
                              </span>
                            </div>
                            <div className="text-xs text-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                              <span>Mã: {fr.zalo_uid_in_nick}</span>
                              {fr.phone_from_sdk && (
                                <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                                  <Phone className="w-3 h-3" />
                                  {fr.phone_from_sdk}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSendTarget({
                                platform: 'ZALO',
                                accountId: selectedZaloId,
                                targetUid: fr.zalo_uid_in_nick,
                                displayName: name,
                              });
                              setMessageText('');
                            }}
                            leftIcon={<MessageSquare className="w-3.5 h-3.5 text-blue-600" />}
                          >
                            Nhắn tin
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {zaloPages > 1 && (
                  <div className="px-4 py-3 bg-surface-muted/40 border-t border-border flex items-center justify-between text-xs text-text-secondary">
                    <span>
                      Trang <strong>{zaloPage}</strong> / {zaloPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={zaloPage <= 1}
                        onClick={() => setZaloPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={zaloPage >= zaloPages}
                        onClick={() => setZaloPage((p) => Math.min(zaloPages, p + 1))}
                        className="p-1.5 rounded-lg border border-border bg-surface hover:bg-surface-muted disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* LINE CONTACTS VIEW */}
      {channel === 'LINE' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="p-4 bg-surface rounded-2xl border border-border shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-text-secondary">
                Tài khoản LINE:
              </label>
              <select
                value={selectedLineId}
                onChange={(e) => setSelectedLineId(Number(e.target.value))}
                className="px-3 py-2 text-xs font-semibold bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[240px]"
              >
                {lineAccounts.length === 0 && (
                  <option value={0}>— Chưa có tài khoản LINE —</option>
                )}
                {lineAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    [{acc.account_type === 'OA' ? 'LINE Official Account' : 'LINE Cá nhân'}]{' '}
                    {acc.display_name || `#${acc.id}`}{' '}
                    {acc.basic_id
                      ? `(${acc.basic_id})`
                      : acc.line_phone
                        ? `(${acc.line_phone})`
                        : ''}
                  </option>
                ))}
              </select>

              {selectedLineAccount && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    selectedLineAccount.account_type === 'OA'
                      ? 'bg-[#06C755]/15 text-[#06C755]'
                      : 'bg-teal-50 text-teal-700'
                  }`}
                >
                  {selectedLineAccount.account_type === 'OA' ? (
                    <>
                      <Bot className="w-3.5 h-3.5" />
                      Người theo dõi kênh OA
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-3.5 h-3.5" />
                      Bạn bè LINE Cá nhân
                    </>
                  )}
                </span>
              )}

              <span className="text-xs text-text-muted">
                Tổng: <strong className="text-text-primary">{lineTotal}</strong> liên hệ
              </span>
            </div>

            <div className="w-full sm:w-72">
              <Input
                placeholder="Tìm theo tên hiển thị, SĐT..."
                value={lineSearchInput}
                onChange={(e) => setLineSearchInput(e.target.value)}
                leftIcon={<Search className="w-4 h-4 text-text-muted" />}
              />
            </div>
          </div>

          {/* LINE Contacts List */}
          <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
            {lineLoading ? (
              <div className="flex items-center justify-center py-14 text-text-muted text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#06C755]" />
                Đang tải danh bạ LINE...
              </div>
            ) : lineFriends.length === 0 ? (
              <div className="text-center py-14 text-text-muted text-sm flex flex-col items-center gap-3">
                <Inbox className="w-10 h-10 text-text-muted/40" />
                <p>
                  Chưa có liên hệ nào trong danh bạ. Nhấn{' '}
                  <strong>Đồng bộ Danh bạ LINE</strong> hoặc để học viên nhắn tin vào kênh LINE.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {lineFriends.map((fr) => {
                  const displayName =
                    fr.line_display_name || fr.alias_in_nick || 'Người dùng LINE';
                  return (
                    <div
                      key={fr.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {fr.line_avatar_url ? (
                          <img
                            src={fr.line_avatar_url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-border/50 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary flex items-center gap-2 truncate">
                            <span>{displayName}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {fr.relationship_kind === 'follower'
                                ? 'Người theo dõi OA'
                                : 'Bạn bè'}
                            </span>
                          </div>
                          <div className="text-xs text-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                            <span>Mã: {fr.line_uid_in_nick}</span>
                            {fr.phone_from_sdk && (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                                <Phone className="w-3 h-3" />
                                {fr.phone_from_sdk}
                              </span>
                            )}
                            {fr.status_message && (
                              <span className="italic text-gray-400 truncate max-w-xs">
                                &ldquo;{fr.status_message}&rdquo;
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSendTarget({
                              platform: 'LINE',
                              accountId: selectedLineId,
                              targetUid: fr.line_uid_in_nick,
                              displayName,
                            });
                            setMessageText('');
                          }}
                          leftIcon={<MessageSquare className="w-3.5 h-3.5 text-[#06C755]" />}
                        >
                          Nhắn tin
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick 1-1 Send Message Modal */}
      <Modal
        isOpen={Boolean(sendTarget)}
        onClose={() => setSendTarget(null)}
        title={
          sendTarget
            ? `Gửi tin nhắn ${sendTarget.platform === 'ZALO' ? 'Zalo' : 'LINE'} tới ${sendTarget.displayName}`
            : 'Gửi tin nhắn'
        }
      >
        {sendTarget && (
          <form onSubmit={handleSendDirectMessage} className="space-y-4">
            <div className="text-xs text-text-muted">
              Gửi từ tài khoản:{' '}
              <strong>
                {sendTarget.platform === 'ZALO'
                  ? selectedZaloAccount?.display_name || `Zalo #${sendTarget.accountId}`
                  : selectedLineAccount?.display_name || `LINE #${sendTarget.accountId}`}
              </strong>
            </div>
            <textarea
              rows={4}
              required
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={`Nhập nội dung tin nhắn gửi tới ${sendTarget.displayName}...`}
              className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" type="button" onClick={() => setSendTarget(null)}>
                Hủy
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={sendingMsg}
                leftIcon={<Send className="w-4 h-4" />}
              >
                Gửi tin nhắn
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* LINE Phone Lookup Modal */}
      <Modal
        isOpen={lookupOpen}
        onClose={() => setLookupOpen(false)}
        title="Tìm & Kết bạn LINE qua Số điện thoại"
      >
        <form onSubmit={handleLookupByPhone} className="space-y-4">
          <p className="text-xs text-text-secondary">
            Nhập số điện thoại của học viên hoặc phụ huynh để tìm tài khoản LINE và gửi lời mời kết
            bạn.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                value={lookupPhoneInput}
                onChange={(e) => setLookupPhoneInput(e.target.value)}
                placeholder="VD: 0901234567"
                required
              />
            </div>
            <Button type="submit" isLoading={lookupLoading}>
              Tìm kiếm
            </Button>
          </div>

          {lookupResult && (
            <div className="p-3.5 rounded-xl border border-border bg-surface-muted/50 flex items-center justify-between gap-3">
              {lookupResult.found ? (
                <>
                  <div className="text-xs">
                    <div className="font-bold text-text-primary">
                      {lookupResult.displayName || 'Người dùng LINE'}
                    </div>
                    <div className="text-text-muted mt-0.5">Mã: {lookupResult.mid}</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSendFriendRequest}
                    isLoading={addingFriend}
                    leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                  >
                    Kết bạn
                  </Button>
                </>
              ) : (
                <div className="text-xs text-amber-700">
                  Không tìm thấy người dùng LINE nào khớp với số điện thoại này.
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </PageContainer>
  );
};
