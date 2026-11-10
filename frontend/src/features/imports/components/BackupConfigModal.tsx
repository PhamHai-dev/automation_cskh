import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import {
  CsSheetBackupConfigItem,
  CsUserOption,
  UpdateCsSheetBackupConfigDTO,
} from '../types/imports.types';
import {
  Check,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  FolderLock,
  HardDrive,
  Lock,
  ShieldCheck,
} from 'lucide-react';

export interface BackupConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingConfig: CsSheetBackupConfigItem | null;
  availableYears: number[];
  csUsers?: CsUserOption[];
  canManage: boolean;
  onSaved: (saved: CsSheetBackupConfigItem) => void;
}

const PROGRAM_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
  flowLabel: string;
  defaultProfileSheet: string;
  defaultProfileHeader: number;
  defaultAttSheet: string;
  defaultFinalSheet: string;
}> = [
  {
    value: 'KAIWA',
    label: 'Sổ CSKH Kaiwa (3 Sheet)',
    flowLabel: '2. Sổ CSKH',
    defaultProfileSheet: '1.Chăm sóc',
    defaultProfileHeader: 3,
    defaultAttSheet: '3.Chấm buổi',
    defaultFinalSheet: 'Điểm danh chốt',
  },
  {
    value: 'JLPT',
    label: 'Sổ CSKH JLPT (3 Sheet)',
    flowLabel: '2. Sổ CSKH',
    defaultProfileSheet: 'Data JLPT_Inhouse',
    defaultProfileHeader: 2,
    defaultAttSheet: 'Chấm buổi',
    defaultFinalSheet: 'Điểm danh chốt',
  },
  {
    value: 'TEACHER',
    label: 'Sổ Điểm danh Giáo viên (2026 スケジュール)',
    flowLabel: '3. Điểm danh GV',
    defaultProfileSheet: '',
    defaultProfileHeader: 2,
    defaultAttSheet: '2026 スケジュール',
    defaultFinalSheet: '',
  },
  {
    value: 'ADMIN_KAIWA',
    label: 'Admin Master Kaiwa (Hồ sơ + Báo cáo + Chốt theo năm)',
    flowLabel: '1. Admin Master',
    defaultProfileSheet: '1.Chăm sóc',
    defaultProfileHeader: 3,
    defaultAttSheet: 'Báo cáo học tập Kaiwa',
    defaultFinalSheet: 'Điểm danh chốt 2026',
  },
  {
    value: 'ADMIN_JLPT',
    label: 'Admin Master JLPT (Hồ sơ + Chuyên cần + Chốt theo năm)',
    flowLabel: '1. Admin Master',
    defaultProfileSheet: 'Data JLPT_Inhouse',
    defaultProfileHeader: 2,
    defaultAttSheet: 'Chuyên cần HV',
    defaultFinalSheet: 'Điểm danh chốt 2026',
  },
  {
    value: 'ADMIN_RECONCILIATION',
    label: 'Admin Đối soát Điểm danh Tổng (CSKH vs GV)',
    flowLabel: '1. Admin Master',
    defaultProfileSheet: 'Tổng hợp Đối soát',
    defaultProfileHeader: 2,
    defaultAttSheet: 'Thống kê Lệch & Chờ duyệt',
    defaultFinalSheet: '',
  },
  {
    value: 'REPORT_KAIWA',
    label: 'Báo cáo học tập Kaiwa (Bảng ngang 61 cột)',
    flowLabel: '4. Báo cáo học tập',
    defaultProfileSheet: 'Báo cáo học tập Kaiwa',
    defaultProfileHeader: 2,
    defaultAttSheet: 'Báo cáo học tập Kaiwa',
    defaultFinalSheet: '',
  },
  {
    value: 'REPORT_JLPT',
    label: 'Báo cáo Chuyên cần & Nhật ký JLPT',
    flowLabel: '4. Báo cáo học tập',
    defaultProfileSheet: 'Chuyên cần HV',
    defaultProfileHeader: 2,
    defaultAttSheet: 'Nhật ký nhận xét buổi học',
    defaultFinalSheet: '',
  },
];

