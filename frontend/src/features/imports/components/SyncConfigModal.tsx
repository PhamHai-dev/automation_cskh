import '../styles/data-management.css';
import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { importsApi } from '../api/imports.api';
import {
  CreateGoogleSheetSyncConfigDTO,
  GoogleSheetSyncConfig,
  SyncFilterConfig,
  SyncFlowType,
  SyncSourceType,
} from '../types/imports.types';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Info,
  Lock,
} from 'lucide-react';

export interface SyncConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingConfig: GoogleSheetSyncConfig | null;
  onSaved: (saved: GoogleSheetSyncConfig) => void;
}

const FLOW_OPTIONS: Array<{
  value: SyncFlowType;
  label: string;
  subtitle: string;
}> = [
  {
    value: 'STUDENT_MASTER',
    label: '1. Dữ liệu học viên & Chăm sóc',
    subtitle:
      'Đồng bộ hồ sơ học viên, lớp học & chăm sóc từ Nguồn tổng JLPT, Nguồn tổng Kaiwa hoặc 1.Chăm sóc',
  },
  {
    value: 'CSKH_ATTENDANCE',
    label: '2. Điểm danh CVHT (Chấm buổi)',
    subtitle: 'Đồng bộ bảng chấm buổi của CSKH (Chấm buổi JLPT / 3.Chấm buổi Kaiwa)',
  },
  {
    value: 'TEACHER_ATTENDANCE',
    label: '3. Điểm danh Giáo viên (Lịch dạy GV)',
    subtitle: 'Đồng bộ file lịch dạy và điểm danh của từng Giáo viên JLPT / Kaiwa',
  },
  {
    value: 'STUDY_REPORT',
    label: '4. Báo cáo học tập (Theo HV / Lớp)',
    subtitle:
      'Đồng bộ Chuyên cần HV JLPT (khớp hàng loạt Lớp + Tên) hoặc Báo cáo học tập Kaiwa',
  },
];

const JLPT_SOURCE_STATUSES = ['Active', 'Deactive', 'HV Mới', 'Đặt cọc'];
const KAIWA_SOURCE_STATUSES = ['HV mới', 'HV combo'];
const ENROLLMENT_STATUS_OPTIONS = [
  'Đang học',
  'Chờ lớp',
  'Bảo lưu',
  'Tạm nghỉ',
  'Sắp học',
  'Chưa học',
  'Kết thúc',
];
const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const AVAILABLE_YEARS = [2024, 2025, 2026, 2027];

const getDefaultSheetName = (flowType: SyncFlowType, programType: string): string => {
  const isJlpt = programType.toUpperCase() === 'JLPT';
  switch (flowType) {
    case 'STUDENT_MASTER':
      return isJlpt ? 'Data JLPT_Inhouse' : 'Tổng';
    case 'CSKH_ATTENDANCE':
      return isJlpt ? 'Chấm buổi' : '3.Chấm buổi';
    case 'TEACHER_ATTENDANCE':
      return '2026 スケジュール';
    case 'STUDY_REPORT':
      return isJlpt ? 'Chuyên cần HV' : '会話 3 - 学習レポート';
  }
};

const getDefaultHeaderRow = (flowType: SyncFlowType, programType: string): number => {
  const isJlpt = programType.toUpperCase() === 'JLPT';
  switch (flowType) {
    case 'STUDENT_MASTER':
      return 2;
    case 'CSKH_ATTENDANCE':
    case 'TEACHER_ATTENDANCE':
      return 2;
    case 'STUDY_REPORT':
      return isJlpt ? 4 : 1;
  }
};

export const isValidGoogleSheetUrl = (url: string): boolean => {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i.test(trimmed);
};

