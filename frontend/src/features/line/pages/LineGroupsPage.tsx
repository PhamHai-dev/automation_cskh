import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { lineApi } from '../api/line.api';
import type { LineAccount, LineGroupInfo } from '../types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import {
  RefreshCw,
  Users,
  Search,
  MessageSquare,
  Send,
  Bot,
  Info,
  Inbox,
  Loader2,
} from 'lucide-react';

export const LineGroupsPage: React.FC = () => {
  const toast = useToast();
  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [groups, setGroups] = useState<LineGroupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  // Quick group message test modal
  const [testGroup, setTestGroup] = useState<LineGroupInfo | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

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

  const fetchGroups = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      const list = await lineApi.listAccountGroups(selectedAccountId);
      setGroups(Array.isArray(list) ? list : []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải danh sách nhóm LINE');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, toast]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleSyncGroups = async () => {
    if (!selectedAccountId) return;
    setSyncing(true);
    try {
      const res = await lineApi.syncGroups(selectedAccountId);
      toast.success(`Đã đồng bộ ${res?.synced ?? 0} nhóm LINE`);
      fetchGroups();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể đồng bộ nhóm LINE',
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSendGroupMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !testGroup || !testMessage.trim()) return;
    setSendingTest(true);
    try {
      await lineApi.sendMessage(
        selectedAccountId,
        testGroup.line_group_id,
        testMessage.trim(),
      );
      toast.success(`Đã gửi tin nhắn vào nhóm ${testGroup.name || testGroup.line_group_id}`);
      setTestGroup(null);
      setTestMessage('');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể gửi tin nhắn vào nhóm LINE',
      );
    } finally {
      setSendingTest(false);
    }
  };

  const filteredGroups = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(q) ||
        g.line_group_id.toLowerCase().includes(q),
    );
  }, [groups, searchInput]);

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Nhóm LINE (Lớp học & Cộng đồng)"
        description="Danh sách các nhóm LINE mà Bot OA hoặc Nick cá nhân đang tham gia để gắn vào Automation Workflow."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleSyncGroups}
            isLoading={syncing}
            disabled={!selectedAccountId}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Đồng bộ Nhóm LINE
          </Button>
        }
      />

      {/* Instructions banner for OA accounts */}
      <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-start gap-3 text-xs text-emerald-900">
        <Info className="w-5 h-5 text-[#06C755] shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <div className="font-bold text-emerald-950">
            Hướng dẫn đồng bộ Nhóm Lớp học với LINE Official Account (OA):
          </div>
          <p>
            Mời Bot LINE OA vào nhóm lớp học trên LINE hoặc gõ{' '}
            <code className="px-1.5 py-0.5 rounded bg-white border border-emerald-200 font-mono font-bold text-emerald-800">
              /link MA_LOP
            </code>{' '}
            trong nhóm để tự động đồng bộ nhóm về hệ thống. Với tài khoản LINE Cá nhân (QR), nhấn{' '}
            <strong>Đồng bộ Nhóm LINE</strong> để tải toàn bộ nhóm đã tham gia.
          </p>
        </div>
      </div>

      {/* Toolbar */}
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
                [{acc.account_type === 'OA' ? 'OA Bot' : 'Cá nhân'}] {acc.display_name || `#${acc.id}`}
              </option>
            ))}
          </select>

          <span className="text-xs text-text-muted">
            Tổng: <strong className="text-text-primary">{filteredGroups.length}</strong> nhóm
          </span>
        </div>

        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo tên nhóm hoặc Group ID..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />
        </div>
      </div>

      {/* Groups Grid / List */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-text-muted text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Đang tải danh sách nhóm LINE...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-14 text-text-muted text-sm flex flex-col items-center gap-3">
            <Inbox className="w-10 h-10 text-text-muted/40" />
            <p>
              Chưa có nhóm LINE nào. Hãy mời Bot OA vào nhóm lớp học hoặc nhấn{' '}
              <strong>Đồng bộ Nhóm LINE</strong>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredGroups.map((gr) => (
              <div
                key={gr.id}
                className="px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-surface-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {gr.avatar_url ? (
                    <img
                      src={gr.avatar_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-xl object-cover border border-border/50 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#06C755]/15 text-[#06C755] flex items-center justify-center font-bold shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-text-primary flex items-center gap-2 truncate">
                      <span>{gr.name || `Nhóm LINE #${gr.id}`}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {gr.member_count ?? '—'} thành viên
                      </span>
                    </div>
                    <div className="text-xs text-text-muted flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="font-mono text-[11px]">
                        Group ID: {gr.line_group_id}
                      </span>
                      <span className="text-text-muted/50">•</span>
                      <span>
                        DB ID (Automation): <strong className="font-mono">#{gr.id}</strong>
                      </span>
                      {gr.last_synced_at && (
                        <>
                          <span className="text-text-muted/50">•</span>
                          <span>
                            Đồng bộ: {new Date(gr.last_synced_at).toLocaleString('vi-VN')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTestGroup(gr);
                      setTestMessage('');
                    }}
                    leftIcon={<MessageSquare className="w-3.5 h-3.5 text-[#06C755]" />}
                  >
                    Gửi tin test
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Group Message Test Modal */}
      <Modal
        isOpen={!!testGroup}
        onClose={() => setTestGroup(null)}
        title={
          testGroup
            ? `Gửi tin nhắn thử nghiệm vào nhóm: ${testGroup.name || testGroup.line_group_id}`
            : 'Gửi tin nhắn nhóm LINE'
        }
      >
        <form onSubmit={handleSendGroupMessage} className="space-y-4">
          <div className="text-xs text-text-muted flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#06C755]" />
            <span>
              Tài khoản gửi: <strong>{selectedAccount?.display_name || `#${selectedAccountId}`}</strong> → Group ID:{' '}
              <code className="font-mono">{testGroup?.line_group_id}</code>
            </span>
          </div>
          <textarea
            rows={4}
            required
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Nhập nội dung tin nhắn gửi vào nhóm lớp học LINE..."
            className="w-full px-3.5 py-2.5 text-sm bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border/80">
            <Button variant="outline" type="button" onClick={() => setTestGroup(null)}>
              Hủy
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={sendingTest}
              leftIcon={<Send className="w-4 h-4" />}
            >
              Gửi vào nhóm
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