const ALLOWED_SUBFOLDERS: Array<{ value: string; label: string }> = [
  { value: 'admin', label: 'backups/admin/ (Sổ tổng Admin)' },
  { value: 'cskh', label: 'backups/cskh/ (Sổ CSKH)' },
  { value: 'giao_vien', label: 'backups/giao_vien/ (Điểm danh GV)' },
  { value: 'bao_cao_hoc_tap', label: 'backups/bao_cao_hoc_tap/ (Báo cáo học tập)' },
  { value: 'custom', label: 'backups/custom/ (Thư mục tùy chỉnh)' },
];

function defaultSubfolderByProgram(pt: string): string {
  const norm = pt.toUpperCase();
  if (norm.startsWith('ADMIN_')) return 'admin';
  if (norm.startsWith('REPORT_')) return 'bao_cao_hoc_tap';
  if (norm === 'TEACHER' || norm.startsWith('GV:')) return 'giao_vien';
  return 'cskh';
}

function defaultFileBaseByProgram(pt: string, staffCode?: string | null): string {
  const norm = pt.toUpperCase();
  if (norm === 'ADMIN_KAIWA') return 'backup_admin_kaiwa';
  if (norm === 'ADMIN_JLPT') return 'backup_admin_jlpt';
  if (norm === 'ADMIN_RECONCILIATION') return 'backup_admin_doi_soat';
  if (norm === 'REPORT_KAIWA') return 'backup_bao_cao_hoc_tap_kaiwa';
  if (norm === 'REPORT_JLPT') return 'backup_bao_cao_hoc_tap_jlpt';
  const staff = (staffCode || 'CVHT01').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (norm === 'TEACHER' || norm.startsWith('GV:')) return `diem_danh_gv_${staff}`;
  return `hoc_vien_${norm.toLowerCase()}_${staff}`;
}

function parseRelativeBackupPath(
  rawPath: string | null | undefined,
  programType: string,
  staffCode?: string | null
): { subfolder: string; fileBaseName: string } {
  const clean = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const withoutPrefix = clean.startsWith('backups/') ? clean.slice('backups/'.length) : clean;
  const parts = withoutPrefix.split('/').filter(Boolean);
  if (parts.length === 2) {
    const sub = ALLOWED_SUBFOLDERS.some((s) => s.value === parts[0])
      ? parts[0]
      : defaultSubfolderByProgram(programType);
    const base = parts[1].replace(/\.xlsx$/i, '');
    return { subfolder: sub, fileBaseName: base || defaultFileBaseByProgram(programType, staffCode) };
  }
  return {
    subfolder: defaultSubfolderByProgram(programType),
    fileBaseName: defaultFileBaseByProgram(programType, staffCode),
  };
}

const PRESET_SCHEDULE_SLOTS = ['08:00', '12:00', '17:30', '21:00', '23:00'];

