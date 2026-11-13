import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  Archive,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  Eye,
  Globe2,
  History,
  KeyRound,
  Monitor,
  RefreshCw,
  Rows3,
  Search,
  Smartphone,
  TriangleAlert,
  Undo2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar } from '../../../components/common/FilterBar';
import { Column, DataTable } from '../../../components/common/DataTable';
import { PaginationFooter } from '../../../components/common/Pagination';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { importsApi } from '../../imports/api/imports.api';
import type {
  BackupHistoryBatch,
  BackupHistoryItem,
  BackupHistoryResponse,
  SyncHistoryDetailResponse,
  SyncHistoryItem,
  SyncHistoryResponse,
} from '../../imports/types/imports.types';
import { activityLogsApi } from '../api/activityLogs.api';
import { ActivityDateControls, defaultActivityRange } from '../components/ActivityDateControls';
import { ActivityLogOverview, ActivityMetric } from '../components/ActivityLogOverview';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type {
  ActivityExportQueryParams,
  ActivityLogTabKey,
  AuditLogActor,
  AuditLogItem,
  AuditLogListResponse,
  AuditModuleKey,
  LoginAuditItem,
  LoginAuditListResponse,
  LoginAuditStatus,
} from '../types/activityLogs.types';

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_RANGE = defaultActivityRange();

const TAB_ITEMS = [
  { value: 'audit' as const, label: 'Thao tác Web', icon: <Activity /> },
  { value: 'sync' as const, label: 'Đồng bộ', icon: <RefreshCw /> },
  { value: 'backup' as const, label: 'Sao lưu', icon: <Archive /> },
  { value: 'login' as const, label: 'Đăng nhập', icon: <KeyRound /> },
];

const AUDIT_MODULES: Array<{ key: AuditModuleKey; label: string }> = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'ENROLLMENT', label: 'Học viên & Ghi danh' },
  { key: 'ATTENDANCE', label: 'Lớp học & Điểm danh' },
  { key: 'CARE', label: 'Chăm sóc học viên' },
  { key: 'MESSAGING', label: 'Đa kênh & Kịch bản' },
  { key: 'IMPORT_SYNC', label: 'Nhập liệu & Đồng bộ' },
  { key: 'SYSTEM', label: 'Hệ thống & Tài khoản' },
];

const EMPTY_AUDIT: AuditLogListResponse = {
  success: true,
  stats: { todayTotal: 0, todayByModule: {}, lastActivityAt: null },
  moduleCounts: {},
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  refreshedAt: '',
};

const EMPTY_SYNC: SyncHistoryResponse = {
  stats: { todayTotal: 0, todaySuccess: 0, todayFailed: 0, lastRunTime: null },
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  refreshedAt: '',
  canRollback: false,
};

const EMPTY_BACKUP: BackupHistoryResponse = {
  stats: { todayTotal: 0, todaySuccess: 0, todayFailed: 0, lastRunTime: null },
  batches: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  refreshedAt: '',
};

const EMPTY_LOGIN: LoginAuditListResponse = {
  success: true,
  stats: { todayTotal: 0, todaySuccess: 0, todayFailed: 0, lastLoginAt: null },
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  refreshedAt: '',
};

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatTime(value?: string | null): string {
  if (!value) return '--:--';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(Trống)';
  if (typeof value === 'boolean') return value ? 'Bật' : 'Tắt';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  const responseError = error as { response?: { data?: { error?: { message?: string }; message?: string } } };
  return responseError?.response?.data?.error?.message || responseError?.response?.data?.message || fallback;
}

function parseUserAgent(userAgent?: string | null) {
  if (!userAgent) return { label: 'Không rõ thiết bị', mobile: false };
  const source = userAgent.toLowerCase();
  const mobile = /iphone|ipad|android|mobile/.test(source);
  const browser = source.includes('edg/')
    ? 'Edge'
    : source.includes('firefox/')
      ? 'Firefox'
      : source.includes('chrome/')
        ? 'Chrome'
        : source.includes('safari/')
          ? 'Safari'
          : 'Trình duyệt';
  const os = source.includes('windows')
    ? 'Windows'
    : source.includes('android')
      ? 'Android'
      : source.includes('iphone') || source.includes('ipad')
        ? 'iOS'
        : source.includes('mac')
          ? 'macOS'
          : '';
  return { label: os ? `${browser} trên ${os}` : browser, mobile };
}

function syncStatusBadge(status: SyncHistoryItem['status']) {
  if (status === 'SUCCESS') return <Badge variant="success" dot>Thành công</Badge>;
  if (status === 'PARTIAL_FAILED') return <Badge variant="warning" dot>Một phần lỗi</Badge>;
  if (status === 'ROLLED_BACK') return <Badge variant="neutral" dot>Đã hoàn tác</Badge>;
  return <Badge variant="danger" dot>Thất bại</Badge>;
}

function backupStatusBadge(status?: BackupHistoryBatch['status']) {
  if (status === 'SUCCESS') return <Badge variant="success" dot>Thành công</Badge>;
  if (status === 'PARTIAL') return <Badge variant="warning" dot>Một phần lỗi</Badge>;
  return <Badge variant="danger" dot>Thất bại</Badge>;
}

function loginStatusBadge(status: LoginAuditItem['status']) {
  if (status === 'SUCCESS') return <Badge variant="success" dot>Thành công</Badge>;
  if (status === 'LOCKED') return <Badge variant="warning" dot>Bị khóa</Badge>;
  if (status === 'DISABLED') return <Badge variant="neutral" dot>Vô hiệu hóa</Badge>;
  return <Badge variant="danger" dot>Sai thông tin</Badge>;
}

