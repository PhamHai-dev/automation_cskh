import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { importsApi } from '../../imports/api/imports.api';
import {
  BackupHistoryBatch,
  BackupHistoryItem,
  BackupHistoryResponse,
  SyncHistoryItem,
  SyncHistoryResponse,
} from '../../imports/types/imports.types';
import { activityLogsApi } from '../api/activityLogs.api';
import {
  ActivityLogTabKey,
  AuditLogActor,
  AuditLogItem,
  AuditLogListResponse,
  AuditModuleKey,
  LoginAuditItem,
  LoginAuditListResponse,
  LoginAuditStatus,
} from '../types/activityLogs.types';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Globe,
  HeartHandshake,
  History,
  KeyRound,
  Layers,
  MessageSquare,
  Monitor,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Users,
} from 'lucide-react';

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const AUDIT_MODULE_CARDS: Array<{
  key: AuditModuleKey;
  title: string;
  subtitle: string;
  activeBorder: string;
  badgeClass: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'ALL',
    title: 'Tất cả phân hệ',
    subtitle: 'Toàn bộ thao tác trên hệ thống',
    activeBorder: 'border-slate-900 bg-slate-900 text-white',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    icon: <Layers className="w-4 h-4" />,
  },
  {
    key: 'ENROLLMENT',
    title: 'Học viên & Ghi danh',
    subtitle: 'Hồ sơ, trạng thái, chuyển CSKH',
    activeBorder: 'border-violet-600 bg-violet-600 text-white',
    badgeClass: 'bg-violet-100 text-violet-800 border-violet-200',
    icon: <Users className="w-4 h-4" />,
  },
  {
    key: 'ATTENDANCE',
    title: 'Lớp học & Điểm danh',
    subtitle: 'Chấm buổi, đối soát, xếp lớp',
    activeBorder: 'border-blue-600 bg-blue-600 text-white',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  {
    key: 'CARE',
    title: 'Chăm sóc HV',
    subtitle: 'Nhật ký CareLog, Task chăm sóc',
    activeBorder: 'border-emerald-600 bg-emerald-600 text-white',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    icon: <HeartHandshake className="w-4 h-4" />,
  },
  {
    key: 'MESSAGING',
    title: 'Đa kênh & Kịch bản',
    subtitle: 'Zalo/LINE, Workflow, Broadcast',
    activeBorder: 'border-amber-600 bg-amber-600 text-white',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  {
    key: 'IMPORT_SYNC',
    title: 'Nhập liệu & Đồng bộ',
    subtitle: 'Duyệt Import, Sync, Backup',
    activeBorder: 'border-teal-600 bg-teal-600 text-white',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    icon: <RefreshCw className="w-4 h-4" />,
  },
  {
    key: 'SYSTEM',
    title: 'Hệ thống & Tài khoản',
    subtitle: 'User, Phân quyền, Cấu hình',
    activeBorder: 'border-rose-600 bg-rose-600 text-white',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    icon: <Settings className="w-4 h-4" />,
  },
];

const MODULE_STYLE_MAP: Record<
  Exclude<AuditModuleKey, 'ALL'>,
  { label: string; className: string }
> = {
  ENROLLMENT: {
    label: 'Học viên & Ghi danh',
    className: 'bg-violet-100 text-violet-800 border border-violet-200',
  },
  ATTENDANCE: {
    label: 'Lớp học & Điểm danh',
    className: 'bg-blue-100 text-blue-800 border border-blue-200',
  },
  CARE: {
    label: 'Chăm sóc HV',
    className: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  },
  MESSAGING: {
    label: 'Đa kênh & Kịch bản',
    className: 'bg-amber-100 text-amber-800 border border-amber-200',
  },
  IMPORT_SYNC: {
    label: 'Nhập liệu & Đồng bộ',
    className: 'bg-teal-100 text-teal-800 border border-teal-200',
  },
  SYSTEM: {
    label: 'Hệ thống & Tài khoản',
    className: 'bg-rose-100 text-rose-800 border border-rose-200',
  },
};

function formatDateTimeFull(iso?: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return '--:--';
  if (/^\d{2}:\d{2}/.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${mins}`;
}

function formatDiffVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '(Trống)';
  if (typeof val === 'boolean') return val ? 'Bật (True)' : 'Tắt (False)';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function parseUserAgent(ua?: string | null): {
  label: string;
  isMobile: boolean;
} {
  if (!ua) return { label: 'Không rõ thiết bị', isMobile: false };
  const s = ua.toLowerCase();
  const isMobile = /iphone|ipad|android|mobile/.test(s);

  let browser = 'Trình duyệt';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('opr/') || s.includes('opera')) browser = 'Opera';
  else if (s.includes('chrome/') && !s.includes('edg/')) browser = 'Chrome';
  else if (s.includes('firefox/')) browser = 'Firefox';
  else if (s.includes('safari/') && !s.includes('chrome/')) browser = 'Safari';

  let os = '';
  if (s.includes('windows')) os = 'Windows';
  else if (s.includes('mac os x') || s.includes('macintosh')) os = 'macOS';
  else if (s.includes('android')) os = 'Android';
  else if (s.includes('iphone') || s.includes('ipad')) os = 'iOS';
  else if (s.includes('linux')) os = 'Linux';

  return {
    label: os ? `${browser} trên ${os}` : browser,
    isMobile,
  };
}

function getBackupFilenameFromItem(item: BackupHistoryItem): string {
  const pt = String(item.programType || '').toUpperCase();
  if (pt === 'ADMIN_KAIWA') return 'backup_admin_kaiwa.xlsx';
  if (pt === 'ADMIN_JLPT') return 'backup_admin_jlpt.xlsx';
  if (pt === 'ADMIN_RECONCILIATION') return 'backup_admin_doi_soat.xlsx';
  if (pt === 'REPORT_KAIWA') return 'backup_bao_cao_hoc_tap_kaiwa.xlsx';
  if (pt === 'REPORT_JLPT') return 'backup_bao_cao_hoc_tap_jlpt.xlsx';
  const staff = item.staffCode || `ID${item.configId}`;
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return `diem_danh_gv_${staff}.xlsx`;
  return `backup_cskh_${pt.toLowerCase()}_${staff}.xlsx`;
}

function getBackupProgramBadge(programType?: string): {
  label: string;
  className: string;
} {
  const pt = String(programType || '').toUpperCase();
  if (pt === 'ADMIN_KAIWA')
    return { label: 'ADMIN KAIWA', className: 'bg-violet-100 text-violet-700' };
  if (pt === 'ADMIN_JLPT')
    return { label: 'ADMIN JLPT', className: 'bg-indigo-100 text-indigo-700' };
  if (pt === 'ADMIN_RECONCILIATION')
    return { label: 'ĐỐI SOÁT', className: 'bg-rose-100 text-rose-700' };
  if (pt === 'REPORT_KAIWA')
    return { label: 'BC KAIWA', className: 'bg-teal-100 text-teal-700' };
  if (pt === 'REPORT_JLPT')
    return { label: 'BC JLPT', className: 'bg-cyan-100 text-cyan-700' };
  if (pt === 'TEACHER' || pt.startsWith('GV:'))
    return { label: 'GIÁO VIÊN', className: 'bg-amber-100 text-amber-800' };
  if (pt === 'JLPT')
    return { label: 'CSKH JLPT', className: 'bg-blue-100 text-blue-700' };
  return { label: 'CSKH KAIWA', className: 'bg-emerald-100 text-emerald-700' };
}

function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '﻿' +
    [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
      '\n'
    );
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export const ActivityLogsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canViewLoginAudit = useMemo(() => {
    const roles = user?.roles || [];
    return roles.includes('ADMIN') || roles.includes('MANAGE');
  }, [user?.roles]);

  const rawTabParam = searchParams.get('tab') as ActivityLogTabKey | null;
  const activeTab: ActivityLogTabKey = useMemo(() => {
    if (rawTabParam === 'sync' || rawTabParam === 'backup') return rawTabParam;
    if (rawTabParam === 'login' && canViewLoginAudit) return 'login';
    return 'audit';
  }, [rawTabParam, canViewLoginAudit]);

  const selectTab = (tab: ActivityLogTabKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  // Actors list for filters
  const [actors, setActors] = useState<AuditLogActor[]>([]);

  useEffect(() => {
    let mounted = true;
    activityLogsApi
      .getActors()
      .then((list) => {
        if (mounted) setActors(list);
      })
      .catch(() => {
        // Ignore if actors endpoint fails
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ==========================================================================
  // TAB 1: AUDIT LOGS (THAO TÁC TRÊN WEB)
  // ==========================================================================
  const [auditModule, setAuditModule] = useState<AuditModuleKey>('ALL');
  const [auditActorId, setAuditActorId] = useState<string>('');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditFromDate, setAuditFromDate] = useState<string>('');
  const [auditToDate, setAuditToDate] = useState<string>('');
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditLimit, setAuditLimit] = useState<number>(20);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditData, setAuditData] = useState<AuditLogListResponse>({
    success: true,
    stats: {
      todayTotal: 0,
      todayByModule: {},
      lastActivityAt: null,
    },
    moduleCounts: {},
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [selectedAuditItem, setSelectedAuditItem] = useState<AuditLogItem | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setAuditLoading(true);
      const res = await activityLogsApi.getAuditLogs({
        module: auditModule,
        actorId: auditActorId || undefined,
        search: auditSearch.trim() || undefined,
        fromDate: auditFromDate || undefined,
        toDate: auditToDate || undefined,
        page: auditPage,
        limit: auditLimit,
      });
      if (res && Array.isArray(res.items)) {
        setAuditData(res);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || 'Không thể tải nhật ký thao tác trên Web'
      );
    } finally {
      setAuditLoading(false);
    }
  }, [
    auditModule,
    auditActorId,
    auditSearch,
    auditFromDate,
    auditToDate,
    auditPage,
    auditLimit,
    toast,
  ]);

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  const handleExportAuditCsv = () => {
    const headers = [
      'ID',
      'Thời gian',
      'Người thực hiện',
      'Email',
      'Phân hệ',
      'Hành động',
      'Đối tượng',
      'Tóm tắt thay đổi',
      'Số trường đổi',
      'IP',
    ];
    const rows = auditData.items.map((it) => [
      it.id,
      formatDateTimeFull(it.createdAt),
      it.actor?.displayLabel || it.actor?.name || 'Hệ thống',
      it.actor?.email || '',
      it.moduleLabel || MODULE_STYLE_MAP[it.module]?.label || it.module,
      it.actionLabel || it.action,
      it.entityLabel || `${it.entityType}#${it.entityId}`,
      it.summary,
      it.changedFields?.length || 0,
      it.ipAddress || '',
    ]);
    downloadCsvFile('lich_su_thao_tac_web.csv', headers, rows);
    toast.success('Đã xuất file CSV lịch sử thao tác trên Web!');
  };

  // ==========================================================================
  // TAB 2: SYNC HISTORY (LỊCH SỬ ĐỒNG BỘ 4 LUỒNG)
  // ==========================================================================
  const [syncFromDate, setSyncFromDate] = useState<string>('');
  const [syncToDate, setSyncToDate] = useState<string>('');
  const [syncProgramFilter, setSyncProgramFilter] = useState<string>('ALL');
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('ALL');
  const [syncLoading, setSyncLoading] = useState<boolean>(false);
  const [syncHistory, setSyncHistory] = useState<SyncHistoryResponse>({
    stats: {
      todayTotal: 0,
      todaySuccess: 0,
      todayFailed: 0,
      lastRunTime: null,
    },
    items: [],
    total: 0,
  });

  const fetchSyncHistory = useCallback(async () => {
    try {
      setSyncLoading(true);
      const res = await importsApi.getSheetSyncHistory({
        programType: syncProgramFilter === 'ALL' ? undefined : syncProgramFilter,
        status: syncStatusFilter === 'ALL' ? undefined : syncStatusFilter,
        fromDate: syncFromDate || undefined,
        toDate: syncToDate || undefined,
        limit: 100,
      });
      if (res && Array.isArray(res.items)) {
        setSyncHistory(res);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || 'Không thể tải lịch sử đồng bộ'
      );
    } finally {
      setSyncLoading(false);
    }
  }, [syncProgramFilter, syncStatusFilter, syncFromDate, syncToDate, toast]);

  useEffect(() => {
    if (activeTab === 'sync') {
      fetchSyncHistory();
    }
  }, [activeTab, fetchSyncHistory]);

  const handleExportSyncHistoryCsv = () => {
    const headers = [
      'ID',
      'Thời gian',
      'Nguồn đồng bộ',
      'Chương trình',
      'Kích hoạt',
      'Tổng dòng',
      'Tạo mới',
      'Cập nhật',
      'Kết quả',
      'Thời lượng (giây)',
    ];
    const rows = syncHistory.items.map((item: SyncHistoryItem) => [
      item.id,
      formatDateTimeFull(item.createdAt),
      item.name || item.code,
      item.programType,
      item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công',
      item.totalRows,
      item.createdCount,
      item.updatedCount,
      item.status === 'FAILED' ? 'Thất bại' : 'Thành công',
      item.durationSec,
    ]);
    downloadCsvFile('lich_su_dong_bo_4_luong.csv', headers, rows);
    toast.success('Đã xuất file CSV lịch sử đồng bộ!');
  };

  // ==========================================================================
  // TAB 3: BACKUP HISTORY (LỊCH SỬ BACKUP GOOGLE SHEET & EXCEL)
  // ==========================================================================
  const [backupFromDate, setBackupFromDate] = useState<string>('');
  const [backupToDate, setBackupToDate] = useState<string>('');
  const [backupProgramFilter, setBackupProgramFilter] = useState<string>('ALL');
  const [backupStatusFilter, setBackupStatusFilter] = useState<string>('ALL');
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [downloadingConfigId, setDownloadingConfigId] = useState<number | null>(null);
  const [selectedBackupItem, setSelectedBackupItem] = useState<{
    batch: BackupHistoryBatch;
    item: BackupHistoryItem;
  } | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryResponse>({
    stats: {
      todayTotal: 0,
      todaySuccess: 0,
      todayFailed: 0,
      lastRunTime: null,
    },
    batches: [],
    total: 0,
  });

  const fetchBackupHistory = useCallback(async () => {
    try {
      setBackupLoading(true);
      const res = await importsApi.getSheetBackupHistory({
        programType: backupProgramFilter === 'ALL' ? undefined : backupProgramFilter,
        status: backupStatusFilter === 'ALL' ? undefined : backupStatusFilter,
        fromDate: backupFromDate || undefined,
        toDate: backupToDate || undefined,
        limit: 50,
      });
      if (res && Array.isArray(res.batches)) {
        setBackupHistory(res);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || 'Không thể tải lịch sử backup'
      );
    } finally {
      setBackupLoading(false);
    }
  }, [backupProgramFilter, backupStatusFilter, backupFromDate, backupToDate, toast]);

  useEffect(() => {
    if (activeTab === 'backup') {
      fetchBackupHistory();
    }
  }, [activeTab, fetchBackupHistory]);

  const handleDownloadBackupExcel = async (item: BackupHistoryItem) => {
    if (!item.configId) return;
    try {
      setDownloadingConfigId(item.configId);
      const fileName = getBackupFilenameFromItem(item);
      await importsApi.downloadCsSheetBackupExcel(item.configId, fileName);
      toast.success(`Đã tải file Excel: ${fileName}`);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || 'Không tải được file Excel backup'
      );
    } finally {
      setDownloadingConfigId(null);
    }
  };

  const handleExportBackupCsv = () => {
    const headers = [
      'Mã đợt (Batch)',
      'Thời gian',
      'Kích hoạt',
      'Chế độ',
      'Sổ Backup',
      'Chương trình',
      'Tổng HV',
      'Tổng ô cập nhật',
      'Ô Hồ sơ',
      'Ô Chấm buổi',
      'Ô Điểm danh chốt',
      'Đẩy Google Sheet',
      'Kết quả',
      'Thời lượng (giây)',
    ];
    const rows: (string | number)[][] = [];
    backupHistory.batches.forEach((batch) => {
      batch.items.forEach((it) => {
        const profileCells =
          it.profile?.updatedCellsCount ?? it.summary?.profile?.updatedCellsCount ?? 0;
        const attCells =
          it.attendance?.updatedCellsCount ??
          it.summary?.attendance?.updatedCellsCount ??
          it.attendanceCellsWritten ??
          0;
        const finalCells =
          it.finalAttendance?.updatedCellsCount ??
          it.summary?.finalAttendance?.updatedCellsCount ??
          0;
        rows.push([
          batch.batchId,
          formatDateTimeFull(it.createdAt || batch.startedAt),
          it.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công',
          it.mode || batch.mode || 'DELTA',
          `${it.staffCode || it.programType} - ${it.configName || ''}`,
          it.programType,
          it.totalStudents ?? 0,
          it.updatedCellsCount ?? 0,
          profileCells,
          attCells,
          finalCells,
          it.syncedToGoogleSheet ? 'Đã đẩy Sheet' : 'Lưu Excel Local',
          it.status === 'SUCCESS' ? 'Thành công' : 'Thất bại',
          it.durationSec ?? batch.durationSec ?? 0,
        ]);
      });
    });
    downloadCsvFile('lich_su_backup_sheet_excel.csv', headers, rows);
    toast.success('Đã xuất file CSV lịch sử Backup!');
  };

  // ==========================================================================
  // TAB 4: LOGIN AUDIT (LỊCH SỬ ĐĂNG NHẬP & BẢO MẬT)
  // ==========================================================================
  const [loginStatus, setLoginStatus] = useState<LoginAuditStatus>('ALL');
  const [loginActorId, setLoginActorId] = useState<string>('');
  const [loginSearch, setLoginSearch] = useState<string>('');
  const [loginFromDate, setLoginFromDate] = useState<string>('');
  const [loginToDate, setLoginToDate] = useState<string>('');
  const [loginPage, setLoginPage] = useState<number>(1);
  const [loginLimit, setLoginLimit] = useState<number>(20);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);
  const [loginData, setLoginData] = useState<LoginAuditListResponse>({
    success: true,
    stats: {
      todayTotal: 0,
      todaySuccess: 0,
      todayFailed: 0,
      lastLoginAt: null,
    },
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });

  const fetchLoginLogs = useCallback(async () => {
    if (!canViewLoginAudit) return;
    try {
      setLoginLoading(true);
      const res = await activityLogsApi.getLoginLogs({
        status: loginStatus,
        actorId: loginActorId || undefined,
        search: loginSearch.trim() || undefined,
        fromDate: loginFromDate || undefined,
        toDate: loginToDate || undefined,
        page: loginPage,
        limit: loginLimit,
      });
      if (res && Array.isArray(res.items)) {
        setLoginData(res);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || 'Không thể tải lịch sử đăng nhập'
      );
    } finally {
      setLoginLoading(false);
    }
  }, [
    canViewLoginAudit,
    loginStatus,
    loginActorId,
    loginSearch,
    loginFromDate,
    loginToDate,
    loginPage,
    loginLimit,
    toast,
  ]);

  useEffect(() => {
    if (activeTab === 'login' && canViewLoginAudit) {
      fetchLoginLogs();
    }
  }, [activeTab, canViewLoginAudit, fetchLoginLogs]);

  const handleExportLoginCsv = () => {
    const headers = [
      'ID',
      'Thời gian',
      'Nhân viên',
      'Email đăng nhập',
      'Trạng thái',
      'Địa chỉ IP',
      'Thiết bị / Trình duyệt',
      'Ghi chú / Lý do',
    ];
    const rows = loginData.items.map((it: LoginAuditItem) => [
      it.id,
      formatDateTimeFull(it.createdAt),
      it.actor?.displayLabel || it.actor?.name || '--',
      it.emailAttempted,
      it.status,
      it.ipAddress || '--',
      parseUserAgent(it.userAgent).label,
      it.reason || '',
    ]);
    downloadCsvFile('lich_su_dang_nhap_bao_mat.csv', headers, rows);
    toast.success('Đã xuất file CSV lịch sử đăng nhập!');
  };

  const renderLoginStatusBadge = (status: LoginAuditItem['status']) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <Badge variant="success" size="sm" dot>
            Thành công
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="danger" size="sm" dot>
            Sai mật khẩu
          </Badge>
        );
      case 'LOCKED':
        return (
          <Badge variant="warning" size="sm" dot>
            Bị khóa
          </Badge>
        );
      case 'DISABLED':
        return (
          <Badge variant="neutral" size="sm" dot>
            Vô hiệu hóa
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" size="sm">
            {status}
          </Badge>
        );
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <PageContainer>
      <div className="space-y-5">
        {/* A. TOP HEADER BAR */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <History className="w-6 h-6 text-blue-600" />
              <span>Lịch sử hoạt động &amp; Kiểm toán hệ thống</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Theo dõi tập trung toàn bộ thao tác người dùng trên Web (Trước → Sau), Lịch sử Đồng bộ 4 luồng, Lịch sử Backup Sheet/Excel và Nhật ký Đăng nhập
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/data-sync?tab=configs')}
              leftIcon={<RefreshCw className="w-3.5 h-3.5 text-blue-600" />}
            >
              Trang Đồng bộ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/data-backup?tab=configs')}
              leftIcon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />}
            >
              Trang Backup
            </Button>
          </div>
        </div>

        {/* B. 4 UNDERLINE TABS (GIỐNG GOOGLE SHEET SYNC PANEL) */}
        <div className="border-b border-slate-200 flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => selectTab('audit')}
            className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Thao tác trên Web</span>
            {auditData.total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 font-bold">
                {auditData.total}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => selectTab('sync')}
            className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'sync'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Lịch sử Đồng bộ (4 luồng)</span>
          </button>

          <button
            type="button"
            onClick={() => selectTab('backup')}
            className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'backup'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Lịch sử Backup (Sheet &amp; Excel)</span>
          </button>

          {canViewLoginAudit && (
            <button
              type="button"
              onClick={() => selectTab('login')}
              className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'login'
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Lịch sử Đăng nhập &amp; Bảo mật</span>
            </button>
          )}
        </div>

        {/* ====================================================================
            TAB 1: THAO TÁC TRÊN WEB (AUDIT)
           ==================================================================== */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            {/* 1. Thanh chỉ số hôm nay + Xuất CSV */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
                <span>
                  Hôm nay:{' '}
                  <strong className="text-blue-600 font-bold">
                    {auditData.stats?.todayTotal ?? 0} thao tác
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-violet-600 font-bold">
                    {auditData.stats?.todayByModule?.ENROLLMENT ?? 0} Học viên &amp; Ghi danh
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-emerald-600 font-bold">
                    {auditData.stats?.todayByModule?.ATTENDANCE ?? 0} Điểm danh &amp; Lớp học
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Gần nhất{' '}
                  <strong className="text-slate-900 font-semibold">
                    {formatTimeShort(auditData.stats?.lastActivityAt)}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportAuditCsv}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất lịch sử CSV</span>
              </button>
            </div>

            {/* 2. Dãy Flow Cards (Thẻ lọc nhanh theo Phân hệ) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
              {AUDIT_MODULE_CARDS.map((card) => {
                const isActive = auditModule === card.key;
                const count =
                  card.key === 'ALL'
                    ? auditData.moduleCounts?.ALL ?? auditData.total ?? 0
                    : auditData.moduleCounts?.[card.key] ?? 0;

                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => {
                      setAuditModule(card.key);
                      setAuditPage(1);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isActive
                        ? `${card.activeBorder} shadow-sm`
                        : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold truncate ${
                          isActive ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {card.icon}
                        <span className="truncate">{card.title}</span>
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[11px] font-extrabold shrink-0 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        isActive ? 'text-white/85' : 'text-slate-500'
                      }`}
                    >
                      {card.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 3. Thanh Bộ lọc */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditSearch(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="Tìm mã HV, tên HV, mã lớp, nội dung thay đổi..."
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 h-9 text-xs text-slate-600">
                <span className="text-slate-400">Từ:</span>
                <input
                  type="date"
                  value={auditFromDate}
                  onChange={(e) => {
                    setAuditFromDate(e.target.value);
                    setAuditPage(1);
                  }}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
                <span className="text-slate-300">—</span>
                <span className="text-slate-400">Đến:</span>
                <input
                  type="date"
                  value={auditToDate}
                  onChange={(e) => {
                    setAuditToDate(e.target.value);
                    setAuditPage(1);
                  }}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
              </div>

              <select
                value={auditActorId}
                onChange={(e) => {
                  setAuditActorId(e.target.value);
                  setAuditPage(1);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="">Người thực hiện: Tất cả</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={String(actor.id)}>
                    {actor.displayLabel ||
                      `${actor.code ? `[${actor.code}] ` : ''}${actor.name || actor.email}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                title="Làm mới nhật ký"
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>Làm mới</span>
              </button>
            </div>

            {/* 4. Bảng Danh Sách Thao tác */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 pl-4 pr-3">Thời gian</th>
                      <th className="py-3 px-3">Người thực hiện</th>
                      <th className="py-3 px-3">Phân hệ</th>
                      <th className="py-3 px-3">Hành động</th>
                      <th className="py-3 px-3">Đối tượng</th>
                      <th className="py-3 px-3">Tóm tắt thay đổi</th>
                      <th className="py-3 pl-3 pr-4 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {auditLoading && auditData.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-600" />
                          Đang tải nhật ký thao tác...
                        </td>
                      </tr>
                    ) : auditData.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          Chưa có bản ghi thao tác nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      auditData.items.map((item) => {
                        const modStyle = MODULE_STYLE_MAP[item.module] || {
                          label: item.moduleLabel || item.module,
                          className: 'bg-slate-100 text-slate-700 border border-slate-200',
                        };
                        const diffCount = item.changedFields?.length || 0;

                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedAuditItem(item)}
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                              {formatDateTimeFull(item.createdAt)}
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              {item.actor ? (
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900">
                                      {item.actor.name || item.actor.email}
                                    </span>
                                    {item.actor.code && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[10px]">
                                        {item.actor.code}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                    <span>{item.actor.email}</span>
                                    {item.actor.roles?.length > 0 && (
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        ({item.actor.roles.join(', ')})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-500 italic">Hệ thống tự động</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3 align-middle whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${modStyle.className}`}
                              >
                                {item.moduleLabel || modStyle.label}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              <span className="font-semibold text-slate-900">
                                {item.actionLabel || item.action}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              <div className="font-bold text-slate-800 max-w-[220px] truncate" title={item.entityLabel}>
                                {item.entityLabel || `${item.entityType} #${item.entityId}`}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                {item.entityType} · ID: {item.entityId}
                              </div>
                            </td>

                            <td className="py-3.5 px-3 align-middle max-w-[320px]">
                              <div className="text-slate-700 line-clamp-2" title={item.summary}>
                                {item.summary}
                              </div>
                              {diffCount > 0 && (
                                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                                  <span>{diffCount} trường thay đổi</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                  <span>Xem đối chiếu</span>
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 pl-3 pr-4 align-middle text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAuditItem(item);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-blue-600 font-semibold text-xs transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Trước → Sau</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Phân trang chuẩn (20 / 50 / 100 dòng) */}
              <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>
                    Hiển thị{' '}
                    <strong className="text-slate-900">{auditData.items.length}</strong> /{' '}
                    <strong className="text-slate-900">{auditData.total}</strong> thao tác
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>Số dòng:</span>
                  <select
                    value={auditLimit}
                    onChange={(e) => {
                      setAuditLimit(Number(e.target.value));
                      setAuditPage(1);
                    }}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value={20}>20 / trang</option>
                    <option value={50}>50 / trang</option>
                    <option value={100}>100 / trang</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Trước
                  </button>
                  <span className="font-semibold text-slate-700">
                    Trang {auditPage} / {Math.max(1, auditData.totalPages || 1)}
                  </span>
                  <button
                    type="button"
                    disabled={auditPage >= (auditData.totalPages || 1)}
                    onClick={() =>
                      setAuditPage((p) => Math.min(auditData.totalPages || 1, p + 1))
                    }
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 2: LỊCH SỬ ĐỒNG BỘ 4 LUỒNG (SYNC)
           ==================================================================== */}
        {activeTab === 'sync' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
                <span>
                  Hôm nay:{' '}
                  <strong className="text-blue-600 font-bold">
                    {syncHistory.stats?.todayTotal ?? 0} lượt chạy
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-emerald-600 font-bold">
                    {syncHistory.stats?.todaySuccess ?? 0} thành công
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-rose-600 font-bold">
                    {syncHistory.stats?.todayFailed ?? 0} thất bại
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Lần gần nhất{' '}
                  <strong className="text-slate-900 font-semibold">
                    {syncHistory.stats?.lastRunTime || '--:--'}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportSyncHistoryCsv}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất lịch sử CSV</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9 text-xs text-slate-600">
                <span className="text-slate-400">Từ:</span>
                <input
                  type="date"
                  value={syncFromDate}
                  onChange={(e) => setSyncFromDate(e.target.value)}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
                <span className="text-slate-300">—</span>
                <span className="text-slate-400">Đến:</span>
                <input
                  type="date"
                  value={syncToDate}
                  onChange={(e) => setSyncToDate(e.target.value)}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
              </div>

              <select
                value={syncProgramFilter}
                onChange={(e) => setSyncProgramFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả chương trình</option>
                <option value="JLPT">JLPT</option>
                <option value="KAIWA">KAIWA</option>
              </select>

              <select
                value={syncStatusFilter}
                onChange={(e) => setSyncStatusFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả kết quả</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Thất bại</option>
              </select>

              <button
                type="button"
                onClick={fetchSyncHistory}
                disabled={syncLoading}
                title="Làm mới lịch sử"
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>Làm mới</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 pl-4 pr-3">Thời gian</th>
                      <th className="py-3 px-3">Nguồn đồng bộ</th>
                      <th className="py-3 px-3">Chương trình</th>
                      <th className="py-3 px-3">Kích hoạt</th>
                      <th className="py-3 px-3">Tổng dòng</th>
                      <th className="py-3 px-3">Tạo mới</th>
                      <th className="py-3 px-3">Cập nhật</th>
                      <th className="py-3 px-3">Kết quả</th>
                      <th className="py-3 px-3">Thời lượng</th>
                      <th className="py-3 pl-3 pr-4 text-right">
                        Chi tiết &amp; Hoàn tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {syncLoading && syncHistory.items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-600" />
                          Đang tải lịch sử đồng bộ...
                        </td>
                      </tr>
                    ) : syncHistory.items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          Chưa có phiên chạy đồng bộ nào khớp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      syncHistory.items.map((item) => {
                        const isJlpt = (item.programType || '').toUpperCase() === 'JLPT';
                        const isFailed = item.status === 'FAILED';

                        return (
                          <tr
                            key={item.id}
                            onClick={() =>
                              navigate(
                                `/data-sync/history/${item.id}?code=${encodeURIComponent(
                                  item.code
                                )}`
                              )
                            }
                            className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                          >
                            <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                              {formatDateTimeFull(item.createdAt)}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-bold text-slate-900">
                              {item.name || item.code}
                            </td>
                            <td className="py-3.5 px-3 align-middle">
                              <span
                                className={
                                  isJlpt
                                    ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                    : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                }
                              >
                                {item.programType}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 align-middle text-slate-600">
                              {item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-slate-800">
                              {item.totalRows}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-emerald-600">
                              +{item.createdCount}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-blue-600">
                              ~{item.updatedCount}
                            </td>
                            <td className="py-3.5 px-3 align-middle">
                              {isFailed ? (
                                <Badge variant="danger" size="sm" dot>
                                  Thất bại
                                </Badge>
                              ) : (
                                <Badge variant="success" size="sm" dot>
                                  Thành công
                                </Badge>
                              )}
                            </td>
                            <td className="py-3.5 px-3 align-middle text-slate-600">
                              {item.durationSec} giây
                            </td>
                            <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                              <span className="text-blue-600 font-semibold hover:underline">
                                Xem &amp; Hoàn tác →
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            TAB 3: LỊCH SỬ BACKUP GOOGLE SHEET & EXCEL (BACKUP)
           ==================================================================== */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            {/* Thanh thống kê hôm nay */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
                <span>
                  Hôm nay:{' '}
                  <strong className="text-blue-600 font-bold">
                    {backupHistory.stats?.todayTotal ?? 0} lượt backup
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-emerald-600 font-bold">
                    {backupHistory.stats?.todaySuccess ?? 0} thành công
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-rose-600 font-bold">
                    {backupHistory.stats?.todayFailed ?? 0} thất bại
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Lần gần nhất{' '}
                  <strong className="text-slate-900 font-semibold">
                    {backupHistory.stats?.lastRunTime || '--:--'}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportBackupCsv}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất CSV</span>
              </button>
            </div>

            {/* Thanh bộ lọc */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9 text-xs text-slate-600">
                <span className="text-slate-400">Từ:</span>
                <input
                  type="date"
                  value={backupFromDate}
                  onChange={(e) => setBackupFromDate(e.target.value)}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
                <span className="text-slate-300">—</span>
                <span className="text-slate-400">Đến:</span>
                <input
                  type="date"
                  value={backupToDate}
                  onChange={(e) => setBackupToDate(e.target.value)}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
              </div>

              <select
                value={backupProgramFilter}
                onChange={(e) => setBackupProgramFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả nhóm sổ / Chương trình</option>
                <option value="ADMIN_KAIWA">Admin Master Kaiwa</option>
                <option value="ADMIN_JLPT">Admin Master JLPT</option>
                <option value="ADMIN_RECONCILIATION">Admin Đối soát</option>
                <option value="KAIWA">Sổ CSKH Kaiwa</option>
                <option value="JLPT">Sổ CSKH JLPT</option>
                <option value="TEACHER">Sổ Giáo viên</option>
                <option value="REPORT_KAIWA">Báo cáo HV Kaiwa</option>
                <option value="REPORT_JLPT">Báo cáo HV JLPT</option>
              </select>

              <select
                value={backupStatusFilter}
                onChange={(e) => setBackupStatusFilter(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Thất bại</option>
              </select>

              <button
                type="button"
                onClick={fetchBackupHistory}
                disabled={backupLoading}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${backupLoading ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>Làm mới</span>
              </button>
            </div>

            {/* Danh sách các đợt chạy (Batches) và từng sổ (Items) */}
            {backupLoading && backupHistory.batches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-600" />
                Đang tải lịch sử các đợt chạy Backup...
              </div>
            ) : backupHistory.batches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-xs text-slate-500">
                Chưa có lịch sử chạy backup nào khớp với bộ lọc.
              </div>
            ) : (
              <div className="space-y-4">
                {backupHistory.batches.map((batch) => (
                  <div
                    key={batch.batchId}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
                  >
                    {/* Batch Header */}
                    <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-bold text-[11px]">
                          Đợt: {batch.batchId}
                        </span>
                        <span className="font-semibold text-slate-800 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateTimeFull(batch.startedAt)}
                        </span>
                        <Badge variant="neutral" size="sm">
                          {batch.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                        </Badge>
                        <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-mono font-bold text-[10px]">
                          {batch.mode || 'DELTA'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge
                          variant={batch.failedCount === 0 ? 'success' : 'warning'}
                          size="sm"
                          dot
                        >
                          {batch.successCount}/{batch.totalConfigs} sổ thành công
                        </Badge>
                        <span className="text-slate-600 font-semibold">
                          · Tổng {batch.updatedCellsCount ?? 0} ô cập nhật ({batch.durationSec}s)
                        </span>
                      </div>
                    </div>

                    {/* Items Table inside Batch */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 pl-4 pr-3">Sổ Backup</th>
                            <th className="py-2.5 px-3">Chế độ</th>
                            <th className="py-2.5 px-3">Tổng HV</th>
                            <th className="py-2.5 px-3">
                              Số ô cập nhật (Hồ sơ / Chấm buổi / Chốt)
                            </th>
                            <th className="py-2.5 px-3">Google Sheet</th>
                            <th className="py-2.5 px-3">Kết quả</th>
                            <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {batch.items.map((it) => {
                            const progBadge = getBackupProgramBadge(it.programType);
                            const profileCells =
                              it.profile?.updatedCellsCount ??
                              it.summary?.profile?.updatedCellsCount ??
                              0;
                            const attCells =
                              it.attendance?.updatedCellsCount ??
                              it.summary?.attendance?.updatedCellsCount ??
                              it.attendanceCellsWritten ??
                              0;
                            const finalCells =
                              it.finalAttendance?.updatedCellsCount ??
                              it.summary?.finalAttendance?.updatedCellsCount ??
                              0;

                            return (
                              <tr
                                key={it.id}
                                className="hover:bg-slate-50/70 transition-colors"
                              >
                                <td className="py-3 pl-4 pr-3 align-middle">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${progBadge.className}`}
                                    >
                                      {progBadge.label}
                                    </span>
                                    <span className="font-bold text-slate-900">
                                      {it.staffCode ? `${it.staffCode} · ` : ''}
                                      {it.configName || it.staffName || `Sổ #${it.configId}`}
                                    </span>
                                  </div>
                                </td>

                                <td className="py-3 px-3 align-middle">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold text-[11px]">
                                    {it.mode || batch.mode || 'DELTA'}
                                  </span>
                                </td>

                                <td className="py-3 px-3 align-middle font-semibold text-slate-800">
                                  {it.totalStudents ?? it.summary?.totalStudents ?? 0} HV
                                </td>

                                <td className="py-3 px-3 align-middle">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-bold text-emerald-700">
                                      +{it.updatedCellsCount ?? 0} ô
                                    </span>
                                    <span className="text-slate-300">|</span>
                                    <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[11px] font-medium">
                                      Hồ sơ: {profileCells}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-medium">
                                      Chấm buổi: {attCells}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 text-[11px] font-medium">
                                      Chốt: {finalCells}
                                    </span>
                                  </div>
                                </td>

                                <td className="py-3 px-3 align-middle">
                                  {it.syncedToGoogleSheet ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Đã đẩy Google Sheet
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-slate-500 font-medium text-[11px]">
                                      <FileSpreadsheet className="w-3.5 h-3.5" />
                                      Lưu Excel Local
                                    </span>
                                  )}
                                </td>

                                <td className="py-3 px-3 align-middle">
                                  {it.status === 'SUCCESS' ? (
                                    <Badge variant="success" size="sm" dot>
                                      Thành công
                                    </Badge>
                                  ) : (
                                    <Badge variant="danger" size="sm" dot>
                                      Thất bại
                                    </Badge>
                                  )}
                                </td>

                                <td className="py-3 pl-3 pr-4 align-middle text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setSelectedBackupItem({ batch, item: it })
                                      }
                                      leftIcon={<Eye className="w-3.5 h-3.5" />}
                                    >
                                      Chi tiết 3 Sheet
                                    </Button>
                                    {it.configId && (
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handleDownloadBackupExcel(it)}
                                        isLoading={downloadingConfigId === it.configId}
                                        leftIcon={<Download className="w-3.5 h-3.5" />}
                                      >
                                        .xlsx
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 4: LỊCH SỬ ĐĂNG NHẬP & BẢO MẬT (LOGIN)
           ==================================================================== */}
        {activeTab === 'login' && canViewLoginAudit && (
          <div className="space-y-4">
            {/* Thanh thống kê hôm nay */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
                <span>
                  Hôm nay:{' '}
                  <strong className="text-blue-600 font-bold">
                    {loginData.stats?.todayTotal ?? 0} lượt đăng nhập
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-emerald-600 font-bold">
                    {loginData.stats?.todaySuccess ?? 0} thành công
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <strong className="text-rose-600 font-bold">
                    {loginData.stats?.todayFailed ?? 0} thất bại / cảnh báo
                  </strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Gần nhất{' '}
                  <strong className="text-slate-900 font-semibold">
                    {formatTimeShort(loginData.stats?.lastLoginAt)}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleExportLoginCsv}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất CSV</span>
              </button>
            </div>

            {/* Thanh bộ lọc */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={loginSearch}
                  onChange={(e) => {
                    setLoginSearch(e.target.value);
                    setLoginPage(1);
                  }}
                  placeholder="Tìm theo Email đăng nhập hoặc Địa chỉ IP..."
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 h-9 text-xs text-slate-600">
                <span className="text-slate-400">Từ:</span>
                <input
                  type="date"
                  value={loginFromDate}
                  onChange={(e) => {
                    setLoginFromDate(e.target.value);
                    setLoginPage(1);
                  }}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
                <span className="text-slate-300">—</span>
                <span className="text-slate-400">Đến:</span>
                <input
                  type="date"
                  value={loginToDate}
                  onChange={(e) => {
                    setLoginToDate(e.target.value);
                    setLoginPage(1);
                  }}
                  className="text-xs text-slate-700 focus:outline-none bg-transparent"
                />
              </div>

              <select
                value={loginStatus}
                onChange={(e) => {
                  setLoginStatus(e.target.value as LoginAuditStatus);
                  setLoginPage(1);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Trạng thái: Tất cả</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Sai mật khẩu</option>
                <option value="LOCKED">Bị khóa</option>
                <option value="DISABLED">Vô hiệu hóa</option>
              </select>

              <select
                value={loginActorId}
                onChange={(e) => {
                  setLoginActorId(e.target.value);
                  setLoginPage(1);
                }}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="">Người dùng: Tất cả</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={String(actor.id)}>
                    {actor.displayLabel ||
                      `${actor.code ? `[${actor.code}] ` : ''}${actor.name || actor.email}`}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={fetchLoginLogs}
                disabled={loginLoading}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loginLoading ? 'animate-spin text-blue-600' : ''}`}
                />
                <span>Làm mới</span>
              </button>
            </div>

            {/* Bảng Lịch sử Đăng nhập */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 pl-4 pr-3">Thời gian</th>
                      <th className="py-3 px-3">Nhân viên</th>
                      <th className="py-3 px-3">Email đăng nhập</th>
                      <th className="py-3 px-3">Trạng thái</th>
                      <th className="py-3 px-3">Địa chỉ IP</th>
                      <th className="py-3 px-3">Thiết bị / Trình duyệt</th>
                      <th className="py-3 pl-3 pr-4">Ghi chú / Lý do</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {loginLoading && loginData.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-600" />
                          Đang tải nhật ký đăng nhập...
                        </td>
                      </tr>
                    ) : loginData.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          Chưa có lịch sử đăng nhập nào khớp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      loginData.items.map((it) => {
                        const uaInfo = parseUserAgent(it.userAgent);
                        return (
                          <tr
                            key={it.id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                              {formatDateTimeFull(it.createdAt)}
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              {it.actor ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-900">
                                    {it.actor.name || it.actor.email}
                                  </span>
                                  {it.actor.code && (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[10px]">
                                      {it.actor.code}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Chưa xác định</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3 align-middle font-mono text-slate-700">
                              {it.emailAttempted}
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              {renderLoginStatusBadge(it.status)}
                            </td>

                            <td className="py-3.5 px-3 align-middle font-mono text-slate-700">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                                <Globe className="w-3 h-3 text-slate-400" />
                                {it.ipAddress || '--'}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 align-middle">
                              <div
                                className="inline-flex items-center gap-1.5 text-slate-700 font-medium"
                                title={it.userAgent || ''}
                              >
                                {uaInfo.isMobile ? (
                                  <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <Monitor className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <span>{uaInfo.label}</span>
                              </div>
                            </td>

                            <td className="py-3.5 pl-3 pr-4 align-middle text-slate-600">
                              {it.reason || (it.status === 'SUCCESS' ? 'Đăng nhập hợp lệ' : '--')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Phân trang */}
              <div className="px-4 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>
                    Hiển thị{' '}
                    <strong className="text-slate-900">{loginData.items.length}</strong> /{' '}
                    <strong className="text-slate-900">{loginData.total}</strong> bản ghi
                  </span>
                  <span className="text-slate-300">|</span>
                  <span>Số dòng:</span>
                  <select
                    value={loginLimit}
                    onChange={(e) => {
                      setLoginLimit(Number(e.target.value));
                      setLoginPage(1);
                    }}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value={20}>20 / trang</option>
                    <option value={50}>50 / trang</option>
                    <option value={100}>100 / trang</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loginPage <= 1}
                    onClick={() => setLoginPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Trước
                  </button>
                  <span className="font-semibold text-slate-700">
                    Trang {loginPage} / {Math.max(1, loginData.totalPages || 1)}
                  </span>
                  <button
                    type="button"
                    disabled={loginPage >= (loginData.totalPages || 1)}
                    onClick={() =>
                      setLoginPage((p) => Math.min(loginData.totalPages || 1, p + 1))
                    }
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                  >
                    Sau
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          MODAL 1: CHI TIẾT THAO TÁC TRÊN WEB (TRƯỚC -> SAU)
         ==================================================================== */}
      <Modal
        isOpen={Boolean(selectedAuditItem)}
        onClose={() => setSelectedAuditItem(null)}
        title="Chi tiết thao tác & Đối chiếu dữ liệu (Trước → Sau)"
        size="lg"
      >
        {selectedAuditItem && (
          <div className="space-y-4 text-xs">
            {/* Thông tin chung */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Thời gian</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {formatDateTimeFull(selectedAuditItem.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Người thực hiện</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedAuditItem.actor?.displayLabel ||
                    selectedAuditItem.actor?.name ||
                    'Hệ thống tự động'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Phân hệ &amp; Hành động</div>
                <div className="font-bold text-blue-700 mt-0.5">
                  {selectedAuditItem.moduleLabel} · {selectedAuditItem.actionLabel}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Đối tượng tác động</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedAuditItem.entityLabel ||
                    `${selectedAuditItem.entityType} #${selectedAuditItem.entityId}`}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Mã thực thể</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  {selectedAuditItem.entityType} (ID: {selectedAuditItem.entityId})
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Địa chỉ IP</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  {selectedAuditItem.ipAddress || '--'}
                </div>
              </div>
            </div>

            {/* Tóm tắt */}
            <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200/70 text-slate-800">
              <span className="font-bold text-blue-800">Tóm tắt: </span>
              <span>{selectedAuditItem.summary}</span>
            </div>

            {/* Bảng đối chiếu Trường dữ liệu | Giá trị trước | Giá trị sau (hoặc 2 cột nếu là sự kiện Tạo mới / Đồng bộ / Backup không có beforeData) */}
            {selectedAuditItem.changedFields &&
            selectedAuditItem.changedFields.length > 0 ? (
              (() => {
                const hasAnyBeforeValue =
                  Boolean(selectedAuditItem.beforeData) &&
                  selectedAuditItem.changedFields.some(
                    (d) => d.before !== null && d.before !== undefined && d.before !== ''
                  );

                if (!hasAnyBeforeValue) {
                  return (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                            <th className="py-2.5 px-3 w-[40%]">Trường thông tin</th>
                            <th className="py-2.5 px-3 w-[60%]">Giá trị ghi nhận (Sau thao tác)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedAuditItem.changedFields.map((diff, idx) => (
                            <tr key={`${diff.field}-${idx}`} className="hover:bg-slate-50/60">
                              <td className="py-2.5 px-3 align-top">
                                <div className="font-bold text-slate-800">{diff.label}</div>
                                <div className="font-mono text-[10px] text-slate-400">
                                  {diff.field}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 align-top bg-emerald-50/30">
                                <span className="inline-block px-2 py-0.5 rounded bg-emerald-100/90 text-emerald-900 font-bold break-all">
                                  {formatDiffVal(diff.after)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }

                return (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                          <th className="py-2.5 px-3 w-[30%]">Trường dữ liệu</th>
                          <th className="py-2.5 px-3 w-[35%]">Giá trị trước</th>
                          <th className="py-2.5 px-3 w-[35%]">Giá trị sau</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedAuditItem.changedFields.map((diff, idx) => (
                          <tr key={`${diff.field}-${idx}`} className="hover:bg-slate-50/60">
                            <td className="py-2.5 px-3 align-top">
                              <div className="font-bold text-slate-800">{diff.label}</div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {diff.field}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 align-top bg-rose-50/40">
                              <span className="inline-block px-2 py-0.5 rounded bg-rose-100/80 text-rose-800 line-through break-all">
                                {formatDiffVal(diff.before)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 align-top bg-emerald-50/40">
                              <span className="inline-block px-2 py-0.5 rounded bg-emerald-100/90 text-emerald-900 font-bold break-all">
                                {formatDiffVal(diff.after)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            ) : (selectedAuditItem.beforeData || selectedAuditItem.afterData) ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
                  <div className="font-bold text-blue-800 mb-1.5 text-[11px] uppercase">
                    Thông tin chi tiết sự kiện
                  </div>
                  <pre className="text-[11px] font-mono text-slate-700 overflow-x-auto max-h-64 whitespace-pre-wrap">
                    {JSON.stringify(selectedAuditItem.afterData || selectedAuditItem.beforeData, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200/70">
                Thao tác này không ghi nhận thay đổi chi tiết.
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAuditItem(null)}
              >
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ====================================================================
          MODAL 2: CHI TIẾT THỐNG KÊ 3 SHEET CỦA LẦN CHẠY BACKUP
         ==================================================================== */}
      <Modal
        isOpen={Boolean(selectedBackupItem)}
        onClose={() => setSelectedBackupItem(null)}
        title="Chi tiết thống kê 3 Sheet của lần chạy Backup"
        size="lg"
      >
        {selectedBackupItem && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <div className="text-[11px] text-slate-400">Mã đợt chạy</div>
                <div className="font-mono font-bold text-indigo-700 mt-0.5">
                  {selectedBackupItem.batch.batchId}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Sổ Backup</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedBackupItem.item.staffCode
                    ? `${selectedBackupItem.item.staffCode} · `
                    : ''}
                  {selectedBackupItem.item.configName ||
                    selectedBackupItem.item.programType}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Thời gian &amp; Chế độ</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {formatDateTimeFull(
                    selectedBackupItem.item.createdAt ||
                      selectedBackupItem.batch.startedAt
                  )}{' '}
                  ({selectedBackupItem.item.mode || 'DELTA'})
                </div>
              </div>
            </div>

            {selectedBackupItem.item.error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                <span className="font-bold">Lỗi ghi nhận: </span>
                <span>{selectedBackupItem.item.error}</span>
              </div>
            )}

            {/* Bảng thống kê 3 Sheet */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="py-2.5 px-3">Sheet trong File</th>
                    <th className="py-2.5 px-3">Tổng dòng HV</th>
                    <th className="py-2.5 px-3">Giữ nguyên</th>
                    <th className="py-2.5 px-3">Dòng cập nhật</th>
                    <th className="py-2.5 px-3">Dòng thêm mới</th>
                    <th className="py-2.5 px-3 text-right">Số ô cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      title: '1. Sheet Hồ sơ / Chăm sóc',
                      stats:
                        selectedBackupItem.item.profile ||
                        selectedBackupItem.item.summary?.profile ||
                        selectedBackupItem.item.summary?.sheet1,
                    },
                    {
                      title: '2. Sheet Chấm buổi / Báo cáo',
                      stats:
                        selectedBackupItem.item.attendance ||
                        selectedBackupItem.item.summary?.attendance ||
                        selectedBackupItem.item.summary?.sheet3,
                    },
                    {
                      title: '3. Sheet Điểm danh chốt',
                      stats:
                        selectedBackupItem.item.finalAttendance ||
                        selectedBackupItem.item.summary?.finalAttendance,
                    },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        <div>{row.title}</div>
                        {row.stats?.sheetName && (
                          <div className="text-[11px] font-normal text-slate-500">
                            Tên tab: {row.stats.sheetName}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700">
                        {row.stats?.totalEnrollments ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {row.stats?.unchangedRows ?? 0}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-blue-600">
                        {row.stats?.updatedRows ?? 0}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-600">
                        +{row.stats?.appendedRows ?? 0}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                        +{row.stats?.updatedCellsCount ?? 0} ô
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedBackupItem.item.configId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownloadBackupExcel(selectedBackupItem.item)}
                  isLoading={downloadingConfigId === selectedBackupItem.item.configId}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  Tải file Excel (.xlsx)
                </Button>
              ) : (
                <div />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedBackupItem(null)}
              >
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default ActivityLogsPage;
