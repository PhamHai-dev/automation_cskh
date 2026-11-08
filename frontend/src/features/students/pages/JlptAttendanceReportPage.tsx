import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { studentsApi } from '../api/students.api';
import {
  JlptAttendanceReportRow,
  UpdateJlptAttendanceReportDTO,
} from '../types/students.types';
import { FilterBar } from '../../../components/common/FilterBar';
import { PaginationFooter } from '../../../components/common/Pagination';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuery } from '../../../hooks/useQuery';
import {
  Search,
  CheckCircle2,
  Edit,
  Lock,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

interface InlineEditCellProps {
  value: string | number | null | undefined;
  type?: 'text' | 'number';
  step?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  align?: 'left' | 'center' | 'right';
  onSave: (newVal: string) => Promise<void>;
  className?: string;
}

export const InlineEditCell: React.FC<InlineEditCellProps> = ({
  value,
  type = 'text',
  step,
  min,
  max,
  disabled = false,
  placeholder = '—',
  multiline = false,
  align = 'left',
  onSave,
  className = '',
}) => {
  const [editing, setEditing] = useState(false);
  const strValue = value !== null && value !== undefined ? String(value) : '';
  const [draft, setDraft] = useState(strValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value !== null && value !== undefined ? String(value) : '');
  }, [value]);

  const alignClass =
    align === 'center'
      ? 'text-center justify-center'
      : align === 'right'
      ? 'text-right justify-end'
      : 'text-left justify-between';

  if (disabled) {
    return (
      <div
        className={`p-1.5 rounded-lg min-h-[28px] flex items-center gap-1 text-xs text-slate-700 ${alignClass} ${className}`}
        title={strValue ? `${strValue} (Chỉ xem)` : 'Chỉ xem'}
      >
        <span className={strValue ? 'font-medium text-slate-700' : 'text-slate-400'}>
          {strValue || placeholder}
        </span>
      </div>
    );
  }

  const commit = async () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === strValue.trim()) return;
    try {
      setSaving(true);
      await onSave(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setDraft(strValue);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    if (multiline) {
      return (
        <div className="min-w-[180px] p-0.5">
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setEditing(false);
                setDraft(strValue);
              }
            }}
            placeholder={placeholder}
            className="w-full text-xs p-1.5 bg-white border-2 border-primary rounded-lg focus:outline-none shadow-md resize-none text-slate-800"
          />
        </div>
      );
    }

    return (
      <input
        autoFocus
        type={type}
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(false);
            setDraft(strValue);
          }
        }}
        placeholder={placeholder}
        className={`w-full min-w-[60px] text-xs p-1 bg-white border-2 border-primary rounded-lg focus:outline-none shadow-md font-semibold text-slate-800 ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        }`}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click để chỉnh sửa trực tiếp"
      className={`group cursor-pointer p-1.5 rounded-lg transition-all min-h-[28px] flex items-center gap-1 hover:bg-blue-50/70 hover:ring-1 hover:ring-blue-300 ${alignClass} ${className}`}
    >
      <span
        className={`text-xs ${
          strValue ? 'font-semibold text-slate-800' : 'text-slate-400'
        } ${multiline ? 'truncate max-w-[200px]' : ''}`}
      >
        {strValue || placeholder}
      </span>
      {saving ? (
        <span className="text-[10px] text-primary font-bold animate-pulse shrink-0">...</span>
      ) : saved ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      ) : (
        <Edit className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-blue-600" />
      )}
    </div>
  );
};

const COURSE_TRACK_OPTIONS = [
  { value: '', label: 'Tất cả khoá' },
  { value: 'N5', label: 'N5' },
  { value: 'N4', label: 'N4' },
  { value: 'N3', label: 'N3' },
  { value: 'N2', label: 'N2' },
  { value: 'N4-LuyenDe', label: 'N4-LuyenDe' },
  { value: 'N3-LuyenDe', label: 'N3-LuyenDe' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'STUDYING', label: 'Đang học' },
  { value: 'WAITING_CLASS', label: 'Chờ lớp' },
  { value: 'PAUSED', label: 'Bảo lưu' },
  { value: 'FINISHED', label: 'Kết thúc' },
];

