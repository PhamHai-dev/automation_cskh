import React, { useEffect, useState, useCallback } from 'react';
import { lineApi } from '../api/line.api';
import type { LineAccount, LineFriend } from '../types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  RefreshCw,
  MessageSquare,
  Search,
  UserPlus,
  Phone,
  Users,
  Send,
  Bot,
  Smartphone,
  Inbox,
  Loader2,
} from 'lucide-react';

export const LineContactsPage: React.FC = () => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [friends, setFriends] = useState<LineFriend[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Quick 1-1 Send Message Modal
  const [sendTarget, setSendTarget] = useState<LineFriend | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Phone Lookup Modal (for Personal accounts)
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

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;

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

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchFriends = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const res = await lineApi.listFriends(selectedAccountId, {
        search: search || undefined,
        limit: 200,
      });
      setFriends(res.items);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh bạ LINE');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, search, toast]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const handleSyncFriends = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      const res = await lineApi.syncFriends(selectedAccountId);
      toast.success(
        `Đã đồng bộ danh bạ LINE (${res?.synced ?? res?.upserted ?? 0} liên hệ)`,
      );
      fetchFriends();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể đồng bộ danh bạ LINE',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !sendTarget || !messageText.trim()) return;
    setSendingMsg(true);
    try {
      await lineApi.sendMessage(
        selectedAccountId,
        sendTarget.line_uid_in_nick,
        messageText.trim(),
      );
      toast.success(
        `Đã gửi tin nhắn LINE tới ${
          sendTarget.line_display_name || sendTarget.alias_in_nick || sendTarget.line_uid_in_nick
        }`,
      );
      setSendTarget(null);
      setMessageText('');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể gửi tin nhắn LINE',
      );
    } finally {
      setSendingMsg(false);
    }
  };

  const handleLookupByPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !lookupPhoneInput.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await lineApi.lookupByPhone(selectedAccountId, lookupPhoneInput.trim());
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
          'Không tìm thấy người dùng LINE với SĐT này',
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!selectedAccountId || !lookupResult?.mid) return;
    setAddingFriend(true);
    try {
      await lineApi.sendFriendRequest(selectedAccountId, lookupResult.mid);
      toast.success(`Đã gửi lời mời kết bạn LINE tới ${lookupResult.displayName || lookupResult.mid}`);
      setLookupOpen(false);
      setLookupPhoneInput('');
      setLookupResult(null);
      fetchFriends();
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

  return (
    <PageContainer>
      <PageHeader
        title="Danh bạ LINE (Bạn bè & OA Followers)"
        description="Quản lý danh sách bạn bè từ nick LINE cá nhân và người theo dõi (Followers) từ LINE Official Account."
        actions={
          <div className="flex items-center gap-2">
            {selectedAccount?.account_type === 'PERSONAL' && (
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
              onClick={handleSyncFriends}
              isLoading={syncing}
              disabled={!selectedAccountId}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Đồng bộ Danh bạ
            </Button>
          </div>
        }
      />

      {/* Toolbar: Account selector + Search */}
      <div className="mb-5 p-4 bg-surface rounded-2xl border border-border/80 shadow-soft flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-text-secondary">
            Tài khoản LINE:
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(Number(e.target.value))}
            className="px-3 py-2 text-xs font-semibold bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[240px]"
          >
            {accounts.length === 0 && <option value={0}>— Chưa có tài khoản LINE —</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                [{acc.account_type === 'OA' ? 'OA Bot' : 'Cá nhân'}] {acc.display_name || `#${acc.id}`}{' '}
                {acc.basic_id ? `(${acc.basic_id})` : acc.line_phone ? `(${acc.line_phone})` : ''}
              </option>
            ))}
          </select>

          {selectedAccount && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                selectedAccount.account_type === 'OA'
                  ? 'bg-[#06C755]/15 text-[#06C755]'
                  : 'bg-teal-50 text-teal-700'
              }`}
            >
              {selectedAccount.account_type === 'OA' ? (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  OA Followers
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
            Tổng: <strong className="text-text-primary">{total}</strong> liên hệ
          </span>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo tên hiển thị, SĐT, LINE UID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-text-muted text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Đang tải danh bạ LINE...
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-14 text-text-muted text-sm flex flex-col items-center gap-3">
            <Inbox className="w-10 h-10 text-text-muted/40" />
            <p>
              Chưa có liên hệ nào trong danh bạ. Nhấn <strong>Đồng bộ Danh bạ</strong> hoặc để học viên nhắn tin vào LINE OA.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {friends.map((fr) => (
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
                      {(fr.line_display_name || fr.alias_in_nick || 'L').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary flex items-center gap-2 truncate">
                      <span>{fr.line_display_name || fr.alias_in_nick || 'LINE User'}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {fr.relationship_kind === 'follower' ? 'OA Follower' : 'Bạn bè'}
                      </span>
                    </div>
                    <div className="text-xs text-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="font-mono text-[11px]">UID: {fr.line_uid_in_nick}</span>
                      {fr.phone_from_sdk && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <Phone className="w-3 h-3" />
                          {fr.phone_from_sdk}
                        </span>
                      )}
                      {fr.status_message && (
                        <span className="italic text-gray-400 truncate max-w-xs">
                          “{fr.status_message}”
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
                      setSendTarget(fr);
                      setMessageText('');
                    }}
                    leftIcon={<MessageSquare className="w-3.5 h-3.5 text-[#06C755]" />}
                  >
                    Nhắn 1-1
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick 1-1 Send Message Modal */}
      <Modal
        isOpen={!!sendTarget}
        onClose={() => setSendTarget(null)}
        title={
          sendTarget
            ? `Gửi tin nhắn LINE tới ${
                sendTarget.line_display_name || sendTarget.alias_in_nick || sendTarget.line_uid_in_nick
              }`
            : 'Gửi tin nhắn LINE'
        }
      >
        <form onSubmit={handleSendMessage} className="space-y-4">
          <div className="text-xs text-text-muted">
            Người nhận UID: <code className="font-mono text-text-primary">{sendTarget?.line_uid_in_nick}</code>
          </div>
          <textarea
            rows={4}
            required
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Nhập nội dung tin nhắn gửi qua LINE..."
            className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setSendTarget(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={sendingMsg}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Gửi ngay
            </Button>
          </div>
        </form>
      </Modal>

      {/* Phone Lookup Modal (Personal Accounts) */}
      <Modal
        isOpen={lookupOpen}
        onClose={() => setLookupOpen(false)}
        title="Tìm & Kết bạn LINE qua Số điện thoại"
        description="Dành cho nick LINE Cá nhân (@evex/linejs): tra cứu MID từ số điện thoại và gửi lời mời kết bạn."
      >
        <div className="space-y-4">
          <form onSubmit={handleLookupByPhone} className="flex gap-2">
            <Input
              placeholder="Nhập SĐT (VD: 0987654321 hoặc +8190...)"
              value={lookupPhoneInput}
              onChange={(e) => setLookupPhoneInput(e.target.value)}
              leftIcon={<Phone className="w-4 h-4 text-text-muted" />}
              className="flex-1"
            />
            <Button
              variant="primary"
              type="submit"
              isLoading={lookupLoading}
              leftIcon={<Search className="w-4 h-4" />}
            >
              Tìm kiếm
            </Button>
          </form>

          {lookupResult && (
            <div className="p-4 rounded-xl border border-border/80 bg-surface-muted/40">
              {lookupResult.found && lookupResult.mid ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                      {(lookupResult.displayName || 'L').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-text-primary">
                        {lookupResult.displayName || 'Người dùng LINE'}
                      </div>
                      <div className="text-xs font-mono text-text-muted">
                        MID: {lookupResult.mid}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSendFriendRequest}
                    isLoading={addingFriend}
                    leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                  >
                    Kết bạn
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-center text-text-muted flex items-center justify-center gap-2 py-2">
                  <Users className="w-4 h-4" />
                  <span>Không tìm thấy tài khoản LINE nào mở tìm kiếm qua SĐT này.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};
