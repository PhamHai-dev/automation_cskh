import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importsApi } from '../api/imports.api';
import {
  BackupHistoryBatch,
  BackupHistoryItem,
  BackupHistoryResponse,
  CsSheetBackupConfigItem,
  CsSheetBackupSummary,
  ServiceAccountInfo,
  SheetBackupSheetStats,
  UpdateCsSheetBackupConfigDTO,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Info,
  Link2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

type SubTabKey = 'configs' | 'history' | 'connection';
type DrawerTabKey = 'overview' | 'config' | 'history';
type ProgramFilter = 'ALL' | 'JLPT' | 'KAIWA' | 'TEACHER';
type StatusFilter = 'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE';

const EMPTY_STATS: SheetBackupSheetStats = {
  totalEnrollments: 0,
  unchangedRows: 0,
  updatedRows: 0,
  appendedRows: 0,
  updatedCellsCount: 0,
};

type ProgramKey = 'JLPT' | 'KAIWA' | 'TEACHER';

const PROGRAM_META: Record<
  ProgramKey,
  {
    badgeLabel: string;
    badgeClass: string;
    profileSheet: string;
    profileHeaderRow: number;
    attendanceSheet: string;
    attendanceHeaderRow: number;
    finalSheet: string;
    finalHeaderRow: number;
    fileSlug: string;
    sheetsSummary: string;
  }
> = {
  JLPT: {
    badgeLabel: 'JLPT',
    badgeClass: 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]',
    profileSheet: 'Data JLPT_Inhouse',
    profileHeaderRow: 2,
    attendanceSheet: 'Chấm buổi',
    attendanceHeaderRow: 2,
    finalSheet: 'Điểm danh chốt',
    finalHeaderRow: 2,
    fileSlug: 'jlpt',
    sheetsSummary: 'Data JLPT_Inhouse · Chấm buổi · Điểm danh chốt',
  },
  KAIWA: {
    badgeLabel: 'KAIWA',
    badgeClass: 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]',
    profileSheet: '1.Chăm sóc',
    profileHeaderRow: 3,
    attendanceSheet: '3.Chấm buổi',
    attendanceHeaderRow: 2,
    finalSheet: 'Điểm danh chốt',
    finalHeaderRow: 2,
    fileSlug: 'kaiwa',
    sheetsSummary: '1.Chăm sóc · 3.Chấm buổi · Điểm danh chốt',
  },
  TEACHER: {
    badgeLabel: 'GIÁO VIÊN',
    badgeClass: 'bg-sky-100 text-sky-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]',
    profileSheet: '',
    profileHeaderRow: 2,
    attendanceSheet: '2026 スケジュール',
    attendanceHeaderRow: 2,
    finalSheet: '',
    finalHeaderRow: 2,
    fileSlug: 'teacher',
    sheetsSummary: '2026 スケジュール',
  },
};

const getProgramKey = (programType?: string): ProgramKey => {
  const upper = String(programType || '').toUpperCase();
  if (upper === 'JLPT') return 'JLPT';
  if (upper === 'TEACHER') return 'TEACHER';
  return 'KAIWA';
};

const resolveSheetStats = (
  summary: CsSheetBackupSummary | null | undefined,
  sheetKey: 'profile' | 'attendance' | 'finalAttendance',
  legacyAliasKey?: 'sheet1' | 'sheet3'
): SheetBackupSheetStats => {
  if (!summary) return EMPTY_STATS;

  const direct =
    summary[sheetKey] || (legacyAliasKey ? summary[legacyAliasKey] : undefined);
  if (direct) return direct;

  if (sheetKey === 'finalAttendance') return EMPTY_STATS;

  const hasFlatData =
    summary.totalStudents !== undefined ||
    summary.unchangedRows !== undefined ||
    summary.updatedRows !== undefined ||
    summary.appendedRows !== undefined ||
    summary.updatedCellsCount !== undefined;

  if (!hasFlatData) return EMPTY_STATS;

  return {
    totalEnrollments: summary.totalStudents || 0,
    unchangedRows: summary.unchangedRows || 0,
    updatedRows: summary.updatedRows || 0,
    appendedRows: summary.appendedRows || 0,
    updatedCellsCount: summary.updatedCellsCount || 0,
    attendanceCellsWritten:
      sheetKey === 'attendance' ? summary.attendanceCellsWritten || 0 : undefined,
  };
};

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

const synthesizeHistoryFromConfigs = (
  configs: CsSheetBackupConfigItem[]
): BackupHistoryResponse => {
  const ranConfigs = configs.filter((c) => Boolean(c.last_backup_at));
  if (ranConfigs.length === 0) {
    return {
      stats: {
        todayTotal: 0,
        todaySuccess: 0,
        todayFailed: 0,
        lastRunTime: null,
      },
      batches: [],
      total: 0,
    };
  }

  // Group configs by minute of last_backup_at to form batches
  const groups = new Map<string, CsSheetBackupConfigItem[]>();
  ranConfigs.forEach((cfg) => {
    const d = new Date(cfg.last_backup_at!);
    const key = Number.isNaN(d.getTime())
      ? 'batch-default'
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
          d.getMinutes()
        ).padStart(2, '0')}`;
    const list = groups.get(key) || [];
    list.push(cfg);
    groups.set(key, list);
  });

  const batches: BackupHistoryBatch[] = Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, items], idx) => {
      const firstIso = items[0]?.last_backup_at || new Date().toISOString();
      const d = new Date(firstIso);
      const batchCode = Number.isNaN(d.getTime())
        ? `#BK-${1000 + idx}`
        : `#BK-${String(d.getMonth() + 1).padStart(2, '0')}${String(
            d.getDate()
          ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(
            d.getMinutes()
          ).padStart(2, '0')}`;

      const mappedItems: BackupHistoryItem[] = items.map((cfg) => {
        const isSuccess =
          cfg.last_status === 'SUCCESS' || cfg.last_status === 'COMPLETED';
        const staffCode = cfg.cs_user?.staff_code || `CVHT0${cfg.id}`;
        const staffName = cfg.cs_user?.name || cfg.name || `CSKH ${cfg.id}`;
        return {
          id: cfg.id * 100 + idx,
          configId: cfg.id,
          staffCode,
          staffName,
          programType: getProgramKey(cfg.program_type),
          triggerType: 'AUTO',
          mode: 'DELTA',
          status: isSuccess ? 'SUCCESS' : 'FAILED',
          durationSec: 6 + (cfg.id % 7),
          createdAt: cfg.last_backup_at || firstIso,
          error: !isSuccess
            ? cfg.last_error || 'Không có quyền ghi vào Google Sheet đích.'
            : null,
          summary: cfg.last_summary || null,
        };
      });

      const successCount = mappedItems.filter((i) => i.status === 'SUCCESS').length;
      const failedCount = mappedItems.length - successCount;
      const totalDuration = mappedItems.reduce((acc, i) => acc + i.durationSec, 0);

      return {
        batchId: batchCode,
        startedAt: firstIso,
        triggerType: 'AUTO',
        mode: 'DELTA',
        totalConfigs: mappedItems.length,
        successCount,
        failedCount,
        durationSec: totalDuration,
        items: mappedItems,
      };
    });

  const allItems = batches.flatMap((b) => b.items);
  const todaySuccess = allItems.filter((i) => i.status === 'SUCCESS').length;
  const todayFailed = allItems.filter((i) => i.status === 'FAILED').length;
  const latestIso = batches[0]?.startedAt || null;
  const latestTime = latestIso ? formatDateParts(latestIso).time : null;

  return {
    stats: {
      todayTotal: allItems.length,
      todaySuccess,
      todayFailed,
      lastRunTime: latestTime,
    },
    batches,
    total: batches.length,
  };
};