const WARNING_FILTER_OPTIONS = [
  { value: 'ALL', label: 'Tất cả cảnh báo' },
  { value: 'ABSENT_WARN', label: '⚠ Vắng liên tiếp ≥2 buổi' },
  { value: 'NO_HW_WARN', label: '⚠ Không làm bài ≥2 buổi' },
  { value: 'MISSING_SCORE', label: '❗ Chưa có đủ điểm KT' },
  { value: 'UPCOMING_EXAM', label: '🔔 Sắp kiểm tra (≤2 buổi)' },
  { value: 'LOW_ATTENDANCE', label: 'Chuyên cần < 70%' },
];

export const renderAttendanceRateCell = (rate: number | null) => {
  if (rate === null || rate === undefined || Number.isNaN(Number(rate))) {
    return <span className="text-slate-400 text-xs">—</span>;
  }
  const pct = Math.round(Number(rate) * 100);
  if (pct < 70) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
        {pct}%
      </span>
    );
  }
  if (pct < 85) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
        {pct}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">
      {pct}%
    </span>
  );
};

export const renderExamWarningBadge = (warning: string) => {
  if (!warning) return <span className="text-slate-400 text-xs">—</span>;
  if (warning.startsWith('❗')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200 whitespace-nowrap">
        {warning}
      </span>
    );
  }
  if (warning.startsWith('🔔')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 whitespace-nowrap">
        {warning}
      </span>
    );
  }
  if (warning.startsWith('✅')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
        {warning}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 whitespace-nowrap">
      {warning}
    </span>
  );
};

/**
 * Reusable 22-column Chuyên cần HV table component used in both:
 * 1. Dashboard tab `jlpt_attendance` (all JLPT students in scope)
 * 2. StudentStudyReportPage (single JLPT student row)
 */
export interface JlptChuyenCanTableProps {
  rows: JlptAttendanceReportRow[];
  isLoading?: boolean;
  onUpdateRow: (
    row: JlptAttendanceReportRow,
    payload: UpdateJlptAttendanceReportDTO
  ) => Promise<void>;
  onRowNameClick?: (row: JlptAttendanceReportRow) => void;
  startIndex?: number;
}

