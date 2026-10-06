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
  RefreshCw,
  BookOpen,
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
  const [editPopupAccountId, setEditPopupAccountId] = useState<string>('');
  const [editPopupFriends, setEditPopupFriends] = useState<FriendRow[]>([]);
  const [editPopupSearch, setEditPopupSearch] = useState('');
  const [editPopupSelected, setEditPopupSelected] = useState<FriendRow | null>(null);
  const [editPopupFriendsLoading, setEditPopupFriendsLoading] = useState(false);
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
        friend_zalo_uid: linkPopupSelected.zalo_uid_in_nick || undefined,
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

  // ─── Open edit popup (contact picker) ────────────────────────────
  const openEditPopup = async (relation: any) => {
    setEditRelation(relation);
    const accountId = String(relation.zalo_account_id ?? '');
    setEditPopupAccountId(accountId);
    setEditPopupSearch('');
    setEditPopupSelected(null);
    setEditPopupOpen(true);
    // Fetch friends for this account and try to pre-select current friend
    if (accountId) {
      try {
        setEditPopupFriendsLoading(true);
        const res = await zaloApi.getFriendsDb(Number(accountId), { limit: 200 });
        const friends: FriendRow[] = res.data?.friends ?? res.friends ?? [];
        setEditPopupFriends(friends);
        // Try to find current friend by display_name or avatar match
        const match = friends.find(
          (f) =>
            (relation.display_name && (f.zalo_display_name === relation.display_name || f.alias_in_nick === relation.display_name)) ||
            (relation.friendZaloUid && f.zalo_uid_in_nick === relation.friendZaloUid),
        );
        if (match) setEditPopupSelected(match);
      } catch {
        setEditPopupFriends([]);
      } finally {
        setEditPopupFriendsLoading(false);
      }
    }
  };

  // ─── Save edit (change link target) ─────────────────────────────
  const handleEditSave = async () => {
    if (!editRelation || !editPopupSelected) return;
    try {
      setEditSaving(true);
      const newAccountId = Number(editPopupAccountId);
      const payload: any = {
        display_name: editPopupSelected.zalo_display_name || editPopupSelected.alias_in_nick || undefined,
        relation_status: 'FRIEND',
        friend_zalo_uid: editPopupSelected.zalo_uid_in_nick || undefined,
      };
      if (newAccountId !== editRelation.zalo_account_id) {
        payload.new_zalo_account_id = newAccountId;
      }
      await automationApi.updateLink(editRelation.id, payload);
      toast.success(
        newAccountId !== editRelation.zalo_account_id
          ? 'Đã chuyển liên kết sang nick mới'
          : 'Đã cập nhật liên kết',
      );
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
        friend_zalo_uid: item.friend.zalo_uid ?? undefined,
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

  const filteredEditFriends = editPopupFriends.filter((f) => {
    if (!editPopupSearch) return true;
    const q = editPopupSearch.toLowerCase();
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => (activeTab === 'suggest' ? fetchSuggestions() : fetchLinked())}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
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
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUnlinked}
              leftIcon={<Search className="w-3.5 h-3.5" />}
            >
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
                          <div className="relative shrink-0">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 flex items-center justify-center text-xs font-bold">
                              {r.student?.full_name?.charAt(0) || '?'}
                            </div>
                            {(r.friendAvatarUrl || r.zalo_account?.avatar_url) && (
                              <img
                                src={r.friendAvatarUrl || r.zalo_account?.avatar_url}
                                referrerPolicy="no-referrer"
                                alt=""
                                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full object-cover border-2 border-white"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">
                              {r.student?.full_name}
                              <span className="ml-1.5 text-[10px] font-mono text-text-muted">#{r.student?.id ?? '—'}</span>
                              {r.student?.phone && <span className="ml-2 text-xs font-normal text-text-muted">{r.student.phone}</span>}
                            </div>
                            <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                              {r.student?.email && <span className="inline-flex items-center gap-0.5">📧 {r.student.email}</span>}
                              {r.student?.enrollments?.[0]?.package?.name && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/5 text-primary text-[10px] font-bold">
                                  {r.student.enrollments[0].package.name}
                                </span>
                              )}
                              {r.student?.enrollments?.[0]?.cs?.name && (
                                <span className="inline-flex items-center gap-0.5">• CS: {r.student.enrollments[0].cs.name}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                              <BookOpen className="w-3 h-3 text-indigo-500" />
                              {r.student?.enrollments?.[0]?.enrollment_classes?.[0]?.class ? (
                                <span>
                                  Lớp:{' '}
                                  <strong className="text-text-secondary">
                                    {r.student.enrollments[0].enrollment_classes[0].class.class_name}
                                    {r.student.enrollments[0].enrollment_classes[0].class.class_code
                                      ? ` (${r.student.enrollments[0].enrollment_classes[0].class.class_code})`
                                      : ''}
                                  </strong>
                                </span>
                              ) : (
                                <span className="text-text-muted/60">Chưa xếp lớp</span>
                              )}
                              {r.student?.enrollments?.[0]?.enrollment_classes?.[0]?.class?.class_teachers?.[0]?.teacher?.name && (
                                <span className="inline-flex items-center gap-0.5">• Giáo viên: {r.student.enrollments[0].enrollment_classes[0].class.class_teachers[0].teacher.name}</span>
                              )}
                            </div>
                            <div className="text-[11px] text-text-muted flex items-center gap-1.5 mt-0.5">
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
                        <img src={f.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover shrink-0" />
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

      {/* ── POPUP: Sửa liên kết (= chuyển đích Zalo) ────────────── */}
      <Modal
        isOpen={editPopupOpen}
        onClose={() => setEditPopupOpen(false)}
        title={editRelation ? `Sửa liên kết: ${editRelation.student?.full_name || '—'}` : 'Sửa liên kết'}
        description={
          editRelation?.student?.phone
            ? `Học viên #${editRelation.student.id ?? '—'} · SĐT ${editRelation.student.phone} — chuyển sang nick Zalo khác và chọn lại người trong danh bạ.`
            : 'Chuyển liên kết sang nick Zalo khác và chọn lại người trong danh bạ.'
        }
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPopupOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleEditSave}
              isLoading={editSaving}
              disabled={!editPopupSelected}
              leftIcon={<Check className="w-4 h-4" />}
            >
              Lưu liên kết mới
            </Button>
          </>
        }
      >
        {/* Nick Zalo (credential / QR-login account) */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Nick Zalo (lấy danh bạ)
            </label>
            <select
              value={editPopupAccountId}
              onChange={async (e) => {
                const newId = e.target.value;
                setEditPopupAccountId(newId);
                if (!newId) {
                  setEditPopupFriends([]);
                  setEditPopupSelected(null);
                  return;
                }
                setEditPopupFriendsLoading(true);
                try {
                  const res = await zaloApi.getFriendsDb(Number(newId), { limit: 200 });
                  const friends: FriendRow[] = res.data?.friends ?? res.friends ?? [];
                  setEditPopupFriends(friends);
                } catch {
                  setEditPopupFriends([]);
                } finally {
                  setEditPopupFriendsLoading(false);
                }
                setEditPopupSelected(null);
                setEditPopupSearch('');
              }}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.display_name || `Nick #${a.id}`} — {a.zalo_phone || '—'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-text-muted">CS quét QR đăng nhập để tạo nick này; đổi nick sẽ load lại danh bạ bên dưới.</p>
          </div>

          {/* Search in contact list */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Chọn lại bạn bè trong danh bạ
            </label>
            <Input
              placeholder="Tìm theo tên, SĐT, UID..."
              value={editPopupSearch}
              onChange={(e) => setEditPopupSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            />
          </div>

          {/* Friends list */}
          <div className="max-h-[320px] overflow-y-auto border border-border/80 rounded-xl">
            {editPopupFriendsLoading ? (
              <div className="flex items-center justify-center py-8 text-text-muted text-sm gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tải danh bạ...
              </div>
            ) : filteredEditFriends.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-xs">
                {editPopupFriends.length === 0
                  ? 'Chưa có bạn bè nào cho nick này. Hãy đồng bộ danh bạ.'
                  : 'Không tìm thấy kết quả.'}
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredEditFriends.map((f) => {
                  const isSelected = editPopupSelected?.zalo_uid_in_nick === f.zalo_uid_in_nick;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setEditPopupSelected(f)}
                      className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors ${
                        isSelected ? 'bg-primary/5 ring-2 ring-primary/30' : 'hover:bg-surface-muted/50'
                      }`}
                    >
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover shrink-0" />
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
                          {f.zalo_uid_in_nick && <span> · UID: {f.zalo_uid_in_nick}</span>}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {editPopupSelected && (
            <div className="p-3 bg-primary-soft border border-primary-border rounded-xl text-xs text-primary flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                Sẽ liên kết <strong>{editRelation?.student?.full_name}</strong> →{' '}
                <strong>
                  {editPopupSelected.zalo_display_name || editPopupSelected.alias_in_nick || editPopupSelected.zalo_uid_in_nick}
                </strong>
                {editPopupAccountId && Number(editPopupAccountId) !== editRelation?.zalo_account_id && (
                  <span className="ml-1 text-amber-600">(đổi nick)</span>
                )}
              </span>
            </div>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};
