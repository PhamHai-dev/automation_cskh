import React, { useEffect, useMemo, useState } from 'react';
import { importsApi } from '../api/imports.api';
import {
  CsSheetBackupConfigItem,
  CsSheetBackupSummary,
  UpdateCsSheetBackupConfigDTO,
  ServiceAccountInfo,
  SheetBackupSheetStats,
} from '../types/imports.types';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Save,
  ShieldCheck,
  FileSpreadsheet,
  Users,
  Link2,
  Layers,
  RotateCcw,
  KeyRound,
  Copy,
  Download,
  Lock,
  EyeOff,
  CalendarClock,
  Filter,
} from 'lucide-react';

const SCHEDULE_PRESETS = [
  { label: '2 lần/ngày (12:00 trưa & 21:00 tối)', value: '12:00,21:00', times: ['12:00', '21:00'] },
  { label: '1 lần/ngày (21:00 tối)', value: '21:00', times: ['21:00'] },
  { label: '1 lần/ngày (12:00 trưa)', value: '12:00', times: ['12:00'] },
  { label: 'Tùy chỉnh khung giờ (HH:mm)', value: 'CUSTOM', times: [] },
];

const EMPTY_STATS: SheetBackupSheetStats = {
  totalEnrollments: 0,
  unchangedRows: 0,
  updatedRows: 0,
  appendedRows: 0,
  updatedCellsCount: 0,
};

type ProgramFilter = 'ALL' | 'KAIWA' | 'JLPT';

const PROGRAM_META: Record<
  'KAIWA' | 'JLPT',
  {
    label: string;
    badgeClass: string;
    profileSheet: string;
    profileHeaderRow: number;
    attendanceSheet: string;
    attendanceHeaderRow: number;
    fileSlug: string;
    profileCaption: string;
    attendanceCaption: string;
  }
> = {
  KAIWA: {
    label: 'KAIWA • Sheet 1.Chăm sóc & 3.Chấm buổi',
    badgeClass: 'bg-teal-600 text-white border-teal-700',
    profileSheet: '1.Chăm sóc',
    profileHeaderRow: 3,
    attendanceSheet: '3.Chấm buổi',
    attendanceHeaderRow: 2,
    fileSlug: 'kaiwa',
    profileCaption: 'Hồ sơ & Chăm sóc học viên',
    attendanceCaption: 'Điểm danh theo năm học',
  },
  JLPT: {
    label: 'JLPT • Sheet Data JLPT_Inhouse & Chấm buổi',
    badgeClass: 'bg-indigo-600 text-white border-indigo-700',
    profileSheet: 'Data JLPT_Inhouse',
    profileHeaderRow: 2,
    attendanceSheet: 'Chấm buổi',
    attendanceHeaderRow: 2,
    fileSlug: 'jlpt',
    profileCaption: 'Dữ liệu lớp JLPT nội bộ',
    attendanceCaption: 'Điểm danh theo năm học',
  },
};

const getProgramKey = (programType?: string): 'KAIWA' | 'JLPT' =>
  String(programType || '').toUpperCase() === 'JLPT' ? 'JLPT' : 'KAIWA';

/**
 * Trả về thống kê delta của 1 sheet, tương thích cả summary 2 sheet (profile/attendance),
 * alias cũ (sheet1/sheet3) lẫn summary phẳng đời cũ (totalStudents / unchangedRows / ...).
 */
