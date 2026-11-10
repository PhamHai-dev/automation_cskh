import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { importsApi } from '../api/imports.api';
import {
  BackupHistoryBatch,
  BackupHistoryItem,
  BackupHistoryResponse,
  CsSheetBackupConfigItem,
  CsUserOption,
  ServiceAccountInfo,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { SheetBackupAdminConfigCard } from '../../../pages/admin/components/SheetBackupAdminConfigCard';
import { BackupConfigModal } from './BackupConfigModal';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  History,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

type SubTabKey = 'configs' | 'history' | 'connection';
type BackupFlowGroup = 'ALL' | 'ADMIN' | 'CSKH' | 'TEACHER' | 'REPORT';

const FLOW_TABS: Array<{
  key: BackupFlowGroup;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'ALL',
    label: 'Tất cả',
    icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
  },
  {
    key: 'ADMIN',
    label: 'Sổ tổng',
    icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
  },
  {
    key: 'CSKH',
    label: 'Sổ CSKH',
    icon: <Users className="w-4 h-4 shrink-0" />,
  },
  {
    key: 'TEACHER',
    label: 'Điểm danh GV',
    icon: <CalendarCheck className="w-4 h-4 shrink-0" />,
  },
  {
    key: 'REPORT',
    label: 'Báo cáo học tập',
    icon: <FileText className="w-4 h-4 shrink-0" />,
  },
];

const GoogleColorIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

function classifyBackupFlow(programType?: string): Exclude<BackupFlowGroup, 'ALL'> {
  const pt = String(programType || '').toUpperCase();
  if (pt.startsWith('ADMIN_')) return 'ADMIN';
  if (pt.startsWith('REPORT_')) return 'REPORT';
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return 'TEACHER';
  return 'CSKH';
}

function getSheetsBadges(cfg: CsSheetBackupConfigItem, selectedYear: number | null): string[] {
  const pt = String(cfg.program_type || '').toUpperCase();
  const y = selectedYear || cfg.backup_year || new Date().getFullYear();
  if (pt === 'ADMIN_KAIWA') {
    return ['1.Chăm sóc', 'Báo cáo học tập Kaiwa', `Điểm danh chốt ${y}`];
  }
  if (pt === 'ADMIN_JLPT') {
    return ['Data JLPT_Inhouse', 'Chuyên cần HV', `Điểm danh chốt ${y}`];
  }
  if (pt === 'ADMIN_RECONCILIATION') {
    return ['Tổng hợp Đối soát', 'Thống kê Lệch & Chờ duyệt'];
  }
  if (pt === 'REPORT_KAIWA') {
    return ['Báo cáo học tập Kaiwa (61 cột)'];
  }
  if (pt === 'REPORT_JLPT') {
    return ['Chuyên cần HV (24 cột)', 'Nhật ký nhận xét buổi học'];
  }
  if (pt === 'TEACHER' || pt.startsWith('GV:')) {
    return [cfg.sheet_name || '2026 スケジュール'];
  }
  const tabs: string[] = [];
  if (cfg.profile_enabled !== false) {
    tabs.push(cfg.profile_sheet_name || (pt === 'JLPT' ? 'Data JLPT_Inhouse' : '1.Chăm sóc'));
  }
  tabs.push(cfg.sheet_name || (pt === 'JLPT' ? 'Chấm buổi' : '3.Chấm buổi'));
  if (cfg.final_enabled !== false) {
    tabs.push(cfg.final_sheet_name || 'Điểm danh chốt');
  }
  return tabs;
}

function renderFlowBadge(flow: Exclude<BackupFlowGroup, 'ALL'>) {
  switch (flow) {
    case 'ADMIN':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-800 border border-violet-200">
          Sổ tổng
        </span>
      );
    case 'CSKH':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          Sổ CSKH
        </span>
      );
    case 'TEACHER':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          Điểm danh GV
        </span>
      );
    case 'REPORT':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
          Báo cáo học tập
        </span>
      );
  }
}

function renderProgramBadge(programType?: string) {
  const pt = String(programType || '').toUpperCase();
  if (pt === 'ADMIN_RECONCILIATION') {
    return (
      <span className="bg-rose-100 text-rose-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]">
        ĐỐI SOÁT
      </span>
    );
  }
  if (pt.includes('JLPT')) {
    return (
      <span className="bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]">
        JLPT
      </span>
    );
  }
  if (pt === 'TEACHER' || pt.startsWith('GV:')) {
    return (
      <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 rounded-md text-[11px]">
        GIÁO VIÊN
      </span>
    );
  }
  return (
    <span className="bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]">
      KAIWA
    </span>
  );
}

function getDownloadFilename(cfg: CsSheetBackupConfigItem): string {
  const pt = String(cfg.program_type || '').toUpperCase();
  if (pt === 'ADMIN_KAIWA') return 'backup_admin_kaiwa.xlsx';
  if (pt === 'ADMIN_JLPT') return 'backup_admin_jlpt.xlsx';
  if (pt === 'ADMIN_RECONCILIATION') return 'backup_admin_doi_soat.xlsx';
  if (pt === 'REPORT_KAIWA') return 'backup_bao_cao_hoc_tap_kaiwa.xlsx';
  if (pt === 'REPORT_JLPT') return 'backup_bao_cao_hoc_tap_jlpt.xlsx';
  const staff = cfg.cs_user?.staff_code || `ID${cfg.id}`;
  if (pt === 'TEACHER' || pt.startsWith('GV:')) return `diem_danh_gv_${staff}.xlsx`;
  return `backup_cskh_${pt.toLowerCase()}_${staff}.xlsx`;
}

