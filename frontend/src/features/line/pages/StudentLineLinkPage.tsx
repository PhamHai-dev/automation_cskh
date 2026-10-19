import React, { useEffect, useState, useCallback } from 'react';
import { lineApi } from '../api/line.api';
import type {
  LineAccount,
  LineFriend,
  LineStudentLink,
  LineSuggestLinkItem,
  LineDeepLinkResult,
} from '../types/line.types';
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
  QrCode,
  Copy,
  ExternalLink,
} from 'lucide-react';

type TabType = 'unlinked' | 'linked' | 'suggest';

export const StudentLineLinkPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('unlinked');

  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  // Unlinked state
  const [unlinkedSearch, setUnlinkedSearch] = useState('');
  const [unlinkedItems, setUnlinkedItems] = useState<any[]>([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);

  // Linked state
  const [linkedItems, setLinkedItems] = useState<LineStudentLink[]>([]);
  const [linkedSearch, setLinkedSearch] = useState('');
  const [linkedLoading, setLinkedLoading] = useState(false);

  // Suggest state
  const [suggestions, setSuggestions] = useState<LineSuggestLinkItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  // Manual Link Popup state
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [linkPopupStudent, setLinkPopupStudent] = useState<any>(null);
  const [linkPopupAccountId, setLinkPopupAccountId] = useState<string>('');
  const [linkPopupFriends, setLinkPopupFriends] = useState<LineFriend[]>([]);
  const [linkPopupSearch, setLinkPopupSearch] = useState('');
  const [linkPopupSelected, setLinkPopupSelected] = useState<LineFriend | null>(null);
  const [linkPopupFriendsLoading, setLinkPopupFriendsLoading] = useState(false);
  const [linkPopupSaving, setLinkPopupSaving] = useState(false);

  // 2-Tap Deep-Link / QR Modal state (for LINE OA)
  const [deepLinkModalOpen, setDeepLinkModalOpen] = useState(false);
  const [deepLinkStudent, setDeepLinkStudent] = useState<any>(null);
  const [deepLinkAccountId, setDeepLinkAccountId] = useState<string>('');
  const [deepLinkData, setDeepLinkData] = useState<LineDeepLinkResult | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(false);
  const [copiedDeepLink, setCopiedDeepLink] = useState(false);

  // Edit Link Popup state
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [editRelation, setEditRelation] = useState<LineStudentLink | null>(null);
  const [editStatus, setEditStatus] = useState<string>('FRIEND');
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [editFriendUid, setEditFriendUid] = useState<string>('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    lineApi
      .listAccounts()
      .then((accs) => {
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccount) {
          setSelectedAccount(String(accs[0].id));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUnlinked = useCallback(async () => {
    try {
      setUnlinkedLoading(true);
      const res = await lineApi.listUnlinkedStudents({
        q: unlinkedSearch || undefined,
        limit: 100,
      });
      setUnlinkedItems(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách chưa liên kết');
    } finally {
      setUnlinkedLoading(false);
    }
  }, [unlinkedSearch, toast]);

  const fetchLinked = useCallback(async () => {
    if (!selectedAccount) {
      setLinkedItems([]);
      return;
    }
    try {
      setLinkedLoading(true);
      const res = await lineApi.listLinksByAccount(
        Number(selectedAccount),
        linkedSearch || undefined,
      );
      setLinkedItems(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách đã liên kết');
    } finally {
      setLinkedLoading(false);
    }
  }, [selectedAccount, linkedSearch, toast]);

  const fetchSuggestions = useCallback(async () => {
    try {
      setSuggestLoading(true);
      const res = await lineApi.autoSuggestLinks(
        selectedAccount ? { line_account_id: Number(selectedAccount) } : undefined,
      );
      setSuggestions(res.items);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải gợi ý tự động');
    } finally {
      setSuggestLoading(false);
    }
  }, [selectedAccount, toast]);

  useEffect(() => {
    if (activeTab === 'unlinked') fetchUnlinked();
    if (activeTab === 'linked') fetchLinked();
    if (activeTab === 'suggest') fetchSuggestions();
  }, [activeTab, selectedAccount, fetchUnlinked, fetchLinked, fetchSuggestions]);

  // Load friends when manual link popup opens
  useEffect(() => {
    if (!linkPopupOpen || !linkPopupAccountId) return;
    setLinkPopupFriendsLoading(true);
    lineApi
      .listFriends(Number(linkPopupAccountId), { limit: 200 })
      .then((res) => setLinkPopupFriends(res.items))
      .catch(() => setLinkPopupFriends([]))
      .finally(() => setLinkPopupFriendsLoading(false));
  }, [linkPopupOpen, linkPopupAccountId]);

  const openManualLinkPopup = (student: any) => {
    setLinkPopupStudent(student);
    setLinkPopupAccountId(selectedAccount || (accounts[0] ? String(accounts[0].id) : ''));
    setLinkPopupSelected(null);
    setLinkPopupSearch('');
    setLinkPopupOpen(true);
  };

  const handleConfirmManualLink = async () => {
    if (!linkPopupStudent || !linkPopupSelected) return;
    setLinkPopupSaving(true);
    try {
      await lineApi.createLink({
        student_id: linkPopupStudent.id,
        line_account_id: Number(linkPopupAccountId),
        relation_status: 'FRIEND',
        display_name:
          linkPopupSelected.line_display_name ||
          linkPopupSelected.alias_in_nick ||
          undefined,
        friend_line_uid: linkPopupSelected.line_uid_in_nick,
      });
      toast.success(
        `Đã liên kết ${linkPopupStudent.full_name} ↔ ${
          linkPopupSelected.line_display_name || linkPopupSelected.line_uid_in_nick
        }`,
      );
      setLinkPopupOpen(false);
      fetchUnlinked();
      if (selectedAccount) fetchLinked();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo liên kết LINE');
    } finally {
      setLinkPopupSaving(false);
    }
  };

  // Generate 2-tap QR / Deep-Link for LINE OA
  const openDeepLinkModal = async (student: any) => {
    const oaAccounts = accounts.filter((a) => a.account_type === 'OA');
    const defaultAccId =
      oaAccounts[0]?.id ?? (selectedAccount ? Number(selectedAccount) : accounts[0]?.id);
    if (!defaultAccId) {
      toast.warning('Vui lòng thêm ít nhất 1 tài khoản LINE OA trước');
      return;
    }
    setDeepLinkStudent(student);
    setDeepLinkAccountId(String(defaultAccId));
    setDeepLinkData(null);
    setDeepLinkModalOpen(true);
    await triggerGenerateDeepLink(student.id, defaultAccId);
  };

  const triggerGenerateDeepLink = async (studentId: number, accountId: number) => {
    setDeepLinkLoading(true);
    try {
      const res = await lineApi.generateDeepLink({
        student_id: studentId,
        line_account_id: accountId,
      });
      setDeepLinkData(res);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tạo mã liên kết 2 chạm LINE OA',
      );
    } finally {
      setDeepLinkLoading(false);
    }
  };

  const handleCopyDeepLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDeepLink(true);
      toast.success('Đã sao chép đường dẫn liên kết LINE OA');
      setTimeout(() => setCopiedDeepLink(false), 2000);
    } catch {
      toast.error('Không thể sao chép');
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    if (!confirm('Gỡ liên kết LINE này?')) return;
    try {
      await lineApi.deleteLink(linkId);
      toast.success('Đã gỡ liên kết LINE');
      fetchLinked();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể gỡ liên kết');
    }
  };

  const openEditModal = (rel: LineStudentLink) => {
    setEditRelation(rel);
    setEditStatus(rel.relation_status || 'FRIEND');
    setEditDisplayName(rel.display_name || '');
    setEditFriendUid(rel.friend_line_uid || '');
    setEditPopupOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editRelation) return;
    setEditSaving(true);
    try {
      await lineApi.updateLink(editRelation.id, {
        relation_status: editStatus,
        display_name: editDisplayName.trim() || undefined,
        friend_line_uid: editFriendUid.trim() || undefined,
      });
      toast.success('Đã cập nhật liên kết LINE');
      setEditPopupOpen(false);
      fetchLinked();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể cập nhật liên kết');
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmSuggestion = async (item: LineSuggestLinkItem) => {
    const uid = item.friend.line_uid || item.friend.line_uid_in_nick || '';
    const key = `${item.student.id}:${item.friend.line_account_id}`;
    setLinkingId(key);
    try {
      await lineApi.createLink({
        student_id: item.student.id,
        line_account_id: item.friend.line_account_id,
        relation_status: 'FRIEND',
        display_name:
          item.friend.display_name || item.friend.line_display_name || undefined,
        friend_line_uid: uid,
      });
      toast.success(`Đã liên kết ${item.student.full_name} ↔ LINE`);
      fetchSuggestions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo liên kết');
    } finally {
      setLinkingId(null);
    }
  };

  const filteredPopupFriends = linkPopupFriends.filter((f) => {
    if (!linkPopupSearch.trim()) return true;
    const q = linkPopupSearch.trim().toLowerCase();
    return (
      (f.line_display_name || '').toLowerCase().includes(q) ||
      (f.alias_in_nick || '').toLowerCase().includes(q) ||
      (f.phone_from_sdk || '').includes(q) ||
      f.line_uid_in_nick.toLowerCase().includes(q)
    );
  });

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'unlinked', label: 'Chưa liên kết', icon: <Unlink2 className="w-4 h-4" /> },
    { key: 'linked', label: 'Đã liên kết', icon: <Link2 className="w-4 h-4" /> },
    { key: 'suggest', label: 'Gợi ý tự động (SĐT)', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Liên kết Học viên ↔ LINE (OA & Cá nhân)"
        description="Gắn hồ sơ Học viên với LINE UID thông qua Link 2 chạm / QR Code (cho LINE OA) hoặc chọn từ Danh bạ / khớp SĐT tự động."
      />

      {/* Account Selector for Linked / Suggest tabs */}
      {(activeTab === 'linked' || activeTab === 'suggest') && (
        <div className="mb-4 flex items-center gap-3">
          <label className="text-xs font-semibold text-text-secondary whitespace-nowrap">
            Tài khoản LINE:
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[220px]"
          >
            <option value="">— Chọn tài khoản LINE —</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                [{a.account_type}] {a.display_name || `#${a.id}`}{' '}
                {a.basic_id ? `(${a.basic_id})` : a.line_phone ? `— ${a.line_phone}` : ''}
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
                ? 'border-[#06C755] text-[#06C755]'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Chưa liên kết ── */}
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
              <p>Tất cả học viên đã được liên kết LINE.</p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden bg-surface">
              <div className="divide-y divide-border/60">
                {unlinkedItems.map((s: any) => (
                  <div
                    key={s.id}
                    className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {s.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">
                          {s.full_name}
                          <span className="ml-1.5 text-[10px] font-mono text-text-muted">
                            #{s.id}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-muted flex items-center gap-2">
                          {s.phone && <span>SĐT: {s.phone}</span>}
                          {s.enrollments?.[0]?.package?.name && (
                            <span>• Gói: {s.enrollments[0].package.name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeepLinkModal(s)}
                        leftIcon={<QrCode className="w-3.5 h-3.5 text-[#06C755]" />}
                        className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                      >
                        Tạo mã QR / Link 2 chạm (LINE OA)
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openManualLinkPopup(s)}
                        leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                      >
                        Chọn từ danh bạ
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: Đã liên kết ── */}
      {activeTab === 'linked' && (
        <div className="space-y-4">
          {!selectedAccount ? (
            <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
              <Users className="w-10 h-10 text-text-muted/40" />
              <p>Chọn một tài khoản LINE ở trên để xem danh sách học viên đã liên kết.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="Tìm theo tên học viên, SĐT, mã LK-..."
                  value={linkedSearch}
                  onChange={(e) => setLinkedSearch(e.target.value)}
                  leftIcon={<Search className="w-4 h-4 text-text-muted" />}
                  onKeyDown={(e) => e.key === 'Enter' && fetchLinked()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={fetchLinked}
                  leftIcon={<Search className="w-3.5 h-3.5" />}
                >
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
                  <p>Chưa có học viên nào liên kết với tài khoản LINE này.</p>
                </div>
              ) : (
                <div className="border border-border/80 rounded-xl overflow-hidden bg-surface">
                  <div className="divide-y divide-border/60">
                    {linkedItems.map((r) => (
                      <div
                        key={r.id}
                        className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {r.student?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">
                              {r.student?.full_name || `HV #${r.student_id}`}
                              {r.student?.phone && (
                                <span className="ml-2 text-xs font-normal text-text-muted">
                                  {r.student.phone}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                              <span>
                                LINE:{' '}
                                <strong className="text-[#06C755]">
                                  {r.display_name || r.friend_line_uid || 'Chờ xác nhận'}
                                </strong>
                              </span>
                              {r.friend_line_uid && (
                                <span className="font-mono text-[10px]">
                                  ({r.friend_line_uid})
                                </span>
                              )}
                              {r.link_code && (
                                <span className="font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px]">
                                  Mã: {r.link_code}
                                </span>
                              )}
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.relation_status === 'FRIEND'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : r.relation_status === 'BLOCKED'
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {r.relation_status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(r)}
                            title="Sửa trạng thái liên kết"
                          >
                            <Pencil className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLink(r.id)}
                            title="Gỡ liên kết"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
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

      {/* ── Tab 3: Gợi ý tự động (SĐT) ── */}
      {activeTab === 'suggest' && (
        <div className="space-y-3">
          <div className="p-3 bg-emerald-50 border border-emerald-200/70 rounded-xl text-xs text-emerald-900 leading-relaxed">
            <strong>Gợi ý tự động theo SĐT:</strong> Hệ thống đối chiếu 9 số cuối của{' '}
            <code className="bg-white px-1 py-0.5 rounded">Student.phone</code> với{' '}
            <code className="bg-white px-1 py-0.5 rounded">LineFriend.phone_from_sdk</code>. Nhấn{' '}
            <strong>Xác nhận link</strong> để hoàn tất gắn kết.
          </div>

          {suggestLoading ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang tìm gợi ý...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm flex flex-col items-center gap-3">
              <Inbox className="w-10 h-10 text-text-muted/40" />
              <p>Chưa có gợi ý trùng khớp SĐT nào.</p>
            </div>
          ) : (
            <div className="border border-border/80 rounded-xl overflow-hidden bg-surface">
              <div className="divide-y divide-border/60">
                {suggestions.map((item) => {
                  const key = `${item.student.id}:${item.friend.line_account_id}`;
                  const isLinking = linkingId === key;
                  return (
                    <div
                      key={key}
                      className="px-4 py-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {item.student.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-primary truncate">
                            {item.student.full_name}
                            <span className="ml-2 text-xs font-normal text-text-muted">
                              {item.student.phone}
                            </span>
                          </div>
                          <div className="text-[11px] text-text-muted truncate">
                            LINE:{' '}
                            <strong>
                              {item.friend.display_name ||
                                item.friend.line_display_name ||
                                item.friend.line_uid}
                            </strong>{' '}
                            — SĐT khớp: {item.friend.phone_from_sdk}
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
                            onClick={() => handleConfirmSuggestion(item)}
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

      {/* ── MODAL: Tạo mã QR / Link 2 chạm (LINE OA) ── */}
      <Modal
        isOpen={deepLinkModalOpen}
        onClose={() => setDeepLinkModalOpen(false)}
        title={
          deepLinkStudent
            ? `Mã QR / Link 2 chạm LINE OA — ${deepLinkStudent.full_name}`
            : 'Tạo mã QR / Link 2 chạm LINE OA'
        }
        description="Gửi mã QR hoặc đường dẫn này cho học viên. Khi học viên mở trên điện thoại và nhấn Gửi mã LK-xxxxxx vào LINE OA, hệ thống sẽ tự động bắt được LINE UID và kích hoạt liên kết!"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Chọn Bot LINE Official Account (OA):
            </label>
            <select
              value={deepLinkAccountId}
              onChange={(e) => {
                const newAccId = e.target.value;
                setDeepLinkAccountId(newAccId);
                if (deepLinkStudent && newAccId) {
                  triggerGenerateDeepLink(deepLinkStudent.id, Number(newAccId));
                }
              }}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  [{a.account_type}] {a.display_name || `#${a.id}`}{' '}
                  {a.basic_id ? `(${a.basic_id})` : ''}
                </option>
              ))}
            </select>
          </div>

          {deepLinkLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-text-muted text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-[#06C755]" />
              <span>Đang khởi tạo mã liên kết 2 chạm...</span>
            </div>
          ) : deepLinkData ? (
            <div className="flex flex-col items-center text-center space-y-4">
              {/* QR Image via api.qrserver.com */}
              <div className="p-3 bg-white rounded-2xl border-2 border-[#06C755]/40 shadow-sm">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                    deepLinkData.deepLinkUrl,
                  )}`}
                  alt="LINE OA Deep Link QR"
                  className="w-48 h-48 object-contain"
                />
              </div>

              {/* Link Code Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
                <span>Mã định danh học viên:</span>
                <strong className="font-mono text-sm text-[#06C755]">
                  {deepLinkData.linkCode}
                </strong>
              </div>

              {/* Copyable line.me/R/oaMessage link */}
              <div className="w-full space-y-1.5 text-left">
                <label className="text-xs font-semibold text-text-secondary">
                  Đường dẫn liên kết 2 chạm (Gửi qua SMS / Email / Zalo):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={deepLinkData.deepLinkUrl}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-surface-muted border border-border/80 rounded-xl text-text-primary"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleCopyDeepLink(deepLinkData.deepLinkUrl)}
                    leftIcon={
                      copiedDeepLink ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )
                    }
                  >
                    {copiedDeepLink ? 'Đã chép' : 'Sao chép'}
                  </Button>
                  <a
                    href={deepLinkData.deepLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl border border-border/80 hover:bg-surface-muted text-text-secondary"
                    title="Mở thử đường dẫn"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* ── MODAL: Chọn từ danh bạ LINE ── */}
      <Modal
        isOpen={linkPopupOpen}
        onClose={() => setLinkPopupOpen(false)}
        title={
          linkPopupStudent
            ? `Liên kết LINE: ${linkPopupStudent.full_name}`
            : 'Tạo liên kết LINE'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setLinkPopupOpen(false)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmManualLink}
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
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Chọn tài khoản LINE:
            </label>
            <select
              value={linkPopupAccountId}
              onChange={(e) => setLinkPopupAccountId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl"
            >
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  [{a.account_type}] {a.display_name || `#${a.id}`}
                </option>
              ))}
            </select>
          </div>

          <Input
            placeholder="Tìm trong danh bạ LINE theo tên, SĐT, UID..."
            value={linkPopupSearch}
            onChange={(e) => setLinkPopupSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />

          <div className="max-h-72 overflow-y-auto border border-border/80 rounded-xl divide-y divide-border/60">
            {linkPopupFriendsLoading ? (
              <div className="py-8 text-center text-xs text-text-muted">
                Đang tải danh bạ LINE...
              </div>
            ) : filteredPopupFriends.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                Không có liên hệ phù hợp.
              </div>
            ) : (
              filteredPopupFriends.map((f) => {
                const isSelected =
                  linkPopupSelected?.line_uid_in_nick === f.line_uid_in_nick;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLinkPopupSelected(f)}
                    className={`w-full px-3 py-2.5 flex items-center justify-between text-left transition-colors ${
                      isSelected ? 'bg-emerald-50' : 'hover:bg-surface-muted/50'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        {f.line_display_name || f.alias_in_nick || f.line_uid_in_nick}
                      </div>
                      <div className="text-[11px] font-mono text-text-muted">
                        UID: {f.line_uid_in_nick}{' '}
                        {f.phone_from_sdk ? `• SĐT: ${f.phone_from_sdk}` : ''}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#06C755]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* ── MODAL: Sửa liên kết LINE ── */}
      <Modal
        isOpen={editPopupOpen}
        onClose={() => setEditPopupOpen(false)}
        title={
          editRelation
            ? `Sửa liên kết LINE: ${editRelation.student?.full_name || `#${editRelation.student_id}`}`
            : 'Sửa liên kết LINE'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPopupOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSaveEdit} isLoading={editSaving}>
              Lưu thay đổi
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Tên hiển thị LINE"
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            placeholder="Tên hiển thị trên LINE"
          />
          <Input
            label="LINE UID (U... hoặc MID)"
            value={editFriendUid}
            onChange={(e) => setEditFriendUid(e.target.value)}
            placeholder="U1234567890abcdef..."
          />
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">
              Trạng thái quan hệ
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-muted border border-border/80 rounded-xl"
            >
              <option value="FRIEND">FRIEND (Đang kết nối / Follow)</option>
              <option value="STRANGER">STRANGER (Người lạ)</option>
              <option value="UNKNOWN">UNKNOWN (Chờ xác nhận)</option>
              <option value="BLOCKED">BLOCKED (Đã chặn)</option>
            </select>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
