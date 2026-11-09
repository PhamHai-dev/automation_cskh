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
  const [targetUrl, setTargetUrl] = useState<string>('');

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
      setTargetUrl(editingConfig.target_spreadsheet_url || '');

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
      setProgramType(def.value);
      setCsUserId(csUsers[0]?.id || '');
      setName('Backup KAIWA - Sổ mới');
      setTargetUrl('');
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

  const handleSubmit = async () => {
    const payload: UpdateCsSheetBackupConfigDTO = {
      name: name.trim() || undefined,
      target_spreadsheet_url: targetUrl.trim() || null,
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

        {/* 2. Link Google Sheet đích */}
        <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Link Google Sheet đích (Tùy chọn)</span>
            </label>
            {targetUrl.trim() && (
              <a
                href={targetUrl.trim()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline"
              >
                <span>Mở Sheet kiểm tra</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/1abc..."
            className="h-9 text-xs font-mono"
          />
          <p className="text-[11px] text-slate-500">
            Nếu để trống, hệ thống vẫn xuất sẵn file Excel chuẩn (<code className="font-mono">.xlsx</code>) trên server để tải về bất cứ lúc nào.
          </p>
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
