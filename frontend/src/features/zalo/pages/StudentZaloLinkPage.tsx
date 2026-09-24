import React, { useEffect, useState, useCallback } from 'react';
import { automationApi } from '../../automation/api/automation.api';
import { zaloApi } from '../api/zalo.api';
import type { SuggestLinkItem } from '../../automation/types/automation.types';
import type { ZaloAccount } from '../types/zalo.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  Search,
  Link2,
  Unlink2,
  UserPlus,
  Sparkles,
  Loader2,
  Check,
  Trash2,
  Pencil,
  Inbox,
  Users,
} from 'lucide-react';

type TabType = 'unlinked' | 'suggest' | 'linked';

/** Friend row from friends-db endpoint */
interface FriendRow {
  id: number;
  zalo_account_id: number;
  zalo_uid_in_nick: string | null;
  alias_in_nick: string | null;
  zalo_display_name: string | null;
  phone_from_sdk: string | null;
  relationship_kind: string | null;
  avatar_url: string | null;
}

export const StudentZaloLinkPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('unlinked');

  // ── Accounts (for dropdown) ──────────────────────────────────────────
  const [accounts, setAccounts] = useState<ZaloAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // ── Suggest state ────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<SuggestLinkItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // ── Unlinked state ───────────────────────────────────────────────────
  const [unlinkedSearch, setUnlinkedSearch] = useState('');
  const [unlinkedItems, setUnlinkedItems] = useState<any[]>([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);

  // ── Linked state ─────────────────────────────────────────────────────
  const [linkedItems, setLinkedItems] = useState<any[]>([]);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [linkedLoading, setLinkedLoading] = useState(false);

  // ── Link popup state ─────────────────────────────────────────────────
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [linkPopupStudent, setLinkPopupStudent] = useState<any>(null);
  const [linkPopupAccountId, setLinkPopupAccountId] = useState<string>('');
  const [linkPopupFriends, setLinkPopupFriends] = useState<FriendRow[]>([]);
  const [linkPopupSearch, setLinkPopupSearch] = useState('');
  const [linkPopupSelected, setLinkPopupSelected] = useState<FriendRow | null>(null);
  const [linkPopupFriendsLoading, setLinkPopupFriendsLoading] = useState(false);
  const [linkPopupSaving, setLinkPopupSaving] = useState(false);

  // ── Edit popup state ─────────────────────────────────────────────────
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [editRelation, setEditRelation] = useState<any>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRelationStatus, setEditRelationStatus] = useState('FRIEND');
  const [editSaving, setEditSaving] = useState(false);

  const [linkingId, setLinkingId] = useState<string | null>(null);

  // ─── Load accounts on mount ───────────────────────────────────────
  useEffect(() => {
    zaloApi.listAccounts().then(setAccounts).catch(() => {});
  }, []);

  // ─── Fetch helpers (useCallback) ────────────────────────────────────

  const fetchUnlinked = useCallback(async () => {
    try {
      setUnlinkedLoading(true);
      const res = await automationApi.getUnlinkedStudents({
        q: unlinkedSearch || undefined,
        limit: 100,
      });
      setUnlinkedItems(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách');
    } finally {
      setUnlinkedLoading(false);
    }
  }, [unlinkedSearch]);

  const fetchSuggestions = useCallback(async () => {
    try {
      setSuggestLoading(true);
      const res = await automationApi.autoSuggestLinks(
        selectedAccount ? { zalo_account_id: Number(selectedAccount) } : undefined,
      );
      setSuggestions(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải gợi ý');
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedAccount]);

  const fetchLinked = useCallback(async () => {
    if (!selectedAccount) { setLinkedItems([]); return; }
    try {
      setLinkedLoading(true);
      const res = await automationApi.getStudentsLinked(Number(selectedAccount), linkedSearch || undefined);
      setLinkedItems(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách đã liên kết');
    } finally {
      setLinkedLoading(false);
    }
  }, [selectedAccount, linkedSearch]);

  // ── Auto-fetch on tab / account change ─────────────────────────────
  useEffect(() => {
    if (activeTab === 'unlinked') fetchUnlinked();
    if (activeTab === 'suggest') fetchSuggestions();
    if (activeTab === 'linked') fetchLinked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedAccount]);

  // ─── Fetch friends-db for contact picker popup ─────────────────────
  const fetchPopupFriends = useCallback(async (accountId: number) => {
    try {
      setLinkPopupFriendsLoading(true);
      const res = await zaloApi.getFriendsDb(accountId, { limit: 200 });
      setLinkPopupFriends(res.data?.friends ?? res.friends ?? []);
    } catch {
      setLinkPopupFriends([]);
    } finally {
      setLinkPopupFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkPopupOpen && linkPopupAccountId) {
      fetchPopupFriends(Number(linkPopupAccountId));
      setLinkPopupSelected(null);
      setLinkPopupSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkPopupAccountId, linkPopupOpen]);

  // ─── Open link popup ───────────────────────────────────────────────
  const openLinkPopup = (student: any) => {
    setLinkPopupStudent(student);
    setLinkPopupAccountId(accounts[0] ? String(accounts[0].id) : '');
    setLinkPopupSelected(null);
    setLinkPopupSearch('');
    setLinkPopupOpen(true);
  };

  // ─── Create link from popup ────────────────────────────────────────
  const handlePopupConfirm = async () => {
    if (!linkPopupStudent || !linkPopupSelected) return;
    try {
      setLinkPopupSaving(true);
      await automationApi.createLink({
        student_id: linkPopupStudent.id,
        zalo_account_id: linkPopupSelected.zalo_account_id,
        relation_status: 'FRIEND',
        display_name: linkPopupSelected.zalo_display_name || linkPopupSelected.alias_in_nick || undefined,
      });
      toast.success(`Đã liên kết ${linkPopupStudent.full_name} ↔ ${(linkPopupSelected.zalo_display_name || linkPopupSelected.alias_in_nick || 'Nick')}`);
      setLinkPopupOpen(false);
      if (activeTab === 'unlinked') fetchUnlinked();
      if (activeTab === 'linked') fetchLinked();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo liên kết');
    } finally {
      setLinkPopupSaving(false);
    }
  };

  // ─── Delete link ───────────────────────────────────────────────────
  const handleDeleteLink = async (relationId: number) => {
    if (!confirm('Gỡ liên kết này?')) return;
    try {
      await automationApi.deleteLink(relationId);
      toast.success('Đã gỡ liên kết');
      fetchLinked();
      fetchSuggestions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gỡ liên kết');
    }
  };

  // ─── Open edit popup ───────────────────────────────────────────────
  const openEditPopup = (relation: any) => {
    setEditRelation(relation);
    setEditDisplayName(relation.display_name || '');
    setEditRelationStatus(relation.relation_status || 'FRIEND');
    setEditPopupOpen(true);
  };

  // ─── Save edit ─────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editRelation) return;
    try {
      setEditSaving(true);
      await automationApi.updateLink(editRelation.id, {
        display_name: editDisplayName,
        relation_status: editRelationStatus,
      });
      toast.success('Đã cập nhật liên kết');
      setEditPopupOpen(false);
      fetchLinked();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật');
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Suggest confirm ───────────────────────────────────────────────
  const handleConfirmLink = async (item: SuggestLinkItem) => {
    const key = `${item.student.id}:${item.friend.zalo_account_id}`;
    try {
      setLinkingId(key);
      await automationApi.createLink({
        student_id: item.student.id,
        zalo_account_id: item.friend.zalo_account_id,
        relation_status: 'FRIEND',
        display_name: item.friend.display_name ?? undefined,
      });
      toast.success(`Đã liên kết ${item.student.full_name} ↔ nick #${item.friend.zalo_account_id}`);
      fetchSuggestions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo liên kết');
    } finally {
      setLinkingId(null);
    }
  };

  // ─── Filter friends in popup ───────────────────────────────────────
  const filteredFriends = linkPopupFriends.filter((f) => {
    if (!linkPopupSearch) return true;
    const q = linkPopupSearch.toLowerCase();
    return (
      (f.zalo_display_name || '').toLowerCase().includes(q) ||
      (f.alias_in_nick || '').toLowerCase().includes(q) ||
      (f.phone_from_sdk || '').includes(q) ||
      (f.zalo_uid_in_nick || '').includes(q)
    );
  });

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'unlinked', label: 'Chưa liên kết', icon: <Unlink2 className="w-4 h-4" /> },
    { key: 'linked', label: 'Đã liên kết', icon: <Link2 className="w-4 h-4" /> },
    { key: 'suggest', label: 'Gợi ý tự động', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Liên kết HV ↔ Zalo"
        description="Liên kết học viên với tài khoản Zalo bạn bè trong danh bạ để automation có thể gửi tin."
      />

      {/* Account selector — only for linked/suggest */}
      {(activeTab === 'linked' || activeTab === 'suggest') && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs font-semibold text-text-secondary whitespace-nowrap">
            Nick Zalo:
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
          >
            <option value="">— Chọn nick —</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.display_name || `Nick #${a.id}`} — {a.zalo_phone || '—'}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => (activeTab === 'suggest' ? fetchSuggestions() : fetchLinked())}>
            Làm mới
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/80 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Unlinked Tab ─────────────────────────────────────────── */}
      {activeTab === 'unlinked' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Tìm học viên theo tên, SĐT..."
              value={unlinkedSearch}
              onChange={(e) => setUnlinkedSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
              onKeyDown={(e) => e.key === 'Enter' && fetchUnlinked()}
              className="flex-1"
            />
            <Button variant="outline" onClick={fetchUnlinked} leftIcon={<Search className="w-3.5 h-3.5" />}>
              Tìm
            </Button>
          </div>

          {unlinkedLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tải...
            </div>
          ) : unlinkedItems.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
              <Inbox className="w-10 h-10 text-text-muted/40" />
              <p>Không có học viên nào chưa liên kết.</p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/60">
                {unlinkedItems.map((s: any) => (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/10 to-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {s.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{s.full_name}</div>
                        <div className="text-[11px] text-text-muted flex items-center gap-2">
                          {s.phone && <span>SĐT: {s.phone}</span>}
                          {s.enrollments?.[0]?.package?.name && <span>• Gói: {s.enrollments[0].package.name}</span>}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openLinkPopup(s)}
                      leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                      className="shrink-0"
                    >
                      Tạo liên kết
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Linked Tab ───────────────────────────────────────────── */}
      {activeTab === 'linked' && (
        <div className="space-y-4">
          {!selectedAccount ? (
            <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
              <Users className="w-10 h-10 text-text-muted/40" />
              <p>Chọn một nick Zalo ở trên để xem danh sách đã liên kết.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Tìm theo tên học viên, SĐT..."
                  value={linkedSearch}
                  onChange={(e) => setLinkedSearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4 text-text-muted" />}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLinked()}
                  className="flex-1"
                />
                <Button variant="outline" onClick={fetchLinked} leftIcon={<Search className="w-3.5 h-3.5" />}>
                  Tìm
                </Button>
              </div>

              {linkedLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang tải...
                </div>
              ) : linkedItems.length === 0 ? (
                <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
                  <Inbox className="w-10 h-10 text-text-muted/40" />
                  <p>Chưa có liên kết nào cho nick này.</p>
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl overflow-hidden">
                  <div className="divide-y divide-border/60">
                    {linkedItems.map((r: any) => (
                      <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {r.student?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">
                              {r.student?.full_name}
                              {r.student?.phone && <span className="ml-2 text-xs font-normal text-text-muted">{r.student.phone}</span>}
                            </div>
                            <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                              <Link2 className="w-3 h-3 text-emerald-500" />
                              <span>
                                Zalo: <strong className="text-emerald-700">{r.display_name || '—'}</strong>
                              </span>
                              <span className="text-text-muted/50">•</span>
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.relation_status === 'FRIEND'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : r.relation_status === 'BLOCKED'
                                      ? 'bg-red-50 text-red-600'
                                      : 'bg-amber-50 text-amber-600'
                                }`}
                              >
                                {r.relation_status}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => openEditPopup(r)} title="Sửa liên kết">
                            <Pencil className="w-4 h-4 text-blue-400 hover:text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteLink(r.id)} title="Gỡ liên kết">
                            <Trash2 className="w-4 h-4 text-red-400 hover:text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Suggest Tab ──────────────────────────────────────────── */}
      {activeTab === 'suggest' && (
        <div className="space-y-3">
          <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-xl text-xs text-blue-800 leading-relaxed">
            <strong>Gợi ý tự động:</strong> Hệ thống khớp <code className="bg-blue-100 px-1 py-0.5 rounded">Student.phone</code> ↔{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded">Friend.phone_from_sdk</code> (chuẩn hóa 9 số cuối). Chỉ là gợi ý —{' '}
            <strong>CS phải xác nhận</strong> mới tạo liên kết. Mỗi HV có thể liên kết nhiều nick.
          </div>

          {suggestLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tìm gợi ý...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
              <Inbox className="w-10 h-10 text-text-muted/40" />
              <p>Không có gợi ý. Hãy đảm bảo đã đồng bộ bạn bè Zalo và học viên có SĐT.</p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden">
              <div className="divide-y divide-border/60">
                {suggestions.map((item) => {
                  const key = `${item.student.id}:${item.friend.zalo_account_id}`;
                  const isLinking = linkingId === key;
                  return (
                    <div key={key} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {item.student.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary truncate">
                            {item.student.full_name}
                            <span className="ml-2 text-xs font-normal text-text-muted">{item.student.phone}</span>
                          </div>
                          <div className="text-[11px] text-text-muted truncate">
                            Zalo: <strong>{item.friend.display_name || item.friend.zalo_uid}</strong> — SĐT khớp:{' '}
                            {item.friend.phone_from_sdk} — Nick:{' '}
                            {item.zaloAccount.display_name || `#${item.friend.zalo_account_id}`}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {item.alreadyLinked ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3" />
                            Đã liên kết
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleConfirmLink(item)}
                            isLoading={isLinking}
                            leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                          >
                            Xác nhận link
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── POPUP: Tạo liên kết (contact picker) ─────────────────── */}
      <Modal
        isOpen={linkPopupOpen}
        onClose={() => setLinkPopupOpen(false)}
        title={linkPopupStudent ? `Liên kết: ${linkPopupStudent.full_name}` : 'Tạo liên kết'}
        description="Chọn nick Zalo và một người trong danh bạ bạn bè để liên kết."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setLinkPopupOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handlePopupConfirm}
              isLoading={linkPopupSaving}
              disabled={!linkPopupSelected}
              leftIcon={<Check className="w-4 h-4" />}
            >
              Xác nhận liên kết
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Chọn nick Zalo:</label>
            <select
              value={linkPopupAccountId}
              onChange={(e) => setLinkPopupAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.display_name || `Nick #${a.id}`} — {a.zalo_phone || '—'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Tìm trong danh bạ:</label>
            <Input
              placeholder="Tìm theo tên, SĐT, UID..."
              value={linkPopupSearch}
              onChange={(e) => setLinkPopupSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto border border-border/80 rounded-xl">
            {linkPopupFriendsLoading ? (
              <div className="flex items-center justify-center py-8 text-text-muted text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tải danh bạ...
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-xs">
                {linkPopupFriends.length === 0 ? 'Không có bạn bè nào. Hãy đồng bộ danh bạ.' : 'Không tìm thấy kết quả.'}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredFriends.map((f) => {
                  const isSelected = linkPopupSelected?.zalo_uid_in_nick === f.zalo_uid_in_nick;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setLinkPopupSelected(f)}
                      className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                        isSelected ? 'bg-primary/5 ring-2 ring-primary/30' : 'hover:bg-surface-muted/50'
                      }`}
                    >
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {(f.zalo_display_name || f.alias_in_nick || '?').charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {f.zalo_display_name || f.alias_in_nick || f.zalo_uid_in_nick || '—'}
                        </div>
                        <div className="text-[11px] text-text-muted truncate">
                          {f.phone_from_sdk && <span>SĐT: {f.phone_from_sdk}</span>}
                          {f.zalo_uid_in_nick && <span> • UID: {f.zalo_uid_in_nick}</span>}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {linkPopupSelected && (
            <div className="p-3 bg-primary-soft border border-primary-border rounded-xl text-xs text-primary flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                Đã chọn: <strong>{linkPopupSelected.zalo_display_name || linkPopupSelected.alias_in_nick || linkPopupSelected.zalo_uid_in_nick}</strong>
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* ── POPUP: Sửa liên kết ──────────────────────────────────── */}
      <Modal
        isOpen={editPopupOpen}
        onClose={() => setEditPopupOpen(false)}
        title={editRelation ? `Sửa liên kết: ${editRelation.student?.full_name || '—'}` : 'Sửa liên kết'}
        description="Chỉnh sửa tên hiển thị Zalo và trạng thái liên kết."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPopupOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleEditSave} isLoading={editSaving} leftIcon={<Check className="w-4 h-4" />}>
              Lưu
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Tên hiển thị Zalo:</label>
            <Input
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Nhập tên hiển thị..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Trạng thái:</label>
            <select
              value={editRelationStatus}
              onChange={(e) => setEditRelationStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="FRIEND">FRIEND (Bạn bè)</option>
              <option value="STRANGER">STRANGER (Người lạ)</option>
              <option value="UNKNOWN">UNKNOWN (Không rõ)</option>
              <option value="BLOCKED">BLOCKED (Bị chặn)</option>
            </select>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