export const BackupConfigModal: React.FC<BackupConfigModalProps> = ({
  isOpen,
  onClose,
  editingConfig,
  availableYears,
  csUsers = [],
  canManage,
  onSaved,
}) => {
  const toast = useToast();
  const isEditing = Boolean(editingConfig);

  const [programType, setProgramType] = useState<string>('KAIWA');
  const [csUserId, setCsUserId] = useState<number | ''>('');
  const [name, setName] = useState<string>('');
  const [activeDestTab, setActiveDestTab] = useState<'GOOGLE_SHEET' | 'LOCAL_SERVER'>(
    'GOOGLE_SHEET'
  );
  const [targetUrl, setTargetUrl] = useState<string>('');

  // Kênh 1: Lưu file Excel (.xlsx) vào thư mục sandbox trên Server
  const [subfolder, setSubfolder] = useState<string>('cskh');
  const [fileBaseName, setFileBaseName] = useState<string>('hoc_vien_kaiwa_CVHT01');
  const [keepDailySnapshots, setKeepDailySnapshots] = useState<boolean>(false);
  const [maxSnapshots, setMaxSnapshots] = useState<number>(7);

  // Sheets config
  const [profileEnabled, setProfileEnabled] = useState<boolean>(true);
  const [profileSheetName, setProfileSheetName] = useState<string>('1.Chăm sóc');
  const [profileHeaderRow, setProfileHeaderRow] = useState<number>(3);

  const [sheetName, setSheetName] = useState<string>('3.Chấm buổi');
  const [headerRow, setHeaderRow] = useState<number>(2);

  const [finalEnabled, setFinalEnabled] = useState<boolean>(true);
  const [finalSheetName, setFinalSheetName] = useState<string>('Điểm danh chốt');
  const [finalHeaderRow, setFinalHeaderRow] = useState<number>(2);

  // Filter & Schedule & Security
  const [backupYear, setBackupYear] = useState<number | null>(new Date().getFullYear());
  const [enabled, setEnabled] = useState<boolean>(true);
  const [scheduleTimes, setScheduleTimes] = useState<string[]>(['12:00', '21:00']);
  const [customTime, setCustomTime] = useState<string>('');
  const [requirePrivateSheet, setRequirePrivateSheet] = useState<boolean>(true);
  const [maskSensitiveData, setMaskSensitiveData] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingConfig) {
      const pt = String(editingConfig.program_type || 'KAIWA').toUpperCase();
      setProgramType(pt);
      setCsUserId(editingConfig.cs_user_id || '');
      setName(editingConfig.name || '');
      const url = editingConfig.target_spreadsheet_url || '';
      setTargetUrl(url);
      setActiveDestTab(url.trim() ? 'GOOGLE_SHEET' : 'LOCAL_SERVER');

      const parsedPath = parseRelativeBackupPath(
        editingConfig.local_backup_path,
        pt,
        editingConfig.cs_user?.staff_code
      );
      setSubfolder(parsedPath.subfolder);
      setFileBaseName(parsedPath.fileBaseName);
      setKeepDailySnapshots(Boolean(editingConfig.keep_daily_snapshots));
      setMaxSnapshots(editingConfig.max_snapshots || 7);

      setProfileEnabled(editingConfig.profile_enabled ?? pt !== 'TEACHER');
      setProfileSheetName(
        editingConfig.profile_sheet_name ||
          (pt.includes('JLPT') ? 'Data JLPT_Inhouse' : '1.Chăm sóc')
      );
      setProfileHeaderRow(editingConfig.profile_header_row || (pt.includes('KAIWA') ? 3 : 2));

      setSheetName(editingConfig.sheet_name || '3.Chấm buổi');
      setHeaderRow(editingConfig.header_row || 2);

      setFinalEnabled(editingConfig.final_enabled ?? pt !== 'TEACHER');
      setFinalSheetName(editingConfig.final_sheet_name || 'Điểm danh chốt');
      setFinalHeaderRow(editingConfig.final_header_row || 2);

      setBackupYear(editingConfig.backup_year ?? null);
      setEnabled(Boolean(editingConfig.enabled));
      setScheduleTimes(
        Array.isArray(editingConfig.schedule_times) && editingConfig.schedule_times.length > 0
          ? editingConfig.schedule_times
          : ['12:00', '21:00']
      );
      setRequirePrivateSheet(editingConfig.require_private_sheet ?? true);
      setMaskSensitiveData(Boolean(editingConfig.mask_sensitive_data));
    } else {
      const def = PROGRAM_TYPE_OPTIONS[0];
      const defaultStaff = csUsers[0]?.staff_code || 'CVHT01';
      setProgramType(def.value);
      setCsUserId(csUsers[0]?.id || '');
      setName('Backup KAIWA - Sổ mới');
      setTargetUrl('');
      setActiveDestTab('GOOGLE_SHEET');
      setSubfolder(defaultSubfolderByProgram(def.value));
      setFileBaseName(defaultFileBaseByProgram(def.value, defaultStaff));
      setKeepDailySnapshots(false);
      setMaxSnapshots(7);
      setProfileEnabled(true);
      setProfileSheetName(def.defaultProfileSheet);
      setProfileHeaderRow(def.defaultProfileHeader);
      setSheetName(def.defaultAttSheet);
      setHeaderRow(2);
      setFinalEnabled(true);
      setFinalSheetName(def.defaultFinalSheet);
      setFinalHeaderRow(2);
      setBackupYear(new Date().getFullYear());
      setEnabled(true);
      setScheduleTimes(['12:00', '21:00']);
      setRequirePrivateSheet(true);
      setMaskSensitiveData(false);
    }
  }, [isOpen, editingConfig, csUsers]);

  const handleProgramTypeChange = (nextPt: string) => {
    setProgramType(nextPt);
    const meta = PROGRAM_TYPE_OPTIONS.find((o) => o.value === nextPt);
    if (!meta) return;
    setProfileEnabled(Boolean(meta.defaultProfileSheet));
    setProfileSheetName(meta.defaultProfileSheet);
    setProfileHeaderRow(meta.defaultProfileHeader);
    setSheetName(meta.defaultAttSheet);
    setFinalEnabled(Boolean(meta.defaultFinalSheet));
    setFinalSheetName(meta.defaultFinalSheet || 'Điểm danh chốt');
    if (!isEditing) {
      setName(meta.label);
      const selectedStaff =
        csUsers.find((u) => u.id === Number(csUserId))?.staff_code || 'CVHT01';
      setSubfolder(defaultSubfolderByProgram(nextPt));
      setFileBaseName(defaultFileBaseByProgram(nextPt, selectedStaff));
    }
  };

  const toggleTimeSlot = (slot: string) => {
    setScheduleTimes((prev) =>
      prev.includes(slot) ? prev.filter((t) => t !== slot) : [...prev, slot].sort()
    );
  };

  const handleAddCustomTime = () => {
    const clean = customTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(clean)) {
      toast.warning('Nhập giờ theo định dạng HH:mm (VD: 13:30)');
      return;
    }
    const [hh, mm] = clean.split(':');
    const formatted = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
    if (!scheduleTimes.includes(formatted)) {
      setScheduleTimes((prev) => [...prev, formatted].sort());
    }
    setCustomTime('');
  };

  const sanitizedBaseName =
    fileBaseName
      .trim()
      .replace(/\.xlsx$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 100) || defaultFileBaseByProgram(programType, editingConfig?.cs_user?.staff_code);

  const previewRelativePath = `backups/${subfolder}/${sanitizedBaseName}.xlsx`;

  const handleSubmit = async () => {
    const payload: UpdateCsSheetBackupConfigDTO = {
      name: name.trim() || undefined,
      target_spreadsheet_url: targetUrl.trim() || null,
      ...(canManage
        ? {
            local_backup_path: previewRelativePath,
            keep_daily_snapshots: keepDailySnapshots,
            max_snapshots: Math.min(Math.max(Number(maxSnapshots) || 7, 1), 60),
          }
        : {}),
      profile_enabled: profileEnabled,
      profile_sheet_name: profileSheetName.trim() || undefined,
      profile_header_row: Number(profileHeaderRow) || 2,
      sheet_name: sheetName.trim() || undefined,
      header_row: Number(headerRow) || 2,
      final_enabled: finalEnabled,
      final_sheet_name: finalSheetName.trim() || undefined,
      final_header_row: Number(finalHeaderRow) || 2,
      backup_year: backupYear,
      enabled,
      schedule_times: scheduleTimes,
      require_private_sheet: requirePrivateSheet,
      mask_sensitive_data: maskSensitiveData,
    };

    try {
      setSaving(true);
      let saved: CsSheetBackupConfigItem;
      if (editingConfig) {
        saved = await importsApi.updateSheetBackupConfig(editingConfig.id, payload);
        toast.success(`Đã lưu cấu hình cho "${saved.name}"`);
      } else {
        saved = await importsApi.createSheetBackupConfig({
          ...payload,
          program_type: programType,
          cs_user_id: csUserId ? Number(csUserId) : undefined,
        });
        toast.success(`Đã tạo/cập nhật sổ backup "${saved.name}"`);
      }
      onSaved(saved);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message ||
          err?.response?.data?.message ||
          'Không thể lưu cấu hình backup'
      );
    } finally {
      setSaving(false);
    }
  };

  const isTeacher =
    programType === 'TEACHER' || programType.startsWith('GV:');
  const isSpecialSingleOrDual =
    programType === 'ADMIN_RECONCILIATION' ||
    programType === 'REPORT_KAIWA' ||
    programType === 'REPORT_JLPT';

  const yearsList = Array.from(new Set([2024, 2025, 2026, 2027, ...availableYears])).sort(
    (a, b) => a - b
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isEditing
          ? `Cấu hình nguồn Backup: ${editingConfig?.name || ''}`
          : 'Thêm / Cấu hình nguồn Backup mới'
      }
      size="lg"
    >
      <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
        {/* 1. Loại nguồn & Tên sổ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Loại sổ &amp; Chương trình
            </label>
            <select
              value={programType}
              disabled={isEditing}
              onChange={(e) => handleProgramTypeChange(e.target.value)}
              className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
            >
              {PROGRAM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tên hiển thị sổ Backup
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Backup KAIWA - CVHT01"
              className="h-9 text-xs"
            />
          </div>

          {!isEditing &&
            canManage &&
            (programType === 'KAIWA' || programType === 'JLPT') &&
            csUsers.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Nhân viên CSKH phụ trách
                </label>
                <select
                  value={csUserId}
                  onChange={(e) => setCsUserId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  {csUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.staff_code ? `${u.staff_code} — ` : ''}
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
        </div>

        {/* 2. Đích kết nối dữ liệu Backup (2 Tabs giống cấu hình trang Đồng bộ) */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Nguồn kết nối dữ liệu Backup
            </span>
            <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
              <button
                type="button"
                onClick={() => setActiveDestTab('GOOGLE_SHEET')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDestTab === 'GOOGLE_SHEET'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Dán Link Google Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveDestTab('LOCAL_SERVER')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeDestTab === 'LOCAL_SERVER'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Lưu File trên máy chủ (.xlsx)</span>
              </button>
            </div>
          </div>

          {activeDestTab === 'GOOGLE_SHEET' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Google Sheet đích
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1abcXYZ.../edit"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!targetUrl.trim()}
                    onClick={() =>
                      window.open(
                        targetUrl.trim(),
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Mở Sheet</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <span>
                  Hệ thống tự động ghi file chuẩn{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-semibold">
                    {previewRelativePath}
                  </code>{' '}
                  trước, sau đó đẩy các ô thay đổi (delta) lên Google Sheet.
                </span>
                <button
                  type="button"
                  onClick={() => setActiveDestTab('LOCAL_SERVER')}
                  className="text-blue-600 font-semibold hover:underline cursor-pointer shrink-0"
                >
                  Cấu hình thư mục .xlsx →
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 px-3.5 py-2 flex items-center justify-between gap-2 text-[11px] text-emerald-800">
                <div className="flex items-center gap-2">
                  <FolderLock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Sandbox bảo mật máy chủ:</strong> Chỉ cho phép lưu trong phân vùng{' '}
                    <code className="font-mono font-bold">backups/*</code> (chặn tuyệt đối{' '}
                    <code className="font-mono">../</code> &amp; symlink ngoài vùng).
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Phân vùng thư mục con (Whitelist)
                  </label>
                  <select
                    value={subfolder}
                    disabled={!canManage}
                    onChange={(e) => setSubfolder(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {ALLOWED_SUBFOLDERS.map((sf) => (
                      <option key={sf.value} value={sf.value}>
                        {sf.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-7">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên file chuẩn trên máy chủ (chỉ nhận chữ, số, _, -)
                  </label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={fileBaseName}
                      disabled={!canManage}
                      onChange={(e) => setFileBaseName(e.target.value)}
                      placeholder="hoc_vien_kaiwa_CVHT01"
                      className="w-full h-9 px-3 rounded-l-xl border border-r-0 border-slate-200 bg-white text-xs font-mono text-slate-800 disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:border-blue-500"
                    />
                    <span className="h-9 px-3 inline-flex items-center rounded-r-xl border border-slate-200 bg-slate-100 text-xs font-mono font-bold text-slate-600">
                      .xlsx
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="text-slate-600">
                  Đường dẫn lưu chuẩn:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-semibold">
                    {previewRelativePath}
                  </code>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={keepDailySnapshots}
                      disabled={!canManage}
                      onChange={(e) => setKeepDailySnapshots(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>Lưu thêm bản lịch sử theo ngày (_YYYY-MM-DD.xlsx)</span>
                  </label>

                  {keepDailySnapshots && (
                    <div className="inline-flex items-center gap-1">
                      <span className="text-slate-500">Giữ tối đa:</span>
                      <select
                        value={maxSnapshots}
                        disabled={!canManage}
                        onChange={(e) => setMaxSnapshots(Number(e.target.value))}
                        className="h-7 px-2 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
                      >
                        <option value={7}>7 bản</option>
                        <option value={14}>14 bản</option>
                        <option value={30}>30 bản</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Cấu hình các Sheet bên trong File */}
        <div className="p-3.5 rounded-xl border border-slate-200 space-y-3">
          <div className="font-bold text-slate-900">
            Cấu hình các Sheet (Tab) được ghi trong File &amp; Google Sheet
          </div>

          {/* Sheet 1: Hồ sơ */}
          {!isTeacher && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <label className="sm:col-span-4 inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profileEnabled}
                  onChange={(e) => setProfileEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Sheet 1 (Hồ sơ / Tổng hợp)</span>
              </label>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={profileSheetName}
                  disabled={!profileEnabled}
                  onChange={(e) => setProfileSheetName(e.target.value)}
                  placeholder="Tên Sheet 1"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium disabled:bg-slate-100"
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 shrink-0">Header dòng:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={profileHeaderRow}
                  disabled={!profileEnabled}
                  onChange={(e) => setProfileHeaderRow(Math.max(1, Number(e.target.value) || 2))}
                  className="w-16 h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-center"
                />
              </div>
            </div>
          )}

          {/* Sheet 2: Chấm buổi / Lịch dạy / Báo cáo */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="sm:col-span-4 font-semibold text-slate-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {isTeacher
                  ? 'Sheet Lịch dạy GV'
                  : programType.startsWith('ADMIN_')
                  ? 'Sheet 2 (Báo cáo / Lệch)'
                  : 'Sheet 2 (Chấm buổi CS)'}
              </span>
            </div>
            <div className="sm:col-span-5">
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Tên Sheet điểm danh"
                className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
              />
            </div>
            <div className="sm:col-span-3 flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 shrink-0">Header dòng:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={headerRow}
                onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 2))}
                className="w-16 h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-center"
              />
            </div>
          </div>

          {/* Sheet 3: Điểm danh chốt */}
          {!isTeacher && !isSpecialSingleOrDual && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
              <label className="sm:col-span-4 inline-flex items-center gap-2 font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={finalEnabled}
                  onChange={(e) => setFinalEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Sheet 3 (Điểm danh chốt)</span>
              </label>
              <div className="sm:col-span-5">
                <input
                  type="text"
                  value={finalSheetName}
                  disabled={!finalEnabled}
                  onChange={(e) => setFinalSheetName(e.target.value)}
                  placeholder="Điểm danh chốt"
                  className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium disabled:bg-slate-100"
                />
              </div>
              <div className="sm:col-span-3 flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 shrink-0">Header dòng:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={finalHeaderRow}
                  disabled={!finalEnabled}
                  onChange={(e) => setFinalHeaderRow(Math.max(1, Number(e.target.value) || 2))}
                  className="w-16 h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold text-center"
                />
              </div>
            </div>
          )}
        </div>

        {/* 4. Năm Backup & Lịch chạy tự động */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
            <label className="block font-bold text-slate-900">
              Phạm vi Năm điểm danh mặc định
            </label>
            <select
              value={backupYear === null ? 'ALL' : String(backupYear)}
              onChange={(e) =>
                setBackupYear(e.target.value === 'ALL' ? null : Number(e.target.value))
              }
              className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
            >
              <option value="ALL">Tất cả các năm</option>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  Năm {y} (Tạo tab Điểm danh chốt {y})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Với sổ Admin Master, hệ thống tự động ghi vào tab <code className="font-mono">Điểm danh chốt &lt;Năm&gt;</code>.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Chạy Backup Tự động</span>
              </span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>{enabled ? 'Đang BẬT' : 'Đang TẮT'}</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_SCHEDULE_SLOTS.map((slot) => {
                const active = scheduleTimes.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!enabled}
                    onClick={() => toggleTimeSlot(slot)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    } disabled:opacity-50`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={customTime}
                disabled={!enabled}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder="Thêm giờ (VD: 14:00)"
                className="h-7 px-2 rounded-lg border border-slate-200 text-xs font-mono flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!enabled || !customTime.trim()}
                onClick={handleAddCustomTime}
              >
                + Giờ
              </Button>
            </div>
          </div>
        </div>

        {/* 5. Bảo mật */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requirePrivateSheet}
              onChange={(e) => setRequirePrivateSheet(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span className="font-semibold text-slate-800">
              Chặn ghi nếu Google Sheet đang mở Public (Anyone with link)
            </span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={maskSensitiveData}
              onChange={(e) => setMaskSensitiveData(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span className="font-semibold text-slate-800">
              Che một phần SĐT &amp; Email học viên
            </span>
          </label>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={saving}
            leftIcon={<Check className="w-3.5 h-3.5" />}
          >
            {isEditing ? 'Lưu cấu hình' : 'Tạo nguồn Backup'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default BackupConfigModal;
