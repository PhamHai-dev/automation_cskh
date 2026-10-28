import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importsApi } from '../api/imports.api';
import {
  CsUserOption,
  GoogleSheetSyncConfig,
  ServiceAccountInfo,
  SyncHistoryItem,
  SyncHistoryResponse,
  UpdateGoogleSheetSyncConfigDTO,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Info,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';

type SyncSubTabKey = 'configs' | 'history' | 'mapping';
type SyncDrawerTabKey = 'overview' | 'config' | 'history';

const deriveCvhtCodes = (
  users: CsUserOption[],
  ...mappings: Array<Record<string, number> | undefined | null>
): string[] => {
  const seen = new Set<string>();
  const add = (raw?: string | null) => {
    const code = raw?.trim().toUpperCase();
    if (code) seen.add(code);
  };
  users.forEach((u) => add(u.staff_code));
  mappings.forEach((m) => {
    if (m) Object.keys(m).forEach((k) => add(k));
  });
  return Array.from(seen).sort();
};

const DEFAULT_CONFIGS: GoogleSheetSyncConfig[] = [
  {
    id: 1,
    code: 'JLPT',
    name: 'Khóa Luyện thi JLPT',
    program_type: 'JLPT',
    spreadsheet_url: '',
    local_file_path: 'docs/data/hoc_vien/hoc_vien_jlpt.xlsx',
    sheet_name: 'Data JLPT_Inhouse',
    setting_sheet_name: 'Setting',
    header_row: 2,
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 10,
    enabled: true,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
  {
    id: 2,
    code: 'KAIWA',
    name: 'Khóa Giao tiếp Kaiwa',
    program_type: 'KAIWA',
    spreadsheet_url: '',
    local_file_path: 'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx',
    sheet_name: 'Tổng',
    setting_sheet_name: null,
    header_row: 2,
    cvht_mapping: {},
    default_cs_id: null,
    sync_interval_minutes: 10,
    enabled: true,
    last_status: null,
    last_synced_at: null,
    last_summary: null,
  },
];

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
      d="M12 4.75c1.77 0 3.35.61 3.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
    />
  </svg>
);

const synthesizeSyncHistory = (
  configs: GoogleSheetSyncConfig[]
): SyncHistoryResponse => {
  const ranConfigs = configs.filter((c) => Boolean(c.last_synced_at));
  const items: SyncHistoryItem[] = ranConfigs.map((cfg, idx) => {
    const isSuccess =
      cfg.last_status === 'SUCCESS' || cfg.last_status === 'COMPLETED';
    const isPartial = cfg.last_status === 'PARTIAL_FAILED';
    const sum = cfg.last_summary;
    return {
      id: cfg.id * 100 + idx,
      code: cfg.code,
      programType: cfg.program_type || cfg.code,
      triggerType: 'AUTO',
      mode: 'DELTA',
      status: isSuccess ? 'SUCCESS' : isPartial ? 'PARTIAL_FAILED' : 'FAILED',
      durationSec: 4 + (cfg.id % 5),
      createdAt: cfg.last_synced_at!,
      totalRows: sum?.totalRows ?? 0,
      createdCount: sum?.createdCount ?? 0,
      updatedCount: sum?.updatedCount ?? 0,
      unchangedRows: sum?.unchangedRows ?? 0,
      failedCount: sum?.failedCount ?? 0,
      error: !isSuccess
        ? cfg.last_error || 'Không thể đọc Google Sheet nguồn hoặc thiếu quyền Viewer.'
        : null,
    };
  });

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const todaySuccess = items.filter((i) => i.status === 'SUCCESS').length;
  const todayFailed = items.length - todaySuccess;
  const latestTime = items[0] ? formatDateParts(items[0].createdAt).time : null;

  return {
    stats: {
      todayTotal: items.length,
      todaySuccess,
      todayFailed,
      lastRunTime: latestTime,
    },
    items,
    total: items.length,
  };
};

export const GoogleSheetSyncPanel: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const [activeSubTab, setActiveSubTab] = useState<SyncSubTabKey>('configs');

  const [configs, setConfigs] = useState<GoogleSheetSyncConfig[]>([]);
  const [csUsers, setCsUsers] = useState<CsUserOption[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [syncingCode, setSyncingCode] = useState<string | null>(null);
  const [syncingAllMode, setSyncingAllMode] = useState<'delta' | 'full' | null>(null);

  // Split button & row action dropdowns
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const splitMenuRef = useRef<HTMLDivElement>(null);
  const [openRowMenuCode, setOpenRowMenuCode] = useState<string | null>(null);

  // Filters on configs tab
  const [searchQuery, setSearchQuery] = useState('');
  const [programFilter, setProgramFilter] = useState<'ALL' | 'JLPT' | 'KAIWA'>('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE'
  >('ALL');

  // Local editable drafts keyed by config.code
  const [drafts, setDrafts] = useState<Record<string, UpdateGoogleSheetSyncConfigDTO>>({});

  // Slide-over Drawer
  const [drawerCode, setDrawerCode] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<SyncDrawerTabKey>('config');

  // History state
  const [historyData, setHistoryData] = useState<SyncHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProgramFilter, setHistoryProgramFilter] = useState<string>('ALL');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');

  // Service Account JSON editor
  const [saJsonText, setSaJsonText] = useState('');
  const [savingSa, setSavingSa] = useState(false);
  const [editingSaJson, setEditingSaJson] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (splitMenuRef.current && !splitMenuRef.current.contains(e.target as Node)) {
        setSplitMenuOpen(false);
      }
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sync-row-menu]')) {
        setOpenRowMenuCode(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await importsApi.getSheetSyncConfigs();
      const loadedConfigs =
        data?.configs && data.configs.length > 0 ? data.configs : DEFAULT_CONFIGS;
      const loadedUsers = data?.csUsers || [];

      setConfigs(loadedConfigs);
      setCsUsers(loadedUsers);
      if (data?.serviceAccount) {
        setServiceAccount(data.serviceAccount);
      }

      const nextDrafts: Record<string, UpdateGoogleSheetSyncConfigDTO> = {};
      loadedConfigs.forEach((cfg) => {
        const initialMapping: Record<string, number> = { ...(cfg.cvht_mapping || {}) };
        const dynamicCodes = deriveCvhtCodes(loadedUsers, cfg.cvht_mapping);
        dynamicCodes.forEach((code) => {
          if (!initialMapping[code]) {
            const matchedUser = loadedUsers.find(
              (u) => u.staff_code?.trim().toUpperCase() === code
            );
            if (matchedUser) {
              initialMapping[code] = matchedUser.id;
            }
          }
        });

        nextDrafts[cfg.code] = {
          spreadsheet_url: cfg.spreadsheet_url || '',
          local_file_path: cfg.local_file_path || '',
          sheet_name: cfg.sheet_name,
          setting_sheet_name: cfg.setting_sheet_name || '',
          cvht_mapping: initialMapping,
          default_cs_id: cfg.default_cs_id ?? null,
          sync_interval_minutes: cfg.sync_interval_minutes || 10,
          enabled: cfg.enabled,
        };
      });
      setDrafts(nextDrafts);
    } catch (err: any) {
      setConfigs(DEFAULT_CONFIGS);
      const fallbackDrafts: Record<string, UpdateGoogleSheetSyncConfigDTO> = {};
      DEFAULT_CONFIGS.forEach((cfg) => {
        fallbackDrafts[cfg.code] = {
          spreadsheet_url: cfg.spreadsheet_url || '',
          local_file_path: cfg.local_file_path || '',
          sheet_name: cfg.sheet_name,
          setting_sheet_name: cfg.setting_sheet_name || '',
          cvht_mapping: cfg.cvht_mapping || {},
          default_cs_id: cfg.default_cs_id ?? null,
          sync_interval_minutes: cfg.sync_interval_minutes || 10,
          enabled: cfg.enabled,
        };
      });
      setDrafts(fallbackDrafts);
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải cấu hình đồng bộ Google Sheet'
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await importsApi.getSheetSyncHistory({
        programType:
          historyProgramFilter === 'ALL' ? undefined : historyProgramFilter,
        status: historyStatusFilter === 'ALL' ? undefined : historyStatusFilter,
        fromDate: historyFromDate || undefined,
        toDate: historyToDate || undefined,
      });
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        setHistoryData(res);
      } else {
        setHistoryData(synthesizeSyncHistory(configs));
      }
    } catch {
      setHistoryData(synthesizeSyncHistory(configs));
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
    fetchConfigs();
  }, [fetchConfigs]);

  useEffect(() => {
    if (activeSubTab === 'history' || drawerTab === 'history') {
      fetchHistory();
    }
  }, [activeSubTab, drawerTab, fetchHistory]);

  const updateDraft = (code: string, patch: Partial<UpdateGoogleSheetSyncConfigDTO>) => {
    setDrafts((prev) => ({
      ...prev,
      [code]: {
        ...(prev[code] || {}),
        ...patch,
      },
    }));
  };

  const updateCvhtMapping = (code: string, cvhtCode: string, userIdStr: string) => {
    setDrafts((prev) => {
      const current = prev[code]?.cvht_mapping || {};
      const nextMapping = { ...current };
      if (!userIdStr) {
        delete nextMapping[cvhtCode];
      } else {
        nextMapping[cvhtCode] = Number(userIdStr);
      }
      return {
        ...prev,
        [code]: {
          ...(prev[code] || {}),
          cvht_mapping: nextMapping,
        },
      };
    });
  };

  const buildPayload = (
    draft: UpdateGoogleSheetSyncConfigDTO
  ): UpdateGoogleSheetSyncConfigDTO => ({
    spreadsheet_url: draft.spreadsheet_url?.trim() || null,
    local_file_path: draft.local_file_path?.trim() || null,
    sheet_name: draft.sheet_name?.trim() || undefined,
    setting_sheet_name: draft.setting_sheet_name?.trim() || null,
    cvht_mapping: draft.cvht_mapping || {},
    default_cs_id: draft.default_cs_id ? Number(draft.default_cs_id) : null,
    sync_interval_minutes: Number(draft.sync_interval_minutes) || 10,
    enabled: Boolean(draft.enabled),
  });

  const handleToggleEnabledInline = async (cfg: GoogleSheetSyncConfig) => {
    const code = cfg.code;
    const currentDraft = drafts[code];
    if (!currentDraft) return;
    const nextEnabled = !currentDraft.enabled;
    const nextDraft = { ...currentDraft, enabled: nextEnabled };
    updateDraft(code, { enabled: nextEnabled });

    try {
      setTogglingCode(code);
      await importsApi.updateSheetSyncConfig(code, buildPayload(nextDraft));
      setConfigs((prev) =>
        prev.map((c) => (c.code === code ? { ...c, enabled: nextEnabled } : c))
      );
      toast.success(
        `${nextEnabled ? 'Đã bật' : 'Đã tắt'} tự động đồng bộ cho nguồn ${code}`
      );
    } catch (err: any) {
      updateDraft(code, { enabled: !nextEnabled });
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể cập nhật trạng thái nguồn ${code}`
      );
    } finally {
      setTogglingCode(null);
    }
  };

  const handleSaveConfig = async (code: string, closeDrawerAfter = true) => {
    const draft = drafts[code];
    if (!draft) return;
    try {
      setSavingCode(code);
      await importsApi.updateSheetSyncConfig(code, buildPayload(draft));
      toast.success(`Đã lưu cấu hình đồng bộ cho nguồn ${code}!`);
      await fetchConfigs();
      if (closeDrawerAfter) {
        setDrawerCode(null);
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể lưu cấu hình nguồn ${code}`
      );
    } finally {
      setSavingCode(null);
    }
  };

  const handleRunSync = async (code: string, forceFullSync = false) => {
    try {
      setSyncingCode(`${code}_${forceFullSync ? 'full' : 'diff'}`);
      const draft = drafts[code];
      if (draft) {
        await importsApi.updateSheetSyncConfig(code, buildPayload(draft));
      }

      const res = await importsApi.runSheetSync(code, { forceFullSync });
      const summary = res?.summary || res;
      const created = summary?.createdCount ?? 0;
      const updated = summary?.updatedCount ?? 0;
      const unchanged = summary?.unchangedRows ?? 0;
      toast.success(
        `Đồng bộ ${code} hoàn tất: Tạo mới ${created}, Cập nhật ${updated}, Giữ nguyên ${unchanged} dòng.`
      );
      await fetchConfigs();
      if (activeSubTab === 'history') {
        await fetchHistory();
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Đồng bộ nguồn ${code} thất bại`
      );
    } finally {
      setSyncingCode(null);
    }
  };

  const handleSyncAll = async (forceFullSync = false) => {
    setSplitMenuOpen(false);
    try {
      setSyncingAllMode(forceFullSync ? 'full' : 'delta');
      const res = await importsApi.runSheetSyncAll({ forceFullSync });
      const count = res?.results?.length || configs.length;
      toast.success(
        forceFullSync
          ? `Đã quét và làm mới toàn bộ (Full Sync) cho ${count} nguồn!`
          : `Đã đồng bộ dữ liệu thay đổi (Delta Sync) cho ${count} nguồn!`
      );
      await fetchConfigs();
      if (activeSubTab === 'history') {
        await fetchHistory();
      }
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Đồng bộ toàn bộ thất bại'
      );
    } finally {
      setSyncingAllMode(null);
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

  const summaryCounts = useMemo(() => {
    const total = configs.length;
    const enabledCount = configs.filter((c) => c.enabled).length;
    const failedCount = configs.filter(
      (c) => c.last_status === 'FAILED' || c.last_status === 'PARTIAL_FAILED'
    ).length;
    return { total, enabledCount, failedCount };
  }, [configs]);

  const filteredConfigs = useMemo(() => {
    return configs.filter((cfg) => {
      const pType = (cfg.program_type || cfg.code).toUpperCase();
      if (programFilter !== 'ALL' && pType !== programFilter) return false;

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
        const code = cfg.code.toLowerCase();
        const name = (cfg.name || '').toLowerCase();
        const sheet = (cfg.sheet_name || '').toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !sheet.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [configs, programFilter, statusFilter, searchQuery]);

  const openDrawer = (code: string, tab: SyncDrawerTabKey = 'config') => {
    setOpenRowMenuCode(null);
    setDrawerCode(code);
    setDrawerTab(tab);
  };

  const activeDrawerConfig = useMemo(
    () => configs.find((c) => c.code === drawerCode) || null,
    [configs, drawerCode]
  );

  const effectiveHistory = useMemo(() => {
    const base = historyData || synthesizeSyncHistory(configs);
    const filteredItems = base.items.filter((item) => {
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
      ...base,
      items: filteredItems,
    };
  }, [historyData, configs, historyProgramFilter, historyStatusFilter]);

  const handleExportSyncHistoryCsv = () => {
    const headers = [
      'Thời gian',
      'Chương trình',
      'Kích hoạt',
      'Chế độ',
      'Tổng dòng',
      'Tạo mới',
      'Cập nhật',
      'Kết quả',
      'Thời lượng',
      'Chi tiết lỗi',
    ];
    const csvContent = [
      headers.join(','),
      ...effectiveHistory.items.map((item) =>
        [
          `"${formatDateTimeFull(item.createdAt)}"`,
          item.programType,
          `"${item.triggerType === 'AUTO' ? 'Tự động' : 'Thủ công'}"`,
          `"${item.mode === 'DELTA' ? 'Chỉ thay đổi' : 'Làm mới toàn bộ'}"`,
          item.totalRows,
          item.createdCount,
          item.updatedCount,
          `"${item.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}"`,
          `"${item.durationSec} giây"`,
          `"${(item.error || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lich_su_dong_bo_hoc_vien.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất file CSV lịch sử đồng bộ!');
  };

  if (loading && configs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 flex items-center justify-center text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-blue-600" />
        <span className="text-xs font-semibold">
          Đang tải cấu hình Đồng bộ dữ liệu học viên...
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
            <span className="text-slate-700 font-semibold">
              Đồng bộ dữ liệu học viên
            </span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Đồng bộ dữ liệu học viên
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Quản lý đồng bộ danh sách học viên từ Google Sheet về hệ thống theo mã CVHT
          </p>
        </div>

        {/* Right: Pill Google + Split Button Đồng bộ tất cả */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Pill trạng thái Google */}
          <button
            type="button"
            onClick={() => {
              if (serviceAccount?.clientEmail) {
                handleCopyEmail(serviceAccount.clientEmail);
              } else {
                setActiveSubTab('mapping');
              }
            }}
            title={
              serviceAccount?.clientEmail
                ? 'Bấm để sao chép email Service Account'
                : 'Bấm để mở tab Ánh xạ CVHT & Kết nối'
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

          {/* 2. Split Button Đồng bộ tất cả */}
          <div className="relative inline-flex" ref={splitMenuRef}>
            <button
              type="button"
              disabled={syncingAllMode !== null}
              onClick={() => handleSyncAll(false)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-l-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  syncingAllMode !== null ? 'animate-spin' : ''
                }`}
              />
              <span>Đồng bộ tất cả</span>
            </button>
            <button
              type="button"
              onClick={() => setSplitMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-r-xl px-2.5 py-2 border-l border-blue-400/50 transition-colors cursor-pointer"
              aria-label="Tùy chọn đồng bộ"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {splitMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => handleSyncAll(false)}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Đồng bộ chỉ thay đổi (Delta Sync)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSyncAll(true)}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Làm mới toàn bộ (Full Sync)</span>
                </button>
              </div>
            )}
          </div>
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
          <span>Cấu hình đồng bộ</span>
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
          <span>Lịch sử đồng bộ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('mapping')}
          className={`pb-3 text-xs sm:text-sm inline-flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeSubTab === 'mapping'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900 font-medium'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Ánh xạ CVHT &amp; Kết nối</span>
        </button>
      </div>

      {/* C. SUB-TAB 1: CẤU HÌNH ĐỒNG BỘ */}
      {activeSubTab === 'configs' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-600 font-medium flex flex-wrap items-center gap-1.5">
              <span>
                <strong className="text-slate-900 font-semibold">
                  {summaryCounts.total}
                </strong>{' '}
                nguồn đồng bộ
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
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm chương trình, tên sheet..."
                  className="w-60 h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <select
                value={programFilter}
                onChange={(e) =>
                  setProgramFilter(e.target.value as 'ALL' | 'JLPT' | 'KAIWA')
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả chương trình</option>
                <option value="JLPT">JLPT</option>
                <option value="KAIWA">KAIWA</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as 'ALL' | 'SUCCESS' | 'FAILED' | 'IDLE'
                  )
                }
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="SUCCESS">Thành công</option>
                <option value="FAILED">Thất bại</option>
                <option value="IDLE">Chưa chạy</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-3">Chương trình</th>
                    <th className="py-3 px-3">Nguồn dữ liệu</th>
                    <th className="py-3 px-3">Sheet đọc dữ liệu</th>
                    <th className="py-3 px-3">Chu kỳ tự động</th>
                    <th className="py-3 px-3">Phân bổ CVHT</th>
                    <th className="py-3 px-3">Lần chạy gần nhất</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 pl-3 pr-4 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Không có nguồn đồng bộ nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredConfigs.map((cfg) => {
                      const isJlpt =
                        cfg.code === 'JLPT' || cfg.program_type === 'JLPT';
                      const draft = drafts[cfg.code] || {
                        spreadsheet_url: cfg.spreadsheet_url || '',
                        sheet_name: cfg.sheet_name,
                        setting_sheet_name: cfg.setting_sheet_name || '',
                        cvht_mapping: cfg.cvht_mapping || {},
                        default_cs_id: cfg.default_cs_id ?? null,
                        sync_interval_minutes: cfg.sync_interval_minutes || 10,
                        enabled: cfg.enabled,
                      };
                      const sheetUrl = (
                        draft.spreadsheet_url ||
                        cfg.spreadsheet_url ||
                        ''
                      ).trim();
                      const hasGoogleSheet = Boolean(sheetUrl);
                      const { date: runDate, time: runTime } = formatDateParts(
                        cfg.last_synced_at
                      );

                      const isSuccess =
                        cfg.last_status === 'SUCCESS' ||
                        cfg.last_status === 'COMPLETED';
                      const isFailed =
                        cfg.last_status === 'FAILED' ||
                        cfg.last_status === 'PARTIAL_FAILED';
                      const isSyncingThis =
                        syncingCode === `${cfg.code}_diff` ||
                        syncingCode === `${cfg.code}_full`;

                      const byCvht = cfg.last_summary?.byCvht || {};
                      const cvhtEntries = Object.entries(byCvht);

                      return (
                        <tr
                          key={cfg.code}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          {/* 1. Chương trình */}
                          <td className="py-3.5 pl-4 pr-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  isJlpt
                                    ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                    : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                                }
                              >
                                {cfg.code}
                              </span>
                              <span className="font-bold text-slate-900">
                                {isJlpt ? 'Khóa Luyện thi JLPT' : 'Khóa Giao tiếp Kaiwa'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Tổng: {cfg.last_summary?.totalRows ?? 0} dòng (Mới:{' '}
                              +{cfg.last_summary?.createdCount ?? 0} · Sửa:{' '}
                              {cfg.last_summary?.updatedCount ?? 0})
                            </div>
                          </td>

                          {/* 2. Nguồn dữ liệu */}
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
                              <div className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                                <span className="w-4 h-4 rounded bg-emerald-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">
                                  X
                                </span>
                                <span>File local (.xlsx)</span>
                              </div>
                            )}
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                              {hasGoogleSheet
                                ? sheetUrl
                                : cfg.local_file_path ||
                                  (isJlpt
                                    ? 'docs/data/hoc_vien/hoc_vien_jlpt.xlsx'
                                    : 'docs/data/hoc_vien/hoc_vien_kaiwa.xlsx')}
                            </div>
                          </td>

                          {/* 3. Sheet đọc dữ liệu */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="font-semibold text-slate-800">
                              {isJlpt
                                ? `${draft.sheet_name || 'Data JLPT_Inhouse'} · ${
                                    draft.setting_sheet_name || 'Setting'
                                  }`
                                : draft.sheet_name || 'Tổng'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Tiêu đề dòng {cfg.header_row || 2}
                            </div>
                          </td>

                          {/* 4. Chu kỳ tự động */}
                          <td className="py-3.5 px-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <span className="text-slate-700 font-medium">
                                Mỗi {draft.sync_interval_minutes || 10} phút
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Boolean(draft.enabled)}
                                disabled={togglingCode === cfg.code}
                                onClick={() => handleToggleEnabledInline(cfg)}
                                className={`relative inline-flex w-9 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                  draft.enabled ? 'bg-blue-600' : 'bg-slate-200'
                                } ${togglingCode === cfg.code ? 'opacity-60' : ''}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out ${
                                    draft.enabled ? 'translate-x-4' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </td>

                          {/* 5. Phân bổ CVHT */}
                          <td className="py-3.5 px-3 align-middle">
                            {cvhtEntries.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1 max-w-[240px]">
                                {cvhtEntries.slice(0, 4).map(([cvhtKey, count]) => (
                                  <span
                                    key={cvhtKey}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]"
                                  >
                                    <span className="text-blue-600 font-mono">
                                      {cvhtKey}:
                                    </span>
                                    <span>{count} HV</span>
                                  </span>
                                ))}
                                {cvhtEntries.length > 4 && (
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    +{cvhtEntries.length - 4}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                Chưa có thống kê
                              </span>
                            )}
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
                                  disabled={isSyncingThis}
                                  onClick={() => handleRunSync(cfg.code, false)}
                                  className="border border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-100 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  <RotateCcw
                                    className={`w-3 h-3 ${
                                      isSyncingThis ? 'animate-spin' : ''
                                    }`}
                                  />
                                  <span>Chạy lại</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isSyncingThis}
                                  onClick={() => handleRunSync(cfg.code, false)}
                                  className="border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 rounded-lg px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                                >
                                  {isSyncingThis ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3 fill-current" />
                                  )}
                                  <span>Đồng bộ</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openDrawer(cfg.code, 'config')}
                                title="Chỉnh sửa cấu hình"
                                className="border border-slate-200 rounded-lg p-1.5 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              <div className="relative" data-sync-row-menu>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenRowMenuCode((prev) =>
                                      prev === cfg.code ? null : cfg.code
                                    )
                                  }
                                  title="Thêm thao tác"
                                  className="border border-slate-200 rounded-lg p-1.5 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>

                                {openRowMenuCode === cfg.code && (
                                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg py-1.5 z-30 text-left text-xs">
                                    <button
                                      type="button"
                                      onClick={() => openDrawer(cfg.code, 'overview')}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <Info className="w-3.5 h-3.5 text-blue-600" />
                                      <span>Xem tổng quan &amp; phân bổ</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenRowMenuCode(null);
                                        handleRunSync(cfg.code, true);
                                      }}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                      <span>Làm mới toàn bộ (Full Sync)</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openDrawer(cfg.code, 'history')}
                                      className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2 font-medium cursor-pointer"
                                    >
                                      <History className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Xem lịch sử đồng bộ</span>
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

            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
              <span>
                Hiển thị <strong className="text-slate-700">1–{filteredConfigs.length}</strong> /{' '}
                <strong className="text-slate-700">{configs.length}</strong> nguồn đồng
                bộ
              </span>
            </div>
          </div>

          {/* Warning Banner */}
          {summaryCounts.failedCount > 0 && (
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-amber-900 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{summaryCounts.failedCount} nguồn đồng bộ</strong> gặp lỗi kết
                  nối hoặc đọc dữ liệu. Vui lòng kiểm tra quyền truy cập Google Sheet.
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

      {/* D. SUB-TAB 2: LỊCH SỬ ĐỒNG BỘ */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
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
              onClick={handleExportSyncHistoryCsv}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Xuất lịch sử</span>
            </button>
          </div>

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

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 pl-4 pr-3">Thời gian</th>
                    <th className="py-3 px-3">Chương trình</th>
                    <th className="py-3 px-3">Kích hoạt</th>
                    <th className="py-3 px-3">Chế độ</th>
                    <th className="py-3 px-3">Tổng dòng</th>
                    <th className="py-3 px-3">Tạo mới</th>
                    <th className="py-3 px-3">Cập nhật</th>
                    <th className="py-3 px-3">Kết quả</th>
                    <th className="py-3 px-3">Thời lượng</th>
                    <th className="py-3 pl-3 pr-4 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {effectiveHistory.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        Chưa có lịch sử đồng bộ dữ liệu học viên nào.
                      </td>
                    </tr>
                  ) : (
                    effectiveHistory.items.map((item) => {
                      const isJlpt = item.programType.toUpperCase() === 'JLPT';
                      const isFailed = item.status !== 'SUCCESS';

                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3.5 pl-4 pr-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                              {formatDateTimeFull(item.createdAt)}
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
                            <td className="py-3.5 px-3 align-middle text-slate-600">
                              {item.mode === 'DELTA'
                                ? 'Chỉ thay đổi'
                                : 'Làm mới toàn bộ'}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-slate-800">
                              {item.totalRows}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-emerald-600">
                              +{item.createdCount}
                            </td>
                            <td className="py-3.5 px-3 align-middle font-semibold text-blue-600">
                              {item.updatedCount}
                            </td>
                            <td className="py-3.5 px-3 align-middle">
                              {isFailed ? (
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
                            <td className="py-3.5 px-3 align-middle text-slate-600">
                              {item.durationSec} giây
                            </td>
                            <td className="py-3.5 pl-3 pr-4 align-middle text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  openDrawer(
                                    item.code || item.programType,
                                    isFailed ? 'config' : 'overview'
                                  )
                                }
                                className={`font-semibold hover:underline cursor-pointer ${
                                  isFailed ? 'text-rose-600' : 'text-blue-600'
                                }`}
                              >
                                {isFailed ? 'Xem lỗi' : 'Xem chi tiết'}
                              </button>
                            </td>
                          </tr>

                          {isFailed && (
                            <tr className="bg-white">
                              <td colSpan={10} className="pl-8 pr-4 pb-3 pt-0.5">
                                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 text-xs text-rose-800 font-medium">
                                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                                    <span>
                                      {item.error ||
                                        'Không có quyền đọc Google Sheet nguồn.'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openDrawer(
                                          item.code || item.programType,
                                          'config'
                                        )
                                      }
                                      className="bg-white border border-rose-200 hover:bg-rose-100/50 text-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                      <Settings className="w-3.5 h-3.5 text-slate-500" />
                                      <span>Xem cấu hình</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRunSync(
                                          item.code || item.programType,
                                          false
                                        )
                                      }
                                      className="bg-white border border-blue-200 hover:bg-blue-50 text-blue-600 rounded-lg px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Chạy lại</span>
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
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

      {/* E. SUB-TAB 3: ÁNH XẠ CVHT & KẾT NỐI */}
      {activeSubTab === 'mapping' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Card 1: Ánh xạ CVHT cho từng chương trình */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>Ánh xạ Mã CVHT trong Sheet ➔ Tài khoản CSKH</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Phân bổ tự động học viên về đúng nhân viên CSKH dựa trên cột CVHT trong
                Google Sheet
              </p>
            </div>

            {configs.map((cfg) => {
              const isJlpt = cfg.code === 'JLPT' || cfg.program_type === 'JLPT';
              const draft = drafts[cfg.code] || {};
              const cvhtCodes = deriveCvhtCodes(
                csUsers,
                cfg.cvht_mapping,
                draft.cvht_mapping
              );

              return (
                <div
                  key={cfg.code}
                  className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          isJlpt
                            ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                            : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                        }
                      >
                        {cfg.code}
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        {isJlpt ? 'Khóa Luyện thi JLPT' : 'Khóa Giao tiếp Kaiwa'}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={savingCode === cfg.code}
                      onClick={() => handleSaveConfig(cfg.code, false)}
                      leftIcon={<Save className="w-3.5 h-3.5 text-slate-600" />}
                    >
                      Lưu ánh xạ {cfg.code}
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {cvhtCodes.map((cvhtCode) => {
                      const selectedId = draft.cvht_mapping?.[cvhtCode] || '';
                      return (
                        <div
                          key={cvhtCode}
                          className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200/90"
                        >
                          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[11px] shrink-0">
                            {cvhtCode}
                          </span>
                          <select
                            value={selectedId}
                            onChange={(e) =>
                              updateCvhtMapping(cfg.code, cvhtCode, e.target.value)
                            }
                            className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                          >
                            <option value="">-- Tự động theo mã {cvhtCode} --</option>
                            {csUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name || u.email}{' '}
                                {u.staff_code ? `(${u.staff_code})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}

                    <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-dashed border-slate-300">
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold text-[11px] shrink-0">
                        Mặc định (Trống)
                      </span>
                      <select
                        value={draft.default_cs_id || ''}
                        onChange={(e) =>
                          updateDraft(cfg.code, {
                            default_cs_id: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                      >
                        <option value="">-- Chọn CSKH mặc định --</option>
                        {csUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email}{' '}
                            {u.staff_code ? `(${u.staff_code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card 2: Google Service Account */}
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
                    Tài khoản kỹ thuật dùng để đọc dữ liệu học viên từ Google Sheet nguồn
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
                <span>Hướng dẫn cấp quyền Xem (Viewer) trên Google Sheet nguồn</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Mở file Google Sheet tổng của khóa JLPT / Kaiwa → Bấm nút{' '}
                <strong>Share (Chia sẻ)</strong> → Dán địa chỉ{' '}
                <strong>Client Email</strong> ở trên vào và cấp quyền{' '}
                <strong>Viewer (Người xem)</strong> để hệ thống tự động đồng bộ định kỳ.
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
        </div>
      )}

      {/* F. SLIDE-OVER DRAWER BÊN PHẢI */}
      {activeDrawerConfig &&
        (() => {
          const cfg = activeDrawerConfig;
          const isJlpt = cfg.code === 'JLPT' || cfg.program_type === 'JLPT';
          const draft = drafts[cfg.code] || {
            spreadsheet_url: cfg.spreadsheet_url || '',
            sheet_name: cfg.sheet_name,
            setting_sheet_name: cfg.setting_sheet_name || '',
            cvht_mapping: cfg.cvht_mapping || {},
            default_cs_id: cfg.default_cs_id ?? null,
            sync_interval_minutes: cfg.sync_interval_minutes || 10,
            enabled: cfg.enabled,
          };
          const summary = cfg.last_summary;
          const byCvht = summary?.byCvht || {};
          const cvhtCodes = deriveCvhtCodes(
            csUsers,
            cfg.cvht_mapping,
            draft.cvht_mapping
          );
          const configHistoryItems = effectiveHistory.items.filter(
            (i) =>
              i.code === cfg.code ||
              i.programType.toUpperCase() === cfg.code.toUpperCase()
          );

          return (
            <div className="fixed inset-0 z-50 bg-slate-900/25 backdrop-blur-[1px] flex justify-end">
              <div
                className="flex-1"
                onClick={() => setDrawerCode(null)}
                aria-hidden="true"
              />
              <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
                {/* Drawer Header */}
                <div>
                  <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Cấu hình đồng bộ
                      </h2>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
                        <span className="font-bold text-slate-800">
                          {isJlpt ? 'Khóa Luyện thi JLPT' : 'Khóa Giao tiếp Kaiwa'}
                        </span>
                        <span>·</span>
                        <span
                          className={
                            isJlpt
                              ? 'bg-violet-100 text-violet-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                              : 'bg-teal-100 text-teal-700 font-bold px-2.5 py-0.5 rounded-md text-[11px]'
                          }
                        >
                          {cfg.code}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerCode(null)}
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
                  {drawerTab === 'config' && (
                    <>
                      {/* 1. Nguồn dữ liệu Google Sheet */}
                      <div className="space-y-3.5">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Nguồn dữ liệu Google Sheet
                        </h3>

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Link Google Sheet
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Input
                                value={draft.spreadsheet_url || ''}
                                onChange={(e) =>
                                  updateDraft(cfg.code, {
                                    spreadsheet_url: e.target.value,
                                  })
                                }
                                placeholder="https://docs.google.com/spreadsheets/d/..."
                              />
                            </div>
                            <button
                              type="button"
                              disabled={!draft.spreadsheet_url?.trim()}
                              onClick={() => {
                                const url = draft.spreadsheet_url?.trim();
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                              <span>Mở Sheet</span>
                            </button>
                          </div>
                          <span className="block text-[11px] text-slate-400 mt-1">
                            Để trống hệ thống sẽ đọc từ file mẫu local:{' '}
                            <code className="font-mono text-slate-600">
                              {cfg.local_file_path}
                            </code>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">
                              Tên Sheet chính
                            </label>
                            <Input
                              value={draft.sheet_name || ''}
                              onChange={(e) =>
                                updateDraft(cfg.code, { sheet_name: e.target.value })
                              }
                              placeholder={isJlpt ? 'Data JLPT_Inhouse' : 'Tổng'}
                            />
                          </div>

                          {isJlpt ? (
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Sheet Setting (Số buổi)
                              </label>
                              <Input
                                value={draft.setting_sheet_name || ''}
                                onChange={(e) =>
                                  updateDraft(cfg.code, {
                                    setting_sheet_name: e.target.value,
                                  })
                                }
                                placeholder="Setting"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Dòng tiêu đề (Header)
                              </label>
                              <Input
                                type="number"
                                disabled
                                value={cfg.header_row || 2}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* 2. Lịch đồng bộ tự động */}
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                              Chu kỳ tự động
                            </h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Tự động kiểm tra và đồng bộ dữ liệu học viên mới
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(draft.enabled)}
                            onClick={() =>
                              updateDraft(cfg.code, { enabled: !draft.enabled })
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

                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Tần suất kiểm tra
                          </label>
                          <select
                            value={draft.sync_interval_minutes || 10}
                            onChange={(e) =>
                              updateDraft(cfg.code, {
                                sync_interval_minutes: Number(e.target.value),
                              })
                            }
                            className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value={5}>Mỗi 5 phút</option>
                            <option value={10}>Mỗi 10 phút</option>
                            <option value={15}>Mỗi 15 phút</option>
                            <option value={30}>Mỗi 30 phút</option>
                            <option value={60}>Mỗi 60 phút</option>
                          </select>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* 3. Ánh xạ CVHT */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Ánh xạ Mã CVHT ➔ Tài khoản CSKH
                        </h3>

                        <div className="space-y-2">
                          {cvhtCodes.map((cvhtCode) => {
                            const selectedId = draft.cvht_mapping?.[cvhtCode] || '';
                            return (
                              <div
                                key={cvhtCode}
                                className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200"
                              >
                                <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[11px] shrink-0">
                                  {cvhtCode}
                                </span>
                                <select
                                  value={selectedId}
                                  onChange={(e) =>
                                    updateCvhtMapping(
                                      cfg.code,
                                      cvhtCode,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                                >
                                  <option value="">
                                    -- Tự động theo mã {cvhtCode} --
                                  </option>
                                  {csUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name || u.email}{' '}
                                      {u.staff_code ? `(${u.staff_code})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}

                          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-dashed border-slate-300">
                            <span className="px-2 py-1 rounded bg-white text-slate-700 font-semibold text-[11px] shrink-0 border border-slate-200">
                              Mặc định (Trống)
                            </span>
                            <select
                              value={draft.default_cs_id || ''}
                              onChange={(e) =>
                                updateDraft(cfg.code, {
                                  default_cs_id: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              className="flex-1 h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-800 focus:outline-none"
                            >
                              <option value="">-- Chọn CSKH mặc định --</option>
                              {csUsers.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name || u.email}{' '}
                                  {u.staff_code ? `(${u.staff_code})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {drawerTab === 'overview' && (
                    <div className="space-y-4">
                      {cfg.last_error && (
                        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-rose-800 text-xs">
                          <strong>Lỗi lần chạy gần nhất:</strong> {cfg.last_error}
                        </div>
                      )}

                      <div className="grid grid-cols-5 gap-2 text-center">
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5">
                          <span className="block text-[10px] text-slate-500">
                            Tổng dòng
                          </span>
                          <strong className="text-sm font-bold text-slate-900">
                            {summary?.totalRows ?? 0}
                          </strong>
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5">
                          <span className="block text-[10px] text-slate-500">
                            Không đổi
                          </span>
                          <strong className="text-sm font-bold text-slate-700">
                            {summary?.unchangedRows ?? 0}
                          </strong>
                        </div>
                        <div className="bg-emerald-50/70 rounded-xl border border-emerald-200 p-2.5">
                          <span className="block text-[10px] text-emerald-700">
                            Tạo mới
                          </span>
                          <strong className="text-sm font-bold text-emerald-700">
                            +{summary?.createdCount ?? 0}
                          </strong>
                        </div>
                        <div className="bg-blue-50/70 rounded-xl border border-blue-200 p-2.5">
                          <span className="block text-[10px] text-blue-700">
                            Cập nhật
                          </span>
                          <strong className="text-sm font-bold text-blue-700">
                            {summary?.updatedCount ?? 0}
                          </strong>
                        </div>
                        <div className="bg-rose-50/70 rounded-xl border border-rose-200 p-2.5">
                          <span className="block text-[10px] text-rose-700">Lỗi</span>
                          <strong className="text-sm font-bold text-rose-700">
                            {summary?.failedCount ?? 0}
                          </strong>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                        <div className="font-bold text-slate-900">
                          Phân bổ học viên theo mã CVHT
                        </div>
                        {Object.keys(byCvht).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(byCvht).map(([key, count]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-xs"
                              >
                                <span className="text-blue-600 font-mono">{key}:</span>
                                <span className="text-slate-800">{count} HV</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-slate-400 italic">
                            Chưa có dữ liệu phân bổ CVHT.
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRunSync(cfg.code, true)}
                          isLoading={syncingCode === `${cfg.code}_full`}
                          leftIcon={<RotateCcw className="w-3.5 h-3.5 text-amber-600" />}
                        >
                          Làm mới toàn bộ
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleRunSync(cfg.code, false)}
                          isLoading={syncingCode === `${cfg.code}_diff`}
                          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        >
                          Đồng bộ thay đổi
                        </Button>
                      </div>
                    </div>
                  )}

                  {drawerTab === 'history' && (
                    <div className="space-y-3">
                      {configHistoryItems.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                          Chưa có lịch sử đồng bộ cho nguồn {cfg.code}.
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
                              <span>Tổng: {item.totalRows} dòng</span>
                              <span>·</span>
                              <span>Tạo mới: +{item.createdCount}</span>
                              <span>·</span>
                              <span>Cập nhật: {item.updatedCount}</span>
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
                    onClick={() => setDrawerCode(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={savingCode === cfg.code}
                    onClick={() => handleSaveConfig(cfg.code, true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    {savingCode === cfg.code && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>Lưu cấu hình</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