const resolveSheetStats = (
  summary: CsSheetBackupSummary | null | undefined,
  sheetKey: 'profile' | 'attendance',
  legacyAliasKey: 'sheet1' | 'sheet3'
): SheetBackupSheetStats => {
  if (!summary) return EMPTY_STATS;

  const direct = summary[sheetKey] || summary[legacyAliasKey];
  if (direct) return direct;

  // Fallback: summary phẳng đời cũ (chưa tách số liệu theo từng sheet)
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

export const CsSheetBackupPanel: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')
  );

  const [configs, setConfigs] = useState<CsSheetBackupConfigItem[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfigId, setSavingConfigId] = useState<number | null>(null);
  const [runningConfigId, setRunningConfigId] = useState<string | null>(null);
  const [downloadingConfigId, setDownloadingConfigId] = useState<number | null>(null);
  const [runningAllMode, setRunningAllMode] = useState<'delta' | 'full' | null>(null);

  // Quick filters
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('ALL');
  const [csFilterUserId, setCsFilterUserId] = useState<number | 'ALL'>('ALL');

  // Editable drafts keyed by config id (cfg.id)
  const [drafts, setDrafts] = useState<Record<number, UpdateCsSheetBackupConfigDTO>>({});
  const [customTimeStrings, setCustomTimeStrings] = useState<Record<number, string>>({});

  const fetchBackupConfigs = async () => {
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
      const nextTimeStrs: Record<number, string> = {};

      loadedConfigs.forEach((cfg) => {
        const meta = PROGRAM_META[getProgramKey(cfg.program_type)];
        const times =
          cfg.schedule_times && cfg.schedule_times.length > 0
            ? cfg.schedule_times
            : ['12:00', '21:00'];
        nextDrafts[cfg.id] = {
          target_spreadsheet_url: cfg.target_spreadsheet_url || '',
          profile_sheet_name: cfg.profile_sheet_name || meta.profileSheet,
          profile_header_row: cfg.profile_header_row ?? meta.profileHeaderRow,
          profile_enabled: cfg.profile_enabled ?? true,
          sheet_name: cfg.sheet_name || meta.attendanceSheet,
          header_row: cfg.header_row ?? meta.attendanceHeaderRow,
          backup_year: cfg.backup_year ?? null,
          schedule_times: times,
          enabled: cfg.enabled ?? true,
          require_private_sheet: cfg.require_private_sheet ?? true,
          mask_sensitive_data: cfg.mask_sensitive_data ?? false,
        };
        nextTimeStrs[cfg.id] = times.join(', ');
      });

      setDrafts(nextDrafts);
      setCustomTimeStrings(nextTimeStrs);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể tải danh sách cấu hình Backup Sổ CSKH'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackupConfigs();
  }, []);

  const updateDraft = (configId: number, patch: Partial<UpdateCsSheetBackupConfigDTO>) => {
    setDrafts((prev) => ({
      ...prev,
      [configId]: {
        ...(prev[configId] || {}),
        ...patch,
      },
    }));
  };

  const getPresetValueForTimes = (times?: string[]) => {
    const normalized = (times || ['12:00', '21:00']).map((t) => t.trim()).join(',');
    const found = SCHEDULE_PRESETS.find((p) => p.value === normalized);
    return found ? found.value : 'CUSTOM';
  };

  const handleSchedulePresetChange = (configId: number, presetValue: string) => {
    if (presetValue === 'CUSTOM') {
      return;
    }
    const preset = SCHEDULE_PRESETS.find((p) => p.value === presetValue);
    if (preset) {
      updateDraft(configId, { schedule_times: preset.times });
      setCustomTimeStrings((prev) => ({
        ...prev,
        [configId]: preset.times.join(', '),
      }));
    }
  };

  const handleCustomTimeStringChange = (configId: number, raw: string) => {
    setCustomTimeStrings((prev) => ({ ...prev, [configId]: raw }));
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
    if (parsed.length > 0) {
      updateDraft(configId, { schedule_times: parsed });
    }
  };

  const buildSavePayload = (
    draft: UpdateCsSheetBackupConfigDTO,
    meta: (typeof PROGRAM_META)['KAIWA']
  ): UpdateCsSheetBackupConfigDTO => ({
    target_spreadsheet_url: draft.target_spreadsheet_url?.trim() || null,
    profile_sheet_name: draft.profile_sheet_name?.trim() || meta.profileSheet,
    profile_header_row: Number(draft.profile_header_row ?? meta.profileHeaderRow),
    profile_enabled: Boolean(draft.profile_enabled),
    sheet_name: draft.sheet_name?.trim() || meta.attendanceSheet,
    header_row: Number(draft.header_row ?? meta.attendanceHeaderRow),
    backup_year: draft.backup_year ?? null,
    schedule_times:
      draft.schedule_times && draft.schedule_times.length > 0
        ? draft.schedule_times
        : ['12:00', '21:00'],
    enabled: Boolean(draft.enabled),
    require_private_sheet: Boolean(draft.require_private_sheet),
    mask_sensitive_data: Boolean(draft.mask_sensitive_data),
  });

  const handleSaveConfig = async (cfg: CsSheetBackupConfigItem) => {
    const configId = cfg.id;
    const draft = drafts[configId];
    if (!draft) return;
    const meta = PROGRAM_META[getProgramKey(cfg.program_type)];
    const staffCode = cfg.cs_user?.staff_code || `CS0${configId}`;
    const staffLabel = `${staffCode} (${getProgramKey(cfg.program_type)})`;
    try {
      setSavingConfigId(configId);
      await importsApi.updateSheetBackupConfig(configId, buildSavePayload(draft, meta));
      toast.success(`Đã lưu cấu hình Backup Sổ CSKH cho ${staffLabel}!`);
      await fetchBackupConfigs();
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
    const meta = PROGRAM_META[getProgramKey(cfg.program_type)];
    const staffCode = cfg.cs_user?.staff_code || `CS0${configId}`;
    const draft = drafts[configId];
    try {
      setRunningConfigId(`${configId}_${forceFullRewrite ? 'full' : 'delta'}`);
      if (isAdminOrManage && draft) {
        await importsApi.updateSheetBackupConfig(configId, buildSavePayload(draft, meta));
      }

      const res = await importsApi.runSheetBackup(configId, {
        forceFullRewrite,
        year: draft?.backup_year ?? cfg.backup_year ?? null,
      });

      const profileStats = resolveSheetStats(res, 'profile', 'sheet1');
      const attendanceStats = resolveSheetStats(res, 'attendance', 'sheet3');
      const profileRows = (profileStats.updatedRows ?? 0) + (profileStats.appendedRows ?? 0);
      const attendanceRows = (attendanceStats.updatedRows ?? 0) + (attendanceStats.appendedRows ?? 0);

      toast.success(
        `Backup ${staffCode} • ${getProgramKey(cfg.program_type)} hoàn tất! Sheet ${
          draft?.profile_sheet_name || meta.profileSheet
        }: ${profileRows} dòng (${profileStats.updatedCellsCount ?? 0} ô), Sheet ${
          draft?.sheet_name || meta.attendanceSheet
        }: ${attendanceRows} dòng (${attendanceStats.updatedCellsCount ?? 0} ô) cập nhật.`
      );
      await fetchBackupConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Backup sổ CSKH ${staffCode} thất bại`
      );
    } finally {
      setRunningConfigId(null);
    }
  };

  const handleRunBackupAll = async (forceFullRewrite = false) => {
    try {
      setRunningAllMode(forceFullRewrite ? 'full' : 'delta');
      const res = await importsApi.runSheetBackupAll({
        forceFullRewrite,
        programType: programFilter === 'ALL' ? null : programFilter,
      });
      const count = res?.results?.length || configs.length;
      const scopeLabel = programFilter === 'ALL' ? 'toàn bộ' : `chương trình ${programFilter}`;
      toast.success(
        forceFullRewrite
          ? `Đã ghi đè toàn bộ (Force Full Backup) cho ${count} cấu hình CSKH (${scopeLabel})!`
          : `Đã thực hiện Delta Backup cho ${count} cấu hình CSKH (${scopeLabel})!`
      );
      await fetchBackupConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Backup toàn bộ CSKH thất bại'
      );
    } finally {
      setRunningAllMode(null);
    }
  };

  const handleDownloadExcel = async (cfg: CsSheetBackupConfigItem) => {
    const configId = cfg.id;
    const meta = PROGRAM_META[getProgramKey(cfg.program_type)];
    const staffCode = cfg.cs_user?.staff_code || `CS${configId}`;
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

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    toast.success(`Đã sao chép email Service Account: ${email}`);
  };

  const renderStatusBadge = (status?: string | null) => {
    if (!status || status === 'IDLE') {
      return <Badge variant="neutral">IDLE</Badge>;
    }
    if (status === 'SUCCESS' || status === 'COMPLETED') {
      return (
        <Badge variant="success">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            SUCCESS
          </span>
        </Badge>
      );
    }
    if (status === 'PARTIAL_FAILED') {
      return (
        <Badge variant="warning">
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            PARTIAL_FAILED
          </span>
        </Badge>
      );
    }
    return (
      <Badge variant="danger">
        <span className="inline-flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          {status}
        </span>
      </Badge>
    );
  };

  const csOptions = useMemo(() => {
    const map = new Map<number, string>();
    configs.forEach((c) => {
      const code = c.cs_user?.staff_code || `CS${c.cs_user_id}`;
      const name = c.cs_user?.name || c.name || '';
      map.set(c.cs_user_id, name ? `${code} — ${name}` : code);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [configs]);

  // Cards hiển thị: lọc theo quyền + chương trình + CSKH
  const visibleConfigs = useMemo(() => {
    let list = isAdminOrManage
      ? configs
      : configs.filter((c) => !user?.id || c.cs_user_id === user.id);

    if (programFilter !== 'ALL') {
      list = list.filter((c) => getProgramKey(c.program_type) === programFilter);
    }
    if (isAdminOrManage && csFilterUserId !== 'ALL') {
      list = list.filter((c) => c.cs_user_id === csFilterUserId);
    }
    return list;
  }, [configs, isAdminOrManage, user?.id, programFilter, csFilterUserId]);

  if (loading && configs.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border/80 p-12 flex items-center justify-center text-text-muted">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-primary" />
        <span className="text-xs font-semibold">
          Đang tải cấu hình Backup Sổ CSKH (Kaiwa &amp; JLPT)...
        </span>
      </div>
    );
  }

  const selectClass =
    'w-full h-10 px-2.5 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100 disabled:text-slate-500';

  return (
    <div className="space-y-5">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50/80 to-emerald-50/70 rounded-2xl border border-indigo-200/80 p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Backup dữ liệu từ Web về Sổ CSKH (Kaiwa &amp; JLPT)
            </h3>
            <p className="text-xs text-slate-600">
              Đổ dữ liệu học viên &amp; điểm danh từ Web về Sheet của từng CSKH:
              {' '}<strong className="text-teal-800">Kaiwa</strong> (<code className="font-mono">1.Chăm sóc</code> &amp; <code className="font-mono">3.Chấm buổi</code>)
              {' '}• <strong className="text-indigo-800">JLPT</strong> (<code className="font-mono">Data JLPT_Inhouse</code> &amp; <code className="font-mono">Chấm buổi</code>).
            </p>
          </div>

          {isAdminOrManage && (
            <div className="flex flex-wrap items-start gap-2.5 shrink-0">
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRunBackupAll(true)}
                  isLoading={runningAllMode === 'full'}
                  disabled={!serviceAccount?.configured || runningAllMode !== null}
                  leftIcon={<RotateCcw className="w-4 h-4 text-amber-600" />}
                  className="bg-white border-amber-300 text-amber-900 hover:bg-amber-50 font-bold"
                  title={
                    !serviceAccount?.configured
                      ? 'Vui lòng cấu hình Google Service Account JSON tại trang Cấu hình Admin trước'
                      : 'Tạo lại toàn bộ dòng & ô từ đầu cho tất cả CSKH'
                  }
                >
                  Ghi đè toàn bộ
                </Button>
                <span className="text-[10px] text-slate-500 mt-1">
                  Làm mới lại toàn bộ dữ liệu
                </span>
              </div>

              <div className="flex flex-col items-center">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleRunBackupAll(false)}
                  isLoading={runningAllMode === 'delta'}
                  disabled={!serviceAccount?.configured || runningAllMode !== null}
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  className="font-bold shadow-sm"
                  title={
                    !serviceAccount?.configured
                      ? 'Vui lòng cấu hình Google Service Account JSON tại trang Cấu hình Admin trước'
                      : 'Chỉ cập nhật những ô có thay đổi cho tất cả CSKH'
                  }
                >
                  Backup tất cả CSKH
                </Button>
                <span className="text-[10px] text-slate-500 mt-1">
                  Chỉ ghi những ô mới thay đổi
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Google Service Account Status Bar */}
        <div className="mt-3.5 pt-3 border-t border-indigo-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold text-slate-800">Tài khoản Google Sheet:</span>
            {serviceAccount?.configured && serviceAccount.clientEmail ? (
              <>
                <Badge variant="success" size="sm">Đã kết nối</Badge>
                <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-bold text-indigo-700">
                  {serviceAccount.clientEmail}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopyEmail(serviceAccount.clientEmail!)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold text-[11px] transition-colors cursor-pointer"
                  title="Copy email này để cấp quyền Chỉnh sửa (Editor) trên Google Sheet"
                >
                  <Copy className="w-3 h-3" />
                  Copy Email
                </button>
              </>
            ) : (
              <Badge variant="warning" size="sm">Chưa gắn Service Account</Badge>
            )}
          </div>
        </div>
      </div>

      {/* 1b. Quick Filters */}
      <div className="bg-surface rounded-2xl border border-border/80 p-3.5 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          Bộ lọc nhanh:
        </span>
        <select
          value={programFilter}
          onChange={(e) => setProgramFilter(e.target.value as ProgramFilter)}
          className={`${selectClass} !h-9 max-w-xs`}
        >
          <option value="ALL">Tất cả chương trình</option>
          <option value="KAIWA">KAIWA (Sheet 1.Chăm sóc &amp; 3.Chấm buổi)</option>
          <option value="JLPT">JLPT (Sheet Data JLPT_Inhouse &amp; Chấm buổi)</option>
        </select>

        {isAdminOrManage && (
          <select
            value={String(csFilterUserId)}
            onChange={(e) =>
              setCsFilterUserId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
            }
            className={`${selectClass} !h-9 max-w-xs`}
          >
            <option value="ALL">Tất cả CSKH</option>
            {csOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        <span className="text-[11px] text-slate-500 font-semibold ml-auto">
          Hiển thị {visibleConfigs.length} / {configs.length} cấu hình
        </span>
      </div>

      {/* 2. CSKH Cards Grid */}
      {visibleConfigs.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/80 p-10 text-center space-y-2">
          <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">
            Chưa có cấu hình tài khoản CSKH nào để hiển thị
          </p>
          <p className="text-xs text-slate-500">
            Vui lòng đổi bộ lọc chương trình/CSKH, kiểm tra tài khoản nhân viên CSKH hoặc bấm làm mới trang.
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            visibleConfigs.length > 1 ? 'xl:grid-cols-2' : ''
          } gap-5`}
        >
          {visibleConfigs.map((cfg) => {
            const configId = cfg.id;
            const programKey = getProgramKey(cfg.program_type);
            const meta = PROGRAM_META[programKey];
            const staffCode = cfg.cs_user?.staff_code || `CS0${configId}`;
            const staffName = cfg.cs_user?.name || cfg.name || `CSKH ${staffCode}`;
            const staffEmail = cfg.cs_user?.email || '';
            const excelFileName = `hoc_vien_${meta.fileSlug}_${staffCode}.xlsx`;

            const draft: UpdateCsSheetBackupConfigDTO = drafts[configId] || {
              target_spreadsheet_url: cfg.target_spreadsheet_url || '',
              profile_sheet_name: cfg.profile_sheet_name || meta.profileSheet,
              profile_header_row: cfg.profile_header_row ?? meta.profileHeaderRow,
              profile_enabled: cfg.profile_enabled ?? true,
              sheet_name: cfg.sheet_name || meta.attendanceSheet,
              header_row: cfg.header_row ?? meta.attendanceHeaderRow,
              backup_year: cfg.backup_year ?? null,
              schedule_times: cfg.schedule_times || ['12:00', '21:00'],
              enabled: cfg.enabled ?? true,
              require_private_sheet: cfg.require_private_sheet ?? true,
              mask_sensitive_data: cfg.mask_sensitive_data ?? false,
            };

            const profileStats = resolveSheetStats(cfg.last_summary, 'profile', 'sheet1');
            const attendanceStats = resolveSheetStats(cfg.last_summary, 'attendance', 'sheet3');

            const profileSheetLabel = draft.profile_sheet_name || meta.profileSheet;
            const attendanceSheetLabel = draft.sheet_name || meta.attendanceSheet;

            const currentPreset = getPresetValueForTimes(draft.schedule_times);
            const yearOptions = availableYears.length > 0 ? availableYears : [2025, 2026];

            return (
              <div
                key={configId}
                className="bg-surface rounded-2xl border border-indigo-200/90 shadow-soft overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="px-5 py-4 border-b bg-gradient-to-r from-indigo-50/70 via-slate-50 to-teal-50/50 border-indigo-200/70 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs tracking-tight ${
                          programKey === 'KAIWA' ? 'bg-teal-600' : 'bg-indigo-600'
                        }`}
                      >
                        {staffCode}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold tracking-wide border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          <h4 className="font-extrabold text-slate-900 text-sm">
                            {staffName}
                          </h4>
                          {staffEmail && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              ({staffEmail})
                            </span>
                          )}
                        </div>

                        {/* Student Counts */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold">
                            <Users className="w-3 h-3 text-indigo-300" />
                            Tổng: {cfg.student_counts?.total ?? 0} HV
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                            Đang học/Chờ lớp: {cfg.student_counts?.attending ?? 0} HV
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold font-mono">
                            File chuẩn: {excelFileName}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Backup Status & Last Backup Time */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {renderStatusBadge(cfg.last_status)}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            draft.enabled
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              draft.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          {draft.enabled ? 'Lịch tự động: BẬT' : 'Lịch tự động: TẮT'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Backup gần nhất:</span>
                        <strong className="text-slate-800">
                          {cfg.last_backup_at
                            ? new Date(cfg.last_backup_at).toLocaleString('vi-VN')
                            : 'Chưa chạy'}
                        </strong>
                      </div>
                      <div className="text-[10px] font-bold text-slate-500">
                        Cấu hình #{configId} • CSKH #{cfg.cs_user_id}
                      </div>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 space-y-4 text-xs">
                    {/* Delta Stats Comparison: Sheet Hồ sơ & Sheet Điểm danh */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Sheet Hồ sơ (profile) */}
                      <div className="rounded-xl bg-indigo-50/40 border border-indigo-200/80 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-indigo-950 text-xs flex items-center gap-1.5 min-w-0">
                            <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span className="truncate">
                              Sheet Hồ sơ: <code className="font-mono">{profileSheetLabel}</code>
                            </span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 shrink-0">
                            {meta.profileCaption}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Tổng dòng
                            </span>
                            <strong className="text-xs font-extrabold text-slate-900">
                              {profileStats.totalEnrollments}
                            </strong>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Giữ nguyên
                            </span>
                            <strong className="text-xs font-extrabold text-slate-600">
                              {profileStats.unchangedRows}
                            </strong>
                          </div>
                          <div className="bg-blue-50/80 rounded-lg border border-blue-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-blue-700 font-semibold">
                              Cập nhật
                            </span>
                            <strong className="text-xs font-extrabold text-blue-700">
                              {profileStats.updatedRows}
                            </strong>
                          </div>
                          <div className="bg-emerald-50/80 rounded-lg border border-emerald-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-emerald-700 font-semibold">
                              Thêm mới
                            </span>
                            <strong className="text-xs font-extrabold text-emerald-700">
                              +{profileStats.appendedRows}
                            </strong>
                          </div>
                          <div className="bg-amber-50/90 rounded-lg border border-amber-200/90 p-1.5 text-center">
                            <span className="block text-[9px] text-amber-800 font-semibold">
                              Ô thay đổi
                            </span>
                            <strong className="text-xs font-extrabold text-amber-800">
                              {profileStats.updatedCellsCount}
                            </strong>
                          </div>
                        </div>
                        {!draft.profile_enabled && (
                          <span className="block text-[10px] font-bold text-slate-500">
                            Sheet hồ sơ đang TẮT đổ dữ liệu.
                          </span>
                        )}
                      </div>

                      {/* Sheet Điểm danh (attendance) */}
                      <div className="rounded-xl bg-teal-50/40 border border-teal-200/80 p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-teal-950 text-xs flex items-center gap-1.5 min-w-0">
                            <Layers className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate">
                              Sheet Điểm danh: <code className="font-mono">{attendanceSheetLabel}</code>
                            </span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800 shrink-0">
                            {meta.attendanceCaption}
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Tổng dòng
                            </span>
                            <strong className="text-xs font-extrabold text-slate-900">
                              {attendanceStats.totalEnrollments}
                            </strong>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Giữ nguyên
                            </span>
                            <strong className="text-xs font-extrabold text-slate-600">
                              {attendanceStats.unchangedRows}
                            </strong>
                          </div>
                          <div className="bg-blue-50/80 rounded-lg border border-blue-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-blue-700 font-semibold">
                              Cập nhật
                            </span>
                            <strong className="text-xs font-extrabold text-blue-700">
                              {attendanceStats.updatedRows}
                            </strong>
                          </div>
                          <div className="bg-emerald-50/80 rounded-lg border border-emerald-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-emerald-700 font-semibold">
                              Thêm mới
                            </span>
                            <strong className="text-xs font-extrabold text-emerald-700">
                              +{attendanceStats.appendedRows}
                            </strong>
                          </div>
                          <div className="bg-amber-50/90 rounded-lg border border-amber-200/90 p-1.5 text-center">
                            <span className="block text-[9px] text-amber-800 font-semibold">
                              Ô thay đổi
                            </span>
                            <strong className="text-xs font-extrabold text-amber-800">
                              {attendanceStats.updatedCellsCount}
                            </strong>
                          </div>
                        </div>
                        {typeof attendanceStats.attendanceCellsWritten === 'number' && (
                          <span className="block text-[10px] font-bold text-teal-800">
                            Ô điểm danh đã ghi: {attendanceStats.attendanceCellsWritten}
                          </span>
                        )}
                      </div>
                    </div>

                    {cfg.last_error && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                        <strong>Lỗi lần chạy gần nhất:</strong> {cfg.last_error}
                      </div>
                    )}

                    {/* Storage Target, Sheets, Year, Schedule & Security Config */}
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Link Google Sheet đích của CSKH ({staffCode} • {programKey})</span>
                          </span>
                          {!isAdminOrManage && (
                            <span className="text-[10px] font-semibold text-slate-500">
                              (Chế độ xem - Liên hệ Admin/Manage để đổi cấu hình)
                            </span>
                          )}
                        </label>
                        <Input
                          placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                          value={draft.target_spreadsheet_url || ''}
                          disabled={!isAdminOrManage}
                          onChange={(e) =>
                            updateDraft(configId, { target_spreadsheet_url: e.target.value })
                          }
                        />
                        <span className="block text-[10px] text-slate-500 mt-1">
                          Ghi chú: Nếu để trống hệ thống vẫn tự động cập nhật ra file Excel chuẩn{' '}
                          <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">
                            {cfg.local_backup_path || `docs/data/hoc_vien/${excelFileName}`}
                          </code>{' '}
                          trên server.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <label className="block font-bold text-slate-700">
                            Tên Sheet Hồ sơ ({programKey})
                          </label>
                          <Input
                            value={draft.profile_sheet_name || ''}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, { profile_sheet_name: e.target.value })
                            }
                            placeholder={meta.profileSheet}
                          />
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.profile_enabled)}
                              disabled={!isAdminOrManage}
                              onChange={(e) =>
                                updateDraft(configId, { profile_enabled: e.target.checked })
                              }
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-[11px] text-slate-700 font-semibold">
                              Bật đổ dữ liệu vào Sheet Hồ sơ
                            </span>
                          </label>
                        </div>

                        <div className="space-y-2">
                          <label className="block font-bold text-slate-700">
                            Tên Sheet Điểm danh ({programKey})
                          </label>
                          <Input
                            value={draft.sheet_name || ''}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, { sheet_name: e.target.value })
                            }
                            placeholder={meta.attendanceSheet}
                          />
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Dòng tiêu đề: Hồ sơ = <strong>{draft.profile_header_row ?? meta.profileHeaderRow}</strong>{' '}
                            • Điểm danh = <strong>{draft.header_row ?? meta.attendanceHeaderRow}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5 text-teal-600" />
                            <span>Năm điểm danh</span>
                          </label>
                          <select
                            value={draft.backup_year == null ? 'ALL' : String(draft.backup_year)}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, {
                                backup_year: e.target.value === 'ALL' ? null : Number(e.target.value),
                              })
                            }
                            className={selectClass}
                          >
                            <option value="ALL">Tất cả các năm</option>
                            {yearOptions.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Tần suất chạy tự động</span>
                          </label>
                          <select
                            value={currentPreset}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              handleSchedulePresetChange(configId, e.target.value)
                            }
                            className={selectClass}
                          >
                            {SCHEDULE_PRESETS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Khung giờ chạy trong ngày (HH:mm, cách nhau bằng dấu phẩy)
                          </label>
                          <Input
                            value={
                              customTimeStrings[configId] ??
                              (draft.schedule_times || ['12:00', '21:00']).join(', ')
                            }
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              handleCustomTimeStringChange(configId, e.target.value)
                            }
                            placeholder="12:00, 21:00"
                          />
                        </div>
                      </div>

                      {/* Security & Anti-Leak Checkboxes */}
                      <div className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/70 space-y-2">
                        <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-1">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Tùy chọn Bảo mật chống rò rỉ dữ liệu &amp; Lịch tự động</span>
                        </div>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.require_private_sheet)}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, {
                                require_private_sheet: e.target.checked,
                              })
                            }
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] text-slate-700 leading-snug">
                            <strong className="text-slate-900 inline-flex items-center gap-1">
                              <Lock className="w-3 h-3 text-emerald-600" />
                              Chặn đẩy dữ liệu nếu Google Sheet mở quyền sửa công khai (Require Private Sheet)
                            </strong>{' '}
                            — Tự động kiểm tra quyền Google Drive và từ chối ghi nếu phát hiện bất kỳ ai có link đều xem/sửa được.
                          </span>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.mask_sensitive_data)}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, {
                                mask_sensitive_data: e.target.checked,
                              })
                            }
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] text-slate-700 leading-snug">
                            <strong className="text-slate-900 inline-flex items-center gap-1">
                              <EyeOff className="w-3 h-3 text-amber-600" />
                              Che bớt SĐT &amp; Email học viên khi xuất ra Sheet (PII Masking)
                            </strong>{' '}
                            — Bảo vệ thông tin liên hệ nhạy cảm (VD: <code className="font-mono">098***456</code>).
                          </span>
                        </label>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.enabled)}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(configId, {
                                enabled: e.target.checked,
                              })
                            }
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] text-slate-700 leading-snug">
                            <strong className="text-slate-900">
                              Bật tự động chạy theo lịch hàng ngày
                            </strong>{' '}
                            — Hệ thống tự động chạy Delta Backup vào các khung giờ{' '}
                            <code className="font-mono font-bold text-indigo-700">
                              {(draft.schedule_times || ['12:00', '21:00']).join(', ')}
                            </code>
                            .
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Action Buttons */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {isAdminOrManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSaveConfig(cfg)}
                        isLoading={savingConfigId === configId}
                        leftIcon={<Save className="w-3.5 h-3.5 text-slate-600" />}
                      >
                        Lưu cấu hình
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadExcel(cfg)}
                      isLoading={downloadingConfigId === configId}
                      leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
                      className="bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-50 font-bold"
                    >
                      Tải file {excelFileName}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunBackup(cfg, true)}
                      isLoading={runningConfigId === `${configId}_full`}
                      disabled={!serviceAccount?.configured || runningConfigId !== null}
                      leftIcon={<RotateCcw className="w-3.5 h-3.5 text-amber-600" />}
                      className="bg-white border-amber-300 text-amber-900 hover:bg-amber-50 font-bold"
                      title={
                        !serviceAccount?.configured
                          ? 'Vui lòng cấu hình Google Service Account JSON tại trang Cấu hình Admin trước'
                          : 'Làm mới toàn bộ dòng & ô của thẻ này'
                      }
                    >
                      Ghi đè (Full)
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRunBackup(cfg, false)}
                      isLoading={runningConfigId === `${configId}_delta`}
                      disabled={!serviceAccount?.configured || runningConfigId !== null}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      className="font-bold"
                      title={
                        !serviceAccount?.configured
                          ? 'Vui lòng cấu hình Google Service Account JSON tại trang Cấu hình Admin trước'
                          : 'Chỉ cập nhật những ô có thay đổi của thẻ này'
                      }
                    >
                      Cập nhật thay đổi (Delta Backup)
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
