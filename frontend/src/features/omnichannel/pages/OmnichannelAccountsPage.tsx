import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { lineApi } from '../../line/api/line.api';
import { omnichannelApi } from '../api/omnichannel.api';
import type {
  ZaloAccount,
  CreateZaloAccountDTO,
  ZaloSocketStatusEvent,
} from '../../zalo/types/zalo.types';
import { ZALO_STATUS_LABELS, ZALO_STATUS_COLORS } from '../../zalo/types/zalo.types';
import type {
  LineAccount,
  CreateLineAccountDTO,
  LineSocketStatusEvent,
} from '../../line/types/line.types';
import { LINE_STATUS_LABELS, LINE_STATUS_COLORS } from '../../line/types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { QrLoginDialog } from '../../zalo/components/QrLoginDialog';
import { LineQrLoginDialog } from '../../line/components/LineQrLoginDialog';
import { LineOaConfigDialog } from '../../line/components/LineOaConfigDialog';
import {
  ChannelSecurityLimitsDialog,
  type SecurityDialogTargetAccount,
} from '../components/ChannelSecurityLimitsDialog';
import { useSocket } from '../../../hooks/useSocket';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Plus,
  QrCode,
  Trash2,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  Bot,
  Smartphone,
  Settings,
  Server,
  MessageSquare,
  Layers,
} from 'lucide-react';

type ChannelFilterTab = 'ALL' | 'ZALO_PERSONAL' | 'LINE_OA' | 'LINE_PERSONAL';

interface UnifiedAccountRow {
  uidKey: string;
  platform: 'ZALO' | 'LINE';
  accountType: 'ZALO_PERSONAL' | 'OA' | 'PERSONAL';
  id: number;
  displayName: string;
  uidOrMid: string | null;
  phone: string | null;
  avatarUrl: string | null;
  csName: string;
  csCode: string | null;
  status: string;
  statusLabel: string;
  statusColor: string;
  proxyUrl: string | null;
  monthlyQuota: number | null;
  monthlyConsumption: number | null;
  lastConnectedAt: string | null;
  rawZalo?: ZaloAccount;
  rawLine?: LineAccount;
}

