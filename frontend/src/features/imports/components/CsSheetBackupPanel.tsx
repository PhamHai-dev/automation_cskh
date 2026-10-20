import React, { useEffect, useState } from 'react';
import { importsApi } from '../api/imports.api';
import {
  CsSheetBackupConfigItem,
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
  Zap,
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

export const CsSheetBackupPanel: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')
  );

  const [configs, setConfigs] = useState<CsSheetBackupConfigItem[]>([]);
  const [serviceAccount, setServiceAccount] = useState<ServiceAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [runningUserId, setRunningUserId] = useState<string | null>(null);
  const [downloadingUserId, setDownloadingUserId] = useState<number | null>(null);
  const [runningAllMode, setRunningAllMode] = useState<'delta' | 'full' | null>(null);

  // Editable drafts keyed by cs_user_id
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

      const nextDrafts: Record<number, UpdateCsSheetBackupConfigDTO> = {};
      const nextTimeStrs: Record<number, string> = {};

      loadedConfigs.forEach((cfg) => {
        const times =
          cfg.schedule_times && cfg.schedule_times.length > 0
            ? cfg.schedule_times
            : ['12:00', '21:00'];
        nextDrafts[cfg.cs_user_id] = {
          target_spreadsheet_url: cfg.target_spreadsheet_url || '',
          sheet1_name: cfg.sheet1_name || '1.Chăm sóc',
          sheet3_name: cfg.sheet3_name || '3.Chấm buổi',
          schedule_times: times,
          enabled: cfg.enabled ?? true,
          require_private_sheet: cfg.require_private_sheet ?? true,
          mask_sensitive_data: cfg.mask_sensitive_data ?? false,
        };
        nextTimeStrs[cfg.cs_user_id] = times.join(', ');
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

  const updateDraft = (csUserId: number, patch: Partial<UpdateCsSheetBackupConfigDTO>) => {
    setDrafts((prev) => ({
      ...prev,
      [csUserId]: {
        ...(prev[csUserId] || {}),
        ...patch,
      },
    }));
  };

  const getPresetValueForTimes = (times?: string[]) => {
    const normalized = (times || ['12:00', '21:00']).map((t) => t.trim()).join(',');
    const found = SCHEDULE_PRESETS.find((p) => p.value === normalized);
    return found ? found.value : 'CUSTOM';
  };

  const handleSchedulePresetChange = (csUserId: number, presetValue: string) => {
    if (presetValue === 'CUSTOM') {
      return;
    }
    const preset = SCHEDULE_PRESETS.find((p) => p.value === presetValue);
    if (preset) {
      updateDraft(csUserId, { schedule_times: preset.times });
      setCustomTimeStrings((prev) => ({
        ...prev,
        [csUserId]: preset.times.join(', '),
      }));
    }
  };

  const handleCustomTimeStringChange = (csUserId: number, raw: string) => {
    setCustomTimeStrings((prev) => ({ ...prev, [csUserId]: raw }));
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
    if (parsed.length > 0) {
      updateDraft(csUserId, { schedule_times: parsed });
    }
  };

  const handleSaveConfig = async (csUserId: number, staffLabel: string) => {
    const draft = drafts[csUserId];
    if (!draft) return;
    try {
      setSavingUserId(csUserId);
      const payload: UpdateCsSheetBackupConfigDTO = {
        target_spreadsheet_url: draft.target_spreadsheet_url?.trim() || null,
        sheet1_name: draft.sheet1_name?.trim() || '1.Chăm sóc',
        sheet3_name: draft.sheet3_name?.trim() || '3.Chấm buổi',
        schedule_times:
          draft.schedule_times && draft.schedule_times.length > 0
            ? draft.schedule_times
            : ['12:00', '21:00'],
        enabled: Boolean(draft.enabled),
        require_private_sheet: Boolean(draft.require_private_sheet),
        mask_sensitive_data: Boolean(draft.mask_sensitive_data),
      };
      await importsApi.updateSheetBackupConfig(csUserId, payload);
      toast.success(`Đã lưu cấu hình Backup Sổ CSKH cho ${staffLabel}!`);
      await fetchBackupConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể lưu cấu hình cho ${staffLabel}`
      );
    } finally {
      setSavingUserId(null);
    }
  };

  const handleRunBackup = async (
    csUserId: number,
    staffLabel: string,
    forceFullRewrite = false
  ) => {
    try {
      setRunningUserId(`${csUserId}_${forceFullRewrite ? 'full' : 'delta'}`);
      if (isAdminOrManage && drafts[csUserId]) {
        const draft = drafts[csUserId];
        await importsApi.updateSheetBackupConfig(csUserId, {
          target_spreadsheet_url: draft.target_spreadsheet_url?.trim() || null,
          sheet1_name: draft.sheet1_name?.trim() || '1.Chăm sóc',
          sheet3_name: draft.sheet3_name?.trim() || '3.Chấm buổi',
          schedule_times:
            draft.schedule_times && draft.schedule_times.length > 0
              ? draft.schedule_times
              : ['12:00', '21:00'],
          enabled: Boolean(draft.enabled),
          require_private_sheet: Boolean(draft.require_private_sheet),
          mask_sensitive_data: Boolean(draft.mask_sensitive_data),
        });
      }

      const res = await importsApi.runSheetBackup(csUserId, { forceFullRewrite });
      const s1Cells = res?.sheet1?.updatedCellsCount ?? 0;
      const s3Cells = res?.sheet3?.updatedCellsCount ?? 0;
      const s1Rows = (res?.sheet1?.updatedRows ?? 0) + (res?.sheet1?.appendedRows ?? 0);
      const s3Rows = (res?.sheet3?.updatedRows ?? 0) + (res?.sheet3?.appendedRows ?? 0);

      toast.success(
        `Backup ${staffLabel} hoàn tất! Sheet 1: ${s1Rows} dòng (${s1Cells} ô), Sheet 3: ${s3Rows} dòng (${s3Cells} ô) cập nhật.`
      );
      await fetchBackupConfigs();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Backup sổ CSKH ${staffLabel} thất bại`
      );
    } finally {
      setRunningUserId(null);
    }
  };

  const handleRunBackupAll = async (forceFullRewrite = false) => {
    try {
      setRunningAllMode(forceFullRewrite ? 'full' : 'delta');
      const res = await importsApi.runSheetBackupAll({ forceFullRewrite });
      const count = res?.results?.length || configs.length;
      toast.success(
        forceFullRewrite
          ? `Đã ghi đè toàn bộ (Force Full Backup) cho ${count} tài khoản CSKH!`
          : `Đã thực hiện Delta Backup cho ${count} tài khoản CSKH!`
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

  const handleDownloadExcel = async (csUserId: number, staffCode?: string | null) => {
    const code = staffCode || `CS${csUserId}`;
    try {
      setDownloadingUserId(csUserId);
      await importsApi.downloadCsSheetBackupExcel(csUserId, code, false);
      toast.success(`Đã tải file cham_soc_hoc_vien_${code}.xlsx thành công!`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          `Không thể tải file cham_soc_hoc_vien_${code}.xlsx`
      );
    } finally {
      setDownloadingUserId(null);
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

  // Filter cards for CS user if backend returns more than their own
  const visibleConfigs = isAdminOrManage
    ? configs
    : configs.filter((c) => !user?.id || c.cs_user_id === user.id);

  if (loading && configs.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border/80 p-12 flex items-center justify-center text-text-muted">
        <RefreshCw className="w-5 h-5 animate-spin mr-3 text-primary" />
        <span className="text-xs font-semibold">
          Đang tải cấu hình Backup Sổ CSKH (Sheet 1.Chăm sóc &amp; 3.Chấm buổi)...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-indigo-50 via-blue-50/80 to-emerald-50/70 rounded-2xl border border-indigo-200/80 p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-indigo-600 text-white shadow-2xs">
                <Zap className="w-3.5 h-3.5" />
                Delta Cell Diffing (Chỉ ghi ô thay đổi)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Google Sheets API v4 + File Excel (.xlsx)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Bảo mật 5 lớp: AES-256-GCM + Cô lập theo CVHT + Chặn Sheet công khai
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                <CalendarClock className="w-3.5 h-3.5" />
                Lịch tự động 1–2 lần/ngày
              </span>
            </div>

            <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
              Backup 2 Chiều từ Web về Sổ CSKH (<code className="font-mono text-indigo-700">1.Chăm sóc</code> &amp;{' '}
              <code className="font-mono text-teal-700">3.Chấm buổi</code>)
            </h3>
            <p className="text-xs text-slate-600 max-w-4xl leading-relaxed">
              Đồng bộ ngược hồ sơ học viên, nhật ký chăm sóc (60 cột Sheet <strong className="text-slate-800">1.Chăm sóc</strong>) và bảng điểm danh 12 tháng (466 cột Sheet <strong className="text-slate-800">3.Chấm buổi</strong>) từ Web về đúng file{' '}
              <code className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-800">
                cham_soc_hoc_vien_&lt;CVHT&gt;.xlsx
              </code>{' '}
              và Google Sheet riêng của từng tài khoản CSKH.
            </p>
          </div>

          {isAdminOrManage && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRunBackupAll(true)}
                isLoading={runningAllMode === 'full'}
                disabled={runningAllMode !== null}
                leftIcon={<RotateCcw className="w-4 h-4 text-amber-600" />}
                className="bg-white border-amber-300 text-amber-900 hover:bg-amber-50 font-bold"
              >
                Ghi đè toàn bộ (Force Full Backup)
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleRunBackupAll(false)}
                isLoading={runningAllMode === 'delta'}
                disabled={runningAllMode !== null}
                leftIcon={<RefreshCw className="w-4 h-4" />}
                className="font-bold shadow-sm"
              >
                Backup Tất cả CSKH ngay
              </Button>
            </div>
          )}
        </div>

        {/* Google Service Account Info Bar */}
        <div className="mt-4 pt-3.5 border-t border-indigo-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 text-xs">
            <KeyRound className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold text-slate-800">
                Google Service Account (Quyền ghi Google Sheet đích):{' '}
              </span>
              {serviceAccount?.configured && serviceAccount.clientEmail ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Badge variant="success" size="sm">Đã sẵn sàng</Badge>
                  <code className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-bold text-indigo-700">
                    {serviceAccount.clientEmail}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopyEmail(serviceAccount.clientEmail!)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold text-[11px] transition-colors cursor-pointer"
                    title="Copy Email để cấp quyền Editor (Người chỉnh sửa) trên file Google Sheet đích của từng CSKH"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Email để cấp quyền Editor (Người chỉnh sửa)
                  </button>
                </span>
              ) : (
                <span className="text-slate-600">
                  Chưa gắn Service Account JSON (Hệ thống vẫn luôn xuất &amp; cập nhật đầy đủ ra file Excel chuẩn{' '}
                  <code className="font-mono text-[11px] bg-white px-1 rounded">
                    cham_soc_hoc_vien_&lt;CVHT&gt;.xlsx
                  </code>{' '}
                  trên server để tải về bất cứ lúc nào).
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. CSKH Cards Grid */}
      {visibleConfigs.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border/80 p-10 text-center space-y-2">
          <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">
            Chưa có cấu hình tài khoản CSKH nào để hiển thị
          </p>
          <p className="text-xs text-slate-500">
            Vui lòng kiểm tra tài khoản nhân viên CSKH hoặc bấm làm mới trang.
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 ${
            visibleConfigs.length > 1 ? 'xl:grid-cols-2' : ''
          } gap-5`}
        >
          {visibleConfigs.map((cfg) => {
            const csUserId = cfg.cs_user_id;
            const staffCode = cfg.cs_user?.staff_code || `CS0${csUserId}`;
            const staffName = cfg.cs_user?.name || cfg.name || `CSKH ${staffCode}`;
            const staffEmail = cfg.cs_user?.email || '';
            const excelFileName = `cham_soc_hoc_vien_${staffCode}.xlsx`;

            const draft: UpdateCsSheetBackupConfigDTO = drafts[csUserId] || {
              target_spreadsheet_url: cfg.target_spreadsheet_url || '',
              sheet1_name: cfg.sheet1_name || '1.Chăm sóc',
              sheet3_name: cfg.sheet3_name || '3.Chấm buổi',
              schedule_times: cfg.schedule_times || ['12:00', '21:00'],
              enabled: cfg.enabled ?? true,
              require_private_sheet: cfg.require_private_sheet ?? true,
              mask_sensitive_data: cfg.mask_sensitive_data ?? false,
            };

            const sheet1Stats: SheetBackupSheetStats =
              cfg.last_summary?.sheet1 || EMPTY_STATS;
            const sheet3Stats: SheetBackupSheetStats =
              cfg.last_summary?.sheet3 || EMPTY_STATS;

            const currentPreset = getPresetValueForTimes(draft.schedule_times);

            return (
              <div
                key={cfg.id || csUserId}
                className="bg-surface rounded-2xl border border-indigo-200/90 shadow-soft overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Card Header */}
                  <div className="px-5 py-4 border-b bg-gradient-to-r from-indigo-50/70 via-slate-50 to-teal-50/50 border-indigo-200/70 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs tracking-tight">
                        {staffCode}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold tracking-wide bg-indigo-100 text-indigo-800 border border-indigo-300 font-mono">
                            {staffCode}
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

                        {/* Student Counts Breakdown */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold">
                            <Users className="w-3 h-3 text-indigo-300" />
                            Tổng: {cfg.studentCounts?.total ?? 0} học viên
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[11px] font-bold">
                            Kaiwa: {cfg.studentCounts?.kaiwa ?? 0}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                            JLPT: {cfg.studentCounts?.jlpt ?? 0}
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
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 space-y-4 text-xs">
                    {/* Delta Stats Comparison: Sheet 1 & Sheet 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Sheet 1.Chăm sóc */}
                      <div className="rounded-xl bg-indigo-50/40 border border-indigo-200/80 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-indigo-950 text-xs flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            Sheet <code className="font-mono">{draft.sheet1_name || '1.Chăm sóc'}</code>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                            60 cột Hồ sơ &amp; Chăm sóc
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Tổng dòng
                            </span>
                            <strong className="text-xs font-extrabold text-slate-900">
                              {sheet1Stats.totalEnrollments}
                            </strong>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Giữ nguyên
                            </span>
                            <strong className="text-xs font-extrabold text-slate-600">
                              {sheet1Stats.unchangedRows}
                            </strong>
                          </div>
                          <div className="bg-blue-50/80 rounded-lg border border-blue-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-blue-700 font-semibold">
                              Cập nhật
                            </span>
                            <strong className="text-xs font-extrabold text-blue-700">
                              {sheet1Stats.updatedRows}
                            </strong>
                          </div>
                          <div className="bg-emerald-50/80 rounded-lg border border-emerald-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-emerald-700 font-semibold">
                              Thêm mới
                            </span>
                            <strong className="text-xs font-extrabold text-emerald-700">
                              +{sheet1Stats.appendedRows}
                            </strong>
                          </div>
                          <div className="bg-amber-50/90 rounded-lg border border-amber-200/90 p-1.5 text-center">
                            <span className="block text-[9px] text-amber-800 font-semibold">
                              Ô thay đổi
                            </span>
                            <strong className="text-xs font-extrabold text-amber-800">
                              {sheet1Stats.updatedCellsCount}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Sheet 3.Chấm buổi */}
                      <div className="rounded-xl bg-teal-50/40 border border-teal-200/80 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-teal-950 text-xs flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-teal-600" />
                            Sheet <code className="font-mono">{draft.sheet3_name || '3.Chấm buổi'}</code>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
                            466 cột Điểm danh 12 tháng
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Tổng dòng
                            </span>
                            <strong className="text-xs font-extrabold text-slate-900">
                              {sheet3Stats.totalEnrollments}
                            </strong>
                          </div>
                          <div className="bg-white rounded-lg border border-slate-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-slate-500 font-semibold">
                              Giữ nguyên
                            </span>
                            <strong className="text-xs font-extrabold text-slate-600">
                              {sheet3Stats.unchangedRows}
                            </strong>
                          </div>
                          <div className="bg-blue-50/80 rounded-lg border border-blue-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-blue-700 font-semibold">
                              Cập nhật
                            </span>
                            <strong className="text-xs font-extrabold text-blue-700">
                              {sheet3Stats.updatedRows}
                            </strong>
                          </div>
                          <div className="bg-emerald-50/80 rounded-lg border border-emerald-200/80 p-1.5 text-center">
                            <span className="block text-[9px] text-emerald-700 font-semibold">
                              Thêm mới
                            </span>
                            <strong className="text-xs font-extrabold text-emerald-700">
                              +{sheet3Stats.appendedRows}
                            </strong>
                          </div>
                          <div className="bg-amber-50/90 rounded-lg border border-amber-200/90 p-1.5 text-center">
                            <span className="block text-[9px] text-amber-800 font-semibold">
                              Ô thay đổi
                            </span>
                            <strong className="text-xs font-extrabold text-amber-800">
                              {sheet3Stats.updatedCellsCount}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {cfg.last_error && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                        <strong>Lỗi lần chạy gần nhất:</strong> {cfg.last_error}
                      </div>
                    )}

                    {/* Storage Target, Schedule & Security Config */}
                    <div className="space-y-3 pt-1">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Link Google Sheet đích của CSKH ({staffCode})</span>
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
                            updateDraft(csUserId, { target_spreadsheet_url: e.target.value })
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

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Tên Sheet 1 (Hồ sơ)
                          </label>
                          <Input
                            value={draft.sheet1_name || ''}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(csUserId, { sheet1_name: e.target.value })
                            }
                            placeholder="1.Chăm sóc"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1">
                            Tên Sheet 3 (Điểm danh)
                          </label>
                          <Input
                            value={draft.sheet3_name || ''}
                            disabled={!isAdminOrManage}
                            onChange={(e) =>
                              updateDraft(csUserId, { sheet3_name: e.target.value })
                            }
                            placeholder="3.Chấm buổi"
                          />
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
                              handleSchedulePresetChange(csUserId, e.target.value)
                            }
                            className="w-full h-9 px-2.5 border border-border rounded-xl text-xs font-semibold bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            {SCHEDULE_PRESETS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Custom HH:mm Schedule Input */}
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Khung giờ chạy tự động trong ngày (Định dạng HH:mm, cách nhau bằng dấu phẩy)
                        </label>
                        <Input
                          value={
                            customTimeStrings[csUserId] ??
                            (draft.schedule_times || ['12:00', '21:00']).join(', ')
                          }
                          disabled={!isAdminOrManage}
                          onChange={(e) =>
                            handleCustomTimeStringChange(csUserId, e.target.value)
                          }
                          placeholder="12:00, 21:00"
                        />
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
                              updateDraft(csUserId, {
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
                              updateDraft(csUserId, {
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
                              updateDraft(csUserId, {
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
                        onClick={() => handleSaveConfig(csUserId, staffCode)}
                        isLoading={savingUserId === csUserId}
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
                      onClick={() => handleDownloadExcel(csUserId, staffCode)}
                      isLoading={downloadingUserId === csUserId}
                      leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
                      className="bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-50 font-bold"
                    >
                      Tải file {excelFileName}
                    </Button>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRunBackup(csUserId, staffCode, false)}
                      isLoading={runningUserId === `${csUserId}_delta`}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      className="font-bold"
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
