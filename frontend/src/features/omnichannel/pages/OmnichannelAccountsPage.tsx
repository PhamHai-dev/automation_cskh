import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { zaloApi } from '../../zalo/api/zalo.api';
import { normalizeZaloStatus } from '../../zalo/utils/zaloAccountStatus';
import { lineApi } from '../../line/api/line.api';
import { omnichannelApi } from '../api/omnichannel.api';
import type {
  ZaloAccount,
  CreateZaloAccountDTO,
  ZaloSocketStatusEvent,
} from '../../zalo/types/zalo.types';
import type {
  LineAccount,
  CreateLineAccountDTO,
  LineSocketStatusEvent,
} from '../../line/types/line.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, type Column } from '../../../components/common/DataTable';
import { Badge, type BadgeProps } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
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
import { useSocket, useAccountSubscriptions } from '../../../hooks/useSocket';
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
  proxyUrl: string | null;
  monthlyQuota: number | null;
  monthlyConsumption: number | null;
  lastConnectedAt: string | null;
  rawZalo?: ZaloAccount;
  rawLine?: LineAccount;
}

const ACCOUNT_STATUSES: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  ACTIVE: { label: 'Đã kết nối', variant: 'success' },
  NOT_LOGGED_IN: { label: 'Chưa đăng nhập', variant: 'neutral' },
  QR_PENDING: { label: 'Chờ quét QR', variant: 'warning' },
  PIN_REQUIRED: { label: 'Chờ nhập PIN', variant: 'warning' },
  CONNECTING: { label: 'Đang kết nối', variant: 'info' },
  EXPIRED: { label: 'Phiên hết hạn', variant: 'warning' },
  BANNED: { label: 'Bị hạn chế', variant: 'danger' },
  DISABLED: { label: 'Vô hiệu hóa', variant: 'neutral' },
  DISCONNECTED: { label: 'Mất kết nối', variant: 'warning' },
  ERROR: { label: 'Lỗi kết nối', variant: 'danger' },
};