export const OmnichannelAccountsPage: React.FC<{ initialChannel?: ChannelFilterTab }> = ({
  initialChannel,
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const initialTabFromQuery = useMemo<ChannelFilterTab>(() => {
    if (initialChannel) return initialChannel;
    const ch = searchParams.get('channel')?.toUpperCase();
    if (ch === 'ZALO') return 'ZALO_PERSONAL';
    if (ch === 'LINE_OA') return 'LINE_OA';
    if (ch === 'LINE_PERSONAL' || ch === 'LINE') return 'LINE_PERSONAL';
    return 'ALL';
  }, [initialChannel, searchParams]);

  const [activeFilter, setActiveFilter] = useState<ChannelFilterTab>(initialTabFromQuery);
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([]);
  const [lineAccounts, setLineAccounts] = useState<LineAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingRowKey, setSyncingRowKey] = useState<string | null>(null);
  const [reconnectingRowKey, setReconnectingRowKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [securityTarget, setSecurityTarget] = useState<SecurityDialogTargetAccount | null>(null);
  const [zaloQrTarget, setZaloQrTarget] = useState<ZaloAccount | null>(null);
  const [lineQrTarget, setLineQrTarget] = useState<LineAccount | null>(null);
  const [lineOaTarget, setLineOaTarget] = useState<LineAccount | null>(null);

  // Quick Add Account Modal
  const [createChannelType, setCreateChannelType] = useState<
    'ZALO' | 'LINE_OA' | 'LINE_PERSONAL' | null
  >(null);
  const [zaloForm, setZaloForm] = useState<CreateZaloAccountDTO>({
    cs_id: user?.id || 0,
    display_name: '',
    zalo_phone: '',
    proxy_url: '',
  });
  const [lineForm, setLineForm] = useState<CreateLineAccountDTO>({
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
  const [creating, setCreating] = useState(false);

  const fetchAllAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const [zRes, lRes] = await Promise.allSettled([
        zaloApi.listAccounts(),
        lineApi.listAccounts(),
      ]);
      if (zRes.status === 'fulfilled') {
        setZaloAccounts(Array.isArray(zRes.value) ? zRes.value : []);
      }
      if (lRes.status === 'fulfilled') {
        setLineAccounts(Array.isArray(lRes.value) ? lRes.value : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllAccounts();
  }, [fetchAllAccounts]);

  // Socket.IO live status updates for both Zalo & LINE
  const { on, off } = useSocket();
  const handleZaloStatus = useCallback((evt: ZaloSocketStatusEvent) => {
    setZaloAccounts((prev) =>
      prev.map((a) =>
        a.id === evt.accountId ? { ...a, liveStatus: evt.status as ZaloAccount['liveStatus'] } : a,
      ),
    );
  }, []);

  const handleLineStatus = useCallback((evt: LineSocketStatusEvent) => {
    setLineAccounts((prev) =>
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

  useEffect(() => {
    on('zalo:status', handleZaloStatus);
    on('line:status', handleLineStatus);
    return () => {
      off('zalo:status', handleZaloStatus);
      off('line:status', handleLineStatus);
    };
  }, [on, off, handleZaloStatus, handleLineStatus]);

  // Build unified rows
  const unifiedRows = useMemo<UnifiedAccountRow[]>(() => {
    const zRows: UnifiedAccountRow[] = zaloAccounts.map((z) => {
      const st = z.liveStatus || z.status;
      const csCode = z.cs?.staff_code || z.cs?.code || null;
      return {
        uidKey: `ZALO-${z.id}`,
        platform: 'ZALO',
        accountType: 'ZALO_PERSONAL',
        id: z.id,
        displayName: z.display_name || `Zalo #${z.id}`,
        uidOrMid: z.zalo_uid,
        phone: z.zalo_phone,
        avatarUrl: z.avatar_url,
        csName: z.cs?.full_name || z.cs?.name || (z.cs_id ? `CSKH #${z.cs_id}` : 'Chưa gán'),
        csCode,
        status: st,
        statusLabel: ZALO_STATUS_LABELS[st] || st,
        statusColor: ZALO_STATUS_COLORS[st] || 'bg-gray-100 text-gray-600',
        proxyUrl: z.proxy_url,
        monthlyQuota: null,
        monthlyConsumption: null,
        lastConnectedAt: z.last_connected_at,
        rawZalo: z,
      };
    });

    const lRows: UnifiedAccountRow[] = lineAccounts.map((l) => {
      const st = l.liveStatus || l.status;
      const csCode = l.cs?.staff_code || l.cs?.code || null;
      return {
        uidKey: `LINE-${l.id}`,
        platform: 'LINE',
        accountType: l.account_type,
        id: l.id,
        displayName:
          l.display_name || (l.account_type === 'OA' ? `LINE OA #${l.id}` : `LINE #${l.id}`),
        uidOrMid: l.basic_id || l.line_mid,
        phone: l.line_phone,
        avatarUrl: l.avatar_url,
        csName: l.cs?.full_name || l.cs?.name || (l.cs_id ? `CSKH #${l.cs_id}` : 'Chưa gán'),
        csCode,
        status: st,
        statusLabel: LINE_STATUS_LABELS[st] || st,
        statusColor: LINE_STATUS_COLORS[st] || 'bg-gray-100 text-gray-600',
        proxyUrl: l.proxy_url,
        monthlyQuota: l.monthly_quota ?? (l.account_type === 'OA' ? 200 : null),
        monthlyConsumption: l.monthly_consumption ?? (l.account_type === 'OA' ? 0 : null),
        lastConnectedAt: l.last_connected_at,
        rawLine: l,
      };
    });

    return [...zRows, ...lRows];
  }, [zaloAccounts, lineAccounts]);

  const filteredRows = useMemo(() => {
    return unifiedRows.filter((row) => {
      if (activeFilter === 'ZALO_PERSONAL' && row.accountType !== 'ZALO_PERSONAL') return false;
      if (activeFilter === 'LINE_OA' && row.accountType !== 'OA') return false;
      if (activeFilter === 'LINE_PERSONAL' && row.accountType !== 'PERSONAL') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = row.displayName.toLowerCase().includes(q);
        const matchPhone = (row.phone || '').toLowerCase().includes(q);
        const matchUid = (row.uidOrMid || '').toLowerCase().includes(q);
        const matchCs = row.csName.toLowerCase().includes(q);
        return matchName || matchPhone || matchUid || matchCs;
      }
      return true;
    });
  }, [unifiedRows, activeFilter, searchQuery]);

  // KPI metrics
  const activeZaloCount = zaloAccounts.filter(
    (a) => (a.liveStatus || a.status) === 'ACTIVE',
  ).length;
  const activeLineOaCount = lineAccounts.filter(
    (a) => a.account_type === 'OA' && (a.liveStatus || a.status) === 'ACTIVE',
  ).length;
  const activeLinePersonalCount = lineAccounts.filter(
    (a) => a.account_type === 'PERSONAL' && (a.liveStatus || a.status) === 'ACTIVE',
  ).length;
  const totalActiveAccounts = activeZaloCount + activeLineOaCount + activeLinePersonalCount;
  const proxyPinnedCount = unifiedRows.filter((r) => Boolean(r.proxyUrl)).length;
  const lineOaQuotaUsed = lineAccounts
    .filter((a) => a.account_type === 'OA')
    .reduce((s, a) => s + (a.monthly_consumption || 0), 0);
  const lineOaQuotaMax = lineAccounts
    .filter((a) => a.account_type === 'OA')
    .reduce((s, a) => s + (a.monthly_quota || 200), 0);

  const handleSyncRow = async (row: UnifiedAccountRow) => {
    setSyncingRowKey(row.uidKey);
    try {
      if (row.platform === 'ZALO') {
        const [frRes, grRes] = await Promise.allSettled([
          zaloApi.syncFriends(row.id),
          zaloApi.refreshGroups(row.id),
        ]);
        const grCount = grRes.status === 'fulfilled' ? grRes.value?.synced ?? 0 : 0;
        const frLoaded = frRes.status === 'fulfilled';
        const matchReport = await omnichannelApi
          .syncAndMatchCareGroups({ refreshLiveGroups: false })
          .catch(() => null);
        const newlyMatched = matchReport?.newlyLinkedZaloCount ?? 0;
        toast.success(
          `Đã đồng bộ Zalo (${frLoaded ? 'Danh bạ + ' : ''}${grCount} nhóm${newlyMatched > 0 ? `, tự động gắn mới +${newlyMatched} nhóm chăm sóc` : ''})`,
        );
      } else {
        const [frRes, grRes] = await Promise.allSettled([
          lineApi.syncFriends(row.id),
          lineApi.syncGroups(row.id),
        ]);
        const frCount =
          frRes.status === 'fulfilled'
            ? frRes.value?.synced ?? frRes.value?.upserted ?? 0
            : 0;
        const grCount = grRes.status === 'fulfilled' ? grRes.value?.synced ?? 0 : 0;
        const matchReport = await omnichannelApi
          .syncAndMatchCareGroups({ refreshLiveGroups: false })
          .catch(() => null);
        const newlyMatched = matchReport?.newlyLinkedLineCount ?? 0;
        toast.success(
          `Đã đồng bộ LINE (${frCount} liên hệ, ${grCount} nhóm${newlyMatched > 0 ? `, tự động gắn mới +${newlyMatched} nhóm chăm sóc` : ''})`,
        );
      }
      fetchAllAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Đồng bộ thất bại');
    } finally {
      setSyncingRowKey(null);
    }
  };

  const handleDisconnectRow = async (row: UnifiedAccountRow) => {
    try {
      if (row.platform === 'ZALO') {
        await zaloApi.disconnect(row.id);
      } else {
        await lineApi.disconnectAccount(row.id);
      }
      toast.success(`Đã ngắt kết nối ${row.displayName}`);
      fetchAllAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể ngắt kết nối');
    }
  };

  const handleReconnectRow = async (row: UnifiedAccountRow) => {
    setReconnectingRowKey(row.uidKey);
    try {
      if (row.platform === 'ZALO') {
        await zaloApi.reconnect(row.id);
        toast.success(`Đã kích hoạt kết nối lại cho ${row.displayName}`);
        await fetchAllAccounts();
      } else {
        const res = await lineApi.reconnectAccount(row.id);
        if (res && res.reconnected === false) {
          toast.warning(
            'Phiên đăng nhập LINE đã hết hạn hoàn toàn. Vui lòng quét mã QR mới để kết nối lại.',
          );
          if (row.rawLine && row.accountType === 'PERSONAL') {
            setLineQrTarget(row.rawLine);
          }
        } else {
          toast.success(`Đã kết nối lại ${row.displayName}`);
        }
        await fetchAllAccounts();
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Phiên đã hết hạn hoàn toàn — vui lòng quét mã QR mới để kết nối lại.';
      toast.warning(String(msg));
      if (row.platform === 'ZALO' && row.rawZalo) {
        setZaloQrTarget(row.rawZalo);
      } else if (row.platform === 'LINE' && row.accountType === 'PERSONAL' && row.rawLine) {
        setLineQrTarget(row.rawLine);
      }
    } finally {
      setReconnectingRowKey(null);
    }
  };

  const handleDeleteRow = async (row: UnifiedAccountRow) => {
    if (!window.confirm(`Xác nhận xóa tài khoản "${row.displayName}"?`)) return;
    try {
      if (row.platform === 'ZALO') {
        await zaloApi.removeAccount(row.id);
      } else {
        await lineApi.deleteAccount(row.id);
      }
      toast.success(`Đã xóa tài khoản ${row.displayName}`);
      fetchAllAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể xóa tài khoản');
    }
  };

  const handleCreateQuickAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createChannelType) return;
    setCreating(true);
    try {
      if (createChannelType === 'ZALO') {
        const created = await zaloApi.createAccount(zaloForm);
        toast.success('Đã thêm tài khoản Zalo — hãy quét mã QR để kết nối');
        setCreateChannelType(null);
        await fetchAllAccounts();
        if (created) setZaloQrTarget(created);
      } else {
        const created = await lineApi.createAccount({
          ...lineForm,
          account_type: createChannelType === 'LINE_OA' ? 'OA' : 'PERSONAL',
        });
        toast.success(
          createChannelType === 'LINE_OA'
            ? 'Đã thêm tài khoản LINE Official Account (OA)'
            : 'Đã thêm tài khoản LINE Cá nhân — hãy quét mã QR trên điện thoại',
        );
        setCreateChannelType(null);
        await fetchAllAccounts();
        if (createChannelType === 'LINE_PERSONAL' && created) {
          setLineQrTarget(created);
        } else if (createChannelType === 'LINE_OA' && created) {
          setLineOaTarget(created);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tạo tài khoản');
    } finally {
      setCreating(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Tài khoản & Bảo mật Đa kênh (Zalo & LINE)"
        description="Quản lý tập trung toàn bộ tài khoản Zalo Cá nhân, LINE Official Account (OA) và LINE Cá nhân cùng cài đặt Proxy, giới hạn gửi tin & đồng bộ nhóm chăm sóc."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllAccounts}
              isLoading={loading}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Làm mới
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setZaloForm({
                  cs_id: user?.id || 0,
                  display_name: '',
                  zalo_phone: '',
                  proxy_url: '',
                });
                setCreateChannelType('ZALO');
              }}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              + Thêm Zalo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setLineForm({
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
                setCreateChannelType('LINE_OA');
              }}
              leftIcon={<Bot className="w-4 h-4" />}
            >
              + Thêm LINE OA
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setLineForm({
                  cs_id: user?.id || 0,
                  account_type: 'PERSONAL',
                  display_name: '',
                  line_phone: '',
                  proxy_url: '',
                });
                setCreateChannelType('LINE_PERSONAL');
              }}
              leftIcon={<Smartphone className="w-4 h-4" />}
            >
              + Thêm LINE Cá nhân
            </Button>
          </div>
        }
      />

      {/* Unified KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500">Tổng tài khoản đang kết nối</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalActiveAccounts}</span>
            <span className="text-xs text-gray-500">/ {unifiedRows.length} tài khoản</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-700">Zalo Cá nhân</span>
            <MessageSquare className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-700">{activeZaloCount}</span>
            <span className="text-xs text-gray-500">/ {zaloAccounts.length} đang hoạt động</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700">LINE Official Account (OA)</span>
            <Bot className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-700">{activeLineOaCount}</span>
            <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
              Đã gửi: {lineOaQuotaUsed}/{lineOaQuotaMax || 200} tin
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-green-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-green-700">LINE Cá nhân</span>
            <Smartphone className="w-4 h-4 text-green-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-green-700">{activeLinePersonalCount}</span>
            <span className="text-xs text-gray-500">
              / {lineAccounts.filter((a) => a.account_type === 'PERSONAL').length} đang hoạt động
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Bảo vệ & Kết nối Proxy</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-bold text-emerald-400">An toàn</span>
            <span className="text-[11px] text-slate-300">
              {proxyPinnedCount}/{unifiedRows.length} dùng Proxy riêng
            </span>
          </div>
        </div>
      </div>

      {/* 4 Clean Channel Filter Tabs & Search */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'ALL', label: `Tất cả tài khoản (${unifiedRows.length})` },
            { key: 'ZALO_PERSONAL', label: `Zalo Cá nhân (${zaloAccounts.length})` },
            {
              key: 'LINE_OA',
              label: `LINE Official Account (OA) (${lineAccounts.filter((a) => a.account_type === 'OA').length})`,
            },
            {
              key: 'LINE_PERSONAL',
              label: `LINE Cá nhân (${lineAccounts.filter((a) => a.account_type === 'PERSONAL').length})`,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key as ChannelFilterTab)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeFilter === tab.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="w-full md:w-72">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên tài khoản, SĐT, nhân viên CSKH..."
          />
        </div>
      </div>

      {/* Unified Accounts Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/90 border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Tài khoản & Kênh</th>
                <th className="py-3.5 px-4">Nhân viên CSKH</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Kết nối mạng</th>
                <th className="py-3.5 px-4">Giới hạn bảo vệ tài khoản</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Đang tải danh sách tài khoản Zalo & LINE...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    Chưa có tài khoản nào khớp bộ lọc. Hãy nhấn <strong>+ Thêm Zalo</strong> hoặc{' '}
                    <strong>+ Thêm LINE</strong> ở góc trên.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const quotaPct =
                    row.accountType === 'OA' && row.monthlyQuota
                      ? Math.min(
                          100,
                          Math.round(((row.monthlyConsumption || 0) / row.monthlyQuota) * 100),
                        )
                      : null;
                  const isRowSyncing = syncingRowKey === row.uidKey;
                  const isRowReconnecting = reconnectingRowKey === row.uidKey;
                  const canReconnect =
                    (row.accountType === 'ZALO_PERSONAL' || row.accountType === 'PERSONAL') &&
                    ['EXPIRED', 'NOT_LOGGED_IN', 'DISCONNECTED', 'ERROR'].includes(row.status);

                  return (
                    <tr key={row.uidKey} className="hover:bg-gray-50/70 transition-colors">
                      {/* Account & Channel Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {row.avatarUrl ? (
                            <img
                              src={row.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                            />
                          ) : (
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                row.platform === 'ZALO'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {row.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{row.displayName}</span>
                              {row.accountType === 'ZALO_PERSONAL' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                                  Zalo Cá nhân
                                </span>
                              )}
                              {row.accountType === 'OA' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  LINE Official Account (OA)
                                </span>
                              )}
                              {row.accountType === 'PERSONAL' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                                  LINE Cá nhân
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {row.uidOrMid || `Mã #${row.id}`}
                              {row.phone ? ` · SĐT: ${row.phone}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Owner CS */}
                      <td className="py-3.5 px-4 text-xs font-medium text-gray-700">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{row.csName}</span>
                          {row.csCode && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[10px] font-bold">
                              {row.csCode}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${row.statusColor}`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>

                      {/* Proxy Status */}
                      <td className="py-3.5 px-4">
                        {row.proxyUrl ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Server className="w-3.5 h-3.5" />
                            Dùng Proxy riêng
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600">
                            Mạng trực tiếp
                          </span>
                        )}
                      </td>

                      {/* Daily Rate Limit / Monthly Quota */}
                      <td className="py-3.5 px-4">
                        {row.accountType === 'OA' && quotaPct !== null ? (
                          <div className="w-44">
                            <div className="flex justify-between text-[11px] font-semibold text-emerald-800 mb-1">
                              <span>Tin nhắn tháng</span>
                              <span>
                                {row.monthlyConsumption || 0}/{row.monthlyQuota || 200} ({quotaPct}
                                %)
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${quotaPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600">
                            <div className="font-semibold text-gray-800">
                              {row.platform === 'ZALO'
                                ? 'Tra cứu SĐT: 60 lần/ngày'
                                : 'Tra cứu SĐT: 20 lần/ngày'}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Tự động giãn cách chống khóa
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Reconnect using saved session */}
                          {canReconnect && (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={isRowReconnecting}
                              onClick={() => handleReconnectRow(row)}
                              title="Kết nối lại từ phiên đã lưu mà không cần quét QR"
                              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-emerald-600" />}
                            >
                              Kết nối lại
                            </Button>
                          )}

                          {/* QR Login for Zalo or LINE Personal when not active */}
                          {row.accountType === 'ZALO_PERSONAL' &&
                            row.status !== 'ACTIVE' &&
                            row.rawZalo && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setZaloQrTarget(row.rawZalo!)}
                                title="Quét mã QR để đăng nhập Zalo"
                                leftIcon={<QrCode className="w-3.5 h-3.5" />}
                              >
                                Quét QR
                              </Button>
                            )}

                          {row.accountType === 'PERSONAL' &&
                            row.status !== 'ACTIVE' &&
                            row.rawLine && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setLineQrTarget(row.rawLine!)}
                                title="Quét mã QR để đăng nhập LINE Cá nhân"
                                leftIcon={<QrCode className="w-3.5 h-3.5" />}
                              >
                                Quét QR
                              </Button>
                            )}

                          {/* OA Webhook & Credentials Config */}
                          {row.accountType === 'OA' && row.rawLine && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setLineOaTarget(row.rawLine!)}
                              title="Cấu hình kết nối LINE Official Account"
                              leftIcon={<Settings className="w-3.5 h-3.5 text-emerald-700" />}
                            >
                              Cấu hình OA
                            </Button>
                          )}

                          {/* Sync Groups & Contacts */}
                          {row.status === 'ACTIVE' && (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={isRowSyncing}
                              onClick={() => handleSyncRow(row)}
                              title="Đồng bộ Nhóm, Danh bạ và tự động gắn nhóm chăm sóc cho học viên"
                              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
                            >
                              Đồng bộ Nhóm & Danh bạ
                            </Button>
                          )}

                          {/* Proxy & Limits */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSecurityTarget({
                                platform: row.platform,
                                accountId: row.id,
                                displayName: row.displayName,
                                uidOrMid: row.uidOrMid,
                                accountType: row.accountType,
                                proxyUrl: row.proxyUrl,
                                monthlyQuota: row.monthlyQuota,
                                monthlyConsumption: row.monthlyConsumption,
                                status: row.status,
                              })
                            }
                            title="Cài đặt Proxy, giới hạn gửi tin và sao lưu phiên"
                            leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />}
                          >
                            Cài đặt Proxy & Giới hạn
                          </Button>

                          {/* Disconnect */}
                          {row.status === 'ACTIVE' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDisconnectRow(row)}
                              title="Ngắt kết nối tài khoản này"
                              leftIcon={<WifiOff className="w-3.5 h-3.5 text-amber-600" />}
                            >
                              Ngắt kết nối
                            </Button>
                          )}

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRow(row)}
                            title="Xóa tài khoản"
                            leftIcon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                          >
                            Xóa
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Create Account Modal */}
      {createChannelType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              {createChannelType === 'ZALO'
                ? 'Thêm Tài khoản Zalo Cá nhân'
                : createChannelType === 'LINE_OA'
                  ? 'Thêm Tài khoản LINE Official Account (OA)'
                  : 'Thêm Tài khoản LINE Cá nhân (Quét mã QR)'}
            </h3>

            <form onSubmit={handleCreateQuickAccount} className="space-y-3">
              {createChannelType === 'ZALO' ? (
                <>
                  <Input
                    label="Tên hiển thị (Để dễ phân biệt)"
                    value={zaloForm.display_name || ''}
                    onChange={(e) => setZaloForm({ ...zaloForm, display_name: e.target.value })}
                    placeholder="VD: Zalo CSKH 01 - Hải Yến"
                  />
                  <Input
                    label="Số điện thoại đăng ký Zalo"
                    value={zaloForm.zalo_phone || ''}
                    onChange={(e) => setZaloForm({ ...zaloForm, zalo_phone: e.target.value })}
                    placeholder="0901234567"
                  />
                  <Input
                    label="Địa chỉ Proxy riêng (Tùy chọn)"
                    value={zaloForm.proxy_url || ''}
                    onChange={(e) => setZaloForm({ ...zaloForm, proxy_url: e.target.value })}
                    placeholder="http://user:pass@ip:port (bỏ trống nếu dùng mạng trực tiếp)"
                  />
                </>
              ) : createChannelType === 'LINE_OA' ? (
                <>
                  <Input
                    label="Tên kênh LINE Official Account"
                    value={lineForm.display_name || ''}
                    onChange={(e) => setLineForm({ ...lineForm, display_name: e.target.value })}
                    placeholder="VD: Edura CSKH Official"
                    required
                  />
                  <Input
                    label="Mã LINE ID (VD: @edura)"
                    value={lineForm.basic_id || ''}
                    onChange={(e) => setLineForm({ ...lineForm, basic_id: e.target.value })}
                    placeholder="@edura"
                  />
                  <Input
                    label="Channel ID"
                    value={lineForm.channel_id || ''}
                    onChange={(e) => setLineForm({ ...lineForm, channel_id: e.target.value })}
                    placeholder="2001234567"
                  />
                  <Input
                    label="Channel Secret"
                    value={lineForm.channel_secret || ''}
                    onChange={(e) => setLineForm({ ...lineForm, channel_secret: e.target.value })}
                    placeholder="Nhập Channel Secret từ trang quản trị LINE"
                  />
                  <Input
                    label="Channel Access Token"
                    value={lineForm.channel_access_token || ''}
                    onChange={(e) =>
                      setLineForm({ ...lineForm, channel_access_token: e.target.value })
                    }
                    placeholder="Nhập mã kết nối Channel Access Token"
                  />
                </>
              ) : (
                <>
                  <Input
                    label="Tên hiển thị LINE Cá nhân"
                    value={lineForm.display_name || ''}
                    onChange={(e) => setLineForm({ ...lineForm, display_name: e.target.value })}
                    placeholder="VD: LINE CSKH 01 - Hải Yến"
                  />
                  <Input
                    label="Số điện thoại LINE"
                    value={lineForm.line_phone || ''}
                    onChange={(e) => setLineForm({ ...lineForm, line_phone: e.target.value })}
                    placeholder="0901234567"
                  />
                  <Input
                    label="Địa chỉ Proxy riêng (Tùy chọn)"
                    value={lineForm.proxy_url || ''}
                    onChange={(e) => setLineForm({ ...lineForm, proxy_url: e.target.value })}
                    placeholder="http://user:pass@ip:port (bỏ trống nếu dùng mạng trực tiếp)"
                  />
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateChannelType(null)}
                >
                  Hủy
                </Button>
                <Button type="submit" isLoading={creating}>
                  Tạo tài khoản
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security / Proxy / Rate Limit Modal */}
      {securityTarget && (
        <ChannelSecurityLimitsDialog
          account={securityTarget}
          onClose={() => setSecurityTarget(null)}
          onUpdated={fetchAllAccounts}
        />
      )}

      {/* Zalo QR Login Dialog */}
      {zaloQrTarget && (
        <QrLoginDialog
          account={zaloQrTarget}
          onClose={() => setZaloQrTarget(null)}
          onSuccess={() => {
            setZaloQrTarget(null);
            fetchAllAccounts();
          }}
        />
      )}

      {/* LINE Personal QR Login Dialog */}
      {lineQrTarget && (
        <LineQrLoginDialog
          account={lineQrTarget}
          onClose={() => setLineQrTarget(null)}
          onSuccess={() => {
            setLineQrTarget(null);
            fetchAllAccounts();
          }}
        />
      )}

      {/* LINE OA Webhook & Credentials Dialog */}
      {lineOaTarget && (
        <LineOaConfigDialog
          account={lineOaTarget}
          onClose={() => setLineOaTarget(null)}
          onSuccess={() => {
            setLineOaTarget(null);
            fetchAllAccounts();
          }}
        />
      )}
    </PageContainer>
  );
};
