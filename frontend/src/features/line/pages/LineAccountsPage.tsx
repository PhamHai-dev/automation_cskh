import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { lineApi } from '../api/line.api';
import type {
  LineAccount,
  LineAccountType,
  CreateLineAccountDTO,
  LineSocketStatusEvent,
} from '../types/line.types';
import { LINE_STATUS_LABELS, LINE_STATUS_COLORS } from '../types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, Column } from '../../../components/common/DataTable';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { LineQrLoginDialog } from '../components/LineQrLoginDialog';
import { LineOaConfigDialog } from '../components/LineOaConfigDialog';
import { useSocket } from '../../../hooks/useSocket';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Plus,
  QrCode,
  Trash2,
  WifiOff,
  RefreshCw,
  Users,
  Bot,
  Smartphone,
  Settings,
  RotateCcw,
} from 'lucide-react';

export const LineAccountsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isAdminOrManager = user?.roles?.some((r) => ['ADMIN', 'MANAGE'].includes(r));

  const [accounts, setAccounts] = useState<LineAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | LineAccountType>('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [qrAccount, setQrAccount] = useState<LineAccount | null>(null);
  const [oaConfigAccount, setOaConfigAccount] = useState<LineAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LineAccount | null>(null);

  // Create form with 2-mode switcher (OA vs PERSONAL)
  const [form, setForm] = useState<CreateLineAccountDTO>({
    cs_id: user?.id || 0,
    account_type: 'OA',
    display_name: '',
    basic_id: '',
    channel_id: '',
    channel_secret: '',
    channel_access_token: '',
    line_phone: '',
    proxy_url: '',
  });
  const [formLoading, setFormLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await lineApi.listAccounts();
      setAccounts(Array.isArray(data) ? data : []);
      setError('');
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải danh sách tài khoản LINE',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Realtime status via Socket.IO
  const handleStatusEvent = useCallback((evt: LineSocketStatusEvent) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === evt.accountId
          ? {
              ...a,
              liveStatus: evt.status,
              status: evt.status,
              pin_code: evt.pinCode !== undefined ? evt.pinCode : a.pin_code,
            }
          : a,
      ),
    );
  }, []);

  const { on, off } = useSocket();
  useEffect(() => {
    on('line:status', handleStatusEvent);
    return () => {
      off('line:status', handleStatusEvent);
    };
  }, [on, off, handleStatusEvent]);

  const filteredAccounts = useMemo(() => {
    if (typeFilter === 'ALL') return accounts;
    return accounts.filter((a) => a.account_type === typeFilter);
  }, [accounts, typeFilter]);

  // KPI metrics
  const totalCount = accounts.length;
  const activeOaCount = accounts.filter(
    (a) => a.account_type === 'OA' && (a.liveStatus || a.status) === 'ACTIVE',
  ).length;
  const activePersonalCount = accounts.filter(
    (a) => a.account_type === 'PERSONAL' && (a.liveStatus || a.status) === 'ACTIVE',
  ).length;
  const totalQuotaUsed = accounts
    .filter((a) => a.account_type === 'OA')
    .reduce((sum, a) => sum + (a.monthly_consumption || 0), 0);
  const totalQuotaLimit = accounts
    .filter((a) => a.account_type === 'OA')
    .reduce((sum, a) => sum + (a.monthly_quota || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const created = await lineApi.createAccount(form);
      setIsCreateOpen(false);
      toast.success(
        form.account_type === 'OA'
          ? 'Đã tạo tài khoản LINE Official Account (Bot OA)'
          : 'Đã tạo tài khoản LINE Cá nhân — hãy quét mã QR để đăng nhập',
      );
      await fetchAccounts();
      if (form.account_type === 'PERSONAL' && created?.id) {
        setQrAccount(created);
      } else if (form.account_type === 'OA' && created?.id) {
        setOaConfigAccount(created);
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tạo tài khoản LINE',
      );
    } finally {
      setFormLoading(false);
    }
  };

  const handleSyncAll = async (account: LineAccount) => {
    try {
      const [frRes, grRes] = await Promise.allSettled([
        lineApi.syncFriends(account.id),
        lineApi.syncGroups(account.id),
      ]);
      const frCount =
        frRes.status === 'fulfilled'
          ? frRes.value?.synced ?? frRes.value?.upserted ?? 0
          : 0;
      const grCount = grRes.status === 'fulfilled' ? grRes.value?.synced ?? 0 : 0;
      toast.success(`Đã đồng bộ ${frCount} bạn bè/followers và ${grCount} nhóm LINE`);
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể đồng bộ dữ liệu LINE');
    }
  };

  const handleDisconnect = async (account: LineAccount) => {
    try {
      await lineApi.disconnectAccount(account.id);
      toast.success('Đã ngắt kết nối tài khoản LINE');
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể ngắt kết nối');
    }
  };

  const handleReconnect = async (account: LineAccount) => {
    try {
      await lineApi.reconnectAccount(account.id);
      toast.success('Đã gửi yêu cầu kết nối lại');
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể kết nối lại');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await lineApi.deleteAccount(deleteTarget.id);
      toast.success('Đã xóa tài khoản LINE');
      setDeleteTarget(null);
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa tài khoản LINE');
    }
  };

  const columns: Column<LineAccount>[] = [
    {
      header: 'Tài khoản LINE',
      cell: (item) => (
        <div className="flex items-center gap-3">
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-border/50 shrink-0"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                item.account_type === 'OA' ? 'bg-[#06C755]' : 'bg-emerald-600'
              }`}
            >
              {item.account_type === 'OA' ? (
                <Bot className="w-5 h-5" />
              ) : (
                (item.display_name || `#${item.id}`).charAt(0).toUpperCase()
              )}
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-1.5">
              <span>{item.display_name || `LINE #${item.id}`}</span>
              {item.basic_id && (
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {item.basic_id}
                </span>
              )}
            </div>
            <div className="text-gray-500 text-xs font-mono">
              {item.line_mid || `ID: ${item.id}`}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Loại kết nối',
      cell: (item) =>
        item.account_type === 'OA' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#06C755]/15 text-[#06C755] border border-[#06C755]/30">
            <Bot className="w-3.5 h-3.5" />
            LINE OA (Bot)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <Smartphone className="w-3.5 h-3.5" />
            Cá nhân (QR E2EE)
          </span>
        ),
    },
    {
      header: 'CS phụ trách',
      cell: (item) =>
        item.cs?.full_name || item.cs?.name || item.cs?.email || `CS #${item.cs_id}`,
    },
    {
      header: 'SĐT / Quota OA',
      cell: (item) =>
        item.account_type === 'OA' ? (
          <div className="text-xs">
            <span className="font-mono font-bold text-gray-800">
              {item.monthly_consumption ?? 0} / {item.monthly_quota ?? 200}
            </span>
            <span className="text-gray-400 ml-1">tin push</span>
          </div>
        ) : (
          <span className="text-xs font-mono text-gray-700">{item.line_phone || '—'}</span>
        ),
    },
    {
      header: 'Trạng thái',
      cell: (item) => {
        const st = item.liveStatus || item.status;
        return (
          <div className="flex flex-col items-start gap-1">
            <span
              className={
                'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' +
                (LINE_STATUS_COLORS[st] || 'bg-gray-100 text-gray-600')
              }
            >
              {LINE_STATUS_LABELS[st] || st}
            </span>
            {st === 'PIN_REQUIRED' && item.pin_code && (
              <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                PIN: {item.pin_code}
              </span>
            )}
          </div>
        );
      },
    },
    {
      header: 'Kết nối cuối',
      cell: (item) =>
        item.last_connected_at
          ? new Date(item.last_connected_at).toLocaleString('vi-VN')
          : '—',
    },
    {
      header: 'Thao tác',
      className: 'text-right',
      cell: (item) => {
        const st = item.liveStatus || item.status;
        return (
          <div className="flex justify-end gap-1">
            {item.account_type === 'PERSONAL' && st !== 'ACTIVE' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setQrAccount(item);
                }}
                title="Quét QR / Xem mã PIN 6 số"
              >
                <QrCode className="w-3.5 h-3.5 text-[#06C755]" />
              </Button>
            )}
            {item.account_type === 'OA' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setOaConfigAccount(item);
                }}
                title="Cấu hình LINE OA & Webhook URL"
              >
                <Settings className="w-3.5 h-3.5 text-[#06C755]" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleSyncAll(item);
              }}
              title="Đồng bộ Danh bạ & Nhóm LINE"
            >
              <Users className="w-3.5 h-3.5 text-blue-600" />
            </Button>
            {st === 'ACTIVE' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisconnect(item);
                }}
                title="Ngắt kết nối"
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReconnect(item);
                }}
                title="Kết nối lại"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTarget(item);
              }}
              title="Xóa tài khoản"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Tài khoản LINE (Hybrid: OA Bot + Cá nhân)"
        description="Kết nối đồng thời LINE Official Account (@line/bot-sdk) không lo khóa nick và LINE Cá nhân (@evex/linejs) quét mã QR + E2EE Letter Sealing."
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => fetchAccounts()}
              variant="outline"
              size="sm"
              isLoading={loading}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Làm mới
            </Button>
            <Button
              onClick={() => {
                setForm({
                  cs_id: user?.id || 0,
                  account_type: 'OA',
                  display_name: '',
                  basic_id: '',
                  channel_id: '',
                  channel_secret: '',
                  channel_access_token: '',
                  line_phone: '',
                  proxy_url: '',
                });
                setIsCreateOpen(true);
              }}
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Thêm tài khoản LINE
            </Button>
          </div>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6 text-sm">
          {error}
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200/60">
          <div className="text-2xl font-bold">{totalCount}</div>
          <div className="text-xs font-medium opacity-80">Tổng tài khoản LINE</div>
        </div>
        <div className="rounded-xl p-3.5 bg-[#06C755]/10 text-[#06C755] border border-[#06C755]/25">
          <div className="text-2xl font-bold">{activeOaCount}</div>
          <div className="text-xs font-medium">LINE OA Bot đang hoạt động</div>
        </div>
        <div className="rounded-xl p-3.5 bg-teal-50 text-teal-700 border border-teal-200/60">
          <div className="text-2xl font-bold">{activePersonalCount}</div>
          <div className="text-xs font-medium">Nick LINE Cá nhân (QR)</div>
        </div>
        <div className="rounded-xl p-3.5 bg-blue-50 text-blue-700 border border-blue-200/60">
          <div className="text-2xl font-bold">
            {totalQuotaUsed.toLocaleString()}
            {totalQuotaLimit > 0 ? ` / ${totalQuotaLimit.toLocaleString()}` : ''}
          </div>
          <div className="text-xs font-medium opacity-80">Tổng Push Quota đã dùng</div>
        </div>
      </div>

      {/* Filter by Account Type */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { key: 'ALL', label: `Tất cả (${accounts.length})` },
          {
            key: 'OA',
            label: `LINE OA - Official (${accounts.filter((a) => a.account_type === 'OA').length})`,
          },
          {
            key: 'PERSONAL',
            label: `LINE Cá nhân - QR (${accounts.filter((a) => a.account_type === 'PERSONAL').length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTypeFilter(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              typeFilter === tab.key
                ? 'bg-[#06C755] text-white shadow-sm'
                : 'bg-surface-muted text-text-secondary hover:bg-gray-200/70'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredAccounts}
        isLoading={loading}
        emptyMessage="Chưa có tài khoản LINE nào được kết nối."
      />

      {/* Create Modal with 2-Mode Switcher */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">
                Thêm Tài khoản LINE Mới
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {/* 2-Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_type: 'OA' })}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                    form.account_type === 'OA'
                      ? 'bg-[#06C755] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Bot className="w-4 h-4 shrink-0" />
                  <span>Chế độ 1: LINE Official Account (Bot OA)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_type: 'PERSONAL' })}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition-all ${
                    form.account_type === 'PERSONAL'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Chế độ 2: LINE Cá nhân (Quét QR)</span>
                </button>
              </div>

              {/* CS Owner */}
              {isAdminOrManager ? (
                <Input
                  label="CS phụ trách (User ID) *"
                  type="number"
                  required
                  value={form.cs_id || ''}
                  onChange={(e) =>
                    setForm({ ...form, cs_id: parseInt(e.target.value, 10) || 0 })
                  }
                  placeholder="ID nhân viên CS"
                />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
                  <span className="text-gray-500 block mb-0.5">CS phụ trách:</span>
                  <span className="font-semibold text-gray-800">
                    {user?.name || user?.email}
                  </span>
                  <span className="text-gray-400 ml-2">(ID: {user?.id})</span>
                </div>
              )}

              {form.account_type === 'OA' ? (
                /* ── Chế độ 1: LINE Official Account (Bot OA - Chính thống) ── */
                <div className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/70 text-xs text-emerald-900">
                    <strong>Khuyên dùng cho CSKH tự động:</strong> LINE Official Account chính thống không bao giờ bị khóa nick, hỗ trợ Reply miễn phí (0 quota) và Push tự động có chống trùng lặp.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Tên hiển thị Bot OA *"
                      required
                      value={form.display_name || ''}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder="VD: Edura CSKH Official"
                    />
                    <Input
                      label="Basic ID (@xxx)"
                      value={form.basic_id || ''}
                      onChange={(e) => setForm({ ...form, basic_id: e.target.value })}
                      placeholder="VD: @edura"
                    />
                  </div>
                  <Input
                    label="Channel ID *"
                    required
                    value={form.channel_id || ''}
                    onChange={(e) => setForm({ ...form, channel_id: e.target.value })}
                    placeholder="VD: 2001234567"
                  />
                  <Input
                    label="Channel Secret *"
                    type="password"
                    required
                    value={form.channel_secret || ''}
                    onChange={(e) => setForm({ ...form, channel_secret: e.target.value })}
                    placeholder="Nhập Channel Secret từ LINE Developers"
                  />
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Channel Access Token (Long-lived) *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={form.channel_access_token || ''}
                      onChange={(e) =>
                        setForm({ ...form, channel_access_token: e.target.value })
                      }
                      placeholder="Dán Channel Access Token từ LINE Developers Console..."
                      className="w-full px-3 py-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              ) : (
                /* ── Chế độ 2: LINE Cá nhân (Quét mã QR - Tương tự Zalo) ── */
                <div className="space-y-3.5">
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/70 text-xs text-amber-900">
                    <strong>Chế độ LINE Cá nhân (QR):</strong> Sau khi tạo, hệ thống sẽ mở hộp thoại quét mã QR và hiển thị <strong>Mã PIN 6 số (Letter Sealing E2EE)</strong> để bạn nhập lên điện thoại.
                  </div>
                  <Input
                    label="Tên hiển thị Nick LINE *"
                    required
                    value={form.display_name || ''}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="VD: LINE CSKH An"
                  />
                  <Input
                    label="Số điện thoại LINE"
                    value={form.line_phone || ''}
                    onChange={(e) => setForm({ ...form, line_phone: e.target.value })}
                    placeholder="VD: 0901234567 hoặc +81901234567"
                  />
                  <Input
                    label="Proxy URL (tùy chọn)"
                    value={form.proxy_url || ''}
                    onChange={(e) => setForm({ ...form, proxy_url: e.target.value })}
                    placeholder="http://user:pass@proxy:port"
                  />
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-gray-100">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Hủy
                </Button>
                <Button variant="primary" type="submit" isLoading={formLoading}>
                  {form.account_type === 'OA'
                    ? 'Kết nối LINE OA'
                    : 'Tạo & Quét mã QR'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Login Dialog (for PERSONAL) */}
      {qrAccount && (
        <LineQrLoginDialog
          account={qrAccount}
          onClose={() => setQrAccount(null)}
          onSuccess={() => {
            setQrAccount(null);
            fetchAccounts();
          }}
        />
      )}

      {/* OA Config & Webhook Dialog (for OA) */}
      {oaConfigAccount && (
        <LineOaConfigDialog
          account={oaConfigAccount}
          onClose={() => setOaConfigAccount(null)}
          onSuccess={() => {
            setOaConfigAccount(null);
            fetchAccounts();
          }}
        />
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Xóa tài khoản LINE?
              </h3>
              <p className="text-sm text-gray-500">
                Tài khoản{' '}
                <strong>{deleteTarget.display_name || `#${deleteTarget.id}`}</strong> sẽ
                bị xóa khỏi hệ thống.
              </p>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Xóa tài khoản
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