export const CsSheetBackupPanel: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));
  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')
  );

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('configs');

  // Data state
  const [configs, setConfigs] = useState<CsSheetBackupConfigItem[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // Action loading states
  const [savingConfigId, setSavingConfigId] = useState<number | null>(null);
  const [togglingConfigId, setTogglingConfigId] = useState<number | null>(null);
  const [runningConfigId, setRunningConfigId] = useState<string | null>(null);
  const [downloadingConfigId, setDownloadingConfigId] = useState<number | null>(null);
  const [runningAllMode, setRunningAllMode] = useState<'delta' | 'full' | null>(null);
  const [isExportingStudents, setIsExportingStudents] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);

  // Split button & row action dropdowns
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);
  const [openRowMenuId, setOpenRowMenuId] = useState<number | null>(null);

  // Sub-tab 1 (Configs) filters & selection
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Editable drafts keyed by config id
  const [drafts, setDrafts] = useState<Record<number, UpdateCsSheetBackupConfigDTO>>({});

  // Slide-over Drawer state
  const [drawerConfigId, setDrawerConfigId] = useState<number | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTabKey>('config');
  const [newTimeChipInput, setNewTimeChipInput] = useState('');

  // Quick Add Config Picker Modal
  const [showAddPickerModal, setShowAddPickerModal] = useState(false);
  const [pickerSelectedId, setPickerSelectedId] = useState<number | null>(null);

  // Sub-tab 2 (History) state
  const [historyData, setHistoryData] = useState<BackupHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historyCsFilter, setHistoryCsFilter] = useState<string>('ALL');
  const [historyProgramFilter, setHistoryProgramFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

  // Sub-tab 3 (Connection) state
  const [saJsonText, setSaJsonText] = useState('');
  const [savingSa, setSavingSa] = useState(false);
  const [editingSaJson, setEditingSaJson] = useState(false);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setSplitMenuOpen(false);
      }
      const target = e.target as HTMLElement;
      if (!target.closest('[data-row-menu]')) {
        setOpenRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initDraftForConfig = useCallback(
    (cfg: CsSheetBackupConfigItem): UpdateCsSheetBackupConfigDTO => {
      const programKey = getProgramKey(cfg.program_type);
      const meta = PROGRAM_META[programKey];
      const times =
        cfg.schedule_times && cfg.schedule_times.length > 0
          ? cfg.schedule_times
          : ['12:00', '21:00'];
      return {
        target_spreadsheet_url: cfg.target_spreadsheet_url || '',
        profile_sheet_name: cfg.profile_sheet_name || meta.profileSheet,
        profile_header_row: cfg.profile_header_row ?? meta.profileHeaderRow,
        profile_enabled: cfg.profile_enabled ?? (programKey !== 'TEACHER'),
        sheet_name: cfg.sheet_name || meta.attendanceSheet,
        header_row: cfg.header_row ?? meta.attendanceHeaderRow,
        final_sheet_name: cfg.final_sheet_name || meta.finalSheet || 'Điểm danh chốt',
        final_enabled: cfg.final_enabled ?? (programKey !== 'TEACHER'),
        backup_year: cfg.backup_year ?? null,
        schedule_times: times,
        enabled: cfg.enabled ?? true,
        require_private_sheet: cfg.require_private_sheet ?? true,
        mask_sensitive_data: cfg.mask_sensitive_data ?? false,
      };
    },
    []
  );

  const fetchBackupConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await importsApi.getSheetBackupConfigs();
      const loadedConfigs = data?.configs || [];
      setConfigs(loadedConfigs);
      if (data?.serviceAccount) {
        setServiceAccount(data.serviceAccount);
      }
      if (Array.isArray(data?.availableYears) && data.availableYears.length > 0) {
        setAvailableYears(data.availableYears);
      }

      const nextDrafts: Record<number, UpdateCsSheetBackupConfigDTO> = {};
      loadedConfigs.forEach((cfg) => {
        nextDrafts[cfg.id] = initDraftForConfig(cfg);
      });
      setDrafts(nextDrafts);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải danh sách cấu hình Backup Sổ CSKH'
      );
    } finally {
      setLoading(false);
    }
  }, [initDraftForConfig, toast]);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await importsApi.getSheetBackupHistory({
        programType: historyProgramFilter === 'ALL' ? undefined : historyProgramFilter,
        status: historyStatusFilter === 'ALL' ? undefined : historyStatusFilter,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
      });
      if (res && Array.isArray(res.batches) && res.batches.length > 0) {
        setHistoryData(res);
        setExpandedBatchIds((prev) => {
          const next = { ...prev };
          if (res.batches[0] && next[res.batches[0].batchId] === undefined) {
            next[res.batches[0].batchId] = true;
          }
          return next;
        });
      } else {
        const fallback = synthesizeHistoryFromConfigs(configs);
        setHistoryData(fallback);
        if (fallback.batches[0]) {
          setExpandedBatchIds((prev) => ({
            ...prev,
            [fallback.batches[0].batchId]: true,
          }));
        }
      }
    } catch {
      const fallback = synthesizeHistoryFromConfigs(configs);
      setHistoryData(fallback);
      if (fallback.batches[0]) {
        setExpandedBatchIds((prev) => ({
          ...prev,
          [fallback.batches[0].batchId]: true,
        }));
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [
    configs,
    historyFromDate,
    historyProgramFilter,
    historyStatusFilter,
    historyToDate,
  ]);

  useEffect(() => {
    fetchBackupConfigs();
  }, [fetchBackupConfigs]);

  useEffect(() => {
    if (activeSubTab === 'history' || drawerTab === 'history') {
      fetchHistory();
    }
  }, [activeSubTab, drawerTab, fetchHistory]);

  const updateDraft = (configId: number, patch: Partial<UpdateCsSheetBackupConfigDTO>) => {
    setDrafts((prev) => ({
      ...prev,
      [configId]: {
        ...(prev[configId] || {}),
        ...patch,
      },
    }));
  };

  const buildSavePayload = (
    draft: UpdateCsSheetBackupConfigDTO,
    programKey: ProgramKey
  ): UpdateCsSheetBackupConfigDTO => {
    const meta = PROGRAM_META[programKey];
    return {
      target_spreadsheet_url: draft.target_spreadsheet_url?.trim() || null,
      profile_sheet_name: draft.profile_sheet_name?.trim() || meta.profileSheet,
      profile_header_row: Number(draft.profile_header_row ?? meta.profileHeaderRow),
      profile_enabled:
        programKey === 'TEACHER' ? false : Boolean(draft.profile_enabled ?? true),
      sheet_name: draft.sheet_name?.trim() || meta.attendanceSheet,
      header_row: Number(draft.header_row ?? meta.attendanceHeaderRow),
      final_sheet_name:
        programKey === 'TEACHER'
          ? undefined
          : draft.final_sheet_name?.trim() || meta.finalSheet || 'Điểm danh chốt',
      final_enabled:
        programKey === 'TEACHER' ? false : Boolean(draft.final_enabled ?? true),
      backup_year: draft.backup_year ?? null,
      schedule_times:
        draft.schedule_times && draft.schedule_times.length > 0
          ? draft.schedule_times
          : ['12:00', '21:00'],
      enabled: Boolean(draft.enabled),
      require_private_sheet: Boolean(draft.require_private_sheet),
      mask_sensitive_data: Boolean(draft.mask_sensitive_data),
    };
  };

  // Toggle enabled inline on table row
  const handleToggleEnabledInline = async (cfg: CsSheetBackupConfigItem) => {
    if (!isAdminOrManage) {
      toast.error('Chỉ Admin hoặc Quản lý mới được bật/tắt lịch tự động.');
      return;
    }
    const configId = cfg.id;
    const programKey = getProgramKey(cfg.program_type);
    const currentDraft = drafts[configId] || initDraftForConfig(cfg);
    const nextEnabled = !currentDraft.enabled;
    const nextDraft = { ...currentDraft, enabled: nextEnabled };
    updateDraft(configId, { enabled: nextEnabled });

    try {
      setTogglingConfigId(configId);
      await importsApi.updateSheetBackupConfig(
        configId,
        buildSavePayload(nextDraft, programKey)
      );
      setConfigs((prev) =>
        prev.map((item) =>
          item.id === configId ? { ...item, enabled: nextEnabled } : item
        )
      );
      const staffCode = cfg.cs_user?.staff_code || `CVHT0${configId}`;
      toast.success(
        `${nextEnabled ? 'Đã bật' : 'Đã tắt'} lịch backup tự động cho ${staffCode} (${programKey})`
      );
    } catch (err: any) {
      updateDraft(configId, { enabled: !nextEnabled });
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể cập nhật lịch tự động'
      );
    } finally {
      setTogglingConfigId(null);
    }
  };

  const handleSaveConfig = async (cfg: CsSheetBackupConfigItem, closeAfter = true) => {
    const configId = cfg.id;
    const draft = drafts[configId] || initDraftForConfig(cfg);
    const programKey = getProgramKey(cfg.program_type);
    const staffCode = cfg.cs_user?.staff_code || `CVHT0${configId}`;
    const staffLabel = `${staffCode} (${programKey})`;
    try {
      setSavingConfigId(configId);
      await importsApi.updateSheetBackupConfig(
        configId,
        buildSavePayload(draft, programKey)
      );
      toast.success(`Đã lưu cấu hình Backup cho ${staffLabel}!`);
      await fetchBackupConfigs();
      if (closeAfter) {
        setDrawerConfigId(null);
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể lưu cấu hình cho ${staffLabel}`
      );
    } finally {
      setSavingConfigId(null);
    }
  };

  const handleRunBackup = async (
    cfg: CsSheetBackupConfigItem,
    forceFullRewrite = false
  ) => {
    const configId = cfg.id;
    const programKey = getProgramKey(cfg.program_type);
    const meta = PROGRAM_META[programKey];
    const staffCode = cfg.cs_user?.staff_code || `CVHT0${configId}`;
    const draft = drafts[configId];
    try {
      setRunningConfigId(`${configId}_${forceFullRewrite ? 'full' : 'delta'}`);
      if (isAdminOrManage && draft) {
        await importsApi.updateSheetBackupConfig(
          configId,
          buildSavePayload(draft, programKey)
        );
      }

      const res = await importsApi.runSheetBackup(configId, {
        forceFullRewrite,
        year: draft?.backup_year ?? cfg.backup_year ?? null,
      });

      const profileStats = resolveSheetStats(res, 'profile', 'sheet1');
      const attendanceStats = resolveSheetStats(res, 'attendance', 'sheet3');
      const profileRows = (profileStats.updatedRows ?? 0) + (profileStats.appendedRows ?? 0);
      const attendanceRows =
        (attendanceStats.updatedRows ?? 0) + (attendanceStats.appendedRows ?? 0);

      toast.success(
        `Backup ${staffCode} · ${meta.badgeLabel} hoàn tất! (${
          profileRows + attendanceRows
        } dòng cập nhật)`
      );
      await fetchBackupConfigs();
      if (activeSubTab === 'history') {
        await fetchHistory();
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Backup sổ ${staffCode} thất bại`
      );
    } finally {
      setRunningConfigId(null);
    }
  };

  const handleRunBackupAll = async (forceFullRewrite = false) => {
    setSplitMenuOpen(false);
    try {
      setRunningAllMode(forceFullRewrite ? 'full' : 'delta');
      const res = await importsApi.runSheetBackupAll({
        forceFullRewrite,
        programType: programFilter === 'ALL' ? null : programFilter,
      });
      const count = res?.results?.length || configs.length;
      const scopeLabel =
        programFilter === 'ALL' ? 'toàn bộ' : `chương trình ${programFilter}`;
      toast.success(
        forceFullRewrite
          ? `Đã ghi đè toàn bộ (Full Backup) cho ${count} cấu hình (${scopeLabel})!`
          : `Đã thực hiện Delta Backup cho ${count} cấu hình (${scopeLabel})!`
      );
      await fetchBackupConfigs();
      if (activeSubTab === 'history') {
        await fetchHistory();
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Backup toàn bộ thất bại'
      );
    } finally {
      setRunningAllMode(null);
    }
  };

  const handleDownloadExcel = async (cfg: CsSheetBackupConfigItem) => {
    const configId = cfg.id;
    const programKey = getProgramKey(cfg.program_type);
    const meta = PROGRAM_META[programKey];
    const staffCode = cfg.cs_user?.staff_code || `CVHT0${configId}`;
    const excelFileName = `hoc_vien_${meta.fileSlug}_${staffCode}.xlsx`;
    try {
      setDownloadingConfigId(configId);
      await importsApi.downloadCsSheetBackupExcel(configId, excelFileName, false);
      toast.success(`Đã tải file ${excelFileName} thành công!`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể tải file ${excelFileName}`
      );
    } finally {
      setDownloadingConfigId(null);
    }
  };

  const handleExportStudents = async () => {
    setSplitMenuOpen(false);
    try {
      setIsExportingStudents(true);
      await importsApi.exportStudents();
      toast.success('Xuất file danh sách học viên thành công!');
    } catch {
      toast.error('Không thể xuất file dữ liệu học viên.');
    } finally {
      setIsExportingStudents(false);
    }
  };

  const handleExportAttendance = async () => {
    setSplitMenuOpen(false);
    try {
      setIsExportingAttendance(true);
      await importsApi.exportAttendance();
      toast.success('Xuất bảng điểm danh thành công!');
    } catch {
      toast.error('Không thể xuất file điểm danh.');
    } finally {
      setIsExportingAttendance(false);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success(`Đã sao chép email Service Account: ${email}`);
  };

  const handleSaveServiceAccount = async () => {
    try {
      setSavingSa(true);
      const res = await importsApi.saveServiceAccount(saJsonText.trim() || null);
      if (res?.serviceAccount) {
        setServiceAccount(res.serviceAccount);
      }
      toast.success('Đã cập nhật cấu hình Google Service Account!');
      setEditingSaJson(false);
      setSaJsonText('');
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể lưu Service Account JSON'
      );
    } finally {
      setSavingSa(false);
    }
  };

  // Scope configs by role
  const roleScopedConfigs = useMemo(() => {
    if (isAdminOrManage) return configs;
    return configs.filter((c) => !user?.id || c.cs_user_id === user.id);
  }, [configs, isAdminOrManage, user?.id]);

  // Summary counts for toolbar
  const summaryCounts = useMemo(() => {
    const total = roleScopedConfigs.length;
    const enabledCount = roleScopedConfigs.filter((c) => c.enabled).length;
    const failedCount = roleScopedConfigs.filter(
      (c) => c.last_status === 'FAILED' || c.last_status === 'PARTIAL_FAILED'
    ).length;
    return { total, enabledCount, failedCount };
  }, [roleScopedConfigs]);

  // Filtered configs for table
  const filteredConfigs = useMemo(() => {
    return roleScopedConfigs.filter((cfg) => {
      const pKey = getProgramKey(cfg.program_type);
      if (programFilter !== 'ALL' && pKey !== programFilter) return false;

      const status = cfg.last_status || 'IDLE';
      if (statusFilter === 'SUCCESS' && status !== 'SUCCESS' && status !== 'COMPLETED') {
        return false;
      }
      if (
        statusFilter === 'FAILED' &&
        status !== 'FAILED' &&
        status !== 'PARTIAL_FAILED'
      ) {
        return false;
      }
      if (statusFilter === 'IDLE' && status !== 'IDLE' && Boolean(cfg.last_status)) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const code = (cfg.cs_user?.staff_code || `CVHT0${cfg.id}`).toLowerCase();
        const name = (cfg.cs_user?.name || cfg.name || '').toLowerCase();
        const email = (cfg.cs_user?.email || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !email.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [roleScopedConfigs, programFilter, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredConfigs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedConfigs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredConfigs.slice(start, start + pageSize);
  }, [filteredConfigs, safePage]);

  const allVisibleSelected =
    paginatedConfigs.length > 0 &&
    paginatedConfigs.every((c) => selectedIds.includes(c.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedConfigs.some((c) => c.id === id))
      );
    } else {
      const visibleIds = paginatedConfigs.map((c) => c.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openDrawer = (configId: number, tab: DrawerTabKey = 'config') => {
    setOpenRowMenuId(null);
    setDrawerConfigId(configId);
    setDrawerTab(tab);
    setNewTimeChipInput('');
  };

  const activeDrawerConfig = useMemo(
    () => configs.find((c) => c.id === drawerConfigId) || null,
    [configs, drawerConfigId]
  );

  // History filtered batches
  const effectiveHistory = useMemo(() => {
    const base = historyData || synthesizeHistoryFromConfigs(roleScopedConfigs);
    const filteredBatches = base.batches
      .map((batch) => {
        const filteredItems = batch.items.filter((item) => {
          if (historyCsFilter !== 'ALL' && item.staffCode !== historyCsFilter) {
            return false;
          }
          if (
            historyProgramFilter !== 'ALL' &&
            item.programType.toUpperCase() !== historyProgramFilter
          ) {
            return false;
          }
          if (historyStatusFilter !== 'ALL' && item.status !== historyStatusFilter) {
            return false;
          }
          return true;
        });
        return {
          ...batch,
          items: filteredItems,
        };
      })
      .filter((b) => b.items.length > 0);

    return {
      ...base,
      batches: filteredBatches,
    };
  }, [
    historyData,
    roleScopedConfigs,
    historyCsFilter,
    historyProgramFilter,
    historyStatusFilter,
  ]);

  const handleExportHistoryCsv = () => {
    const rows = effectiveHistory.batches.flatMap((b) =>
      b.items.map((item) => ({
        batchId: b.batchId,
        createdAt: formatDateTimeFull(item.createdAt),
        staffCode: item.staffCode,
        staffName: item.staffName,
        programType: item.programType,
        triggerType: item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công',
        mode: item.mode === 'DELTA' ? 'Chỉ thay đổi' : 'Ghi đè',
        status: item.status === 'SUCCESS' ? 'Thành công' : 'Thất bại',
        durationSec: `${item.durationSec} giây`,
        error: item.error || '',
      }))
    );

    const headers = [
      'Đợt chạy',
      'Thời gian',
      'Mã NV',
      'Tên NV',
      'Chương trình',
      'Kích hoạt',
      'Chế độ',
      'Kết quả',
      'Thời lượng',
      'Chi tiết lỗi',
    ];
    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.batchId,
          `"${r.createdAt}"`,
          r.staffCode,
          `"${r.staffName}"`,
          r.programType,
          `"${r.triggerType}"`,
          `"${r.mode}"`,
          `"${r.status}"`,
          `"${r.durationSec}"`,
          `"${r.error.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lich_su_backup_cskh.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV lịch sử backup!');
  };

  // Distinct staff codes for history filter
  const staffFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    roleScopedConfigs.forEach((c) => {
      const code = c.cs_user?.staff_code || `CVHT0${c.id}`;
      const name = c.cs_user?.name || c.name || `CSKH ${c.id}`;
      map.set(code, `${code} · ${name}`);
    });
    return Array.from(map.entries()).map(([code, label]) => ({ code, label }));
  }, [roleScopedConfigs]);

  if (loading && configs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 flex items-center justify-center text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-blue-600" />
        <span className="text-xs font-semibold">
          Đang tải dữ liệu Backup sổ CSKH...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* A. Breadcrumb & Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Nhập &amp; Xuất dữ liệu</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-700 font-semibold">Backup sổ CSKH</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Backup sổ CSKH
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý sao lưu dữ liệu học viên và điểm danh
          </p>
        </div>

        {/* Right: 3 horizontal elements */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Pill trạng thái Google */}
          <button
            type="button"
            onClick={() => {
              if (serviceAccount?.clientEmail) {
                handleCopyEmail(serviceAccount.clientEmail);
              } else {
                setActiveSubTab('connection');
              }
            }}
            title={
              serviceAccount?.clientEmail
                ? 'Bấm để sao chép email Service Account'
                : 'Bấm để mở tab Kết nối & mặc định'
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
                  <span>Chưa kết nối</span>
                  <span className="text-[10px]">●</span>
                </div>
              )}
              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                {serviceAccount?.clientEmail || 'Chưa cấu hình Service Account'}
              </div>
            </div>
          </button>

          {/* 2. Split Button Backup tất cả */}
          <div className="relative inline-flex" ref={splitMenuRef}>
            <button
              type="button"
              disabled={runningAllMode !== null}
              onClick={() => handleRunBackupAll(false)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-l-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              {runningAllMode !== null ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>Backup tất cả</span>
            </button>
            <button
              type="button"
              onClick={() => setSplitMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl px-2.5 py-2 border-l border-blue-400/50 transition-colors cursor-pointer"
              aria-label="Tùy chọn backup"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {splitMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => handleRunBackupAll(false)}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Backup chỉ thay đổi (Delta)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunBackupAll(true)}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Ghi đè toàn bộ (Full Backup)</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={handleExportStudents}
                  disabled={isExportingStudents}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Xuất Excel DS Học viên</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAttendance}
                  disabled={isExportingAttendance}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-600" />
                  <span>Xuất Excel Bảng Điểm danh</span>
                </button>
              </div>
            )}
          </div>

          {/* 3. Nút + Thêm cấu hình */}
          <button
            type="button"
            onClick={() => {
              if (roleScopedConfigs.length > 0) {
                setPickerSelectedId(roleScopedConfigs[0].id);
                setShowAddPickerModal(true);
              } else {
                toast.info('Chưa có nhân sự CSKH/GV nào để thiết lập cấu hình.');
              }
            }}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-slate-600" />
            <span>Thêm cấu hình</span>
          </button>
        </div>
      </div>

      {/* B. Thanh 3 Sub-tab (Underline Tabs) */}
      <div className="border-b border-slate-200 flex items-center gap-6">
        <button
          type="button"
          onClick={() => setActiveSubTab('configs')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'configs'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Cấu hình backup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'history'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lịch sử backup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('connection')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'connection'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>Kết nối &amp; mặc định</span>
        </button>
      </div>

      {/* C. SUB-TAB 1: CẤU HÌNH BACKUP */}
      {activeSubTab === 'configs' && (
        <div className="space-y-4">
          {/* 1. Toolbar phía trên bảng */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
              <span>
                <strong className="text-slate-900 font-semibold">
                  {summaryCounts.total}
                </strong>{' '}
                cấu hình
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-emerald-600 font-semibold">
                  {summaryCounts.enabledCount}
                </strong>{' '}
                hoạt động
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong
                  className={
                    summaryCounts.failedCount > 0
                      ? 'text-rose-600 font-semibold'
                      : 'text-slate-700 font-semibold'
                  }
                >
                  {summaryCounts.failedCount}
                </strong>{' '}
                cần kiểm tra
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Ô tìm kiếm */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Tìm CSKH, Giáo viên..."
                  className="w-60 h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Dropdown chương trình */}
              <select
                value={programFilter}
                onChange={(e) => {
                  setProgramFilter(e.target.value as ProgramFilter);
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ALL">Tất cả chương trình</option>
                <option value="JLPT">JLPT</option>
                <option value="KAIWA">KAIWA</option>
                <option value="TEACHER">Điểm danh GV</option>
              </select>

              {/* Dropdown trạng thái */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setCurrentPage(1);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Thất bại</option>
                <option value="IDLE">Chưa chạy</option>
              </select>
            </div>
          </div>

          {/* 2. Bảng Cấu hình */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">CSKH</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">Nơi lưu</th>
                    <th className="py-3 px-3">Lịch tự động</th>
                    <th className="py-3 px-3">Lần chạy gần nhất</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 pl-3 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Không tìm thấy cấu hình backup phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    paginatedConfigs.map((cfg) => {
                      const configId = cfg.id;
                      const programKey = getProgramKey(cfg.program_type);
                      const meta = PROGRAM_META[programKey];
                      const staffCode =
                        cfg.cs_user?.staff_code ||
                        (programKey === 'TEACHER' ? `GV0${configId}` : `CVHT0${configId}`);
                      const staffName =
                        cfg.cs_user?.name || cfg.name || `CSKH ${configId}`;
                      const draft = drafts[configId] || initDraftForConfig(cfg);
                      const hasGoogleSheet = Boolean(
                        (draft.target_spreadsheet_url || cfg.target_spreadsheet_url || '').trim()
                      );
                      const sheetUrl = (
                        draft.target_spreadsheet_url ||
                        cfg.target_spreadsheet_url ||
                        ''
                      ).trim();

                      const scheduleText = (
                        draft.schedule_times && draft.schedule_times.length > 0
                          ? draft.schedule_times
                          : ['12:00', '21:00']
                      ).join(', ');

                      const { date: runDate, time: runTime } = formatDateParts(
                        cfg.last_backup_at
                      );

                      const isFailed =
                        cfg.last_status === 'FAILED' ||
                        cfg.last_status === 'PARTIAL_FAILED';
                      const isSuccess =
                        cfg.last_status === 'SUCCESS' ||
                        cfg.last_status === 'COMPLETED';
                      const isRunningThis =
                        runningConfigId === `${configId}_delta` ||
                        runningConfigId === `${configId}_full`;

                      const sheetsSubline =
                        programKey === 'TEACHER'
                          ? draft.sheet_name || meta.attendanceSheet
                          : [
                              draft.profile_enabled !== false
                                ? draft.profile_sheet_name || meta.profileSheet
                                : null,
                              draft.sheet_name || meta.attendanceSheet,
                              draft.final_enabled !== false
                                ? draft.final_sheet_name || meta.finalSheet
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ');

                      return (
                        <tr
                          key={configId}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          {/* 1. Checkbox */}
                          <td className="py-3.5 pl-4 pr-2 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(configId)}
                              onChange={() => toggleSelectOne(configId)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>

                          {/* 2. CSKH */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="font-bold text-slate-900">{staffCode}</div>
                            <div className="text-[11px] text-slate-500">{staffName}</div>
                          </td>

                          {/* 3. Chương trình */}
                          <td className="py-3.5 px-3 align-middle">
                            <span className={meta.badgeClass}>{meta.badgeLabel}</span>
                          </td>

                          {/* 4. Nơi lưu */}
                          <td className="py-3.5 px-3 align-middle">
                            {hasGoogleSheet ? (
                              <a
                                href={sheetUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-blue-600 transition-colors"
                              >
                                <span className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                                  <FileSpreadsheet className="w-3 h-3" />
                                </span>
                                <span>Google Sheet</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDownloadExcel(cfg)}
                                disabled={downloadingConfigId === configId}
                                className="inline-flex items-center gap-1.5 font-semibold text-slate-800 hover:text-emerald-700 transition-colors cursor-pointer"
                              >
                                <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">
                                  X
                                </span>
                                <span>Excel (.xlsx)</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </button>
                            )}
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[260px]">
                              {sheetsSubline}
                            </div>
                          </td>

                          {/* 5. Lịch tự động */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <span className="text-slate-700 font-medium">
                                {scheduleText}
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(draft.enabled)}
                                disabled={togglingConfigId === configId}
                                onClick={() => handleToggleEnabledInline(cfg)}
                                className={`relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  draft.enabled ? 'bg-blue-600' : 'bg-slate-200'
                                } ${
                                  togglingConfigId === configId ? 'opacity-60' : ''
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                    draft.enabled ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </td>

                          {/* 6. Lần chạy gần nhất */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="text-slate-800 font-medium">{runDate}</div>
                            <div className="text-[11px] text-slate-400">{runTime}</div>
                          </td>

                          {/* 7. Kết quả */}
                          <td className="py-3.5 px-3 align-middle">
                            {isSuccess ? (
                              <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                                <span>●</span>
                                <span>Thành công</span>
                              </span>
                            ) : isFailed ? (
                              <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                                <span>●</span>
                                <span>Thất bại</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium inline-flex items-center gap-1">
                                <span>●</span>
                                <span>Chưa chạy</span>
                              </span>
                            )}
                          </td>

                          {/* 8. Thao tác */}
                          <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              {isFailed ? (
                                <button
                                  type="button"
                                  disabled={isRunningThis}
                                  onClick={() => handleRunBackup(cfg, false)}
                                  className="border border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  <RotateCcw
                                    className={`w-3 h-3 ${
                                      isRunningThis ? 'animate-spin' : ''
                                    }`}
                                  />
                                  <span>Chạy lại</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isRunningThis}
                                  onClick={() => handleRunBackup(cfg, false)}
                                  className="border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  {isRunningThis ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3 fill-current" />
                                  )}
                                  <span>Chạy</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openDrawer(configId, 'config')}
                                title="Chỉnh sửa cấu hình"
                                className="border border-slate-200 rounded-lg p-1.5 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              <div className="relative" data-row-menu>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenRowMenuId((prev) =>
                                      prev === configId ? null : configId
                                    )
                                  }
                                  title="Thêm thao tác"
                                  className="border border-slate-200 rounded-lg p-1.5 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>

                                {openRowMenuId === configId && (
                                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30 text-left text-xs">
                                    <button
                                      type="button"
                                      onClick={() => openDrawer(configId, 'overview')}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <Info className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Xem tổng quan &amp; thống kê</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        handleRunBackup(cfg, true);
                                      }}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Ghi đè toàn bộ (Full Backup)</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenRowMenuId(null);
                                        handleDownloadExcel(cfg);
                                      }}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Tải file Excel (.xlsx)</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDrawer(configId, 'history')}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <History className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Xem lịch sử chạy</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer phân trang */}
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Hiển thị{' '}
                <strong className="text-slate-700">
                  {filteredConfigs.length === 0
                    ? 0
                    : (safePage - 1) * pageSize + 1}
                  –{Math.min(safePage * pageSize, filteredConfigs.length)}
                </strong>{' '}
                / <strong className="text-slate-700">{filteredConfigs.length}</strong> cấu
                hình
              </span>

              <div className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-semibold flex items-center justify-center text-xs">
                  {safePage}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* 3. Banner cảnh báo lỗi dưới đáy */}
          {summaryCounts.failedCount > 0 && (
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-amber-900 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{summaryCounts.failedCount} cấu hình backup</strong> gặp lỗi kết
                  nối. Vui lòng kiểm tra lại quyền truy cập hoặc thư mục đích.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('history');
                  setHistoryStatusFilter('FAILED');
                }}
                className="bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-800 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
              >
                Xem lỗi
              </button>
            </div>
          )}
        </div>
      )}

      {/* D. SUB-TAB 2: LỊCH SỬ BACKUP */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          {/* 1. Dòng thống kê hôm nay */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
              <span>
                Hôm nay:{' '}
                <strong className="text-blue-600 font-bold">
                  {effectiveHistory.stats.todayTotal} lượt chạy
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-emerald-600 font-bold">
                  {effectiveHistory.stats.todaySuccess} thành công
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="text-rose-600 font-bold">
                  {effectiveHistory.stats.todayFailed} thất bại
                </strong>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Lần gần nhất{' '}
                <strong className="text-slate-900 font-semibold">
                  {effectiveHistory.stats.lastRunTime || '--:--'}
                </strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportHistoryCsv}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Xuất lịch sử</span>
            </button>
          </div>

          {/* 2. Thanh bộ lọc */}
          <div className="flex flex-wrap items-center gap-2.5">
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
              value={historyCsFilter}
              onChange={(e) => setHistoryCsFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả CSKH</option>
              {staffFilterOptions.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={historyProgramFilter}
              onChange={(e) => setHistoryProgramFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="ALL">Tất cả chương trình</option>
              <option value="JLPT">JLPT</option>
              <option value="KAIWA">KAIWA</option>
              <option value="TEACHER">GIÁO VIÊN</option>
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
              onClick={fetchHistory}
              disabled={historyLoading}
              title="Làm mới lịch sử"
              className="h-9 w-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {/* 3. Bảng Lịch sử theo Đợt chạy (Expandable Batch Tree Table) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-3">Thời gian</th>
                    <th className="py-3 px-3">CSKH / Chương trình</th>
                    <th className="py-3 px-3">Kích hoạt</th>
                    <th className="py-3 px-3">Chế độ</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 px-3">Thời lượng</th>
                    <th className="py-3 pl-3 pr-4 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {effectiveHistory.batches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        Chưa có lịch sử đợt chạy backup nào.
                      </td>
                    </tr>
                  ) : (
                    effectiveHistory.batches.map((batch) => {
                      const isExpanded = Boolean(expandedBatchIds[batch.batchId]);
                      const toggleBatch = () =>
                        setExpandedBatchIds((prev) => ({
                          ...prev,
                          [batch.batchId]: !prev[batch.batchId],
                        }));
                      const allBatchOk = batch.failedCount === 0;

                      return (
                        <React.Fragment key={batch.batchId}>
                          {/* Batch Parent Row */}
                          <tr
                            onClick={toggleBatch}
                            className="bg-slate-50/60 hover:bg-slate-100/70 transition-colors cursor-pointer font-medium"
                          >
                            <td className="py-3.5 pl-4 pr-3 align-middle whitespace-nowrap">
                              <div className="inline-flex items-center gap-2 text-slate-800 font-semibold">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-slate-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-500" />
                                )}
                                <span>{formatDateTimeFull(batch.startedAt)}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-3 align-middle">
                              <div className="font-bold text-slate-900">
                                Đợt backup {batch.batchId}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {batch.totalConfigs} cấu hình · {batch.successCount}/
                                {batch.totalConfigs} thành công
                              </div>
                            </td>
                            <td className="py-3.5 px-3 align-middle text-slate-700">
                              {batch.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                            </td>
                            <td className="py-3.5 px-3 align-middle text-slate-700">
                              {batch.mode === 'DELTA' ? 'Chỉ thay đổi' : 'Ghi đè'}
                            </td>
                            <td className="py-3.5 px-3 align-middle">
                              <span
                                className={`font-semibold inline-flex items-center gap-1 ${
                                  allBatchOk ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                              >
                                <span>●</span>
                                <span>
                                  {batch.successCount}/{batch.totalConfigs} thành công
                                </span>
                              </span>
                            </td>
                            <td className="py-3.5 px-3 align-middle text-slate-600">
                              {batch.durationSec} giây
                            </td>
                            <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                              {isExpanded ? (
                                <span className="text-slate-400">-</span>
                              ) : (
                                <span className="text-blue-600 font-semibold hover:underline">
                                  Xem chi tiết
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Child Rows */}
                          {isExpanded &&
                            batch.items.map((item) => {
                              const pKey = getProgramKey(item.programType);
                              const meta = PROGRAM_META[pKey];
                              const itemFailed = item.status === 'FAILED';
                              const matchedCfg = configs.find(
                                (c) => c.id === item.configId
                              );

                              return (
                                <React.Fragment key={item.id}>
                                  <tr className="bg-white hover:bg-slate-50/60 transition-colors">
                                    <td className="py-3 pl-9 pr-3 align-middle text-slate-500 whitespace-nowrap">
                                      <div className="border-l border-dashed border-slate-300 pl-3 py-0.5">
                                        {formatDateParts(item.createdAt).time}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 align-middle">
                                      <div className="flex items-center gap-2">
                                        <div>
                                          <span className="font-bold text-slate-900">
                                            {item.staffCode}
                                          </span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span className="text-slate-600">
                                            {item.staffName}
                                          </span>
                                        </div>
                                        <span className={meta.badgeClass}>
                                          {meta.badgeLabel}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 align-middle text-slate-600">
                                      {item.triggerType === 'AUTO'
                                        ? 'Tự động'
                                        : 'Thủ công'}
                                    </td>
                                    <td className="py-3 px-3 align-middle text-slate-600">
                                      {item.mode === 'DELTA'
                                        ? 'Chỉ thay đổi'
                                        : 'Ghi đè'}
                                    </td>
                                    <td className="py-3 px-3 align-middle">
                                      {itemFailed ? (
                                        <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                                          <span>●</span>
                                          <span>Thất bại</span>
                                        </span>
                                      ) : (
                                        <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                                          <span>●</span>
                                          <span>Thành công</span>
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 align-middle text-slate-600">
                                      {item.durationSec} giây
                                    </td>
                                    <td className="py-3 pl-3 pr-4 align-middle text-right">
                                      {itemFailed ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openDrawer(item.configId, 'config')
                                          }
                                          className="text-rose-600 font-semibold hover:underline cursor-pointer"
                                        >
                                          Xem lỗi
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openDrawer(item.configId, 'overview')
                                          }
                                          className="text-blue-600 font-semibold hover:underline cursor-pointer"
                                        >
                                          Xem chi tiết
                                        </button>
                                      )}
                                    </td>
                                  </tr>

                                  {/* Inline Error Callout */}
                                  {itemFailed && (
                                    <tr className="bg-white">
                                      <td colSpan={7} className="pl-12 pr-4 pb-3 pt-0.5">
                                        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 text-xs text-rose-800 font-medium">
                                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                            <span>
                                              {item.error ||
                                                'Không có quyền ghi vào Google Sheet đích.'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                openDrawer(item.configId, 'config')
                                              }
                                              className="bg-white border border-rose-200 hover:bg-rose-100/50 text-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                            >
                                              <Settings className="w-3.5 h-3.5 text-slate-500" />
                                              <span>Xem cấu hình</span>
                                            </button>
                                            {matchedCfg && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleRunBackup(matchedCfg, false)
                                                }
                                                disabled={
                                                  runningConfigId ===
                                                  `${matchedCfg.id}_delta`
                                                }
                                                className="bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                              >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Chạy lại</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* E. SUB-TAB 3: KẾT NỐI & MẶC ĐỊNH */}
      {activeSubTab === 'connection' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Google Service Account */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <GoogleColorIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Google Service Account
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tài khoản kỹ thuật dùng để ghi dữ liệu vào Google Sheet của CSKH/GV
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  serviceAccount?.configured
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span>●</span>
                <span>
                  {serviceAccount?.configured ? 'Đã kết nối' : 'Chưa kết nối'}
                </span>
              </span>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Client Email:</span>
                {serviceAccount?.clientEmail ? (
                  <div className="inline-flex items-center gap-1.5">
                    <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-semibold text-slate-800">
                      {serviceAccount.clientEmail}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyEmail(serviceAccount.clientEmail!)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-[11px] cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-slate-400 italic">Chưa thiết lập</span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Project ID:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {serviceAccount?.projectId || '-'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium">Nguồn cấu hình:</span>
                <span className="font-semibold text-slate-700">
                  {serviceAccount?.source || 'NONE'}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/60 border border-blue-200/80 p-3.5 text-xs text-slate-700 space-y-1">
              <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Hướng dẫn cấp quyền trên Google Sheet đích</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Mở file Google Sheet của từng CSKH/Giáo viên → Bấm nút{' '}
                <strong>Share (Chia sẻ)</strong> → Dán địa chỉ{' '}
                <strong>Client Email</strong> ở trên vào và chọn quyền{' '}
                <strong>Editor (Người chỉnh sửa)</strong>. Khuyến nghị tắt quyền truy cập
                công khai (&quot;Anyone with the link&quot;) để đảm bảo bảo mật.
              </p>
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-slate-100 space-y-3">
                {!editingSaJson ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Cập nhật khóa JSON Service Account mới
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingSaJson(true)}
                    >
                      Cập nhật JSON
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Dán nội dung file Service Account JSON:
                    </label>
                    <textarea
                      rows={5}
                      value={saJsonText}
                      onChange={(e) => setSaJsonText(e.target.value)}
                      placeholder='{"type": "service_account", "project_id": "...", "client_email": "..."}'
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingSaJson(false);
                          setSaJsonText('');
                        }}
                      >
                        Hủy
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={savingSa}
                        onClick={handleSaveServiceAccount}
                      >
                        Lưu Service Account
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Quy tắc 3 loại sổ Backup mặc định */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Quy tắc mặc định cho 3 loại sổ Backup
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cấu trúc các trang tính (Sheet) chuẩn được ghi tự động từ hệ thống
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Sổ CSKH Kaiwa</span>
                    <span className={PROGRAM_META.KAIWA.badgeClass}>KAIWA</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Gồm 3 sheet:{' '}
                    <code className="font-mono font-semibold text-teal-700">
                      1.Chăm sóc
                    </code>{' '}
                    (Hồ sơ HV) +{' '}
                    <code className="font-mono font-semibold text-teal-700">
                      3.Chấm buổi
                    </code>{' '}
                    (Điểm danh CVHT) +{' '}
                    <code className="font-mono font-semibold text-teal-700">
                      Điểm danh chốt
                    </code>{' '}
                    (Điểm danh đối soát chốt).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Sổ Học viên JLPT</span>
                    <span className={PROGRAM_META.JLPT.badgeClass}>JLPT</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Gồm 3 sheet:{' '}
                    <code className="font-mono font-semibold text-violet-700">
                      Data JLPT_Inhouse
                    </code>{' '}
                    (Hồ sơ HV) +{' '}
                    <code className="font-mono font-semibold text-violet-700">
                      Chấm buổi
                    </code>{' '}
                    (Điểm danh CVHT) +{' '}
                    <code className="font-mono font-semibold text-violet-700">
                      Điểm danh chốt
                    </code>{' '}
                    (Điểm danh đối soát chốt).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      Sổ Điểm danh Giáo viên
                    </span>
                    <span className={PROGRAM_META.TEACHER.badgeClass}>GIÁO VIÊN</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Gồm 1 sheet:{' '}
                    <code className="font-mono font-semibold text-sky-700">
                      2026 スケジュール
                    </code>{' '}
                    (Bảng chấm buổi dạy và điểm danh của Giáo viên).
                  </p>
                </div>
              </div>
            </div>

            {isAdmin && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Cấu hình ánh xạ cột nâng cao cho Admin
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/settings/config/sheet-backup')}
                  leftIcon={<Settings className="w-3.5 h-3.5 text-slate-600" />}
                >
                  Cấu hình cột nâng cao
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* F. SLIDE-OVER DRAWER BÊN PHẢI (THEO ẢNH 3) */}
      {activeDrawerConfig &&
        (() => {
          const cfg = activeDrawerConfig;
          const configId = cfg.id;
          const programKey = getProgramKey(cfg.program_type);
          const meta = PROGRAM_META[programKey];
          const staffCode =
            cfg.cs_user?.staff_code ||
            (programKey === 'TEACHER' ? `GV0${configId}` : `CVHT0${configId}`);
          const staffName = cfg.cs_user?.name || cfg.name || `CSKH ${configId}`;
          const draft = drafts[configId] || initDraftForConfig(cfg);
          const scheduleTimes =
            draft.schedule_times && draft.schedule_times.length > 0
              ? draft.schedule_times
              : ['12:00', '21:00'];

          const frequencyValue =
            scheduleTimes.length === 2
              ? '2_PER_DAY'
              : scheduleTimes.length === 1
              ? '1_PER_DAY'
              : 'CUSTOM';

          const handleFrequencyChange = (val: string) => {
            if (val === '2_PER_DAY') {
              updateDraft(configId, { schedule_times: ['12:00', '21:00'] });
            } else if (val === '1_PER_DAY') {
              updateDraft(configId, { schedule_times: ['21:00'] });
            }
          };

          const handleRemoveTimeChip = (timeToRemove: string) => {
            const next = scheduleTimes.filter((t) => t !== timeToRemove);
            updateDraft(configId, {
              schedule_times: next.length > 0 ? next : ['12:00'],
            });
          };

          const handleAddTimeChip = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const raw = newTimeChipInput.trim();
            if (!/^\d{1,2}:\d{2}$/.test(raw)) {
              toast.error('Vui lòng nhập giờ theo định dạng HH:mm (VD: 12:00)');
              return;
            }
            const [h, m] = raw.split(':');
            const normalized = `${h.padStart(2, '0')}:${m}`;
            if (!scheduleTimes.includes(normalized)) {
              updateDraft(configId, {
                schedule_times: [...scheduleTimes, normalized],
              });
            }
            setNewTimeChipInput('');
          };

          const profileStats = resolveSheetStats(cfg.last_summary, 'profile', 'sheet1');
          const attendanceStats = resolveSheetStats(
            cfg.last_summary,
            'attendance',
            'sheet3'
          );
          const finalStats = resolveSheetStats(cfg.last_summary, 'finalAttendance');
          const yearOptions =
            availableYears.length > 0 ? availableYears : [2025, 2026];

          const configHistoryItems = effectiveHistory.batches
            .flatMap((b) => b.items)
            .filter((item) => item.configId === configId);

          return (
            <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-[1px] flex justify-end">
              <div
                className="flex-1"
                onClick={() => setDrawerConfigId(null)}
                aria-hidden="true"
              />
              <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
                {/* Drawer Header */}
                <div>
                  <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Cấu hình backup
                      </h2>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                        <span className="font-bold text-slate-800">{staffCode}</span>
                        <span>({staffName})</span>
                        <span>·</span>
                        <span className={meta.badgeClass}>{meta.badgeLabel}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerConfigId(null)}
                      className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer 3 Tabs */}
                  <div className="px-6 border-b border-slate-200 flex items-center gap-6">
                    <button
                      type="button"
                      onClick={() => setDrawerTab('overview')}
                      className={`pb-2.5 text-xs inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        drawerTab === 'overview'
                          ? 'border-blue-600 text-blue-600 font-semibold'
                          : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Tổng quan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerTab('config')}
                      className={`pb-2.5 text-xs inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        drawerTab === 'config'
                          ? 'border-blue-600 text-blue-600 font-semibold'
                          : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Cấu hình</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerTab('history')}
                      className={`pb-2.5 text-xs inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                        drawerTab === 'history'
                          ? 'border-blue-600 text-blue-600 font-semibold'
                          : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Lịch sử</span>
                    </button>
                  </div>
                </div>

                {/* Drawer Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                  {/* TAB CẤU HÌNH (Theo Ảnh 3) */}
                  {drawerTab === 'config' && (
                    <>
                      {/* 1. Đích lưu dữ liệu */}
                      <div className="space-y-3.5">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Đích lưu dữ liệu
                        </h3>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Link Google Sheet
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Input
                                value={draft.target_spreadsheet_url || ''}
                                disabled={!isAdminOrManage}
                                onChange={(e) =>
                                  updateDraft(configId, {
                                    target_spreadsheet_url: e.target.value,
                                  })
                                }
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!draft.target_spreadsheet_url?.trim()}
                              onClick={() => {
                                const url = draft.target_spreadsheet_url?.trim();
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                              <span>Mở Sheet</span>
                            </button>
                          </div>
                        </div>

                        {programKey !== 'TEACHER' ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                  Sheet hồ sơ
                                </label>
                                <Input
                                  value={draft.profile_sheet_name || ''}
                                  disabled={!isAdminOrManage}
                                  onChange={(e) =>
                                    updateDraft(configId, {
                                      profile_sheet_name: e.target.value,
                                    })
                                  }
                                  placeholder={meta.profileSheet}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                  Sheet điểm danh CVHT
                                </label>
                                <Input
                                  value={draft.sheet_name || ''}
                                  disabled={!isAdminOrManage}
                                  onChange={(e) =>
                                    updateDraft(configId, {
                                      sheet_name: e.target.value,
                                    })
                                  }
                                  placeholder={meta.attendanceSheet}
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Sheet điểm danh chốt
                              </label>
                              <Input
                                value={draft.final_sheet_name ?? 'Điểm danh chốt'}
                                disabled={!isAdminOrManage}
                                onChange={(e) =>
                                  updateDraft(configId, {
                                    final_sheet_name: e.target.value,
                                  })
                                }
                                placeholder="Điểm danh chốt"
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-5 pt-1">
                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft.profile_enabled)}
                                  disabled={!isAdminOrManage}
                                  onChange={(e) =>
                                    updateDraft(configId, {
                                      profile_enabled: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-xs text-slate-700 font-medium">
                                  Đổ dữ liệu vào Sheet hồ sơ
                                </span>
                              </label>

                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={Boolean(draft.final_enabled ?? true)}
                                  disabled={!isAdminOrManage}
                                  onChange={(e) =>
                                    updateDraft(configId, {
                                      final_enabled: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-xs text-slate-700 font-medium">
                                  Đổ dữ liệu vào Sheet điểm danh chốt
                                </span>
                              </label>
                            </div>
                          </>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                              Sheet điểm danh Giáo viên
                            </label>
                            <Input
                              value={draft.sheet_name || ''}
                              disabled={!isAdminOrManage}
                              onChange={(e) =>
                                updateDraft(configId, {
                                  sheet_name: e.target.value,
                                })
                              }
                              placeholder="2026 スケジュール"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Năm điểm danh
                          </label>
                          <select
                            value={
                              draft.backup_year == null
                                ? 'ALL'
                                : String(draft.backup_year)
                            }
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, {
                                backup_year:
                                  e.target.value === 'ALL'
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="ALL">Tất cả các năm</option>
                            {yearOptions.map((y) => (
                              <option key={y} value={y}>
                                Năm {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* 2. Lịch tự động */}
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                              Lịch tự động
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Tự động backup hằng ngày
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(draft.enabled)}
                            disabled={!isAdminOrManage}
                            onClick={() =>
                              updateDraft(configId, { enabled: !draft.enabled })
                            }
                            className={`relative inline-flex w-10 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              draft.enabled ? 'bg-blue-600' : 'bg-slate-200'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                draft.enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                              Tần suất
                            </label>
                            <select
                              value={frequencyValue}
                              disabled={!isAdminOrManage}
                              onChange={(e) => handleFrequencyChange(e.target.value)}
                              className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="2_PER_DAY">2 lần/ngày</option>
                              <option value="1_PER_DAY">1 lần/ngày</option>
                              <option value="CUSTOM">Tùy chỉnh</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                              Giờ chạy
                            </label>
                            <div className="min-h-9 rounded-xl border border-slate-200 bg-white px-2 py-1 flex flex-wrap items-center gap-1.5">
                              {scheduleTimes.map((timeStr) => (
                                <span
                                  key={timeStr}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-semibold text-[11px]"
                                >
                                  <span>{timeStr}</span>
                                  {isAdminOrManage && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveTimeChip(timeStr)}
                                      className="text-blue-400 hover:text-blue-700 cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                              {isAdminOrManage && (
                                <input
                                  type="text"
                                  value={newTimeChipInput}
                                  onChange={(e) => setNewTimeChipInput(e.target.value)}
                                  onKeyDown={handleAddTimeChip}
                                  placeholder="+ HH:mm"
                                  className="w-14 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none bg-transparent"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-400">
                          Múi giờ: Asia/Ho_Chi_Minh
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* 3. Bảo mật */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Bảo mật
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.require_private_sheet)}
                              disabled={!isAdminOrManage}
                              onChange={(e) =>
                                updateDraft(configId, {
                                  require_private_sheet: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-slate-700 font-medium">
                              Chỉ ghi vào Sheet riêng tư
                            </span>
                          </label>

                          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.mask_sensitive_data)}
                              disabled={!isAdminOrManage}
                              onChange={(e) =>
                                updateDraft(configId, {
                                  mask_sensitive_data: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-slate-700 font-medium">
                              Ẩn bớt SĐT và email học viên
                            </span>
                          </label>
                        </div>

                        <div className="rounded-xl bg-slate-100/80 border border-slate-200/80 px-3.5 py-2.5 text-[11px] text-slate-600 flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Chế độ mặc định: Chỉ cập nhật dữ liệu thay đổi</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* TAB TỔNG QUAN TRONG DRAWER */}
                  {drawerTab === 'overview' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                          <span className="text-[11px] text-slate-500 font-medium">
                            Tổng học viên quản lý
                          </span>
                          <div className="text-lg font-bold text-slate-900 mt-0.5">
                            {cfg.student_counts?.total ?? 0} HV
                          </div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 p-3.5 bg-emerald-50/40">
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Đang học / Chờ lớp
                          </span>
                          <div className="text-lg font-bold text-emerald-800 mt-0.5">
                            {cfg.student_counts?.attending ?? 0} HV
                          </div>
                        </div>
                      </div>

                      {cfg.last_error && (
                        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800 text-xs">
                          <strong>Lỗi lần chạy gần nhất:</strong> {cfg.last_error}
                        </div>
                      )}

                      {/* Thống kê Delta từng Sheet */}
                      <div className="space-y-3">
                        {programKey !== 'TEACHER' && (
                          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                Sheet Hồ sơ:{' '}
                                <code className="font-mono text-blue-600">
                                  {draft.profile_sheet_name || meta.profileSheet}
                                </code>
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Header dòng {draft.profile_header_row ?? meta.profileHeaderRow}
                              </span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 text-center">
                              <div className="bg-slate-50 rounded-lg p-2">
                                <span className="block text-[10px] text-slate-500">
                                  Tổng dòng
                                </span>
                                <strong className="text-slate-900">
                                  {profileStats.totalEnrollments}
                                </strong>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2">
                                <span className="block text-[10px] text-slate-500">
                                  Giữ nguyên
                                </span>
                                <strong className="text-slate-700">
                                  {profileStats.unchangedRows}
                                </strong>
                              </div>
                              <div className="bg-blue-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-blue-700">
                                  Cập nhật
                                </span>
                                <strong className="text-blue-700">
                                  {profileStats.updatedRows}
                                </strong>
                              </div>
                              <div className="bg-emerald-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-emerald-700">
                                  Thêm mới
                                </span>
                                <strong className="text-emerald-700">
                                  +{profileStats.appendedRows}
                                </strong>
                              </div>
                              <div className="bg-amber-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-amber-800">
                                  Ô đổi
                                </span>
                                <strong className="text-amber-800">
                                  {profileStats.updatedCellsCount}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">
                              Sheet Điểm danh:{' '}
                              <code className="font-mono text-teal-600">
                                {draft.sheet_name || meta.attendanceSheet}
                              </code>
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Header dòng {draft.header_row ?? meta.attendanceHeaderRow}
                            </span>
                          </div>
                          <div className="grid grid-cols-5 gap-1.5 text-center">
                            <div className="bg-slate-50 rounded-lg p-2">
                              <span className="block text-[10px] text-slate-500">
                                Tổng dòng
                              </span>
                              <strong className="text-slate-900">
                                {attendanceStats.totalEnrollments}
                              </strong>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-2">
                              <span className="block text-[10px] text-slate-500">
                                Giữ nguyên
                              </span>
                              <strong className="text-slate-700">
                                {attendanceStats.unchangedRows}
                              </strong>
                            </div>
                            <div className="bg-blue-50/70 rounded-lg p-2">
                              <span className="block text-[10px] text-blue-700">
                                Cập nhật
                              </span>
                              <strong className="text-blue-700">
                                {attendanceStats.updatedRows}
                              </strong>
                            </div>
                            <div className="bg-emerald-50/70 rounded-lg p-2">
                              <span className="block text-[10px] text-emerald-700">
                                Thêm mới
                              </span>
                              <strong className="text-emerald-700">
                                +{attendanceStats.appendedRows}
                              </strong>
                            </div>
                            <div className="bg-amber-50/70 rounded-lg p-2">
                              <span className="block text-[10px] text-amber-800">
                                Ô đổi
                              </span>
                              <strong className="text-amber-800">
                                {attendanceStats.updatedCellsCount}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {programKey !== 'TEACHER' && (
                          <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                Sheet Điểm danh chốt:{' '}
                                <code className="font-mono text-indigo-600">
                                  {draft.final_sheet_name || meta.finalSheet}
                                </code>
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Header dòng 2
                              </span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 text-center">
                              <div className="bg-slate-50 rounded-lg p-2">
                                <span className="block text-[10px] text-slate-500">
                                  Tổng dòng
                                </span>
                                <strong className="text-slate-900">
                                  {finalStats.totalEnrollments}
                                </strong>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-2">
                                <span className="block text-[10px] text-slate-500">
                                  Giữ nguyên
                                </span>
                                <strong className="text-slate-700">
                                  {finalStats.unchangedRows}
                                </strong>
                              </div>
                              <div className="bg-blue-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-blue-700">
                                  Cập nhật
                                </span>
                                <strong className="text-blue-700">
                                  {finalStats.updatedRows}
                                </strong>
                              </div>
                              <div className="bg-emerald-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-emerald-700">
                                  Thêm mới
                                </span>
                                <strong className="text-emerald-700">
                                  +{finalStats.appendedRows}
                                </strong>
                              </div>
                              <div className="bg-amber-50/70 rounded-lg p-2">
                                <span className="block text-[10px] text-amber-800">
                                  Ô đổi
                                </span>
                                <strong className="text-amber-800">
                                  {finalStats.updatedCellsCount}
                                </strong>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Quick Action Buttons */}
                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadExcel(cfg)}
                          isLoading={downloadingConfigId === configId}
                          leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
                        >
                          Tải file .xlsx
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRunBackup(cfg, true)}
                          isLoading={runningConfigId === `${configId}_full`}
                          leftIcon={<RotateCcw className="w-3.5 h-3.5 text-amber-600" />}
                        >
                          Ghi đè toàn bộ
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleRunBackup(cfg, false)}
                          isLoading={runningConfigId === `${configId}_delta`}
                          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          Chạy Delta Backup
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* TAB LỊCH SỬ TRONG DRAWER */}
                  {drawerTab === 'history' && (
                    <div className="space-y-3">
                      {configHistoryItems.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                          Chưa có lịch sử chạy cho cấu hình {staffCode}.
                        </div>
                      ) : (
                        configHistoryItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-200 p-3.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800">
                                {formatDateTimeFull(item.createdAt)}
                              </span>
                              {item.status === 'SUCCESS' ? (
                                <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Thành công</span>
                                </span>
                              ) : (
                                <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Thất bại</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>
                                Kích hoạt:{' '}
                                {item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}
                              </span>
                              <span>·</span>
                              <span>
                                Chế độ:{' '}
                                {item.mode === 'DELTA' ? 'Chỉ thay đổi' : 'Ghi đè'}
                              </span>
                              <span>·</span>
                              <span>Thời lượng: {item.durationSec} giây</span>
                            </div>
                            {item.error && (
                              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 mt-1">
                                {item.error}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Drawer Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setDrawerConfigId(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  {isAdminOrManage && (
                    <button
                      type="button"
                      disabled={savingConfigId === configId}
                      onClick={() => handleSaveConfig(cfg, true)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      {savingConfigId === configId && (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      )}
                      <span>Lưu cấu hình</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Quick Picker Modal when clicking "+ Thêm cấu hình" */}
      {showAddPickerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Chọn cấu hình CSKH / Giáo viên để thiết lập
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPickerModal(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Chọn nhân sự và chương trình bên dưới để gắn Link Google Sheet hoặc điều
              chỉnh lịch tự động:
            </p>
            <select
              value={pickerSelectedId ?? ''}
              onChange={(e) => setPickerSelectedId(Number(e.target.value))}
              className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {roleScopedConfigs.map((c) => {
                const pKey = getProgramKey(c.program_type);
                const code = c.cs_user?.staff_code || `CVHT0${c.id}`;
                const name = c.cs_user?.name || c.name || `CSKH ${c.id}`;
                return (
                  <option key={c.id} value={c.id}>
                    {code} ({name}) — {PROGRAM_META[pKey].badgeLabel}
                  </option>
                );
              })}
            </select>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddPickerModal(false)}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowAddPickerModal(false);
                  if (pickerSelectedId) {
                    openDrawer(pickerSelectedId, 'config');
                  }
                }}
              >
                Tiếp tục cấu hình
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