const formatDateParts = (iso?: string | null): { date: string; time: string } => {
  if (!iso) return { date: 'Chưa chạy', time: '-' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: 'Chưa chạy', time: '-' };
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${minutes}`,
  };
};

const formatDateTimeFull = (iso?: string | null): string => {
  if (!iso) return '-';
  const { date, time } = formatDateParts(iso);
  if (date === 'Chưa chạy') return '-';
  return `${date} ${time}`;
};

export interface CsSheetBackupPanelProps {
  initialTab?: SubTabKey;
}

export const CsSheetBackupPanel: React.FC<CsSheetBackupPanelProps> = ({ initialTab }) => {
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const canManage = Boolean(user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE'));
  const canViewConnection = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE' || r === 'CS')
  );

  const resolveActiveView = useCallback((): SubTabKey => {
    if (location.pathname.endsWith('/history')) return 'history';
    if (location.pathname.endsWith('/connection')) {
      return canViewConnection ? 'connection' : 'configs';
    }
    const raw = searchParams.get('sub') || searchParams.get('tab') || initialTab;
    if (raw === 'history') return 'history';
    if (raw === 'connection') return canViewConnection ? 'connection' : 'configs';
    return 'configs';
  }, [location.pathname, searchParams, initialTab, canViewConnection]);

  const [subTab, setSubTab] = useState<SubTabKey>(resolveActiveView);

  useEffect(() => {
    setSubTab(resolveActiveView());
  }, [resolveActiveView]);

  const changeSubTab = (next: SubTabKey) => {
    const nextPath = next === 'configs' ? '/data-backup' : `/data-backup/${next}`;
    navigate(nextPath, { replace: true });
  };

  // Configs state & Multi-filters
  const [configs, setConfigs] = useState<CsSheetBackupConfigItem[]>([]);
  const [csUsers, setCsUsers] = useState<CsUserOption[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([2025, 2026]);
  const [loading, setLoading] = useState(true);

  const [flowFilter, setFlowFilter] = useState<BackupFlowGroup>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<'ALL' | 'JLPT' | 'KAIWA'>('ALL');
  const [destTypeFilter, setDestTypeFilter] = useState<'ALL' | 'GOOGLE_SHEET' | 'LOCAL_ONLY'>('ALL');
  const [autoModeFilter, setAutoModeFilter] = useState<'ALL' | 'AUTO_ON' | 'AUTO_OFF'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE'>('ALL');

  // Pagination & Selection for Configs Tab (20 / 50 / 100 rows)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Action states & Menus
  const [runningId, setRunningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<number | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addMenuRef.current && !addMenuRef.current.contains(target)) {
        setAddMenuOpen(false);
      }
      if (rowMenuRef.current && !rowMenuRef.current.contains(target)) {
        setOpenRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Modals: BackupConfigModal & BulkPaste
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CsSheetBackupConfigItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // History state, filters, pagination & Detail modal
  const [historyData, setHistoryData] = useState<BackupHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFlowFilter, setHistoryFlowFilter] = useState<BackupFlowGroup>('ALL');
  const [historyProgramFilter, setHistoryProgramFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<20 | 50 | 100>(20);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<
    (BackupHistoryItem & { batchId?: string }) | null
  >(null);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await importsApi.getSheetBackupConfigs();
      const list = res.configs || [];
      setConfigs(list);
      setServiceAccount(res.serviceAccount || null);
      if (res.availableYears && res.availableYears.length > 0) {
        setAvailableYears(res.availableYears);
      }
      const map = new Map<number, CsUserOption>();
      for (const c of list) {
        if (c.cs_user?.id && !map.has(c.cs_user.id)) {
          map.set(c.cs_user.id, c.cs_user);
        }
      }
      setCsUsers(Array.from(map.values()));
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được cấu hình Backup');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await importsApi.getSheetBackupHistory({
        programType: historyProgramFilter === 'ALL' ? undefined : historyProgramFilter,
        status: historyStatusFilter === 'ALL' ? undefined : historyStatusFilter,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
        limit: 150,
      });
      setHistoryData(res);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được lịch sử Backup');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFromDate, historyProgramFilter, historyStatusFilter, historyToDate, toast]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (subTab === 'history') void loadHistory();
  }, [subTab, loadHistory]);

  // Flow counts from actual data
  const flowCounts = useMemo(() => {
    const counts: Record<BackupFlowGroup, number> = {
      ALL: configs.length,
      ADMIN: 0,
      CSKH: 0,
      TEACHER: 0,
      REPORT: 0,
    };
    for (const c of configs) {
      counts[classifyBackupFlow(c.program_type)]++;
    }
    return counts;
  }, [configs]);

  // Overview status metrics for the status overview line
  const overviewMetrics = useMemo(() => {
    let linkedCount = 0;
    let autoOnCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let latestBackupAt: string | null = null;

    for (const c of configs) {
      if (c.target_spreadsheet_url && c.target_spreadsheet_url.trim()) linkedCount++;
      if (c.enabled) autoOnCount++;
      if (c.last_status === 'SUCCESS') successCount++;
      if (c.last_status === 'FAILED') failedCount++;
      if (c.last_backup_at && (!latestBackupAt || c.last_backup_at > latestBackupAt)) {
        latestBackupAt = c.last_backup_at;
      }
    }

    return {
      total: configs.length,
      linkedCount,
      autoOnCount,
      successCount,
      failedCount,
      latestTime: latestBackupAt ? formatDateParts(latestBackupAt).time : null,
    };
  }, [configs]);

  // Filtered configs
  const filteredConfigs = useMemo(() => {
    return configs.filter((cfg) => {
      const flow = classifyBackupFlow(cfg.program_type);
      if (flowFilter !== 'ALL' && flow !== flowFilter) return false;

      const pt = String(cfg.program_type || '').toUpperCase();
      if (programFilter === 'JLPT' && !pt.includes('JLPT')) return false;
      if (programFilter === 'KAIWA' && !pt.includes('KAIWA')) return false;

      const hasSheetUrl = Boolean(cfg.target_spreadsheet_url && cfg.target_spreadsheet_url.trim());
      if (destTypeFilter === 'GOOGLE_SHEET' && !hasSheetUrl) return false;
      if (destTypeFilter === 'LOCAL_ONLY' && hasSheetUrl) return false;

      if (autoModeFilter === 'AUTO_ON' && !cfg.enabled) return false;
      if (autoModeFilter === 'AUTO_OFF' && cfg.enabled) return false;

      const st = cfg.last_status || 'IDLE';
      if (statusFilter === 'SUCCESS' && st !== 'SUCCESS') return false;
      if (statusFilter === 'FAILED' && st !== 'FAILED') return false;
      if (statusFilter === 'IDLE' && st !== 'IDLE' && Boolean(cfg.last_status)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystacks = [
          cfg.name,
          cfg.program_type,
          cfg.cs_user?.staff_code,
          cfg.cs_user?.name,
          cfg.cs_user?.email,
          cfg.sheet_name,
          cfg.profile_sheet_name,
          cfg.target_spreadsheet_url,
          cfg.local_backup_path,
        ]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase());
        if (!haystacks.some((h) => h.includes(q))) return false;
      }

      return true;
    });
  }, [
    configs,
    flowFilter,
    programFilter,
    destTypeFilter,
    autoModeFilter,
    statusFilter,
    searchQuery,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [
    flowFilter,
    programFilter,
    destTypeFilter,
    autoModeFilter,
    statusFilter,
    searchQuery,
    pageSize,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredConfigs.length / pageSize));
  const paginatedConfigs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredConfigs.slice(start, start + pageSize);
  }, [filteredConfigs, page, pageSize]);

  // Flatten history items from batches
  const flatHistoryItems = useMemo(() => {
    const batches: BackupHistoryBatch[] = historyData?.batches || [];
    const all: Array<BackupHistoryItem & { batchId: string }> = [];
    for (const b of batches) {
      for (const it of b.items || []) {
        all.push({
          ...it,
          batchId: b.batchId,
          triggerType: it.triggerType || b.triggerType,
          mode: it.mode || b.mode,
        });
      }
    }
    const q = historySearch.trim().toLowerCase();
    return all.filter((it) => {
      const flow = classifyBackupFlow(it.programType);
      if (historyFlowFilter !== 'ALL' && flow !== historyFlowFilter) return false;
      if (
        historyProgramFilter !== 'ALL' &&
        !it.programType.toUpperCase().includes(historyProgramFilter)
      ) {
        return false;
      }
      if (historyStatusFilter !== 'ALL' && it.status !== historyStatusFilter) {
        return false;
      }
      if (q) {
        const hay = `${it.configName || ''} ${it.staffCode || ''} ${it.staffName || ''} ${it.programType} ${it.batchId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [historyData, historyFlowFilter, historyProgramFilter, historyStatusFilter, historySearch]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyFlowFilter, historyProgramFilter, historyStatusFilter, historySearch, historyPageSize]);

  const totalHistoryPages = Math.max(1, Math.ceil(flatHistoryItems.length / historyPageSize));
  const paginatedHistoryItems = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return flatHistoryItems.slice(start, start + historyPageSize);
  }, [flatHistoryItems, historyPage, historyPageSize]);

  // Handlers
  const handleToggleAutoOnRow = async (cfg: CsSheetBackupConfigItem) => {
    const nextEnabled = !cfg.enabled;
    setConfigs((prev) =>
      prev.map((c) => (c.id === cfg.id ? { ...c, enabled: nextEnabled } : c))
    );
    try {
      setTogglingId(cfg.id);
      await importsApi.updateSheetBackupConfig(cfg.id, { enabled: nextEnabled });
      toast.success(
        `${nextEnabled ? 'Đã BẬT' : 'Đã TẮT'} Backup tự động cho "${cfg.name}"`
      );
    } catch (err: any) {
      setConfigs((prev) =>
        prev.map((c) => (c.id === cfg.id ? { ...c, enabled: !nextEnabled } : c))
      );
      toast.error(err?.response?.data?.error?.message || 'Không thể đổi chế độ tự động');
    } finally {
      setTogglingId(null);
    }
  };

  const handleRunOne = async (cfg: CsSheetBackupConfigItem) => {
    try {
      setRunningId(String(cfg.id));
      const summary = await importsApi.runSheetBackup(cfg.id, {
        year: cfg.backup_year ?? null,
      });
      toast.success(
        summary.syncedToGoogleSheet
          ? `Đã Backup "${cfg.name}" ra Excel & đẩy lên Google Sheet!`
          : `Đã xuất file Excel trên server cho "${cfg.name}"!`
      );
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Backup thất bại');
    } finally {
      setRunningId(null);
    }
  };

  const handleRunBatchOrAll = async () => {
    try {
      setRunningId('ALL');
      if (selectedIds.size > 0) {
        const targets = configs.filter((c) => selectedIds.has(c.id));
        for (const t of targets) {
          await importsApi.runSheetBackup(t.id, { year: t.backup_year ?? null });
        }
        toast.success(`Đã chạy Backup cho ${targets.length} nguồn đã chọn!`);
        setSelectedIds(new Set());
      } else {
        const programParam = flowFilter === 'ALL' ? null : flowFilter;
        await importsApi.runSheetBackupAll({ programType: programParam });
        toast.success('Đã chạy Backup toàn bộ nguồn đang bật!');
      }
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Backup hàng loạt thất bại');
    } finally {
      setRunningId(null);
    }
  };

  const handleDownloadExcel = async (cfg: CsSheetBackupConfigItem) => {
    try {
      setDownloadingId(cfg.id);
      await importsApi.downloadCsSheetBackupExcel(cfg.id, getDownloadFilename(cfg));
      toast.success('Đã tải file Excel (.xlsx)');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không tải được file Excel');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteConfig = async (cfg: CsSheetBackupConfigItem) => {
    if (String(cfg.program_type || '').toUpperCase().startsWith('ADMIN_')) {
      toast.warning('Không thể xóa sổ tổng mặc định của Admin');
      return;
    }
    try {
      await importsApi.deleteSheetBackupConfig(cfg.id);
      setConfigs((prev) => prev.filter((c) => c.id !== cfg.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(cfg.id);
        return next;
      });
      toast.success(`Đã xóa nguồn Backup "${cfg.name}"`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không thể xóa nguồn Backup');
    }
  };

  const handleBulkSave = async () => {
    if (!bulkText.trim()) return;
    try {
      setBulkSaving(true);
      const res = await importsApi.bulkPasteSheetBackupLinks(bulkText);
      toast.success(`Đã gắn ${res.updatedCount} link (bỏ qua ${res.skippedCount} dòng)`);
      setBulkOpen(false);
      setBulkText('');
      await loadConfigs();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Không thể dán link hàng loạt');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleCopySaEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success(`Đã sao chép email Service Account: ${email}`);
    } catch {
      toast.warning('Không thể copy tự động');
    }
  };

  const handleExportBackupHistoryCsv = () => {
    const headers = [
      'Thời gian',
      'Mã đợt (Batch)',
      'Nguồn Backup',
      'Nhân sự',
      'Chương trình',
      'Kích hoạt',
      'Tổng HV',
      'Dòng thêm mới',
      'Dòng cập nhật',
      'Ô cập nhật',
      'Kết quả',
      'Thời lượng',
    ];
    const csvContent = [
      headers.join(','),
      ...flatHistoryItems.map((it) =>
        [
          `"${formatDateTimeFull(it.backedUpAt || it.createdAt)}"`,
          `"${it.batchId || ''}"`,
          `"${it.configName || `Config #${it.configId}`}"`,
          `"${it.staffCode || ''}"`,
          it.programType,
          `"${it.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}"`,
          it.totalStudents ?? 0,
          it.appendedRows ?? 0,
          it.updatedRows ?? 0,
          it.updatedCellsCount ?? 0,
          `"${it.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}"`,
          `"${it.durationSec} giây"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'lich_su_backup_du_lieu.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV lịch sử Backup!');
  };

  const historyStats = historyData?.stats || {
    todayTotal: flatHistoryItems.length,
    todaySuccess: flatHistoryItems.filter((i) => i.status === 'SUCCESS').length,
    todayFailed: flatHistoryItems.filter((i) => i.status === 'FAILED').length,
    lastRunTime: flatHistoryItems[0]
      ? formatDateParts(flatHistoryItems[0].backedUpAt || flatHistoryItems[0].createdAt).time
      : null,
  };

  const pageHeaderTitle =
    subTab === 'history'
      ? 'Lịch sử Backup'
      : subTab === 'connection'
      ? 'Cấu hình & Kết nối'
      : 'Backup dữ liệu';

  const pageHeaderDescription =
    subTab === 'history'
      ? 'Theo dõi lịch sử các phiên chạy Backup, số lượng dòng/ô cập nhật và tải file Excel (.xlsx)'
      : subTab === 'connection'
      ? 'Cấu hình Google Service Account JSON và ánh xạ cột dữ liệu Web → Sheet Backup'
      : '';

  return (
    <div className="space-y-4">
      {/* 1. TIÊU ĐỀ TRANG VÀ CÁC NÚT HÀNH ĐỘNG (Không có thanh 3 tab lặp lại) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {pageHeaderTitle}
          </h1>
          {pageHeaderDescription && (
            <p className="text-xs text-slate-500 mt-0.5">{pageHeaderDescription}</p>
          )}
        </div>

        {/* Right: Pill Google + Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (serviceAccount?.clientEmail) {
                handleCopySaEmail(serviceAccount.clientEmail);
              } else if (canViewConnection) {
                changeSubTab('connection');
              }
            }}
            title={
              serviceAccount?.clientEmail
                ? 'Bấm để sao chép email Service Account cấp quyền Editor'
                : 'Bấm để mở trang Cấu hình & Kết nối'
            }
            className="bg-white rounded-xl border border-slate-200 px-3.5 py-1.5 flex items-center gap-2.5 shadow-2xs hover:bg-slate-50 transition-colors text-left cursor-pointer"
          >
            <GoogleColorIcon className="w-5 h-5 shrink-0" />
            <div className="leading-tight">
              {serviceAccount?.configured ? (
                <div className="text-emerald-600 font-semibold text-xs flex items-center gap-1">
                  <span>Google đã kết nối</span>
                  <span className="text-[10px]">●</span>
                </div>
              ) : (
                <div className="text-amber-600 font-semibold text-xs flex items-center gap-1">
                  <span>Chỉ lưu Excel Local</span>
                  <span className="text-[10px]">●</span>
                </div>
              )}
              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                {serviceAccount?.clientEmail || 'Chưa gắn Service Account'}
              </div>
            </div>
          </button>

          {subTab === 'configs' && (
            <>
              {canViewConnection && (
                <div className="relative" ref={addMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAddMenuOpen((prev) => !prev)}
                    className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span>Thêm nguồn</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        addMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {addMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-30">
                      <button
                        type="button"
                        onClick={() => {
                          setAddMenuOpen(false);
                          setEditingConfig(null);
                          setConfigModalOpen(true);
                        }}
                        className="w-full px-2.5 py-2 rounded-lg text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Thêm nguồn mới</span>
                      </button>

                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddMenuOpen(false);
                            setBulkOpen(true);
                          }}
                          className="w-full px-2.5 py-2 rounded-lg text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <ClipboardPaste className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>Dán nhiều link</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {canManage && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRunBatchOrAll}
                  isLoading={runningId === 'ALL'}
                  leftIcon={<Play className="w-4 h-4" />}
                >
                  {selectedIds.size > 0
                    ? `Backup đã chọn (${selectedIds.size})`
                    : 'Backup tất cả'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ==========================================================================
       * TRANG 1: DANH SÁCH NGUỒN BACKUP
       * ========================================================================== */}
      {subTab === 'configs' && (
        <div className="space-y-3.5">
          {/* 2. Dòng tổng quan trạng thái */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 font-medium px-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span>
                Tổng nguồn:{' '}
                <strong className="text-slate-900 font-bold">
                  {overviewMetrics.total} nguồn Backup
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Đã gắn Link Sheet:{' '}
                <strong className="text-blue-600 font-bold">
                  {overviewMetrics.linkedCount}
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Tự động đang BẬT:{' '}
                <strong className="text-emerald-600 font-bold">
                  {overviewMetrics.autoOnCount}
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Đã chạy thành công:{' '}
                <strong className="text-emerald-600 font-bold">
                  {overviewMetrics.successCount}
                </strong>
              </span>
              {overviewMetrics.failedCount > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    Có lỗi:{' '}
                    <strong className="text-rose-600 font-bold">
                      {overviewMetrics.failedCount}
                    </strong>
                  </span>
                </>
              )}
              {overviewMetrics.latestTime && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    Cập nhật gần nhất:{' '}
                    <strong className="text-slate-900 font-semibold">
                      {overviewMetrics.latestTime}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 3. Thanh chọn 5 nhóm nằm ngang (Segmented Pill Bar bám sát ảnh 2) */}
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div
              role="tablist"
              aria-label="Lọc nhóm nguồn Backup"
              className="inline-flex min-w-max items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-1.5 shadow-2xs"
            >
              {FLOW_TABS.filter(
                (tab) => canManage || (tab.key !== 'ADMIN' && tab.key !== 'REPORT')
              ).map((tab) => {
                const isActive = flowFilter === tab.key;
                const count = flowCounts[tab.key] ?? 0;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setFlowFilter(tab.key)}
                    className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-xs sm:text-sm font-semibold outline-none transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'border-slate-200/90 bg-white text-blue-600 shadow-xs'
                        : 'border-transparent bg-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900'
                    }`}
                  >
                    <span className={isActive ? 'text-blue-600' : 'text-slate-500'}>
                      {tab.icon}
                    </span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                    <span
                      className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-200/75 text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Thanh Tìm Kiếm & Bộ Lọc */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 shadow-2xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm tên nguồn, Mã CVHT, Mã GV, tên sheet, link sheet..."
                  className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Chương trình */}
              <select
                value={programFilter}
                onChange={(e) => setProgramFilter(e.target.value as 'ALL' | 'JLPT' | 'KAIWA')}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Chương trình: Tất cả</option>
                <option value="JLPT">JLPT</option>
                <option value="KAIWA">KAIWA</option>
              </select>

              {/* Đích lưu trữ */}
              <select
                value={destTypeFilter}
                onChange={(e) =>
                  setDestTypeFilter(e.target.value as 'ALL' | 'GOOGLE_SHEET' | 'LOCAL_ONLY')
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Đích lưu: Tất cả</option>
                <option value="GOOGLE_SHEET">Đã gắn Link Google Sheet</option>
                <option value="LOCAL_ONLY">Chỉ lưu File .xlsx Server</option>
              </select>

              {/* Chế độ tự động */}
              <select
                value={autoModeFilter}
                onChange={(e) =>
                  setAutoModeFilter(e.target.value as 'ALL' | 'AUTO_ON' | 'AUTO_OFF')
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Chế độ tự động: Tất cả</option>
                <option value="AUTO_ON">Tự động: Đang BẬT</option>
                <option value="AUTO_OFF">Tự động: Đang TẮT</option>
              </select>

              {/* Trạng thái */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE')
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="ALL">Trạng thái: Tất cả</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Có lỗi</option>
                <option value="IDLE">Chưa chạy</option>
              </select>
            </div>
          </div>

          {/* 5. Bảng Nguồn Backup (8 Cột) & Phân trang */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={
                          paginatedConfigs.length > 0 &&
                          paginatedConfigs.every((c) => selectedIds.has(c.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              paginatedConfigs.forEach((c) => next.add(c.id));
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              paginatedConfigs.forEach((c) => next.delete(c.id));
                              return next;
                            });
                          }
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Tên nguồn &amp; Kết nối</th>
                    <th className="py-3 px-3">Loại luồng</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">Cấu hình Sheet &amp; Phạm vi</th>
                    <th className="py-3 px-3">Chế độ Tự động</th>
                    <th className="py-3 px-3">Lần chạy cuối &amp; Kết quả</th>
                    <th className="py-3 pl-3 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-blue-600" />
                        Đang tải danh sách nguồn Backup...
                      </td>
                    </tr>
                  ) : paginatedConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Không có nguồn Backup nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    paginatedConfigs.map((cfg) => {
                      const flow = classifyBackupFlow(cfg.program_type);
                      const sheets = getSheetsBadges(cfg, cfg.backup_year ?? null);
                      const sheetUrl = (cfg.target_spreadsheet_url || '').trim();
                      const localFileName =
                        (cfg.local_backup_path || '').split(/[/\\]/).pop() ||
                        getDownloadFilename(cfg);
                      const isChecked = selectedIds.has(cfg.id);
                      const isAdminSystem = String(cfg.program_type || '')
                        .toUpperCase()
                        .startsWith('ADMIN_');

                      const { date: runDate, time: runTime } = formatDateParts(
                        cfg.last_backup_at
                      );
                      const isSuccess = cfg.last_status === 'SUCCESS';
                      const isFailed = cfg.last_status === 'FAILED';
                      const sum = cfg.last_summary;
                      const times =
                        Array.isArray(cfg.schedule_times) && cfg.schedule_times.length > 0
                          ? cfg.schedule_times.join(', ')
                          : '12:00, 21:00';

                      return (
                        <tr
                          key={cfg.id}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-blue-50/30 hover:bg-blue-50/50'
                              : 'hover:bg-slate-50/70'
                          }`}
                        >
                          {/* Cột 1: Checkbox */}
                          <td className="py-3.5 pl-4 pr-2 align-middle">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(cfg.id)) next.delete(cfg.id);
                                  else next.add(cfg.id);
                                  return next;
                                })
                              }
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          {/* Cột 2: Tên nguồn & Kết nối */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-900">{cfg.name}</span>
                              {cfg.cs_user?.staff_code && (
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[10px]">
                                  {cfg.cs_user.staff_code}
                                </span>
                              )}
                            </div>

                            {/* Chips các Sheet bên trong */}
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {sheets.map((s) => (
                                <span
                                  key={s}
                                  className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium text-[10px]"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>

                            {/* Connection line: Kênh 1 (File .xlsx Server) + Kênh 3 (Google Sheet) */}
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                              <span
                                title={`Đường dẫn sandbox trên server: ${cfg.local_backup_path || localFileName}`}
                                className="inline-flex items-center gap-1 text-slate-600 font-medium"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate max-w-[190px] font-mono text-[10px]">
                                  {cfg.local_backup_path || localFileName}
                                </span>
                                {cfg.keep_daily_snapshots && (
                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-semibold">
                                    +Snapshot({cfg.max_snapshots || 7})
                                  </span>
                                )}
                              </span>

                              <span className="text-slate-300">·</span>

                              {sheetUrl ? (
                                <>
                                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Đã gắn Google Sheet</span>
                                  </span>
                                  <a
                                    href={sheetUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                                  >
                                    <span>Mở Sheet</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingConfig(cfg);
                                    setConfigModalOpen(true);
                                  }}
                                  className="px-2 py-0.5 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] transition-colors cursor-pointer"
                                >
                                  + Gắn Link Sheet
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Cột 3: Loại luồng */}
                          <td className="py-3.5 px-3 align-middle">{renderFlowBadge(flow)}</td>

                          {/* Cột 4: Chương trình */}
                          <td className="py-3.5 px-3 align-middle">
                            {renderProgramBadge(cfg.program_type)}
                          </td>

                          {/* Cột 5: Cấu hình Sheet & Phạm vi */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="space-y-1 max-w-[220px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]">
                                  Năm: {cfg.backup_year || 'Tất cả'}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                  {cfg.student_counts?.total ?? 0} HV
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                Đang học:{' '}
                                <strong className="text-slate-800">
                                  {cfg.student_counts?.attending ?? 0}
                                </strong>
                                {cfg.mask_sensitive_data && ' · Đã che SĐT'}
                              </div>
                            </div>
                          </td>

                          {/* Cột 6: Chế độ Tự động */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={cfg.enabled}
                                  disabled={togglingId === cfg.id}
                                  onClick={() => handleToggleAutoOnRow(cfg)}
                                  className={`relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                    cfg.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition ${
                                      cfg.enabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span className="font-semibold text-slate-800">
                                  {cfg.enabled ? 'BẬT' : 'TẮT'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Khung giờ: {times}
                              </div>
                            </div>
                          </td>

                          {/* Cột 7: Lần chạy cuối & Kết quả */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-700 font-medium">
                                {runDate === 'Chưa chạy'
                                  ? 'Chưa chạy'
                                  : `${runDate} ${runTime}`}
                              </span>
                              {isSuccess ? (
                                <Badge variant="success" size="sm" dot>
                                  Thành công
                                </Badge>
                              ) : isFailed ? (
                                <Badge variant="danger" size="sm" dot>
                                  Thất bại
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  Chưa chạy
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              <span className="text-emerald-600 font-semibold">
                                +{sum?.appendedRows ?? 0} mới
                              </span>{' '}
                              •{' '}
                              <span className="text-blue-600 font-semibold">
                                ~{sum?.updatedRows ?? 0} sửa
                              </span>{' '}
                              •{' '}
                              <span className="text-indigo-600 font-semibold">
                                {sum?.updatedCellsCount ?? 0} ô
                              </span>
                            </div>
                          </td>

                          {/* Cột 8: Thao tác */}
                          <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                            <div
                              className="inline-flex items-center justify-end gap-1.5 relative"
                              ref={openRowMenuId === cfg.id ? rowMenuRef : undefined}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingConfig(cfg);
                                  setConfigModalOpen(true);
                                }}
                                title="Cấu hình nguồn Backup, Năm, Sheet & Lịch chạy"
                                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span>Cấu hình</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setOpenRowMenuId((prev) => (prev === cfg.id ? null : cfg.id))
                                }
                                title="Thao tác khác"
                                className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg p-1.5 transition-colors cursor-pointer"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {openRowMenuId === cfg.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-30 text-left">
                                  <button
                                    type="button"
                                    disabled={runningId === String(cfg.id)}
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      void handleRunOne(cfg);
                                    }}
                                    className="w-full px-2.5 py-2 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                                  >
                                    {runningId === String(cfg.id) ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    ) : (
                                      <Play className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span>Backup ngay</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={downloadingId === cfg.id}
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      void handleDownloadExcel(cfg);
                                    }}
                                    className="w-full px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                                  >
                                    <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Tải file Excel (.xlsx)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenRowMenuId(null);
                                      setHistorySearch(cfg.cs_user?.staff_code || cfg.name);
                                      changeSubTab('history');
                                    }}
                                    className="w-full px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                  >
                                    <History className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                    <span>Xem lịch sử Backup</span>
                                  </button>

                                  {canManage && !isAdminSystem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        void handleDeleteConfig(cfg);
                                      }}
                                      className="w-full px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>Xóa nguồn Backup</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer (20 / 50 / 100 rows) */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>
                  Hiển thị{' '}
                  <strong className="text-slate-800">
                    {filteredConfigs.length === 0
                      ? 0
                      : (page - 1) * pageSize + 1}
                    –{Math.min(page * pageSize, filteredConfigs.length)}
                  </strong>{' '}
                  / <strong className="text-slate-800">{filteredConfigs.length}</strong>{' '}
                  nguồn Backup
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      setPageSize(Number(e.target.value) as 20 | 50 | 100)
                    }
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value={20}>20 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Trước
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Trang {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================================================
       * TRANG 2: LỊCH SỬ BACKUP
       * ========================================================================== */}
      {subTab === 'history' && (
        <div className="space-y-4">
          {/* 1. KPI Summary Row + Xuất CSV */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
              <span>
                Hôm nay:{' '}
                <strong className="text-blue-600 font-bold">
                  {historyStats.todayTotal} lượt Backup
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-emerald-600 font-bold">
                  {historyStats.todaySuccess} thành công
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-rose-600 font-bold">
                  {historyStats.todayFailed} thất bại
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Lần gần nhất{' '}
                <strong className="text-slate-900 font-semibold">
                  {historyStats.lastRunTime || '--:--'}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportBackupHistoryCsv}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Xuất lịch sử CSV</span>
            </button>
          </div>

          {/* 2. Bộ lọc lịch sử */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Tìm tên nguồn, mã CVHT, GV, mã batch..."
                className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 focus:outline-none"
              />
            </div>

            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 h-9 text-xs text-slate-600">
              <span className="text-slate-400">Từ:</span>
              <input
                type="date"
                value={historyFromDate}
                onChange={(e) => setHistoryFromDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none bg-transparent"
              />
              <span className="text-slate-300">—</span>
              <span className="text-slate-400">Đến:</span>
              <input
                type="date"
                value={historyToDate}
                onChange={(e) => setHistoryToDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none bg-transparent"
              />
            </div>

            <select
              value={historyFlowFilter}
              onChange={(e) => setHistoryFlowFilter(e.target.value as BackupFlowGroup)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả nhóm</option>
              <option value="ADMIN">Sổ tổng</option>
              <option value="CSKH">Sổ CSKH</option>
              <option value="TEACHER">Điểm danh GV</option>
              <option value="REPORT">Báo cáo học tập</option>
            </select>

            <select
              value={historyProgramFilter}
              onChange={(e) => setHistoryProgramFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả chương trình</option>
              <option value="JLPT">JLPT</option>
              <option value="KAIWA">KAIWA</option>
            </select>

            <select
              value={historyStatusFilter}
              onChange={(e) => setHistoryStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả kết quả</option>
              <option value="SUCCESS">Thành công</option>
              <option value="FAILED">Thất bại</option>
            </select>

            <button
              type="button"
              onClick={loadHistory}
              disabled={historyLoading}
              title="Làm mới lịch sử"
              className="h-9 w-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 3. Bảng phẳng Lịch sử Backup (10 cột) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-3">Thời gian</th>
                    <th className="py-3 px-3">Nguồn Backup</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">Kích hoạt</th>
                    <th className="py-3 px-3">Tổng HV</th>
                    <th className="py-3 px-3">Dòng mới</th>
                    <th className="py-3 px-3">Ô cập nhật</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 px-3">Thời lượng</th>
                    <th className="py-3 pl-3 pr-4 text-right">Chi tiết &amp; File .xlsx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedHistoryItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        Chưa có phiên chạy Backup nào khớp bộ lọc. Hãy bấm{' '}
                        <strong>[Backup ngay]</strong> trên một nguồn bất kỳ để tạo lịch sử.
                      </td>
                    </tr>
                  ) : (
                    paginatedHistoryItems.map((item) => {
                      const isFailed = item.status === 'FAILED';
                      return (
                        <tr
                          key={`${item.id}-${item.configId}-${item.createdAt}`}
                          onClick={() => setSelectedHistoryItem(item)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                            <div>{formatDateTimeFull(item.backedUpAt || item.createdAt)}</div>
                            {item.batchId && (
                              <div className="text-[10px] font-mono text-slate-400">
                                {item.batchId}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 align-middle">
                            <div className="font-bold text-slate-900">
                              {item.configName || `Nguồn #${item.configId}`}
                            </div>
                            {item.staffCode && (
                              <div className="text-[11px] text-slate-500 font-mono">
                                {item.staffCode} {item.staffName ? `· ${item.staffName}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 align-middle">
                            {renderProgramBadge(item.programType)}
                          </td>
                          <td className="py-3.5 px-3 align-middle text-slate-600">
                            {item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-slate-800">
                            {item.totalStudents ?? 0}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-emerald-600">
                            +{item.appendedRows ?? 0}
                          </td>
                          <td className="py-3.5 px-3 align-middle font-semibold text-blue-600">
                            ~{item.updatedCellsCount ?? 0} ô
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
                              Xem chi tiết Sheet →
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer cho Lịch sử */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>
                  Hiển thị{' '}
                  <strong className="text-slate-800">
                    {flatHistoryItems.length === 0
                      ? 0
                      : (historyPage - 1) * historyPageSize + 1}
                    –{Math.min(historyPage * historyPageSize, flatHistoryItems.length)}
                  </strong>{' '}
                  / <strong className="text-slate-800">{flatHistoryItems.length}</strong>{' '}
                  phiên Backup
                </span>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Số dòng/trang:</span>
                  <select
                    value={historyPageSize}
                    onChange={(e) =>
                      setHistoryPageSize(Number(e.target.value) as 20 | 50 | 100)
                    }
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value={20}>20 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-semibold cursor-pointer"
                >
                  Trước
                </button>
                <span className="px-2 font-semibold text-slate-700">
                  Trang {historyPage} / {totalHistoryPages}
                </span>
                <button
                  type="button"
                  disabled={historyPage >= totalHistoryPages}
                  onClick={() =>
                    setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))
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

      {/* ==========================================================================
       * TRANG 3: CẤU HÌNH & KẾT NỐI
       * ========================================================================== */}
      {subTab === 'connection' && <SheetBackupAdminConfigCard />}

      {/* MODAL 1: CẤU HÌNH / THÊM NGUỒN BACKUP */}
      <BackupConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        editingConfig={editingConfig}
        availableYears={availableYears}
        csUsers={csUsers}
        canManage={canManage}
        onSaved={() => {
          void loadConfigs();
        }}
      />

      {/* MODAL 2: CHI TIẾT PHIÊN BACKUP (KHI BẤM VÀO 1 DÒNG LỊCH SỬ) */}
      <Modal
        isOpen={Boolean(selectedHistoryItem)}
        onClose={() => setSelectedHistoryItem(null)}
        title={
          selectedHistoryItem
            ? `Chi tiết phiên Backup: ${selectedHistoryItem.configName || `#${selectedHistoryItem.configId}`}`
            : 'Chi tiết phiên Backup'
        }
        size="lg"
      >
        {selectedHistoryItem && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <div className="text-[11px] text-slate-500">Thời gian chạy</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {formatDateTimeFull(
                    selectedHistoryItem.backedUpAt || selectedHistoryItem.createdAt
                  )}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Trạng thái</div>
                <div className="mt-0.5">
                  <Badge
                    variant={
                      selectedHistoryItem.status === 'SUCCESS' ? 'success' : 'danger'
                    }
                    size="sm"
                    dot
                  >
                    {selectedHistoryItem.status === 'SUCCESS'
                      ? 'Thành công'
                      : 'Thất bại'}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Đẩy Google Sheet</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {selectedHistoryItem.syncedToGoogleSheet
                    ? 'Đã đẩy lên Sheet'
                    : 'Lưu Excel Local'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Tổng thay đổi</div>
                <div className="font-bold text-blue-600 mt-0.5">
                  +{selectedHistoryItem.appendedRows ?? 0} dòng ·{' '}
                  {selectedHistoryItem.updatedCellsCount ?? 0} ô
                </div>
              </div>
            </div>

            {selectedHistoryItem.error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
                <strong>Chi tiết lỗi:</strong> {selectedHistoryItem.error}
              </div>
            )}

            {/* Bảng thống kê từng Sheet trong Workbook */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-2.5 px-3">Tên Sheet trong File</th>
                    <th className="py-2.5 px-3">Tổng dòng HV</th>
                    <th className="py-2.5 px-3">Thêm mới</th>
                    <th className="py-2.5 px-3">Dòng sửa</th>
                    <th className="py-2.5 px-3">Ô cập nhật</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      fallback: 'Sheet 1 (Hồ sơ / Tổng hợp)',
                      stat: selectedHistoryItem.profile,
                    },
                    {
                      fallback: 'Sheet 2 (Chấm buổi / Báo cáo)',
                      stat: selectedHistoryItem.attendance,
                    },
                    {
                      fallback: 'Sheet 3 (Điểm danh chốt)',
                      stat: selectedHistoryItem.finalAttendance,
                    },
                  ]
                    .filter((x) => Boolean(x.stat))
                    .map((entry, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {entry.stat?.sheetName || entry.fallback}
                        </td>
                        <td className="py-2.5 px-3">
                          {entry.stat?.totalEnrollments ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-600 font-semibold">
                          +{entry.stat?.appendedRows ?? 0}
                        </td>
                        <td className="py-2.5 px-3 text-blue-600 font-semibold">
                          ~{entry.stat?.updatedRows ?? 0}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                          {entry.stat?.updatedCellsCount ?? 0} ô
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {selectedHistoryItem.localFilePath && (
              <div className="text-[11px] text-slate-500 flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span>
                  Đường dẫn file Server:{' '}
                  <code className="font-mono font-semibold text-slate-700">
                    {selectedHistoryItem.localFilePath}
                  </code>
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const found = configs.find(
                    (c) => c.id === selectedHistoryItem.configId
                  );
                  if (found) void handleDownloadExcel(found);
                }}
                leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
              >
                Tải file Excel (.xlsx)
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSelectedHistoryItem(null)}
              >
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 3: DÁN HÀNG LOẠT LINK */}
      <Modal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Dán hàng loạt Link Google Sheet Backup"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-600">
            Mỗi dòng 1 link theo cú pháp:{' '}
            <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              Mã | Chương trình | Link Google Sheet
            </code>
          </p>
          <pre className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700 overflow-x-auto">
{`ADMIN_KAIWA | https://docs.google.com/spreadsheets/d/1abc...
ADMIN_JLPT | https://docs.google.com/spreadsheets/d/1def...
ADMIN_RECONCILIATION | https://docs.google.com/spreadsheets/d/1ghi...
CVHT01 | KAIWA | https://docs.google.com/spreadsheets/d/1jkl...
CVHT01 | JLPT | https://docs.google.com/spreadsheets/d/1mno...
GV505 | https://docs.google.com/spreadsheets/d/1pqr...`}
          </pre>
          <textarea
            rows={7}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Dán danh sách link vào đây..."
            className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBulkSave}
              isLoading={bulkSaving}
              disabled={!bulkText.trim()}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              Lưu tất cả Link
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CsSheetBackupPanel;