export const JlptChuyenCanTable: React.FC<JlptChuyenCanTableProps> = ({
  rows,
  isLoading = false,
  onUpdateRow,
  onRowNameClick,
  startIndex = 0,
}) => {
  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-text-muted">
        Đang tải dữ liệu Chuyên cần HV...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-14 text-center space-y-2">
        <BookOpen className="w-9 h-9 text-text-muted mx-auto opacity-50" />
        <div className="font-semibold text-sm text-text-primary">
          Chưa có học viên JLPT nào
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          {/* Row 1: Group Headers (giống dòng 3 sheet Chuyên cần HV) */}
          <tr className="bg-slate-100 text-text-secondary border-b border-border/80 text-[11px] font-bold uppercase tracking-wider text-center">
            <th
              colSpan={3}
              className="sticky left-0 z-30 bg-slate-100 border-r-2 border-border/80 px-3 py-2 text-slate-800 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]"
            >
              Học viên
            </th>
            <th
              colSpan={3}
              className="bg-blue-50/80 text-blue-900 border-r border-border/80 px-3 py-2"
            >
              A. CHUYÊN CẦN
            </th>
            <th
              colSpan={2}
              className="bg-indigo-50/80 text-indigo-900 border-r border-border/80 px-3 py-2"
            >
              B. BÀI TẬP VỀ NHÀ
            </th>
            <th
              colSpan={4}
              className="bg-amber-50/80 text-amber-900 border-r border-border/80 px-3 py-2"
            >
              C. CẢNH BÁO LIÊN TIẾP
            </th>
            <th colSpan={4} className="bg-slate-100 border-r border-border/80 px-3 py-2" />
            <th colSpan={7} className="bg-teal-50/70 text-teal-900 px-3 py-2" />
          </tr>

          {/* Row 2: 22 Column Headers (giống dòng 4 sheet Chuyên cần HV) */}
          <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold text-center">
            <th className="sticky left-0 z-30 px-2 py-3 border-r border-border/60 bg-slate-100 w-10 min-w-[40px] max-w-[40px] whitespace-nowrap">
              #
            </th>
            {/* 1. Mã lớp */}
            <th className="sticky left-10 z-30 px-3 py-3 border-r border-border/60 bg-slate-100 text-left w-[115px] min-w-[115px] max-w-[115px] whitespace-nowrap">
              Mã lớp
            </th>
            {/* 2. Họ và tên */}
            <th className="sticky left-[155px] z-30 px-3 py-3 border-r-2 border-border/80 bg-slate-100 text-left w-[185px] min-w-[185px] max-w-[185px] whitespace-nowrap shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
              Họ và tên
            </th>
            {/* 3. Số buổi tham gia */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[110px] whitespace-nowrap">
              Số buổi tham gia
            </th>
            {/* 4. Tổng số buổi đã điểm danh */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[140px] whitespace-nowrap">
              Tổng số buổi đã điểm danh
            </th>
            {/* 5. Tỷ lệ tham gia */}
            <th className="px-3 py-3 border-r border-border/80 min-w-[105px] whitespace-nowrap">
              Tỷ lệ tham gia
            </th>
            {/* 6. Điểm KT trung bình */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[120px] whitespace-nowrap">
              Điểm KT trung bình
            </th>
            {/* 7. Số buổi đã làm bài */}
            <th className="px-3 py-3 border-r border-border/80 min-w-[120px] whitespace-nowrap">
              Số buổi đã làm bài
            </th>
            {/* 8. Chuỗi vắng liên tiếp tối đa */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[145px] whitespace-nowrap">
              Chuỗi vắng liên tiếp tối đa
            </th>
            {/* 9. Cảnh báo vắng (≥2 buổi) */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[155px] whitespace-nowrap">
              Cảnh báo vắng (≥2 buổi)
            </th>
            {/* 10. Chuỗi không làm bài liên tiếp tối đa */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[175px] whitespace-nowrap">
              Chuỗi không làm bài liên tiếp tối đa
            </th>
            {/* 11. Cảnh báo không làm bài (≥2 buổi) */}
            <th className="px-3 py-3 border-r border-border/80 min-w-[175px] whitespace-nowrap">
              Cảnh báo không làm bài (≥2 buổi)
            </th>
            {/* 12. Thông tin trao đổi với HV */}
            <th className="px-3 py-3 border-r border-border/60 text-left min-w-[210px] whitespace-nowrap">
              Thông tin trao đổi với HV
            </th>
            {/* 13. Trạng Thái */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[115px] whitespace-nowrap">
              Trạng Thái
            </th>
            {/* 14. CVHT */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[90px] whitespace-nowrap">
              CVHT
            </th>
            {/* 15. Khoá */}
            <th className="px-3 py-3 border-r border-border/80 min-w-[95px] whitespace-nowrap">
              Khoá
            </th>
            {/* 16. KT gần nhất (đã qua) */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[115px] whitespace-nowrap">
              KT gần nhất (đã qua)
            </th>
            {/* 17. Buổi KT gần nhất */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[110px] whitespace-nowrap">
              Buổi KT gần nhất
            </th>
            {/* 18. Cách đây (buổi) */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[105px] whitespace-nowrap">
              Cách đây (buổi)
            </th>
            {/* 19. KT tiếp theo */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[105px] whitespace-nowrap">
              KT tiếp theo
            </th>
            {/* 20. Buổi KT tiếp theo */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[110px] whitespace-nowrap">
              Buổi KT tiếp theo
            </th>
            {/* 21. Còn (buổi) */}
            <th className="px-3 py-3 border-r border-border/60 min-w-[90px] whitespace-nowrap">
              Còn (buổi)
            </th>
            {/* 22. Cảnh báo lịch KT */}
            <th className="px-3 py-3 min-w-[230px] whitespace-nowrap">
              Cảnh báo lịch KT
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rIdx) => {
            const stickyBg = rIdx % 2 === 1 ? 'bg-slate-50' : 'bg-surface';

            return (
              <tr
                key={`${row.student_id}-${row.enrollment_id}`}
                className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                  rIdx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                }`}
              >
                {/* # */}
                <td
                  className={`sticky left-0 z-20 ${stickyBg} px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold w-10 min-w-[40px]`}
                >
                  {startIndex + rIdx + 1}
                </td>

                {/* 1. Mã lớp */}
                <td
                  className={`sticky left-10 z-20 ${stickyBg} px-3 py-2.5 border-r border-border/60 font-mono font-bold text-indigo-700 whitespace-nowrap w-[115px] min-w-[115px] max-w-[115px] overflow-hidden`}
                >
                  {row.class_code || '—'}
                </td>

                {/* 2. Họ và tên */}
                <td
                  className={`sticky left-[155px] z-20 ${stickyBg} px-3 py-2.5 border-r-2 border-border/80 w-[185px] min-w-[185px] max-w-[185px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] overflow-hidden`}
                >
                  <div className="flex items-center justify-between gap-1">
                    {onRowNameClick ? (
                      <button
                        type="button"
                        onClick={() => onRowNameClick(row)}
                        className="font-bold text-text-primary hover:text-primary text-left truncate max-w-[155px] cursor-pointer"
                        title={row.full_name}
                      >
                        {row.full_name}
                      </button>
                    ) : (
                      <span
                        className="font-bold text-text-primary truncate max-w-[155px]"
                        title={row.full_name}
                      >
                        {row.full_name}
                      </span>
                    )}
                    {row.is_readonly && (
                      <span title="Chỉ xem">
                        <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                      </span>
                    )}
                  </div>
                </td>

                {/* 3. Số buổi tham gia */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <InlineEditCell
                    value={row.attended_sessions}
                    type="number"
                    min={0}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          attended_sessions: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 4. Tổng số buổi đã điểm danh */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <InlineEditCell
                    value={row.total_marked_sessions}
                    type="number"
                    min={0}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          total_marked_sessions: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 5. Tỷ lệ tham gia */}
                <td className="px-3 py-2.5 border-r border-border/80 text-center">
                  {renderAttendanceRateCell(row.attendance_rate)}
                </td>

                {/* 6. Điểm KT trung bình */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <InlineEditCell
                    value={row.average_exam_score}
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          average_exam_score: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 7. Số buổi đã làm bài */}
                <td className="px-2 py-2 border-r border-border/80 text-center">
                  <InlineEditCell
                    value={row.homework_completed_sessions}
                    type="number"
                    min={0}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          homework_completed_sessions: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 8. Chuỗi vắng liên tiếp tối đa */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <InlineEditCell
                    value={row.max_consecutive_absent}
                    type="number"
                    min={0}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          max_consecutive_absent: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 9. Cảnh báo vắng (≥2 buổi) */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center">
                  {row.absent_warning ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                      {row.absent_warning}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>

                {/* 10. Chuỗi không làm bài liên tiếp tối đa */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <InlineEditCell
                    value={row.max_consecutive_no_homework}
                    type="number"
                    min={0}
                    align="center"
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        overrides: {
                          max_consecutive_no_homework: val === '' ? null : Number(val),
                        },
                      })
                    }
                  />
                </td>

                {/* 11. Cảnh báo không làm bài (≥2 buổi) */}
                <td className="px-3 py-2.5 border-r border-border/80 text-center">
                  {row.no_homework_warning ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                      {row.no_homework_warning}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>

                {/* 12. Thông tin trao đổi với HV */}
                <td className="px-2.5 py-2 border-r border-border/60">
                  <InlineEditCell
                    value={row.exchange_info}
                    multiline
                    placeholder="Nhập trao đổi..."
                    disabled={row.is_readonly}
                    onSave={(val) =>
                      onUpdateRow(row, {
                        exchange_info: val,
                      })
                    }
                  />
                </td>

                {/* 13. Trạng Thái */}
                <td className="px-2 py-2 border-r border-border/60 text-center">
                  <select
                    disabled={row.is_readonly}
                    value={row.status || 'STUDYING'}
                    onChange={(e) => onUpdateRow(row, { status: e.target.value })}
                    className={`text-[11px] font-semibold rounded-lg px-2 py-1 border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer ${
                      row.status === 'STUDYING'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : row.status === 'PAUSED'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : row.status === 'FINISHED'
                        ? 'bg-slate-100 text-slate-700 border-slate-300'
                        : 'bg-blue-50 text-blue-800 border-blue-200'
                    }`}
                  >
                    <option value="STUDYING">Đang học</option>
                    <option value="WAITING_CLASS">Chờ lớp</option>
                    <option value="PAUSED">Bảo lưu</option>
                    <option value="FINISHED">Kết thúc</option>
                  </select>
                </td>

                {/* 14. CVHT */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center">
                  <span
                    className="inline-block font-mono font-bold text-[11px] text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded whitespace-nowrap"
                    title={row.cs_name || row.cvht_code}
                  >
                    {row.cvht_code || '—'}
                  </span>
                </td>

                {/* 15. Khoá */}
                <td className="px-3 py-2.5 border-r border-border/80 text-center font-mono font-semibold text-teal-800 whitespace-nowrap">
                  {row.course_track || '—'}
                </td>

                {/* 16. KT gần nhất (đã qua) */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-semibold text-text-primary whitespace-nowrap">
                  {row.last_exam_name || '—'}
                </td>

                {/* 17. Buổi KT gần nhất */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-mono text-text-secondary whitespace-nowrap">
                  {row.last_exam_session !== null && row.last_exam_session !== undefined
                    ? row.last_exam_session
                    : '—'}
                </td>

                {/* 18. Cách đây (buổi) */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-mono text-text-secondary whitespace-nowrap">
                  {row.sessions_since_last_exam !== null &&
                  row.sessions_since_last_exam !== undefined
                    ? row.sessions_since_last_exam
                    : '—'}
                </td>

                {/* 19. KT tiếp theo */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-semibold text-indigo-700 whitespace-nowrap">
                  {row.next_exam_name || '—'}
                </td>

                {/* 20. Buổi KT tiếp theo */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-mono text-text-secondary whitespace-nowrap">
                  {row.next_exam_session !== null && row.next_exam_session !== undefined
                    ? row.next_exam_session
                    : '—'}
                </td>

                {/* 21. Còn (buổi) */}
                <td className="px-3 py-2.5 border-r border-border/60 text-center font-mono font-bold text-text-primary whitespace-nowrap">
                  {row.sessions_until_next_exam !== null &&
                  row.sessions_until_next_exam !== undefined
                    ? row.sessions_until_next_exam
                    : '—'}
                </td>

                {/* 22. Cảnh báo lịch KT */}
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  {renderExamWarningBadge(row.exam_schedule_warning)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Dashboard Tab Panel: Chuyên cần HV (JLPT)
 */
export const JlptAttendanceReportTabPanel: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdminOrManage = Boolean(
    user?.roles?.some((r) => r === 'ADMIN' || r === 'MANAGE')
  );

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const debouncedSearch = useDebouncedValue(searchTerm.trim(), 300);
  const [classCodeFilter, setClassCodeFilter] = useState(
    () => searchParams.get('class_code') || ''
  );
  const [courseTrackFilter, setCourseTrackFilter] = useState(
    () => searchParams.get('course_track') || ''
  );
  const [statusFilter, setStatusFilter] = useState(
    () => searchParams.get('jlpt_status') || ''
  );
  const [warningFilter, setWarningFilter] = useState(
    () => searchParams.get('warning_filter') || 'ALL'
  );
  const [cvhtFilter, setCvhtFilter] = useState(() => searchParams.get('cvht') || '');
  const [page, setPage] = useState<number>(
    () => Math.max(1, Number(searchParams.get('page')) || 1)
  );
  const [pageSize, setPageSize] = useState<number>(() => {
    const ps = Number(searchParams.get('pageSize'));
    return [25, 50, 100, 200].includes(ps) ? ps : 50;
  });

  // Reset page on filter changes
  const isFirstRender = React.useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [
    debouncedSearch,
    classCodeFilter,
    courseTrackFilter,
    statusFilter,
    warningFilter,
    cvhtFilter,
  ]);

  // Sync filters to URL while preserving `tab=jlpt_attendance`
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'jlpt_attendance');
    if (searchTerm.trim()) next.set('search', searchTerm.trim());
    else next.delete('search');
    if (classCodeFilter) next.set('class_code', classCodeFilter);
    else next.delete('class_code');
    if (courseTrackFilter) next.set('course_track', courseTrackFilter);
    else next.delete('course_track');
    if (statusFilter) next.set('jlpt_status', statusFilter);
    else next.delete('jlpt_status');
    if (warningFilter && warningFilter !== 'ALL') next.set('warning_filter', warningFilter);
    else next.delete('warning_filter');
    if (isAdminOrManage && cvhtFilter) next.set('cvht', cvhtFilter);
    else next.delete('cvht');
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    if (pageSize !== 50) next.set('pageSize', String(pageSize));
    else next.delete('pageSize');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    searchTerm,
    classCodeFilter,
    courseTrackFilter,
    statusFilter,
    warningFilter,
    cvhtFilter,
    page,
    pageSize,
    isAdminOrManage,
    searchParams,
    setSearchParams,
  ]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      class_code: classCodeFilter || undefined,
      course_track: courseTrackFilter || undefined,
      status: statusFilter || undefined,
      warning_filter: warningFilter !== 'ALL' ? warningFilter : undefined,
      cvht: isAdminOrManage && cvhtFilter ? cvhtFilter : undefined,
    }),
    [
      page,
      pageSize,
      debouncedSearch,
      classCodeFilter,
      courseTrackFilter,
      statusFilter,
      warningFilter,
      cvhtFilter,
      isAdminOrManage,
    ]
  );

  const {
    data: reportResponse,
    isLoading,
    isFetching,
    refetch,
    mutateData,
  } = useQuery({
    queryKey: ['jlpt-attendance-report', queryParams],
    queryFn: (signal) => studentsApi.getJlptAttendanceReport(queryParams, signal),
    staleTime: 20 * 1000,
    keepPreviousData: true,
    onError: (err: any) => {
      toast.error(
        err.response?.data?.error?.message ||
          'Không thể tải dữ liệu báo cáo chuyên cần JLPT'
      );
    },
  });

  const rows: JlptAttendanceReportRow[] = useMemo(
    () => reportResponse?.data || [],
    [reportResponse]
  );
  const meta = reportResponse?.meta;
  const total = meta?.total ?? rows.length;
  const totalPages = meta?.totalPages ?? Math.max(1, Math.ceil(total / pageSize));

  const classCodeOptions = useMemo(() => {
    const set = new Set<string>([
      ...(meta?.filterOptions?.classCodes || []),
      ...(meta?.filterOptions?.classList || []),
    ]);
    rows.forEach((r) => {
      if (r.class_code && r.class_code !== '—') set.add(r.class_code);
    });
    if (classCodeFilter) set.add(classCodeFilter);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi-VN'));
  }, [meta, rows, classCodeFilter]);

  const cvhtOptions = useMemo(() => {
    const set = new Set<string>([
      'CVHT01',
      'CVHT02',
      'CVHT03',
      ...(meta?.filterOptions?.cvhtList || []),
    ]);
    rows.forEach((r) => {
      if (r.cvht_code && r.cvht_code !== '—') set.add(r.cvht_code.toUpperCase());
    });
    if (cvhtFilter) set.add(cvhtFilter.toUpperCase());
    return Array.from(set).sort();
  }, [meta, rows, cvhtFilter]);

  const activeFiltersCount =
    (searchTerm.trim() ? 1 : 0) +
    (classCodeFilter ? 1 : 0) +
    (courseTrackFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (warningFilter !== 'ALL' ? 1 : 0) +
    (isAdminOrManage && cvhtFilter ? 1 : 0);

  const handleResetFilters = () => {
    setSearchTerm('');
    setClassCodeFilter('');
    setCourseTrackFilter('');
    setStatusFilter('');
    setWarningFilter('ALL');
    setCvhtFilter('');
    setPage(1);
  };

  const handleUpdateRow = async (
    row: JlptAttendanceReportRow,
    payload: UpdateJlptAttendanceReportDTO
  ) => {
    try {
      const updated = await studentsApi.updateJlptAttendanceReport(row.student_id, {
        enrollment_id: row.enrollment_id,
        ...payload,
      });
      mutateData((prev) => {
        if (!prev) return prev as any;
        return {
          ...prev,
          data: prev.data.map((r) =>
            r.student_id === row.student_id && r.enrollment_id === row.enrollment_id
              ? updated
              : r
          ),
        };
      });
      toast.success(`Đã lưu cập nhật của ${row.full_name}`);
    } catch (err: any) {
      toast.error(
        err.response?.data?.error?.message ||
          'Không thể lưu cập nhật báo cáo chuyên cần JLPT'
      );
      throw err;
    }
  };

  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <FilterBar
        title="Tìm kiếm & Lọc nhanh"
        activeCount={activeFiltersCount}
        onClear={handleResetFilters}
        gridClassName={`grid grid-cols-1 sm:grid-cols-2 ${
          isAdminOrManage ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
        } gap-3.5 items-end`}
      >
        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Tìm học viên
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tên, mã HV, mã lớp..."
              className="w-full h-9 pl-9 pr-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Mã lớp
          </label>
          <select
            value={classCodeFilter}
            onChange={(e) => setClassCodeFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <option value="">Tất cả lớp</option>
            {classCodeOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Khoá
          </label>
          <select
            value={courseTrackFilter}
            onChange={(e) => setCourseTrackFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {COURSE_TRACK_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Trạng thái
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            Cảnh báo
          </label>
          <select
            value={warningFilter}
            onChange={(e) => setWarningFilter(e.target.value)}
            className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            {WARNING_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isAdminOrManage && (
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              CVHT
            </label>
            <select
              value={cvhtFilter}
              onChange={(e) => setCvhtFilter(e.target.value)}
              className="w-full h-9 px-3 border border-border rounded-xl text-sm bg-white text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
            >
              <option value="">Tất cả CVHT</option>
              {cvhtOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        )}
      </FilterBar>

      {/* Main Table Card (Chuẩn cấu trúc bảng chung của web) */}
      <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-text-secondary">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
              <span>Hiển thị:</span>
              <span className="font-extrabold text-primary">{rows.length}</span>
              <span className="text-text-muted">/ {total} học viên JLPT</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              title="Làm mới dữ liệu"
              className="px-2.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-primary' : ''}`}
              />
            </Button>
          </div>
        </div>

        <JlptChuyenCanTable
          rows={rows}
          isLoading={isLoading}
          onUpdateRow={handleUpdateRow}
          startIndex={(page - 1) * pageSize}
          onRowNameClick={(row) =>
            navigate(`/students/${row.student_id}/study-report`, {
              state: { from: '/dashboard?tab=jlpt_attendance' },
            })
          }
        />

        {!isLoading && total > 0 && (
          <PaginationFooter
            startRecord={startRecord}
            endRecord={endRecord}
            totalCount={total}
            pageSize={pageSize}
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            recordLabel="học viên"
          />
        )}
      </div>
    </div>
  );
};

export const JlptAttendanceReportPage: React.FC = () => {
  return <JlptAttendanceReportTabPanel />;
};