function hasUsageDetails(row: UnifiedAccountRow): boolean {
  return row.accountType === 'OA' &&
    row.monthlyQuota !== null && Number.isFinite(row.monthlyQuota) && row.monthlyQuota >= 0 &&
    row.monthlyConsumption !== null && Number.isFinite(row.monthlyConsumption) && row.monthlyConsumption >= 0;
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
  useAccountSubscriptions('zalo', zaloAccounts.map((a) => a.id));
  useAccountSubscriptions('line', lineAccounts.map((a) => a.id));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    setLoadError(null);
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
      const failed = [zRes.status === 'rejected' ? 'Zalo' : '', lRes.status === 'rejected' ? 'LINE' : ''].filter(Boolean);
      if (failed.length) setLoadError(`Không tải được tài khoản ${failed.join(' và ')}. Vui lòng thử lại.`);
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
        a.id === evt.accountId ? { ...a, liveStatus: normalizeZaloStatus(evt.status) } : a,
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
              display_name: evt.displayName !== undefined ? evt.displayName : a.display_name,
              line_mid: evt.lineMid !== undefined ? evt.lineMid : a.line_mid,
              avatar_url: evt.avatarUrl !== undefined ? evt.avatarUrl : a.avatar_url,
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
      const st = normalizeZaloStatus(z.liveStatus) || z.status;
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
        csName: z.cs?.full_name || z.cs?.name || (z.cs_id ? `CVHT #${z.cs_id}` : 'Chưa gán'),
        csCode,
        status: st,
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
        csName: l.cs?.full_name || l.cs?.name || (l.cs_id ? `CVHT #${l.cs_id}` : 'Chưa gán'),
        csCode,
        status: st,
        proxyUrl: l.proxy_url,
        monthlyQuota: l.monthly_quota ?? null,
        monthlyConsumption: l.monthly_consumption ?? null,
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
    (a) => (normalizeZaloStatus(a.liveStatus) || a.status) === 'ACTIVE',
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
    .reduce((s, a) => s + (a.monthly_quota ?? 0), 0);
  const lineOaRows = unifiedRows.filter((row) => row.accountType === 'OA');
  const lineOaUsageKnown = lineOaRows.length > 0 && lineOaRows.every(hasUsageDetails);

  const handleSyncRow = async (row: UnifiedAccountRow) => {
    setSyncingRowKey(row.uidKey);
    try {
      if (row.platform === 'ZALO') {
        const [frRes, grRes] = await Promise.allSettled([
          zaloApi.syncFriends(row.id),
          zaloApi.refreshGroups(row.id),
        ]);
        if (frRes.status === 'rejected' || grRes.status === 'rejected') {
          toast.warning('Đồng bộ Zalo chưa hoàn tất. Vui lòng kiểm tra kết nối và thử lại.');
          await fetchAllAccounts();
          return;
        }
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
        if (frRes.status === 'rejected' || grRes.status === 'rejected') {
          toast.warning('Đồng bộ LINE chưa hoàn tất. Vui lòng kiểm tra kết nối và thử lại.');
          await fetchAllAccounts();
          return;
        }
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

  const columns: Column<UnifiedAccountRow>[] = [
    {
      align: 'left' as const, wrap: true, key: 'account', header: 'Tài khoản & kênh', className: 'min-w-80 align-middle', width: '28%',
      cell: (row) => (
        <div className="flex items-start gap-3">
          {row.avatarUrl ? (
            <img src={row.avatarUrl} alt="" referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
              {row.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <div className="font-semibold text-text-primary break-words">{row.displayName}</div>
            <Badge size="sm" variant={row.platform === 'ZALO' ? 'info' : 'accent'} className="whitespace-nowrap">
              {row.accountType === 'ZALO_PERSONAL' ? 'Zalo cá nhân' : row.accountType === 'OA' ? 'LINE OA' : 'LINE cá nhân'}
            </Badge>
            <div className="whitespace-nowrap text-[11px] text-text-secondary">
              <span className="font-medium">ID: </span>{row.uidOrMid || `#${row.id}`}
            </div>
            <div className="whitespace-nowrap text-xs text-text-secondary">
              <span className="font-medium">SĐT: </span>{row.phone || 'Chưa cập nhật'}
            </div>
          </div>
        </div>
      ),
    },
    {
      align: 'center' as const, wrap: true, key: 'owner', header: 'Nhân viên CVHT', className: 'min-w-40 align-middle',
      cell: (row) => (
        <div className="flex flex-col items-center gap-1 text-xs">
          <div className="max-w-44 font-medium leading-relaxed">{row.csName}</div>
          {row.csCode && <Badge size="sm" className="whitespace-nowrap">{row.csCode}</Badge>}
        </div>
      ),
    },
    {
      align: 'center' as const, wrap: false, key: 'status', header: 'Trạng thái', className: 'align-middle',
      cell: (row) => {
        const status = ACCOUNT_STATUSES[row.status] ?? { label: 'Chưa xác định', variant: 'neutral' as const };
        return <Badge size="sm" variant={status.variant} dot className="whitespace-nowrap">{status.label}</Badge>;
      },
    },
    {
      align: 'center' as const, wrap: false, key: 'network', header: 'Kết nối mạng', className: 'align-middle',
      cell: (row) => (
        <Badge size="sm" variant={row.proxyUrl ? 'info' : 'neutral'} className="whitespace-nowrap">
          {row.proxyUrl && <Server className="h-3.5 w-3.5 shrink-0" />}
          {row.proxyUrl ? 'Proxy riêng' : 'Mạng trực tiếp'}
        </Badge>
      ),
    },
    {
      align: 'center' as const, wrap: false, key: 'actions', header: 'Thao tác', className: 'min-w-44 align-middle',
      cell: (row) => {
        const isRowSyncing = syncingRowKey === row.uidKey;
        const isRowReconnecting = reconnectingRowKey === row.uidKey;
        const canReconnect = row.accountType !== 'OA' && ['EXPIRED', 'NOT_LOGGED_IN', 'DISCONNECTED', 'ERROR'].includes(row.status);
        return <div className="flex items-center justify-end gap-1 whitespace-nowrap [&>button]:shrink-0">
          {/* Reconnect using saved session */}
          {canReconnect && (
            <Button
              variant="outline"
              size="icon-sm"
              isLoading={isRowReconnecting}
              onClick={() => handleReconnectRow(row)}
              aria-label={`Kết nối lại ${row.displayName}`}
              title="Kết nối lại từ phiên đã lưu"
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-success" />}
            />
          )}

          {/* QR Login for Zalo or LINE Personal when not active */}
          {row.accountType === 'ZALO_PERSONAL' &&
            row.status !== 'ACTIVE' &&
            row.rawZalo && (
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => setZaloQrTarget(row.rawZalo!)}
                aria-label={`Quét QR ${row.displayName}`}
                title="Quét mã QR để đăng nhập Zalo"
                leftIcon={<QrCode className="w-3.5 h-3.5" />}
              />
            )}

          {row.accountType === 'PERSONAL' &&
            row.status !== 'ACTIVE' &&
            row.rawLine && (
              <Button
                variant="secondary"
                size="icon-sm"
                onClick={() => setLineQrTarget(row.rawLine!)}
                aria-label={`Quét QR ${row.displayName}`}
                title="Quét mã QR để đăng nhập LINE Cá nhân"
                leftIcon={<QrCode className="w-3.5 h-3.5" />}
              />
            )}

          {/* OA Webhook & Credentials Config */}
          {row.accountType === 'OA' && row.rawLine && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setLineOaTarget(row.rawLine!)}
              aria-label={`Cấu hình OA ${row.displayName}`}
              title="Cấu hình kết nối LINE OA"
              leftIcon={<Settings className="w-3.5 h-3.5 text-success" />}
            />
          )}

          {/* Sync Groups & Contacts */}
          {row.status === 'ACTIVE' && (
            <Button
              variant="outline"
              size="icon-sm"
              isLoading={isRowSyncing}
              onClick={() => handleSyncRow(row)}
              aria-label={`Đồng bộ ${row.displayName}`}
              title="Đồng bộ nhóm, danh bạ và liên kết nhóm chăm sóc"
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-primary" />}
            />
          )}

          {/* Proxy & Limits */}
          <Button
            variant="outline"
            size="icon-sm"
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
            aria-label={`Cài đặt ${row.displayName}`}
            title="Cài đặt proxy, giới hạn và sao lưu phiên"
            leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-primary" />}
          />

          {/* Disconnect */}
          {row.status === 'ACTIVE' && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleDisconnectRow(row)}
              aria-label={`Ngắt kết nối ${row.displayName}`}
              title="Ngắt kết nối"
              leftIcon={<WifiOff className="w-3.5 h-3.5 text-warning" />}
            />
          )}

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDeleteRow(row)}
            aria-label={`Xóa ${row.displayName}`}
            title="Xóa tài khoản"
            leftIcon={<Trash2 className="w-3.5 h-3.5 text-danger" />}
          />
        </div>;
      },
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Tài khoản & kênh"
        description="Quản lý kết nối Zalo và LINE, đồng bộ danh bạ, nhóm và cấu hình giới hạn sử dụng."
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
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
          Thêm Zalo
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
          Thêm LINE OA
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
          Thêm LINE cá nhân
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'Đã kết nối', value: totalActiveAccounts, meta: `/ ${unifiedRows.length} tài khoản`, icon: Layers },
          { label: 'Zalo cá nhân', value: activeZaloCount, meta: `/ ${zaloAccounts.length} đã kết nối`, icon: MessageSquare },
          { label: 'LINE OA', value: activeLineOaCount, meta: lineOaUsageKnown ? `Đã gửi ${lineOaQuotaUsed}/${lineOaQuotaMax} tin tháng này` : lineOaRows.length ? 'Chưa có số liệu sử dụng' : 'Chưa có tài khoản', icon: Bot },
          { label: 'LINE cá nhân', value: activeLinePersonalCount, meta: `/ ${lineAccounts.filter((a) => a.account_type === 'PERSONAL').length} đã kết nối`, icon: Smartphone },
          { label: 'Dùng proxy riêng', value: proxyPinnedCount, meta: `/ ${unifiedRows.length} tài khoản`, icon: ShieldCheck },
        ].map(({ label, value, meta, icon: Icon }) => (
          <Card key={label} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-text-secondary">
              <span>{label}</span><Icon className="h-4 w-4 shrink-0 text-primary" />
            </div>
            <div className="text-2xl font-bold text-text-primary">{value}</div>
            <div className="text-xs text-text-secondary">{meta}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-5 space-y-4 p-4">
        <HorizontalTabs<ChannelFilterTab> value={activeFilter} onChange={setActiveFilter} ariaLabel="Lọc tài khoản theo kênh" size="sm"
          items={[
            { value: 'ALL', label: 'Tất cả', badge: unifiedRows.length },
            { value: 'ZALO_PERSONAL', label: 'Zalo cá nhân', badge: zaloAccounts.length },
            { value: 'LINE_OA', label: 'LINE OA', badge: lineAccounts.filter((a) => a.account_type === 'OA').length },
            { value: 'LINE_PERSONAL', label: 'LINE cá nhân', badge: lineAccounts.filter((a) => a.account_type === 'PERSONAL').length },
          ]} />
        <div className="w-full sm:max-w-md">
          <Input aria-label="Tìm tài khoản" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên, SĐT, ID hoặc nhân viên CVHT" />
        </div>
      </Card>

      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-warning-soft p-4 text-sm text-text-primary">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={fetchAllAccounts}>Thử lại</Button>
        </div>
      )}
      <p className="mb-3 text-xs text-text-secondary">{filteredRows.length} tài khoản · Cuộn ngang để xem đầy đủ các cột trên màn hình nhỏ.</p>
      <div className="[&_th]:px-3 [&_td]:px-3 ">
        <DataTable columns={columns} data={filteredRows} isLoading={loading} pagination={false}
          emptyMessage={loadError ? 'Chưa tải được dữ liệu tài khoản.' : searchQuery.trim() ? 'Không tìm thấy tài khoản khớp từ khóa.' : 'Chưa có tài khoản trong kênh này. Chọn nút thêm tài khoản để bắt đầu.'} />
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
                    placeholder="VD: Zalo CVHT 01 - Hải Yến"
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
                    placeholder="VD: Edura CVHT Official"
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
                    label="Tên tạm trước khi đăng nhập LINE"
                    helperText="Tên này sẽ được cập nhật theo hồ sơ LINE sau khi kết nối thành công."
                    value={lineForm.display_name || ''}
                    onChange={(e) => setLineForm({ ...lineForm, display_name: e.target.value })}
                    placeholder="VD: LINE CVHT 01 - Hải Yến"
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
