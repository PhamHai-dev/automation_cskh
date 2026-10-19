import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import type { ZaloAccount } from '../../zalo/types/zalo.types';
import type { LineGroupInfo } from '../../line/types/line.types';
import { ZaloGroupsPage } from '../../zalo/pages/ZaloGroupsPage';
import { LineGroupsPage } from '../../line/pages/LineGroupsPage';
import {
  Users,
  Layers,
  Smartphone,
  Bot,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { useToast } from '../../../components/ui/Toast';

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
  const toast = useToast();

  const resolvedInitial = useMemo<GroupsViewTab>(() => {
    if (initialTab) return initialTab;
    const ch = (searchParams.get('channel') || '').toUpperCase();
    if (ch === 'ZALO') return 'ZALO';
    if (ch === 'LINE') return 'LINE';
    return 'UNIFIED';
  }, [initialTab, searchParams]);

  const [tab, setTab] = useState<GroupsViewTab>(resolvedInitial);
  const [groups, setGroups] = useState<UnifiedGroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'ALL' | 'ZALO' | 'LINE'>('ALL');
  const [sendTarget, setSendTarget] = useState<UnifiedGroupItem | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  const loadUnifiedGroups = useCallback(async () => {
    setLoading(true);
    try {
      const [zAccs, lGroups] = await Promise.all([
        zaloApi.listAccounts().catch(() => [] as ZaloAccount[]),
        lineApi.listAllGroups().catch(() => [] as LineGroupInfo[]),
      ]);

      const zaloGroupLists = await Promise.all(
        zAccs.map(async (acc) => {
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

      const lineMapped: UnifiedGroupItem[] = (lGroups ?? []).map((g) => ({
        uidKey: `LINE:${g.line_account_id}:${g.line_group_id}`,
        platform: 'LINE',
        accountId: g.line_account_id,
        accountName: g.line_account?.display_name || `LINE #${g.line_account_id}`,
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
    if (tab === 'UNIFIED') {
      loadUnifiedGroups();
    }
  }, [tab, loadUnifiedGroups]);

  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (platformFilter !== 'ALL' && g.platform !== platformFilter) return false;
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
  }, [groups, platformFilter, searchQuery]);

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
      toast.success(`Đã gửi thông báo vào nhóm "${sendTarget.name}" (${sendTarget.platform})`);
      setSendTarget(null);
      setMessageText('');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Lỗi gửi tin nhắn nhóm');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Omnichannel Group Switcher */}
      <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-surface border border-border shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-500 text-white flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary">
              Nhóm Lớp Đa kênh (Zalo & LINE Groups)
            </h1>
            <p className="text-xs text-text-muted">
              Quản lý tập trung toàn bộ nhóm lớp học trên Zalo và LINE Official Account / Personal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-surface-muted p-1 rounded-xl border border-border">
          <button
            onClick={() => setTab('UNIFIED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'UNIFIED'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Tổng hợp Nhóm Lớp ({groups.length})
          </button>
          <button
            onClick={() => setTab('ZALO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'ZALO'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Quản trị Nhóm Zalo & Quét TV
          </button>
          <button
            onClick={() => setTab('LINE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              tab === 'LINE'
                ? 'bg-[#06C755] text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            Nhóm LINE & Lệnh /link
          </button>
        </div>
      </div>

      {tab === 'ZALO' ? (
        <ZaloGroupsPage />
      ) : tab === 'LINE' ? (
        <LineGroupsPage />
      ) : (
        <div className="px-4 pb-6 space-y-4">
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['ALL', 'ZALO', 'LINE'] as const).map((pf) => (
                <button
                  key={pf}
                  onClick={() => setPlatformFilter(pf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    platformFilter === pf
                      ? pf === 'ZALO'
                        ? 'bg-blue-600 text-white'
                        : pf === 'LINE'
                          ? 'bg-[#06C755] text-white'
                          : 'bg-primary text-white'
                      : 'bg-surface-muted text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {pf === 'ALL'
                    ? `Tất cả (${groups.length})`
                    : pf === 'ZALO'
                      ? `Nhóm Zalo (${groups.filter((g) => g.platform === 'ZALO').length})`
                      : `Nhóm LINE (${groups.filter((g) => g.platform === 'LINE').length})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên nhóm lớp, ID..."
                  className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-border bg-surface-muted/60 focus:bg-surface focus:outline-none"
                />
              </div>
              <button
                onClick={loadUnifiedGroups}
                className="px-3 py-1.5 rounded-xl border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-surface-muted"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Làm mới
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-sm text-text-muted bg-surface rounded-2xl border border-border">
              Đang tải danh sách nhóm lớp Zalo & LINE...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-12 text-center text-sm text-text-muted bg-surface rounded-2xl border border-border">
              Chưa có nhóm lớp nào khớp bộ lọc.
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
                        <img src={g.avatarUrl} alt={g.name} className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-5 h-5 text-text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${
                            g.platform === 'ZALO' ? 'bg-blue-600' : 'bg-[#06C755]'
                          }`}
                        >
                          {g.platform}
                        </span>
                        <span className="text-xs font-bold text-text-primary truncate">
                          {g.name}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted truncate mt-1">
                        Quản lý bởi: {g.accountName}
                      </p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Thành viên: <strong>{g.memberCount}</strong> · ID: {g.externalGroupId}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                    <button
                      onClick={() => setTab(g.platform)}
                      className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-muted"
                    >
                      Chi tiết / Quản trị
                    </button>
                    <button
                      onClick={() => setSendTarget(g)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold text-white flex items-center gap-1 ${
                        g.platform === 'ZALO' ? 'bg-blue-600' : 'bg-[#06C755]'
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
      )}

      {/* Quick Send Group Message Modal */}
      {sendTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleQuickSend}
            className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-primary">
                Gửi thông báo vào nhóm ({sendTarget.platform})
              </h3>
              <button
                type="button"
                onClick={() => setSendTarget(null)}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                Đóng
              </button>
            </div>
            <div className="text-xs text-text-secondary">
              Nhóm: <strong>{sendTarget.name}</strong> ({sendTarget.accountName})
            </div>
            <textarea
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Nhập nội dung thông báo gửi tới nhóm lớp..."
              className="w-full p-3 text-xs rounded-xl border border-border bg-surface-muted/40 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSendTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-border text-xs"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50"
              >
                {sending ? 'Đang gửi...' : 'Gửi ngay'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