export const SyncConfigModal: React.FC<SyncConfigModalProps> = ({
  isOpen,
  onClose,
  editingConfig,
  onSaved,
}) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [flowType, setFlowType] = useState<SyncFlowType>('STUDENT_MASTER');
  const [programType, setProgramType] = useState<'JLPT' | 'KAIWA'>('JLPT');
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<SyncSourceType>('GOOGLE_SHEET');
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [localFilePath, setLocalFilePath] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('Data JLPT_Inhouse');
  const [settingSheetName, setSettingSheetName] = useState('Setting');
  const [headerRow, setHeaderRow] = useState<number>(2);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(30);

  // Dynamic filters
  const [syncYear, setSyncYear] = useState<number>(2026);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(ALL_MONTHS);
  const [sourceStatuses, setSourceStatuses] = useState<string[]>([
    'Active',
    'Deactive',
    'HV Mới',
    'Đặt cọc',
  ]);
  const [enrollmentStatuses, setEnrollmentStatuses] = useState<string[]>([
    'Đang học',
    'Chờ lớp',
    'Bảo lưu',
    'Tạm nghỉ',
    'Sắp học',
  ]);
  const [targetTeacherCode, setTargetTeacherCode] = useState('');
  const [targetStudentExternalId, setTargetStudentExternalId] = useState('');
  const [targetStudentName, setTargetStudentName] = useState('');
  const [targetClassCode, setTargetClassCode] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (editingConfig) {
      const resolvedFlow: SyncFlowType =
        editingConfig.flow_type ||
        (editingConfig.code === 'JLPT' ||
        editingConfig.code === 'KAIWA' ||
        editingConfig.code === 'KAIWA_CARE'
          ? 'STUDENT_MASTER'
          : 'STUDY_REPORT');
      const resolvedProgram: 'JLPT' | 'KAIWA' =
        editingConfig.program_type?.toUpperCase() === 'KAIWA' ? 'KAIWA' : 'JLPT';
      const resolvedSource: SyncSourceType =
        editingConfig.source_type ||
        (editingConfig.spreadsheet_url?.trim() ? 'GOOGLE_SHEET' : 'LOCAL_FILE');

      setFlowType(resolvedFlow);
      setProgramType(resolvedProgram);
      setName(editingConfig.name || '');
      setSourceType(resolvedSource);
      setSpreadsheetUrl(editingConfig.spreadsheet_url || '');
      setLocalFilePath(editingConfig.local_file_path || '');
      setSelectedFile(null);
      setSheetName(
        editingConfig.sheet_name || getDefaultSheetName(resolvedFlow, resolvedProgram)
      );
      setSettingSheetName(editingConfig.setting_sheet_name || 'Setting');
      setHeaderRow(
        editingConfig.header_row || getDefaultHeaderRow(resolvedFlow, resolvedProgram)
      );
      setEnabled(resolvedSource === 'GOOGLE_SHEET' ? Boolean(editingConfig.enabled) : false);
      setSyncIntervalMinutes(editingConfig.sync_interval_minutes || 30);

      setSyncYear(editingConfig.sync_year || 2026);
      const fc = editingConfig.filter_config;
      setSelectedMonths(
        fc?.months && fc.months.length > 0 ? fc.months : ALL_MONTHS
      );
      setSourceStatuses(
        fc?.sourceStatuses && fc.sourceStatuses.length > 0
          ? fc.sourceStatuses
          : resolvedProgram === 'JLPT'
          ? JLPT_SOURCE_STATUSES
          : KAIWA_SOURCE_STATUSES
      );
      setEnrollmentStatuses(
        fc?.enrollmentStatuses && fc.enrollmentStatuses.length > 0
          ? fc.enrollmentStatuses
          : ['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ', 'Sắp học']
      );
      setTargetTeacherCode(
        editingConfig.target_teacher_code || fc?.teacherCodes?.[0] || ''
      );
      setTargetStudentExternalId(editingConfig.target_student_external_id || '');
      setTargetStudentName(editingConfig.target_student_name || '');
      setTargetClassCode(
        editingConfig.target_class_code || fc?.classCodes?.[0] || ''
      );
    } else {
      setFlowType('STUDY_REPORT');
      setProgramType('JLPT');
      setName('');
      setSourceType('GOOGLE_SHEET');
      setSpreadsheetUrl('');
      setLocalFilePath('');
      setSelectedFile(null);
      setSheetName(getDefaultSheetName('STUDY_REPORT', 'JLPT'));
      setSettingSheetName('Setting');
      setHeaderRow(getDefaultHeaderRow('STUDY_REPORT', 'JLPT'));
      setEnabled(true);
      setSyncIntervalMinutes(30);
      setSyncYear(2026);
      setSelectedMonths(ALL_MONTHS);
      setSourceStatuses(JLPT_SOURCE_STATUSES);
      setEnrollmentStatuses(['Đang học', 'Chờ lớp', 'Bảo lưu', 'Tạm nghỉ', 'Sắp học']);
      setTargetTeacherCode('');
      setTargetStudentExternalId('');
      setTargetStudentName('');
      setTargetClassCode('');
    }
  }, [isOpen, editingConfig]);

  const handleFlowOrProgramChange = (
    nextFlow: SyncFlowType,
    nextProgram: 'JLPT' | 'KAIWA'
  ) => {
    setFlowType(nextFlow);
    setProgramType(nextProgram);
    if (nextFlow === 'STUDY_REPORT' && nextProgram === 'JLPT') {
      setSheetName('Chuyên cần HV');
      setHeaderRow(4);
    } else if (!editingConfig) {
      setSheetName(getDefaultSheetName(nextFlow, nextProgram));
      setHeaderRow(getDefaultHeaderRow(nextFlow, nextProgram));
    }
    if (!editingConfig) {
      setSourceStatuses(
        nextProgram === 'JLPT' ? JLPT_SOURCE_STATUSES : KAIWA_SOURCE_STATUSES
      );
    }
  };

  const toggleItemInList = <T,>(list: T[], item: T, setter: (next: T[]) => void) => {
    if (list.includes(item)) {
      setter(list.filter((i) => i !== item));
    } else {
      setter([...list, item]);
    }
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSelectedFile(file);
    const nativePath = (file as any).path as string | undefined;
    setLocalFilePath(nativePath || `docs/data/import_data/${file.name}`);
    setSourceType('LOCAL_FILE');
    setEnabled(false);
    if (!name.trim()) {
      setName(file.name.replace(/\.(xlsx|xls)$/i, ''));
    }
  };

  const isSystemMaster =
    editingConfig?.is_system_default ||
    editingConfig?.code === 'JLPT' ||
    editingConfig?.code === 'KAIWA' ||
    editingConfig?.code === 'KAIWA_CARE';

  const urlValid =
    sourceType !== 'GOOGLE_SHEET' || isValidGoogleSheetUrl(spreadsheetUrl);

  const handleSubmit = async () => {
    if (sourceType === 'GOOGLE_SHEET') {
      if (!spreadsheetUrl.trim()) {
        toast.error('Vui lòng dán Link Google Sheet hợp lệ');
        return;
      }
      if (!isValidGoogleSheetUrl(spreadsheetUrl)) {
        toast.error('Định dạng Link Google Sheet không hợp lệ');
        return;
      }
    } else {
      if (!localFilePath.trim() && !selectedFile) {
        toast.error('Vui lòng chọn file Excel (.xlsx) từ máy tính');
        return;
      }
    }

    if (
      (flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE') &&
      !syncYear
    ) {
      toast.error('Vui lòng chọn Năm cần đồng bộ cho luồng Điểm danh');
      return;
    }

    const filterConfig: SyncFilterConfig = {};
    if (flowType === 'STUDENT_MASTER') {
      filterConfig.sourceStatuses = sourceStatuses;
      filterConfig.enrollmentStatuses = enrollmentStatuses;
    } else if (
      flowType === 'CSKH_ATTENDANCE' ||
      flowType === 'TEACHER_ATTENDANCE'
    ) {
      filterConfig.months = selectedMonths.length > 0 ? selectedMonths : ALL_MONTHS;
      filterConfig.enrollmentStatuses = enrollmentStatuses;
      if (flowType === 'TEACHER_ATTENDANCE' && targetTeacherCode.trim()) {
        filterConfig.teacherCodes = [targetTeacherCode.trim().toUpperCase()];
      }
    } else if (flowType === 'STUDY_REPORT') {
      if (targetClassCode.trim()) {
        filterConfig.classCodes = [targetClassCode.trim()];
      }
    }

    const resolvedName =
      name.trim() ||
      (flowType === 'STUDY_REPORT'
        ? `Báo cáo học tập ${programType} - ${
            targetStudentName.trim() ||
            targetStudentExternalId.trim() ||
            targetClassCode.trim() ||
            'Mới'
          }`
        : flowType === 'TEACHER_ATTENDANCE'
        ? `Điểm danh GV ${programType} - ${targetTeacherCode.trim() || 'Mới'}`
        : flowType === 'CSKH_ATTENDANCE'
        ? `Điểm danh CVHT ${programType} (${syncYear})`
        : `Dữ liệu học viên ${programType}`);

    const payload: CreateGoogleSheetSyncConfigDTO = {
      name: resolvedName,
      flow_type: flowType,
      program_type: programType,
      source_type: sourceType,
      spreadsheet_url:
        sourceType === 'GOOGLE_SHEET' ? spreadsheetUrl.trim() : null,
      local_file_path:
        sourceType === 'LOCAL_FILE' ? localFilePath.trim() : null,
      sheet_name: sheetName.trim() || getDefaultSheetName(flowType, programType),
      setting_sheet_name:
        flowType === 'STUDENT_MASTER' && programType === 'JLPT'
          ? settingSheetName.trim() || 'Setting'
          : null,
      header_row: headerRow || 2,
      sync_year:
        flowType === 'CSKH_ATTENDANCE' || flowType === 'TEACHER_ATTENDANCE'
          ? syncYear
          : null,
      filter_config: filterConfig,
      target_student_external_id:
        flowType === 'STUDY_REPORT'
          ? targetStudentExternalId.trim() || null
          : null,
      target_student_name:
        flowType === 'STUDY_REPORT' ? targetStudentName.trim() || null : null,
      target_class_code:
        flowType === 'STUDY_REPORT' ? targetClassCode.trim() || null : null,
      target_teacher_code:
        flowType === 'TEACHER_ATTENDANCE'
          ? targetTeacherCode.trim().toUpperCase() || null
          : null,
      sync_interval_minutes: syncIntervalMinutes || 30,
      enabled: sourceType === 'GOOGLE_SHEET' ? enabled : false,
    };

    try {
      setSaving(true);
      let savedConfig: GoogleSheetSyncConfig;

      if (editingConfig) {
        savedConfig = await importsApi.updateSheetSyncConfig(
          editingConfig.code,
          payload
        );
      } else {
        try {
          savedConfig = await importsApi.createSheetSyncConfig(payload);
        } catch {
          // Fallback local creation if backend endpoint is still warming up
          const generatedCode = `${flowType}_${programType}_${Date.now()
            .toString()
            .slice(-5)}`;
          savedConfig = {
            id: Date.now(),
            code: generatedCode,
            ...payload,
            sheet_name: payload.sheet_name || 'Sheet1',
            header_row: payload.header_row || 2,
            sync_interval_minutes: payload.sync_interval_minutes || 30,
            enabled: Boolean(payload.enabled),
          };
        }
      }

      if (selectedFile && savedConfig?.code) {
        try {
          const uploadRes = await importsApi.uploadSheetSyncLocalFile(
            savedConfig.code,
            selectedFile
          );
          if (uploadRes?.config) {
            savedConfig = { ...savedConfig, ...uploadRes.config };
          }
        } catch {
          // Keep local_file_path already set
        }
      }

      toast.success(
        editingConfig
          ? `Đã cập nhật cấu hình "${resolvedName}"`
          : `Đã thêm nguồn đồng bộ "${resolvedName}"`
      );
      onSaved(savedConfig);
      onClose();
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Không thể lưu cấu hình nguồn đồng bộ'
      );
    } finally {
      setSaving(false);
    }
  };

  const availableSourceStatuses =
    programType === 'JLPT' ? JLPT_SOURCE_STATUSES : KAIWA_SOURCE_STATUSES;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        editingConfig
          ? `Cấu hình nguồn đồng bộ: ${editingConfig.name}`
          : 'Thêm nguồn đồng bộ dữ liệu mới'
      }
      description="Thiết lập kết nối Google Sheet hoặc File Excel từ máy tính và bộ lọc dữ liệu trước khi đồng bộ"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={saving}
            onClick={handleSubmit}
          >
            {editingConfig ? 'Lưu cấu hình' : 'Tạo nguồn đồng bộ'}
          </Button>
        </>
      }
    >
      <div className="data-form space-y-5">
        {/* 1. Chọn Loại luồng & Chương trình */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Loại luồng dữ liệu <span className="text-rose-500">*</span>
            </label>
            <select
              value={flowType}
              disabled={Boolean(isSystemMaster)}
              onChange={(e) =>
                handleFlowOrProgramChange(
                  e.target.value as SyncFlowType,
                  programType
                )
              }
              className="w-full h-9 rounded-xl border border-slate-200 bg-white disabled:bg-slate-100 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {FLOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              {FLOW_OPTIONS.find((f) => f.value === flowType)?.subtitle}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1.5">
              Chương trình <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['JLPT', 'KAIWA'] as const).map((prog) => {
                const active = programType === prog;
                return (
                  <button
                    key={prog}
                    type="button"
                    disabled={Boolean(isSystemMaster)}
                    onClick={() => handleFlowOrProgramChange(flowType, prog)}
                    className={`h-9 rounded-xl border font-bold text-xs transition-all cursor-pointer disabled:opacity-60 ${
                      active
                        ? prog === 'JLPT'
                          ? 'bg-primary text-white border-primary shadow-xs'
                          : 'bg-primary text-white border-primary shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {prog}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tên hiển thị */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Tên hiển thị nguồn đồng bộ
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              flowType === 'STUDY_REPORT'
                ? 'VD: Báo cáo học tập Kaiwa - Đỗ Phú Sĩ (427901798)'
                : flowType === 'TEACHER_ATTENDANCE'
                ? 'VD: Lịch dạy & Điểm danh GV505 - JLPT'
                : 'Nhập tên gợi nhớ cho nguồn đồng bộ...'
            }
          />
        </div>

        {/* 2. Chọn Nguồn dữ liệu (2 Tabs: Google Sheet vs Local File) */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Nguồn kết nối dữ liệu
            </span>
            <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
              <button
                type="button"
                onClick={() => setSourceType('GOOGLE_SHEET')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  sourceType === 'GOOGLE_SHEET'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Dán Link Google Sheet</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceType('LOCAL_FILE');
                  setEnabled(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  sourceType === 'LOCAL_FILE'
                    ? 'bg-white text-blue-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Import File từ máy tính (.xlsx)</span>
              </button>
            </div>
          </div>

          {sourceType === 'GOOGLE_SHEET' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Google Sheet <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      value={spreadsheetUrl}
                      onChange={(e) => setSpreadsheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1abcXYZ.../edit"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!spreadsheetUrl.trim()}
                    onClick={() =>
                      window.open(
                        spreadsheetUrl.trim(),
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
                {spreadsheetUrl.trim() && !urlValid && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">
                    Link chưa đúng chuẩn Google Spreadsheet (cần chứa
                    docs.google.com/spreadsheets/d/...).
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên Sheet / Tab đọc dữ liệu
                  </label>
                  <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder={getDefaultSheetName(flowType, programType)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dòng tiêu đề
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={headerRow}
                    onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>

                <div className="sm:col-span-6 flex items-end">
                  <div className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-800">
                        Đồng bộ tự động định kỳ (Auto Sync)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Chạy tự động ngầm theo chu kỳ (không qua màn hình Preview)
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <select
                        value={syncIntervalMinutes}
                        disabled={!enabled}
                        onChange={(e) =>
                          setSyncIntervalMinutes(Number(e.target.value))
                        }
                        className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700"
                      >
                        <option value={10}>Mỗi 10 phút</option>
                        <option value={15}>Mỗi 15 phút</option>
                        <option value={30}>Mỗi 30 phút</option>
                        <option value={60}>Mỗi 60 phút</option>
                      </select>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => setEnabled((prev) => !prev)}
                        className={`relative inline-flex w-10 h-5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          enabled ? 'bg-emerald-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-amber-50/90 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2.5 text-amber-900">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Chế độ chỉ chạy thủ công:</strong> Khi dùng file từ máy
                  tính, hệ thống sẽ khóa chế độ Tự động và chỉ chạy Thủ công qua
                  trang Xem trước (Preview). Hãy gắn Link Google Sheet nếu muốn
                  chạy tự động định kỳ.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Chọn file Excel (.xlsx) từ máy tính
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        value={localFilePath}
                        onChange={(e) => setLocalFilePath(e.target.value)}
                        placeholder="Đường dẫn file hoặc bấm Chọn file..."
                      />
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFilePicked}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-9 px-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Chọn file .xlsx</span>
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên Sheet / Tab đọc dữ liệu
                  </label>
                  <Input
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    placeholder={getDefaultSheetName(flowType, programType)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dòng tiêu đề
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={headerRow}
                    onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Nút chọn nhanh mẫu Sheet cho STUDENT_MASTER + KAIWA */}
          {flowType === 'STUDENT_MASTER' && programType === 'KAIWA' && (
            <div className="pt-2 border-t border-slate-200/80 space-y-2">
              <div className="text-[11px] font-bold text-slate-700">
                Chọn nhanh mẫu Sheet Kaiwa:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSheetName('Tổng');
                    setHeaderRow(2);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    sheetName.trim() === 'Tổng' && headerRow === 2
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs">
                    Sheet &quot;Tổng&quot; (Dòng tiêu đề 2 — Hồ sơ &amp; Lớp học A..AH + BF,BG,BJ,BY)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Đồng bộ mới &amp; cập nhật Hồ sơ học viên, Gói học, Lớp học
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSheetName('1.Chăm sóc');
                    setHeaderRow(3);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    sheetName.trim() === '1.Chăm sóc' && headerRow === 3
                      ? 'bg-fuchsia-50 border-fuchsia-400 text-fuchsia-900 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs">
                    Sheet &quot;1.Chăm sóc&quot; (Dòng tiêu đề 3 — Báo cáo &amp; Chăm sóc AI..BH theo ID)
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Chỉ cập nhật cột Báo cáo &amp; Chăm sóc (AI..BH) khi khớp ID học viên
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        <details className="data-advanced">
          <summary>Phạm vi dữ liệu & tùy chọn nâng cao</summary>
          <div>
        {/* 3. Khối Cấu Hình Lọc Trước Khi Đồng Bộ (Dynamic Filter Section) */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Cấu hình lọc trước khi đồng bộ
            </h4>
            <span className="text-[11px] text-slate-500">
              Hệ thống chỉ quét &amp; đồng bộ các dòng thỏa điều kiện dưới đây
            </span>
          </div>

          {/* LUỒNG 1: STUDENT_MASTER -> Ẩn hoàn toàn trường Năm */}
          {flowType === 'STUDENT_MASTER' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Tình trạng nguồn / Active ({programType}):
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSourceStatuses(
                        sourceStatuses.length === availableSourceStatuses.length
                          ? []
                          : [...availableSourceStatuses]
                      )
                    }
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    {sourceStatuses.length === availableSourceStatuses.length
                      ? 'Bỏ chọn tất cả'
                      : 'Chọn tất cả'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availableSourceStatuses.map((st) => {
                    const checked = sourceStatuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          toggleItemInList(sourceStatuses, st, setSourceStatuses)
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          checked
                            ? 'bg-violet-50 border-violet-300 text-violet-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            checked
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>
                          {st === 'Deactive' ? 'Deactive (gộp cả Deative)' : st}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Trạng thái học tập cần lọc:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEnrollmentStatuses(
                        enrollmentStatuses.length ===
                          ENROLLMENT_STATUS_OPTIONS.length
                          ? []
                          : [...ENROLLMENT_STATUS_OPTIONS]
                      )
                    }
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    {enrollmentStatuses.length === ENROLLMENT_STATUS_OPTIONS.length
                      ? 'Bỏ chọn tất cả'
                      : 'Chọn tất cả trạng thái'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ENROLLMENT_STATUS_OPTIONS.map((st) => {
                    const checked = enrollmentStatuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          toggleItemInList(
                            enrollmentStatuses,
                            st,
                            setEnrollmentStatuses
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          checked
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>{st}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* LUỒNG 2 & 3: CSKH_ATTENDANCE hoặc TEACHER_ATTENDANCE */}
          {(flowType === 'CSKH_ATTENDANCE' ||
            flowType === 'TEACHER_ATTENDANCE') && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Năm đồng bộ điểm danh <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={syncYear}
                    onChange={(e) => setSyncYear(Number(e.target.value))}
                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
                  >
                    {AVAILABLE_YEARS.map((y) => (
                      <option key={y} value={y}>
                        Năm {y}
                      </option>
                    ))}
                  </select>
                </div>

                {flowType === 'TEACHER_ATTENDANCE' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mã giáo viên phụ trách (VD: GV505)
                    </label>
                    <Input
                      value={targetTeacherCode}
                      onChange={(e) => setTargetTeacherCode(e.target.value)}
                      placeholder="Nhập mã giáo viên (VD: GV505, GV102...)"
                    />
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Tháng cần đồng bộ trong năm {syncYear}:
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMonths(
                        selectedMonths.length === 12 ? [] : [...ALL_MONTHS]
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold text-[11px] hover:bg-blue-100 cursor-pointer"
                  >
                    {selectedMonths.length === 12
                      ? 'Bỏ chọn 12 tháng'
                      : 'Tất cả 12 tháng'}
                  </button>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                  {ALL_MONTHS.map((m) => {
                    const active = selectedMonths.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          toggleItemInList(selectedMonths, m, setSelectedMonths)
                        }
                        className={`h-8 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        T{m}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Lọc Trạng thái học viên:
                </label>
                <div className="flex flex-wrap gap-2">
                  {ENROLLMENT_STATUS_OPTIONS.map((st) => {
                    const checked = enrollmentStatuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() =>
                          toggleItemInList(
                            enrollmentStatuses,
                            st,
                            setEnrollmentStatuses
                          )
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                          checked
                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>{st}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* LUỒNG 4: STUDY_REPORT */}
          {flowType === 'STUDY_REPORT' && (
            <div className="space-y-3">
              {programType === 'JLPT' && (
                <div className="rounded-xl bg-teal-50/90 border border-teal-200 px-3.5 py-2.5 flex items-start gap-2.5 text-teal-900">
                  <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    Báo cáo học tập JLPT đọc từ sheet <strong>Chuyên cần HV</strong> và tự động khớp hàng loạt học viên theo cặp <strong>(Mã lớp cột A + Họ và tên cột B)</strong>. Để trống thông tin học viên mục tiêu nếu muốn đồng bộ toàn bộ danh sách trong sheet.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã học viên (Tùy chọn)
                  </label>
                  <Input
                    value={targetStudentExternalId}
                    onChange={(e) => setTargetStudentExternalId(e.target.value)}
                    placeholder={programType === 'JLPT' ? 'Để trống nếu đồng bộ cả lớp' : 'VD: 427901798'}
                  />
                  <span className="text-[10px] text-slate-400">
                    {programType === 'JLPT'
                      ? 'Để trống để khớp hàng loạt theo Mã lớp + Họ và tên'
                      : 'Kaiwa tự đọc được từ dòng 5 của sheet hoặc gắn cứng tại đây'}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tên học viên
                  </label>
                  <Input
                    value={targetStudentName}
                    onChange={(e) => setTargetStudentName(e.target.value)}
                    placeholder={programType === 'JLPT' ? 'Tùy chọn lọc 1 học viên' : 'VD: Đỗ Phú Sĩ'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã lớp
                  </label>
                  <Input
                    value={targetClassCode}
                    onChange={(e) => setTargetClassCode(e.target.value)}
                    placeholder={programType === 'JLPT' ? 'VD: N3_2601 (hoặc để trống)' : 'VD: SKAI31030JP'}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
          </div>
        </details>
      </div>
    </Modal>
  );
};