function modeBadge(mode: string) {
  return (
    <span title={mode === 'FULL' ? 'Ghi lại toàn bộ dữ liệu' : 'Chỉ xử lý phần dữ liệu thay đổi'} className="inline-flex rounded-lg border border-border bg-surface-muted px-2 py-1 font-mono text-[10px] font-bold text-text-secondary">
      {mode} · {mode === 'FULL' ? 'Toàn bộ' : 'Phần thay đổi'}
    </span>
  );
}

function MobilePagination({ page, pageSize, total, onPageChange, onPageSizeChange, label }: {
  page: number;
  pageSize: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (!total) return null;
  return (
    <div className="lg:hidden">
      <PaginationFooter
        startRecord={(page - 1) * pageSize + 1}
        endRecord={Math.min(page * pageSize, total)}
        totalCount={total}
        pageSize={pageSize}
        currentPage={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={PAGE_SIZES}
        recordLabel={label}
      />
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 border-danger-border bg-danger-soft p-8 text-center">
      <TriangleAlert className="h-8 w-8 text-danger" />
      <div>
        <p className="font-semibold text-text-primary">Không thể tải dữ liệu</p>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>Thử lại</Button>
    </Card>
  );
}

export const ActivityLogsPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const canViewLogin = Boolean(user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE'));

  const requestedTab = searchParams.get('tab') as ActivityLogTabKey | null;
  const activeTab: ActivityLogTabKey = requestedTab === 'sync' || requestedTab === 'backup' || (requestedTab === 'login' && canViewLogin) ? requestedTab : 'audit';
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const requestedPageSize = parsePositiveInt(searchParams.get('pageSize'), 25);
  const pageSize = PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : 25;
  const query = searchParams.get('q') || '';
  const fromDate = searchParams.get('from') || DEFAULT_RANGE.fromDate;
  const toDate = searchParams.get('to') || DEFAULT_RANGE.toDate;
  const moduleFilter = (searchParams.get('module') || 'ALL') as AuditModuleKey;
  const actorFilter = searchParams.get('actor') || '';
  const statusFilter = searchParams.get('status') || 'ALL';
  const programFilter = searchParams.get('program') || 'ALL';
  const triggerFilter = searchParams.get('trigger') || 'ALL';

  const updateQuery = useCallback((updates: Record<string, string | number | undefined | null>) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === 'ALL') next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [queryDraft, setQueryDraft] = useState(query);
  const debouncedQuery = useDebouncedValue(queryDraft, 400);
  useEffect(() => setQueryDraft(query), [query]);
  useEffect(() => {
    if (debouncedQuery !== query) updateQuery({ q: debouncedQuery.trim() || undefined, page: 1 });
  }, [debouncedQuery, query, updateQuery]);

  const selectTab = (tab: ActivityLogTabKey) => {
    updateQuery({ tab, page: 1, status: undefined, program: undefined, trigger: undefined, module: undefined, actor: undefined });
  };

  const [actors, setActors] = useState<AuditLogActor[]>([]);
  useEffect(() => {
    activityLogsApi.getActors().then(setActors).catch(() => setActors([]));
  }, []);

  const [auditData, setAuditData] = useState(EMPTY_AUDIT);
  const [syncData, setSyncData] = useState(EMPTY_SYNC);
  const [backupData, setBackupData] = useState(EMPTY_BACKUP);
  const [loginData, setLoginData] = useState(EMPTY_LOGIN);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [exporting, setExporting] = useState(false);

  const fetchCurrentView = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (activeTab === 'audit') {
        const result = await activityLogsApi.getAuditLogs({
          module: moduleFilter,
          actorId: actorFilter || undefined,
          search: query || undefined,
          fromDate,
          toDate,
          page,
          pageSize,
        });
        setAuditData(result);
      } else if (activeTab === 'sync') {
        const result = await importsApi.getSheetSyncHistory({
          programType: programFilter === 'ALL' ? undefined : programFilter,
          triggerType: triggerFilter === 'ALL' ? undefined : triggerFilter,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          search: query || undefined,
          fromDate,
          toDate,
          page,
          pageSize,
        });
        setSyncData(result);
      } else if (activeTab === 'backup') {
        const result = await importsApi.getSheetBackupHistory({
          programType: programFilter === 'ALL' ? undefined : programFilter,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          fromDate,
          toDate,
          page,
          pageSize,
        });
        setBackupData(result);
      } else if (canViewLogin) {
        const result = await activityLogsApi.getLoginLogs({
          status: statusFilter as LoginAuditStatus,
          actorId: actorFilter || undefined,
          search: query || undefined,
          fromDate,
          toDate,
          page,
          pageSize,
        });
        setLoginData(result);
      }
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Đã xảy ra lỗi khi tải lịch sử hoạt động.'));
    } finally {
      setLoading(false);
    }
  }, [activeTab, actorFilter, canViewLogin, fromDate, moduleFilter, page, pageSize, programFilter, query, statusFilter, toDate, triggerFilter]);

  useEffect(() => {
    fetchCurrentView();
  }, [fetchCurrentView, refreshToken]);

  const currentRefreshedAt = activeTab === 'audit'
    ? auditData.refreshedAt
    : activeTab === 'sync'
      ? syncData.refreshedAt
      : activeTab === 'backup'
        ? backupData.refreshedAt
        : loginData.refreshedAt;

  const handleExport = async () => {
    const params: ActivityExportQueryParams = {
      view: activeTab,
      search: query || undefined,
      fromDate,
      toDate,
      module: activeTab === 'audit' ? moduleFilter : undefined,
      actorId: activeTab === 'audit' || activeTab === 'login' ? actorFilter || undefined : undefined,
      status: activeTab !== 'audit' && statusFilter !== 'ALL' ? statusFilter : undefined,
      programType: activeTab === 'sync' || activeTab === 'backup' ? programFilter : undefined,
    };
    try {
      setExporting(true);
      await activityLogsApi.downloadExport(params);
      toast.success('Đã xuất toàn bộ dữ liệu phù hợp với bộ lọc hiện tại.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể xuất file CSV.'));
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    updateQuery({
      q: undefined,
      module: undefined,
      actor: undefined,
      status: undefined,
      program: undefined,
      trigger: undefined,
      from: DEFAULT_RANGE.fromDate,
      to: DEFAULT_RANGE.toDate,
      page: 1,
    });
  };

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (query) chips.push({ key: 'q', label: `Từ khóa: ${query}`, clear: () => updateQuery({ q: undefined, page: 1 }) });
    if (moduleFilter !== 'ALL') chips.push({ key: 'module', label: AUDIT_MODULES.find((item) => item.key === moduleFilter)?.label || moduleFilter, clear: () => updateQuery({ module: undefined, page: 1 }) });
    if (actorFilter) chips.push({ key: 'actor', label: actors.find((actor) => String(actor.id) === actorFilter)?.displayLabel || 'Người thực hiện', clear: () => updateQuery({ actor: undefined, page: 1 }) });
    if (statusFilter !== 'ALL') chips.push({ key: 'status', label: `Trạng thái: ${statusFilter}`, clear: () => updateQuery({ status: undefined, page: 1 }) });
    if (programFilter !== 'ALL') chips.push({ key: 'program', label: `Chương trình: ${programFilter}`, clear: () => updateQuery({ program: undefined, page: 1 }) });
    if (triggerFilter !== 'ALL') chips.push({ key: 'trigger', label: triggerFilter === 'AUTO' ? 'Tự động' : 'Thủ công', clear: () => updateQuery({ trigger: undefined, page: 1 }) });
    if (fromDate !== DEFAULT_RANGE.fromDate || toDate !== DEFAULT_RANGE.toDate) chips.push({ key: 'date', label: `${fromDate} → ${toDate}`, clear: () => updateQuery({ from: DEFAULT_RANGE.fromDate, to: DEFAULT_RANGE.toDate, page: 1 }) });
    return chips;
  }, [actorFilter, actors, fromDate, moduleFilter, programFilter, query, statusFilter, toDate, triggerFilter, updateQuery]);

  const metrics: ActivityMetric[] = useMemo(() => {
    if (activeTab === 'audit') return [
      { label: 'Hôm nay', value: auditData.stats.todayTotal, helper: 'Thao tác được ghi nhận', icon: Activity },
      { label: 'Trong kỳ', value: auditData.total, helper: 'Theo bộ lọc hiện tại', icon: Rows3 },
      { label: 'Ghi danh hôm nay', value: auditData.stats.todayByModule.ENROLLMENT || 0, helper: 'Học viên & ghi danh', icon: UserRound, tone: 'success' },
      { label: 'Hoạt động gần nhất', value: formatTime(auditData.stats.lastActivityAt), helper: 'Múi giờ Việt Nam', icon: Clock3 },
    ];
    const stats = activeTab === 'sync' ? syncData.stats : activeTab === 'backup' ? backupData.stats : loginData.stats;
    const last = activeTab === 'login'
      ? loginData.stats.lastLoginAt
      : activeTab === 'sync'
        ? syncData.stats.lastRunTime
        : backupData.stats.lastRunTime;
    return [
      { label: 'Hôm nay', value: stats.todayTotal, helper: activeTab === 'login' ? 'Lượt đăng nhập' : 'Lượt thực thi', icon: Database },
      { label: 'Thành công', value: stats.todaySuccess, helper: 'Ghi nhận trong hôm nay', icon: CheckCircle2, tone: 'success' },
      { label: 'Cần chú ý', value: stats.todayFailed, helper: 'Thất bại hoặc cảnh báo', icon: XCircle, tone: stats.todayFailed ? 'danger' : 'primary' },
      { label: 'Gần nhất', value: formatTime(last), helper: 'Múi giờ Việt Nam', icon: Clock3 },
    ];
  }, [activeTab, auditData, backupData.stats, loginData.stats, syncData.stats]);

  const [selectedAudit, setSelectedAudit] = useState<AuditLogItem | null>(null);
  const [selectedSync, setSelectedSync] = useState<SyncHistoryItem | null>(null);
  const [syncDetail, setSyncDetail] = useState<SyncHistoryDetailResponse | null>(null);
  const [syncDetailLoading, setSyncDetailLoading] = useState(false);
  const [syncDetailError, setSyncDetailError] = useState('');
  const [rollingBack, setRollingBack] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupHistoryBatch | null>(null);
  const [downloadingConfigId, setDownloadingConfigId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedAudit(null);
    setSelectedSync(null);
    setSyncDetail(null);
    setSelectedBackup(null);
  }, [activeTab, user?.id, user?.roles]);

  const loadSyncDetail = useCallback(async (item: SyncHistoryItem) => {
    setSelectedSync(item);
    setSyncDetail(null);
    setSyncDetailError('');
    setSyncDetailLoading(true);
    try {
      setSyncDetail(await importsApi.getSheetSyncHistoryDetail(item.id));
    } catch (error) {
      setSyncDetailError(getErrorMessage(error, 'Không thể tải chi tiết phiên đồng bộ.'));
    } finally {
      setSyncDetailLoading(false);
    }
  }, []);

  const rollbackSync = async () => {
    if (!selectedSync || !window.confirm('Hoàn tác toàn bộ thay đổi còn hiệu lực của phiên đồng bộ này?')) return;
    try {
      setRollingBack(true);
      const result = await importsApi.rollbackSheetSyncHistory(selectedSync.id, { rollbackAll: true });
      toast.success(`Đã hoàn tác ${result.rolledBackCount} thay đổi.`);
      await loadSyncDetail(selectedSync);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể hoàn tác phiên đồng bộ.'));
    } finally {
      setRollingBack(false);
    }
  };

  const downloadBackup = async (item: BackupHistoryItem) => {
    try {
      setDownloadingConfigId(item.configId);
      const fileName = `sao-luu-${item.staffCode || item.programType}-${item.configId}.xlsx`;
      await importsApi.downloadCsSheetBackupExcel(item.configId, fileName);
      toast.success(`Đã tải ${fileName}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Không thể tải file sao lưu.'));
    } finally {
      setDownloadingConfigId(null);
    }
  };

  const auditColumns: Column<AuditLogItem>[] = [
    { header: 'Thời gian', width: '150px', cell: (item) => <span className="whitespace-nowrap text-xs font-semibold">{formatDateTime(item.createdAt)}</span> },
    { header: 'Người thực hiện', cell: (item) => <div className="min-w-[150px]"><p className="font-semibold">{item.actor?.displayLabel || 'Hệ thống tự động'}</p><p className="text-xs text-text-muted">{item.actor?.email || 'Không có email'}</p></div> },
    { header: 'Phân hệ', cell: (item) => <Badge variant="info">{item.moduleLabel}</Badge> },
    { header: 'Hành động', cell: (item) => <span className="font-medium">{item.actionLabel}</span> },
    { header: 'Đối tượng', cell: (item) => <span className="min-w-[140px] font-medium">{item.entityLabel}</span> },
    { header: 'Tóm tắt thay đổi', cell: (item) => <div className="min-w-[240px] max-w-md"><p className="line-clamp-2 text-text-secondary">{item.summary}</p>{item.changedFields.length > 0 && <span className="mt-1 inline-block text-[11px] font-semibold text-primary">{item.changedFields.length} trường thay đổi</span>}</div> },
    { header: 'Chi tiết', width: '100px', cell: (item) => <Button id={`audit-detail-${item.id}`} variant="ghost" size="sm" onClick={() => setSelectedAudit(item)} leftIcon={<Eye className="h-4 w-4" />}>Xem</Button> },
  ];

  const syncColumns: Column<SyncHistoryItem>[] = [
    { header: 'Thời gian', cell: (item) => <span className="whitespace-nowrap text-xs font-semibold">{formatDateTime(item.createdAt)}</span> },
    { header: 'Nguồn đồng bộ', cell: (item) => <div className="min-w-[180px]"><p className="font-semibold">{item.name || item.code}</p><p className="font-mono text-[11px] text-text-muted">{item.code}</p></div> },
    { header: 'Chương trình', cell: (item) => <Badge variant="info">{item.programType}</Badge> },
    { header: 'Chế độ', cell: (item) => modeBadge(item.mode) },
    { header: 'Kết quả dữ liệu', cell: (item) => <div className="min-w-[180px] text-xs"><span className="font-semibold text-success">+{item.createdCount} mới</span><span className="mx-1.5 text-text-muted">·</span><span className="font-semibold text-primary">{item.updatedCount} cập nhật</span><p className="mt-1 text-text-muted">{item.totalRows} dòng · {item.durationSec}s</p></div> },
    { header: 'Trạng thái', cell: (item) => syncStatusBadge(item.status) },
    { header: 'Chi tiết', cell: (item) => <Button id={`sync-detail-${item.id}`} variant="ghost" size="sm" onClick={() => loadSyncDetail(item)} leftIcon={<Eye className="h-4 w-4" />}>Xem</Button> },
  ];

  const backupColumns: Column<BackupHistoryBatch>[] = [
    { header: 'Thời gian', cell: (batch) => <span className="whitespace-nowrap text-xs font-semibold">{formatDateTime(batch.startedAt)}</span> },
    { header: 'Mã đợt', cell: (batch) => <span className="font-mono text-xs font-semibold text-primary">{batch.batchId}</span> },
    { header: 'Kiểu chạy', cell: (batch) => <div className="space-y-1"><Badge variant="neutral">{batch.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}</Badge><div>{modeBadge(batch.mode)}</div></div> },
    { header: 'Phạm vi', cell: (batch) => <div className="text-xs"><p className="font-semibold">{batch.totalConfigs} sổ · {batch.totalStudents || 0} học viên</p><p className="mt-1 text-text-muted">{batch.updatedCellsCount || 0} ô cập nhật</p></div> },
    { header: 'Kết quả', cell: (batch) => <div>{backupStatusBadge(batch.status)}<p className="mt-1 text-[11px] text-text-muted">{batch.successCount}/{batch.totalConfigs} sổ thành công</p></div> },
    { header: 'Thời lượng', cell: (batch) => <span className="font-semibold">{batch.durationSec}s</span> },
    { header: 'Chi tiết', cell: (batch) => <Button id={`backup-detail-${batch.batchId}`} variant="ghost" size="sm" onClick={() => setSelectedBackup(batch)} leftIcon={<Eye className="h-4 w-4" />}>Xem</Button> },
  ];

  const loginColumns: Column<LoginAuditItem>[] = [
    { header: 'Thời gian', cell: (item) => <span className="whitespace-nowrap text-xs font-semibold">{formatDateTime(item.createdAt)}</span> },
    { header: 'Nhân viên', cell: (item) => <div className="min-w-[150px]"><p className="font-semibold">{item.actor?.displayLabel || 'Chưa xác định'}</p><p className="text-xs text-text-muted">{item.actor?.code || '--'}</p></div> },
    { header: 'Email đăng nhập', cell: (item) => <span className="font-mono text-xs">{item.emailAttempted}</span> },
    { header: 'Trạng thái', cell: (item) => loginStatusBadge(item.status) },
    { header: 'Địa chỉ IP', cell: (item) => <span className="inline-flex items-center gap-1.5 font-mono text-xs"><Globe2 className="h-3.5 w-3.5 text-text-muted" />{item.ipAddress || '--'}</span> },
    { header: 'Thiết bị', cell: (item) => { const info = parseUserAgent(item.userAgent); const Icon = info.mobile ? Smartphone : Monitor; return <span title={item.userAgent || ''} className="inline-flex min-w-[150px] items-center gap-1.5 text-xs"><Icon className="h-4 w-4 text-text-muted" />{info.label}</span>; } },
    { header: 'Ghi chú', cell: (item) => <span className="min-w-[160px] text-xs text-text-secondary">{item.reason || (item.status === 'SUCCESS' ? 'Đăng nhập hợp lệ' : '--')}</span> },
  ];

  const currentData = activeTab === 'audit' ? auditData.items : activeTab === 'sync' ? syncData.items : activeTab === 'backup' ? backupData.batches : loginData.items;
  const currentTotal = activeTab === 'audit' ? auditData.total : activeTab === 'sync' ? syncData.total : activeTab === 'backup' ? backupData.total : loginData.total;

  return (
    <PageContainer>
      <PageHeader
        title={<span className="inline-flex items-center gap-2.5"><span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><History className="h-5 w-5" /></span>Lịch sử hoạt động</span>}
        description="Theo dõi thao tác nghiệp vụ, đồng bộ, sao lưu và đăng nhập trong 30 ngày gần nhất. Thời gian hiển thị theo múi giờ Việt Nam."
        actions={<>
          <div className="hidden text-right md:block"><p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Làm mới gần nhất</p><p className="text-xs font-semibold text-text-secondary">{formatDateTime(currentRefreshedAt)}</p></div>
          <Button id="activity-refresh" variant="outline" size="sm" onClick={() => setRefreshToken((value) => value + 1)} isLoading={loading} leftIcon={<RefreshCw className="h-4 w-4" />}>Làm mới</Button>
          <Button id="activity-export" variant="primary" size="sm" onClick={handleExport} isLoading={exporting} leftIcon={<Download className="h-4 w-4" />}>Xuất CSV</Button>
        </>}
      />

      <div className="mb-5 lg:hidden">
        <HorizontalTabs items={TAB_ITEMS.filter((item) => item.value !== 'login' || canViewLogin)} value={activeTab} onChange={selectTab} ariaLabel="Chọn loại lịch sử hoạt động" />
      </div>

      <div className="space-y-5">
        <ActivityLogOverview metrics={metrics} />

        {activeTab === 'audit' && (
          <Card className="p-3 sm:p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><p className="text-sm font-bold text-text-primary">Phân hệ nghiệp vụ</p><p className="text-xs text-text-muted">Chọn nhanh phạm vi thao tác cần kiểm tra</p></div>
              <Badge variant="info">{auditData.total} bản ghi</Badge>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {AUDIT_MODULES.map((item) => {
                const active = moduleFilter === item.key;
                const count = item.key === 'ALL' ? auditData.moduleCounts.ALL ?? auditData.total : auditData.moduleCounts[item.key] ?? 0;
                return <button id={`activity-module-${item.key.toLowerCase()}`} key={item.key} type="button" onClick={() => updateQuery({ module: item.key, page: 1 })} className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${active ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20' : 'border-border bg-surface text-text-secondary hover:border-primary-border hover:bg-primary-soft hover:text-primary'}`}><span>{item.label}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-surface-muted text-text-muted'}`}>{count}</span></button>;
              })}
            </div>
          </Card>
        )}

        <FilterBar title="Tìm kiếm và lọc lịch sử" activeCount={filterChips.length} hasActiveFilters={filterChips.length > 0} onClear={resetFilters} gridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="sm:col-span-2 lg:col-span-3">
            <Input id="activity-search" label="Tìm kiếm" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder={activeTab === 'login' ? 'Email hoặc địa chỉ IP...' : 'Mã, tên hoặc nội dung thay đổi...'} leftIcon={<Search className="h-4 w-4" />} helperText="Tự động tìm sau 400ms" />
          </div>
          <ActivityDateControls fromDate={fromDate} toDate={toDate} onChange={(from, to) => updateQuery({ from, to, page: 1 })} />
          {(activeTab === 'audit' || activeTab === 'login') && <Select id="activity-actor" label={activeTab === 'audit' ? 'Người thực hiện' : 'Người dùng'} value={actorFilter} onChange={(event) => updateQuery({ actor: event.target.value, page: 1 })}><option value="">Tất cả</option>{actors.filter((actor) => actor.id !== null).map((actor) => <option key={String(actor.id)} value={String(actor.id)}>{actor.displayLabel}</option>)}</Select>}
          {(activeTab === 'sync' || activeTab === 'backup') && <Select id="activity-program" label="Chương trình" value={programFilter} onChange={(event) => updateQuery({ program: event.target.value, page: 1 })}><option value="ALL">Tất cả</option><option value="JLPT">JLPT</option><option value="KAIWA">KAIWA</option><option value="TEACHER">Giáo viên</option></Select>}
          {activeTab !== 'audit' && <Select id="activity-status" label="Trạng thái" value={statusFilter} onChange={(event) => updateQuery({ status: event.target.value, page: 1 })}><option value="ALL">Tất cả</option>{activeTab === 'login' ? <><option value="SUCCESS">Thành công</option><option value="FAILED">Sai thông tin</option><option value="LOCKED">Bị khóa</option><option value="DISABLED">Vô hiệu hóa</option></> : activeTab === 'sync' ? <><option value="SUCCESS">Thành công</option><option value="PARTIAL_FAILED">Một phần lỗi</option><option value="FAILED">Thất bại</option><option value="ROLLED_BACK">Đã hoàn tác</option></> : <><option value="SUCCESS">Thành công</option><option value="FAILED">Thất bại</option></>}</Select>}
          {activeTab === 'sync' && <Select id="activity-trigger" label="Kích hoạt" value={triggerFilter} onChange={(event) => updateQuery({ trigger: event.target.value, page: 1 })}><option value="ALL">Tất cả</option><option value="AUTO">Tự động</option><option value="MANUAL">Thủ công</option></Select>}
        </FilterBar>

        {filterChips.length > 0 && <div className="-mt-2 flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang áp dụng"><span className="text-xs font-semibold text-text-muted">Đang lọc:</span>{filterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex items-center gap-1.5 rounded-full border border-primary-border bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-blue-100">{chip.label}<XCircle className="h-3.5 w-3.5" /></button>)}</div>}

        {loadError ? <InlineError message={loadError} onRetry={fetchCurrentView} /> : <>
          <div className="hidden lg:block">
            {activeTab === 'audit' && <DataTable columns={auditColumns} data={auditData.items} isLoading={loading} emptyMessage="Chưa có thao tác phù hợp với bộ lọc." serverPagination total={auditData.total} page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageChange={(value) => updateQuery({ page: value })} onPageSizeChange={(value) => updateQuery({ pageSize: value, page: 1 })} />}
            {activeTab === 'sync' && <DataTable columns={syncColumns} data={syncData.items} isLoading={loading} emptyMessage="Chưa có phiên đồng bộ phù hợp với bộ lọc." serverPagination total={syncData.total} page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageChange={(value) => updateQuery({ page: value })} onPageSizeChange={(value) => updateQuery({ pageSize: value, page: 1 })} />}
            {activeTab === 'backup' && <DataTable columns={backupColumns} data={backupData.batches} isLoading={loading} emptyMessage="Chưa có đợt sao lưu phù hợp với bộ lọc." serverPagination total={backupData.total} page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageChange={(value) => updateQuery({ page: value })} onPageSizeChange={(value) => updateQuery({ pageSize: value, page: 1 })} />}
            {activeTab === 'login' && <DataTable columns={loginColumns} data={loginData.items} isLoading={loading} emptyMessage="Chưa có lượt đăng nhập phù hợp với bộ lọc." serverPagination total={loginData.total} page={page} pageSize={pageSize} pageSizeOptions={PAGE_SIZES} onPageChange={(value) => updateQuery({ page: value })} onPageSizeChange={(value) => updateQuery({ pageSize: value, page: 1 })} />}
          </div>

          <div className="space-y-3 lg:hidden">
            {loading && currentData.length === 0 && Array.from({ length: 3 }).map((_, index) => <Card key={index} className="animate-pulse p-4"><div className="h-4 w-1/3 rounded bg-slate-200" /><div className="mt-3 h-3 w-4/5 rounded bg-slate-100" /><div className="mt-2 h-3 w-1/2 rounded bg-slate-100" /></Card>)}
            {!loading && currentData.length === 0 && <Card className="p-10 text-center"><Archive className="mx-auto h-8 w-8 text-text-muted" /><p className="mt-3 text-sm font-semibold text-text-primary">Chưa có dữ liệu phù hợp</p><p className="mt-1 text-xs text-text-muted">Hãy thay đổi bộ lọc hoặc khoảng thời gian.</p></Card>}
            {activeTab === 'audit' && auditData.items.map((item) => <Card key={item.id} className="relative overflow-hidden p-4"><div className="absolute bottom-0 left-0 top-0 w-1 bg-primary" /><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-text-muted">{formatDateTime(item.createdAt)}</p><p className="mt-1 font-bold text-text-primary">{item.actor?.displayLabel || 'Hệ thống tự động'}</p></div><Badge variant="info">{item.moduleLabel}</Badge></div><p className="mt-3 text-sm font-semibold text-text-primary">{item.actionLabel} · {item.entityLabel}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">{item.summary}</p><Button className="mt-3" variant="soft" size="sm" onClick={() => setSelectedAudit(item)} leftIcon={<Eye className="h-4 w-4" />}>Chi tiết</Button></Card>)}
            {activeTab === 'sync' && syncData.items.map((item) => <Card key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-text-primary">{item.name || item.code}</p><p className="mt-1 text-xs text-text-muted">{formatDateTime(item.createdAt)}</p></div>{syncStatusBadge(item.status)}</div><div className="mt-3 flex flex-wrap gap-2"><Badge variant="info">{item.programType}</Badge>{modeBadge(item.mode)}</div><p className="mt-3 text-xs text-text-secondary">{item.totalRows} dòng · <strong className="text-success">+{item.createdCount} mới</strong> · <strong className="text-primary">{item.updatedCount} cập nhật</strong></p><Button className="mt-3" variant="soft" size="sm" onClick={() => loadSyncDetail(item)} leftIcon={<Eye className="h-4 w-4" />}>Chi tiết</Button></Card>)}
            {activeTab === 'backup' && backupData.batches.map((batch) => <Card key={batch.batchId} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">{batch.batchId}</p><p className="mt-1 text-xs text-text-muted">{formatDateTime(batch.startedAt)}</p></div>{backupStatusBadge(batch.status)}</div><div className="mt-3 flex flex-wrap gap-2"><Badge variant="neutral">{batch.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}</Badge>{modeBadge(batch.mode)}</div><p className="mt-3 text-xs text-text-secondary">{batch.totalConfigs} sổ · {batch.totalStudents || 0} học viên · {batch.updatedCellsCount || 0} ô cập nhật</p><Button className="mt-3" variant="soft" size="sm" onClick={() => setSelectedBackup(batch)} leftIcon={<Eye className="h-4 w-4" />}>Chi tiết đợt</Button></Card>)}
            {activeTab === 'login' && loginData.items.map((item) => { const info = parseUserAgent(item.userAgent); const Icon = info.mobile ? Smartphone : Monitor; return <Card key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-text-primary">{item.actor?.displayLabel || item.emailAttempted}</p><p className="mt-1 text-xs text-text-muted">{formatDateTime(item.createdAt)}</p></div>{loginStatusBadge(item.status)}</div><p className="mt-3 font-mono text-xs text-text-secondary">{item.emailAttempted}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted"><span className="inline-flex items-center gap-1"><Globe2 className="h-3.5 w-3.5" />{item.ipAddress || '--'}</span><span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{info.label}</span></div>{item.reason && <p className="mt-2 text-xs text-danger">{item.reason}</p>}</Card>; })}
          </div>
          <MobilePagination page={page} pageSize={pageSize} total={currentTotal} label={activeTab === 'backup' ? 'đợt' : 'bản ghi'} onPageChange={(value) => updateQuery({ page: value })} onPageSizeChange={(value) => updateQuery({ pageSize: value, page: 1 })} />
        </>}
      </div>

      <Modal isOpen={Boolean(selectedAudit)} onClose={() => setSelectedAudit(null)} title="Chi tiết thao tác" description="Đối chiếu dữ liệu trước và sau thao tác" size="xl" footer={<Button variant="outline" onClick={() => setSelectedAudit(null)}>Đóng</Button>}>
        {selectedAudit && <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface-muted/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {[['Thời gian', formatDateTime(selectedAudit.createdAt)], ['Người thực hiện', selectedAudit.actor?.displayLabel || 'Hệ thống tự động'], ['Phân hệ', selectedAudit.moduleLabel], ['Hành động', selectedAudit.actionLabel], ['Đối tượng', selectedAudit.entityLabel], ['Địa chỉ IP', selectedAudit.ipAddress || '--']].map(([label, value]) => <div key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-text-primary">{value}</p></div>)}
          </div>
          <div className="rounded-xl border border-primary-border bg-primary-soft p-4 text-sm text-text-secondary"><strong className="text-primary">Tóm tắt: </strong>{selectedAudit.summary}</div>
          {selectedAudit.changedFields.length > 0 ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-surface-muted text-text-secondary"><tr><th className="px-4 py-3">Trường dữ liệu</th><th className="px-4 py-3">Giá trị trước</th><th className="px-4 py-3">Giá trị sau</th></tr></thead><tbody className="divide-y divide-border">{selectedAudit.changedFields.map((field) => <tr key={field.field}><td className="px-4 py-3"><p className="font-semibold text-text-primary">{field.label}</p><p className="font-mono text-[10px] text-text-muted">{field.field}</p></td><td className="px-4 py-3 text-danger">{formatValue(field.before)}</td><td className="px-4 py-3 font-semibold text-success">{formatValue(field.after)}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-border p-6 text-center text-sm text-text-muted">Thao tác này không ghi nhận thay đổi theo từng trường.</div>}
          {(selectedAudit.beforeData || selectedAudit.afterData) && <details className="rounded-xl border border-border bg-surface"><summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-text-secondary"><Braces className="h-4 w-4 text-primary" />Dữ liệu kỹ thuật</summary><div className="grid gap-3 border-t border-border p-4 lg:grid-cols-2">{selectedAudit.beforeData && <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">{JSON.stringify(selectedAudit.beforeData, null, 2)}</pre>}{selectedAudit.afterData && <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-100">{JSON.stringify(selectedAudit.afterData, null, 2)}</pre>}</div></details>}
        </div>}
      </Modal>

      <Modal isOpen={Boolean(selectedSync)} onClose={() => { setSelectedSync(null); setSyncDetail(null); setSyncDetailError(''); }} title="Chi tiết phiên đồng bộ" description={selectedSync ? `${selectedSync.name || selectedSync.code} · ${formatDateTime(selectedSync.createdAt)}` : undefined} size="2xl" footer={<>{selectedSync && syncData.canRollback && selectedSync.status !== 'ROLLED_BACK' && <Button variant="danger" onClick={rollbackSync} isLoading={rollingBack} leftIcon={<Undo2 className="h-4 w-4" />}>Hoàn tác phiên</Button>}<Button variant="outline" onClick={() => { setSelectedSync(null); setSyncDetail(null); }}>Đóng</Button></>}>
        {selectedSync && <div className="space-y-4">
          {syncDetailLoading && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-text-muted"><RefreshCw className="h-5 w-5 animate-spin text-primary" />Đang tải chi tiết...</div>}
          {syncDetailError && <InlineError message={syncDetailError} onRetry={() => loadSyncDetail(selectedSync)} />}
          {syncDetail && <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Đã quét', syncDetail.summary.totalRowsScanned], ['Tạo mới', syncDetail.summary.createdCount], ['Cập nhật', syncDetail.summary.updatedCount], ['Còn hiệu lực', syncDetail.summary.remainingAppliedCount]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-[10px] font-bold uppercase text-text-muted">{label}</p><p className="mt-1 text-2xl font-extrabold text-text-primary">{value}</p></Card>)}</div>
            <div className="max-h-[48vh] overflow-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-surface-muted"><tr><th className="px-4 py-3">Dòng</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Thao tác</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Thay đổi</th></tr></thead><tbody className="divide-y divide-border">{syncDetail.items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-mono">{item.rowNumber}</td><td className="px-4 py-3"><p className="font-semibold">{item.fullName}</p><p className="text-text-muted">{item.externalId}</p></td><td className="px-4 py-3">{item.action}</td><td className="px-4 py-3"><Badge variant={item.status === 'APPLIED' ? 'success' : item.status === 'ROLLED_BACK' ? 'neutral' : 'warning'}>{item.status}</Badge></td><td className="px-4 py-3 text-text-secondary">{item.fieldDiffs.length} trường</td></tr>)}</tbody></table></div>
          </>}
        </div>}
      </Modal>

      <Modal isOpen={Boolean(selectedBackup)} onClose={() => setSelectedBackup(null)} title="Chi tiết đợt sao lưu" description={selectedBackup ? `${selectedBackup.batchId} · ${formatDateTime(selectedBackup.startedAt)}` : undefined} size="2xl" footer={<Button variant="outline" onClick={() => setSelectedBackup(null)}>Đóng</Button>}>
        {selectedBackup && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Số sổ', selectedBackup.totalConfigs], ['Thành công', selectedBackup.successCount], ['Học viên', selectedBackup.totalStudents || 0], ['Ô cập nhật', selectedBackup.updatedCellsCount || 0]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-[10px] font-bold uppercase text-text-muted">{label}</p><p className="mt-1 text-2xl font-extrabold text-text-primary">{value}</p></Card>)}</div>
          <div className="space-y-3">{selectedBackup.items.map((item) => { const sheetRows = [{ label: 'Hồ sơ / Chăm sóc', value: item.profile || item.summary?.profile || item.summary?.sheet1 }, { label: 'Chấm buổi / Báo cáo', value: item.attendance || item.summary?.attendance || item.summary?.sheet3 }, { label: 'Điểm danh chốt', value: item.finalAttendance || item.summary?.finalAttendance }]; return <Card key={item.id} className="overflow-hidden"><div className="flex flex-col gap-3 border-b border-border bg-surface-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-text-primary">{item.staffCode ? `${item.staffCode} · ` : ''}{item.configName || item.staffName || `Sổ #${item.configId}`}</p><Badge variant={item.status === 'SUCCESS' ? 'success' : 'danger'}>{item.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}</Badge></div><p className="mt-1 text-xs text-text-muted">{item.programType} · {item.totalStudents || 0} học viên</p></div><Button variant="outline" size="sm" onClick={() => downloadBackup(item)} isLoading={downloadingConfigId === item.configId} leftIcon={<Download className="h-4 w-4" />}>Tải Excel</Button></div>{item.error && <div className="border-b border-danger-border bg-danger-soft px-4 py-3 text-xs text-danger">{item.error}</div>}<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-surface"><tr><th className="px-4 py-3">Sheet</th><th className="px-4 py-3">Tổng dòng</th><th className="px-4 py-3">Giữ nguyên</th><th className="px-4 py-3">Cập nhật</th><th className="px-4 py-3">Thêm mới</th><th className="px-4 py-3">Ô cập nhật</th></tr></thead><tbody className="divide-y divide-border">{sheetRows.map((row) => <tr key={row.label}><td className="px-4 py-3 font-semibold">{row.label}{row.value?.sheetName && <p className="font-normal text-text-muted">{row.value.sheetName}</p>}</td><td className="px-4 py-3">{row.value?.totalEnrollments || 0}</td><td className="px-4 py-3">{row.value?.unchangedRows || 0}</td><td className="px-4 py-3 font-semibold text-primary">{row.value?.updatedRows || 0}</td><td className="px-4 py-3 font-semibold text-success">+{row.value?.appendedRows || 0}</td><td className="px-4 py-3 font-bold text-text-primary">{row.value?.updatedCellsCount || 0}</td></tr>)}</tbody></table></div></Card>; })}</div>
        </div>}
      </Modal>
    </PageContainer>
  );
};

export default ActivityLogsPage;
