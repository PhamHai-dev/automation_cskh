import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import { omnichannelApi } from '../api/omnichannel.api';
import type { ZaloAccount } from '../../zalo/types/zalo.types';
import type { LineAccount, LineGroupInfo } from '../../line/types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  Users,
  Layers,
  Smartphone,
  Bot,
  RefreshCw,
  Search,
  Send,
  MessageSquare,
  Sparkles,
  Loader2,
  Inbox,
} from 'lucide-react';

type GroupsViewTab = 'UNIFIED' | 'ZALO' | 'LINE';

interface UnifiedGroupItem {
  uidKey: string;
  platform: 'ZALO' | 'LINE';
  accountId: number;
  accountName: string;
  externalGroupId: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  lastSyncedAt: string | null;
}

export const OmnichannelGroupsPage: React.FC<{ initialTab?: GroupsViewTab }> = ({
  initialTab,
}) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const resolvedInitial = useMemo<GroupsViewTab>(() => {
    if (initialTab) return initialTab;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    if (ch === 'ZALO') return 'ZALO';
    if (ch === 'LINE') return 'LINE';
    return 'UNIFIED';
  }, [initialTab, searchParams]);

  const [tab, setTab] = useState<GroupsViewTab>(resolvedInitial);
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('ALL');
  const [groups, setGroups] = useState<UnifiedGroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Send Group Message Modal
  const [sendTarget, setSendTarget] = useState<UnifiedGroupItem | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // Rename Zalo Group Modal
  const [renameTarget, setRenameTarget] = useState<UnifiedGroupItem | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [renaming, setRenaming] = useState(false);

  const loadUnifiedGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [zAccs, lAccs, lGroups] = await Promise.all([
        zaloApi.listAccounts().catch(() => [] as ZaloAccount[]),
        lineApi.listAccounts().catch(() => [] as LineAccount[]),
        lineApi.listAllGroups().catch(() => [] as LineGroupInfo[]),
      ]);

      const safeZaloAccs = Array.isArray(zAccs) ? zAccs : [];
      const safeLineAccs = Array.isArray(lAccs) ? lAccs : [];
      setZaloAccounts(safeZaloAccs);
      setLineAccounts(safeLineAccs);

      const zaloGroupLists = await Promise.all(
        safeZaloAccs.map(async (acc) => {
          try {
            const gList = await zaloApi.getGroupsDb(acc.id);
            return (gList ?? []).map((g: any): UnifiedGroupItem => ({
              uidKey: `ZALO:${acc.id}:${g.zalo_group_id || g.groupId || g.id}`,
              platform: 'ZALO',
              accountId: acc.id,
              accountName: acc.display_name || `Zalo #${acc.id}`,
              externalGroupId: g.zalo_group_id || g.groupId || String(g.id),
              name: g.name || `Nhóm Zalo ${g.zalo_group_id || g.id}`,
              avatarUrl: g.avatar_url || g.avatarUrl || null,
              memberCount: g.member_count ?? g.memberCount ?? g._count?.members ?? 0,
              lastSyncedAt: g.last_synced_at || null,
            }));
          } catch {
            return [] as UnifiedGroupItem[];
          }
        }),
      );

      const lineAccNameMap = new Map<number, string>(
        safeLineAccs.map((a) => [a.id, a.display_name || `LINE #${a.id}`]),
      );

      const lineMapped: UnifiedGroupItem[] = (lGroups ?? []).map((g) => ({
        uidKey: `LINE:${g.line_account_id}:${g.line_group_id}`,
        platform: 'LINE',
        accountId: g.line_account_id,
        accountName:
          g.line_account?.display_name ||
          lineAccNameMap.get(g.line_account_id) ||
          `LINE #${g.line_account_id}`,
        externalGroupId: g.line_group_id,
        name: g.name || `Nhóm LINE ${g.line_group_id.slice(0, 8)}`,
        avatarUrl: g.avatar_url || null,
        memberCount: g.member_count ?? (g as any)._count?.members ?? 0,
        lastSyncedAt: g.last_synced_at || null,
      }));

      setGroups([...zaloGroupLists.flat(), ...lineMapped]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUnifiedGroups();
  }, [loadUnifiedGroups]);

  const handleSyncAllGroups = async () => {
    setSyncingAll(true);
    try {
      const report = await omnichannelApi.syncAndMatchCareGroups({
        refreshLiveGroups: true,
      });
      toast.success(
        `Đã đồng bộ danh sách nhóm mới nhất (${report.totalZaloGroupsScanned} nhóm Zalo, ${report.totalLineGroupsScanned} nhóm LINE) và tự động gắn nhóm cho học viên!`,
      );
      await loadUnifiedGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể đồng bộ danh sách nhóm');
    } finally {
      setSyncingAll(false);
    }
  };

  const zaloGroupCount = useMemo(
    () => groups.filter((g) => g.platform === 'ZALO').length,
    [groups],
  );
  const lineGroupCount = useMemo(
    () => groups.filter((g) => g.platform === 'LINE').length,
    [groups],
  );

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (tab === 'ZALO' && g.platform !== 'ZALO') return false;
      if (tab === 'LINE' && g.platform !== 'LINE') return false;
      if (
        selectedAccountFilter !== 'ALL' &&
        `${g.platform}:${g.accountId}` !== selectedAccountFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          g.name.toLowerCase().includes(q) ||
          g.accountName.toLowerCase().includes(q) ||
          g.externalGroupId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [groups, tab, selectedAccountFilter, searchQuery]);

  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTarget || !messageText.trim() || sending) return;
    setSending(true);
    try {
      if (sendTarget.platform === 'ZALO') {
        await zaloApi.sendMessage(
          sendTarget.accountId,
          sendTarget.externalGroupId,
          messageText.trim(),
        );
      } else {
        await lineApi.sendMessage(
          sendTarget.accountId,
          sendTarget.externalGroupId,
          messageText.trim(),
        );
      }
      toast.success(`Đã gửi thông báo vào nhóm "${sendTarget.name}"`);
      setSendTarget(null);
      setMessageText('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Không thể gửi tin nhắn vào nhóm');
    } finally {
      setSending(false);
    }
  };

  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !newGroupName.trim() || renaming) return;
    setRenaming(true);
    try {
      await zaloApi.renameGroup(
        renameTarget.accountId,
        renameTarget.externalGroupId,
        newGroupName.trim(),
      );
      toast.success(`Đã đổi tên nhóm thành "${newGroupName.trim()}"`);
      setRenameTarget(null);
      setNewGroupName('');
      await omnichannelApi
        .syncAndMatchCareGroups({ refreshLiveGroups: true })
        .catch(() => null);
      await loadUnifiedGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể đổi tên nhóm Zalo');
    } finally {
      setRenaming(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Nhóm Lớp & Nhóm Chăm sóc (Zalo & LINE)"
        description="Theo dõi, tìm kiếm, gửi thông báo nhanh và đồng bộ toàn bộ nhóm học viên trên Zalo và LINE trong một màn hình thống nhất."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Native Top Switcher */}
            <div className="flex items-center gap-1 bg-surface-muted p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => {
                  setTab('UNIFIED');
                  setSelectedAccountFilter('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  tab === 'UNIFIED'
                    ? 'bg-primary text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Tổng hợp Nhóm ({groups.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('ZALO');
                  setSelectedAccountFilter('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  tab === 'ZALO'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Nhóm Zalo ({zaloGroupCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('LINE');
                  setSelectedAccountFilter('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  tab === 'LINE'
                    ? 'bg-[#06C755] text-white shadow-2xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                Nhóm LINE ({lineGroupCount})
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadUnifiedGroups}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Làm mới
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSyncAllGroups}
              isLoading={syncingAll}
              leftIcon={<Sparkles className="w-4 h-4" />}
            >
              Đồng bộ Nhóm Mới Nhất
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {/* Filter & Search Toolbar */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-text-secondary">
              Lọc theo tài khoản:
            </label>
            <select
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[240px]"
            >
              <option value="ALL">Tất cả tài khoản ({groups.length} nhóm)</option>
              {tab !== 'LINE' &&
                zaloAccounts.map((acc) => (
                  <option key={`ZALO:${acc.id}`} value={`ZALO:${acc.id}`}>
                    [Zalo] {acc.display_name || `Zalo #${acc.id}`}
                  </option>
                ))}
              {tab !== 'ZALO' &&
                lineAccounts.map((acc) => (
                  <option key={`LINE:${acc.id}`} value={`LINE:${acc.id}`}>
                    [LINE] {acc.display_name || `LINE #${acc.id}`}
                  </option>
                ))}
            </select>

            <span className="text-xs text-text-muted">
              Đang hiển thị: <strong className="text-text-primary">{filteredGroups.length}</strong>{' '}
              nhóm
            </span>
          </div>

          <div className="w-full sm:w-80">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên nhóm chăm sóc, mã học viên, tài khoản..."
              leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            />
          </div>
        </div>

        {/* Groups Grid */}
        {loading ? (
          <div className="p-14 text-center text-sm text-text-muted bg-surface rounded-2xl border border-border flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Đang tải danh sách nhóm Zalo & LINE...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-14 text-center text-sm text-text-muted bg-surface rounded-2xl border border-border flex flex-col items-center gap-3">
            <Inbox className="w-10 h-10 text-text-muted/40" />
            <p>
              Chưa có nhóm nào khớp bộ lọc. Hãy nhấn <strong>Đồng bộ Nhóm Mới Nhất</strong> ở góc
              trên để tải danh sách nhóm từ Zalo và LINE.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((g) => (
              <div
                key={g.uidKey}
                className="p-4 rounded-2xl bg-surface border border-border hover:border-primary/40 transition-all flex flex-col justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-surface-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {g.avatarUrl ? (
                      <img
                        src={g.avatarUrl}
                        alt={g.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-5 h-5 text-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0 ${
                          g.platform === 'ZALO' ? 'bg-blue-600' : 'bg-[#06C755]'
                        }`}
                      >
                        {g.platform}
                      </span>
                      <span
                        className="text-xs font-bold text-text-primary truncate"
                        title={g.name}
                      >
                        {g.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted truncate mt-1">
                      Tài khoản quản lý: <strong>{g.accountName}</strong>
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Thành viên: <strong>{g.memberCount}</strong> · Mã nhóm: {g.externalGroupId}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-border/60">
                  {g.platform === 'ZALO' && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameTarget(g);
                        setNewGroupName(g.name);
                      }}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-surface-muted"
                    >
                      Đổi tên nhóm
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate('/omnichannel/chat')}
                    className="px-2.5 py-1 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-surface-muted flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Mở hộp thư
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendTarget(g);
                      setMessageText('');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold text-white flex items-center gap-1 ${
                      g.platform === 'ZALO'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-[#06C755] hover:bg-emerald-600'
                    }`}
                  >
                    <Send className="w-3 h-3" />
                    Gửi thông báo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Send Group Message Modal */}
      <Modal
        isOpen={Boolean(sendTarget)}
        onClose={() => setSendTarget(null)}
        title={
          sendTarget
            ? `Gửi thông báo vào nhóm ${sendTarget.platform}: ${sendTarget.name}`
            : 'Gửi thông báo vào nhóm'
        }
      >
        {sendTarget && (
          <form onSubmit={handleQuickSend} className="space-y-4">
            <div className="text-xs text-text-secondary">
              Tài khoản gửi: <strong>{sendTarget.accountName}</strong>
            </div>
            <textarea
              rows={4}
              required
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Nhập nội dung thông báo gửi tới nhóm học viên..."
              className="w-full p-3 text-xs rounded-xl border border-border bg-surface-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setSendTarget(null)}>
                Hủy
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={sending}
                disabled={!messageText.trim()}
                leftIcon={<Send className="w-4 h-4" />}
              >
                Gửi thông báo
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Rename Zalo Group Modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Đổi tên Nhóm Zalo theo chuẩn Chăm sóc Học viên"
      >
        {renameTarget && (
          <form onSubmit={handleRenameGroup} className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Đặt tên nhóm theo chuẩn{' '}
              <code className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                [Số thứ tự CSKH] - [Mã học viên] [Tên học viên]
              </code>{' '}
              (VD: <strong>01 - HV_001 Nguyễn Văn An</strong>) để hệ thống tự động nhận diện và gắn
              vào hồ sơ học viên.
            </p>
            <Input
              label="Tên nhóm mới"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="VD: 01 - HV_001 Nguyễn Văn An"
              required
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>
                Hủy
              </Button>
              <Button type="submit" variant="primary" isLoading={renaming}>
                Lưu tên nhóm & Tự động đối chiếu
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </PageContainer>
  );
};
