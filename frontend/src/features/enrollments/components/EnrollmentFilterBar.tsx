import React, { useState, useMemo } from 'react';
import {
  EnrollmentFilterState,
  CourseCategory,
  FilterOperator,
  KAIWA_LEVEL_OPTIONS,
  JNPT_LEVEL_OPTIONS,
} from '../types/enrollmentFilter.types';
import { Button } from '../../../components/ui/Button';
import {
  Search,
  SlidersHorizontal,
  RotateCcw,
  Users,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface EnrollmentFilterBarProps {
  filters: EnrollmentFilterState;
  onChange: (updater: (prev: EnrollmentFilterState) => EnrollmentFilterState) => void;
  onReset: () => void;
  salesList: string[];
  packagesList: string[];
  teachersList: string[];
  teacherCodesList: string[];
  classesList: string[];
  isCS?: boolean;
}

export const EnrollmentFilterBar: React.FC<EnrollmentFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  salesList,
  packagesList,
  teachersList,
  teacherCodesList,
  classesList,
  isCS = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Helper to update individual filter field
  const setField = <K extends keyof EnrollmentFilterState>(
    field: K,
    val: EnrollmentFilterState[K]
  ) => {
    onChange((prev) => ({ ...prev, [field]: val }));
  };

  // Count active filters
  const { totalActiveCount, advancedActiveCount } = useMemo(() => {
    let advancedCount = 0;
    let totalCount = 0;

    if (filters.searchQuery) totalCount++;
    if (filters.packageName) totalCount++;
    if (filters.statusFilter) totalCount++;
    if (filters.modelFilter) totalCount++;

    if (filters.courseCategory !== 'ALL') {
      advancedCount++;
      totalCount++;
    }
    if (filters.courseLevel) {
      advancedCount++;
      totalCount++;
    }

    // Total sessions
    if (filters.totalSessionsOp === 'EXACT') {
      if (filters.totalSessionsExact !== '') {
        advancedCount++;
        totalCount++;
      }
    } else {
      if (filters.totalSessionsMin !== '' || filters.totalSessionsMax !== '') {
        advancedCount++;
        totalCount++;
      }
    }

    // Attended sessions
    if (filters.attendedSessionsOp === 'EXACT') {
      if (filters.attendedSessionsExact !== '') {
        advancedCount++;
        totalCount++;
      }
    } else {
      if (filters.attendedSessionsMin !== '' || filters.attendedSessionsMax !== '') {
        advancedCount++;
        totalCount++;
      }
    }

    // Remaining sessions
    if (filters.remainingSessionsOp === 'EXACT') {
      if (filters.remainingSessionsExact !== '') {
        advancedCount++;
        totalCount++;
      }
    } else {
      if (filters.remainingSessionsMin !== '' || filters.remainingSessionsMax !== '') {
        advancedCount++;
        totalCount++;
      }
    }

    if (filters.teacherName) {
      advancedCount++;
      totalCount++;
    }
    if (filters.teacherCode) {
      advancedCount++;
      totalCount++;
    }
    if (filters.className) {
      advancedCount++;
      totalCount++;
    }
    if (filters.selectedSale) {
      advancedCount++;
      totalCount++;
    }

    // Start date
    if (filters.startDateOp === 'EXACT') {
      if (filters.startDateExact) {
        advancedCount++;
        totalCount++;
      }
    } else {
      if (filters.startDateFrom || filters.startDateTo) {
        advancedCount++;
        totalCount++;
      }
    }

    // End date
    if (filters.endDateOp === 'EXACT') {
      if (filters.endDateExact) {
        advancedCount++;
        totalCount++;
      }
    } else {
      if (filters.endDateFrom || filters.endDateTo) {
        advancedCount++;
        totalCount++;
      }
    }

    if (filters.schedulePattern) {
      advancedCount++;
      totalCount++;
    }
    if (filters.startTime) {
      advancedCount++;
      totalCount++;
    }

    return { totalActiveCount: totalCount, advancedActiveCount: advancedCount };
  }, [filters]);

  const hasAnyFilter = totalActiveCount > 0;

  // Level options based on current category
  const levelOptions = useMemo(() => {
    if (filters.courseCategory === 'KAIWA') return KAIWA_LEVEL_OPTIONS;
    if (filters.courseCategory === 'JNPT') return JNPT_LEVEL_OPTIONS;
    return [...KAIWA_LEVEL_OPTIONS, ...JNPT_LEVEL_OPTIONS];
  }, [filters.courseCategory]);

  return (
    <div className="mb-4 rounded-2xl border border-border/80 bg-surface p-3 sm:p-4 shadow-soft transition-all">
      {/* ------------------------------------------------------------- */}
      {/* TẦNG 1: QUICK SEARCH & BASIC FILTERS                          */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search input: ID, Name, Phone, Email */}
        <div className="relative min-w-[200px] flex-1">
          <input
            type="text"
            placeholder="Tìm theo Mã HV, Họ tên, SĐT, Email..."
            value={filters.searchQuery}
            onChange={(e) => setField('searchQuery', e.target.value)}
            className="h-10 w-full rounded-xl border border-border/80 bg-surface pl-9 pr-3 text-xs font-semibold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Tìm kiếm học viên"
          />
          <Search className="absolute left-3 top-3 h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>

        {/* Tìm kiếm / Lọc Gói học */}
        <div className="min-w-[150px] flex-initial">
          <select
            value={filters.packageName}
            onChange={(e) => setField('packageName', e.target.value)}
            aria-label="Lọc theo Gói học"
            className="h-10 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tất cả Gói học</option>
            {packagesList.map((pkg) => (
              <option key={pkg} value={pkg}>
                {pkg}
              </option>
            ))}
          </select>
        </div>

        {/* Lọc Trạng thái ghi danh */}
        <div className="min-w-[140px] flex-initial">
          <select
            value={filters.statusFilter}
            onChange={(e) => setField('statusFilter', e.target.value)}
            aria-label="Lọc theo trạng thái"
            className="h-10 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="STUDYING">Đang học</option>
            <option value="WAITING_CLASS">Chờ lớp</option>
            <option value="PAUSED">Bảo lưu</option>
            <option value="FINISHED">Kết thúc</option>
            <option value="UPCOMING">Sắp học</option>
            <option value="NOT_STARTED">Chưa học</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </div>

        {/* Lọc Mô hình lớp */}
        <div className="min-w-[125px] flex-initial">
          <select
            value={filters.modelFilter}
            onChange={(e) => setField('modelFilter', e.target.value)}
            aria-label="Lọc theo mô hình"
            className="h-10 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tất cả mô hình</option>
            <option value="1:1">Mô hình 1:1</option>
            <option value="1:2">Mô hình 1:2</option>
            <option value="1:n">Mô hình 1:n</option>
          </select>
        </div>

        {/* Nút Toggle Bộ lọc nâng cao */}
        <Button
          type="button"
          variant={showAdvanced ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setShowAdvanced((prev) => !prev)}
          className="h-10 shrink-0 gap-1.5 px-3 text-xs font-bold"
          leftIcon={<SlidersHorizontal className="h-4 w-4" />}
          rightIcon={showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        >
          <span>Bộ lọc nâng cao</span>
          {advancedActiveCount > 0 && (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-amber-950">
              {advancedActiveCount}
            </span>
          )}
        </Button>

        {/* Nút Xóa bộ lọc */}
        {hasAnyFilter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-10 shrink-0 px-2.5 text-xs text-text-muted hover:text-danger"
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Xóa lọc ({totalActiveCount})
          </Button>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TẦNG 2: ADVANCED FILTERS PANEL (Mở rộng theo nhóm)            */}
      {/* ------------------------------------------------------------- */}
      {showAdvanced && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border/80 pt-4 lg:grid-cols-3">
          {/* ========================================================= */}
          {/* KHỐI 1: KHÓA HỌC & TIẾN ĐỘ BUỔI HỌC                       */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-border/70 bg-surface-muted/50 p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-text-primary">
              <Layers className="h-4 w-4 text-primary" />
              <span>Khóa học & Tiến độ buổi</span>
            </div>

            <div className="space-y-2.5">
              {/* Lọc Khóa học: Kaiwa 1->6, JNPT 1->6 */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Trình độ / Khóa học cụ thể
                </label>
                <div className="flex gap-2">
                  <select
                    value={filters.courseCategory}
                    onChange={(e) => {
                      setField('courseCategory', e.target.value as CourseCategory);
                      setField('courseLevel', '');
                    }}
                    className="h-9 w-2/5 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Nhóm khóa học"
                  >
                    <option value="ALL">Tất cả nhóm</option>
                    <option value="KAIWA">Kaiwa (1–6)</option>
                    <option value="JNPT">JNPT / JLPT</option>
                  </select>

                  <select
                    value={filters.courseLevel}
                    onChange={(e) => setField('courseLevel', e.target.value)}
                    className="h-9 w-3/5 rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Khóa học cụ thể"
                  >
                    <option value="">
                      {filters.courseCategory === 'KAIWA'
                        ? 'Tất cả Kaiwa 1–6'
                        : filters.courseCategory === 'JNPT'
                        ? 'Tất cả JNPT 1–6'
                        : 'Chọn cấp độ cụ thể...'}
                    </option>
                    {levelOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lọc Tổng số buổi */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Tổng số buổi
                  </label>
                  <select
                    value={filters.totalSessionsOp}
                    onChange={(e) => setField('totalSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Tổng số buổi"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {filters.totalSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập số buổi chính xác (vd: 30)"
                    value={filters.totalSessionsExact}
                    onChange={(e) => setField('totalSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối thiểu"
                      value={filters.totalSessionsMin}
                      onChange={(e) => setField('totalSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối đa"
                      value={filters.totalSessionsMax}
                      onChange={(e) => setField('totalSessionsMax', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              {/* Lọc Số buổi đã học */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Số buổi đã học
                  </label>
                  <select
                    value={filters.attendedSessionsOp}
                    onChange={(e) => setField('attendedSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Số buổi đã học"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {filters.attendedSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập số buổi chính xác (vd: 10)"
                    value={filters.attendedSessionsExact}
                    onChange={(e) => setField('attendedSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối thiểu"
                      value={filters.attendedSessionsMin}
                      onChange={(e) => setField('attendedSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối đa"
                      value={filters.attendedSessionsMax}
                      onChange={(e) => setField('attendedSessionsMax', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              {/* Lọc Số buổi còn lại */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Số buổi còn lại
                  </label>
                  <select
                    value={filters.remainingSessionsOp}
                    onChange={(e) => setField('remainingSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Số buổi còn lại"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {filters.remainingSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    placeholder="Nhập số buổi chính xác (vd: 0, 5, -2...)"
                    value={filters.remainingSessionsExact}
                    onChange={(e) => setField('remainingSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Tối thiểu"
                      value={filters.remainingSessionsMin}
                      onChange={(e) => setField('remainingSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      placeholder="Tối đa"
                      value={filters.remainingSessionsMax}
                      onChange={(e) => setField('remainingSessionsMax', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* KHỐI 2: GIÁO VIÊN & LỚP HỌC                               */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-border/70 bg-surface-muted/50 p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-text-primary">
              <Users className="h-4 w-4 text-emerald-600" />
              <span>Giáo viên & Lớp học</span>
            </div>

            <div className="space-y-2.5">
              {/* Lọc Giáo viên */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Giáo viên phụ trách
                </label>
                <select
                  value={filters.teacherName}
                  onChange={(e) => setField('teacherName', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                >
                  <option value="">Tất cả giáo viên</option>
                  {teachersList.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lọc Mã giáo viên */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Mã giáo viên
                </label>
                <select
                  value={filters.teacherCode}
                  onChange={(e) => setField('teacherCode', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                >
                  <option value="">Tất cả mã GV</option>
                  {teacherCodesList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lọc Tên lớp */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Tên lớp
                </label>
                <select
                  value={filters.className}
                  onChange={(e) => setField('className', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                >
                  <option value="">Tất cả lớp học</option>
                  {classesList.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </div>

              {/* Lọc Nhân viên Sale (dành cho Admin/Manage) */}
              {!isCS && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                    Nhân viên Sale phụ trách
                  </label>
                  <select
                    value={filters.selectedSale}
                    onChange={(e) => setField('selectedSale', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                  >
                    <option value="">Tất cả Sale</option>
                    {salesList.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* KHỐI 3: THỜI GIAN & LỊCH HỌC                              */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-border/70 bg-surface-muted/50 p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-text-primary">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span>Thời gian & Lịch học</span>
            </div>

            <div className="space-y-2.5">
              {/* Lọc Ngày bắt đầu học */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Ngày bắt đầu học
                  </label>
                  <select
                    value={filters.startDateOp}
                    onChange={(e) => setField('startDateOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Ngày bắt đầu"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {filters.startDateOp === 'EXACT' ? (
                  <input
                    type="date"
                    value={filters.startDateExact}
                    onChange={(e) => setField('startDateExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Đúng ngày bắt đầu"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={filters.startDateFrom}
                      onChange={(e) => setField('startDateFrom', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày bắt đầu từ"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="date"
                      value={filters.startDateTo}
                      onChange={(e) => setField('startDateTo', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày bắt đầu đến"
                    />
                  </div>
                )}
              </div>

              {/* Lọc Ngày kết thúc / Bảo lưu */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Ngày kết thúc / Bảo lưu
                  </label>
                  <select
                    value={filters.endDateOp}
                    onChange={(e) => setField('endDateOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Ngày kết thúc"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {filters.endDateOp === 'EXACT' ? (
                  <input
                    type="date"
                    value={filters.endDateExact}
                    onChange={(e) => setField('endDateExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Đúng ngày kết thúc"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={filters.endDateFrom}
                      onChange={(e) => setField('endDateFrom', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày kết thúc từ"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="date"
                      value={filters.endDateTo}
                      onChange={(e) => setField('endDateTo', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày kết thúc đến"
                    />
                  </div>
                )}
              </div>

              {/* Lọc Lịch học: Input text tìm kiếm (246, 357, LKCD...) */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Lịch học
                </label>
                <input
                  type="text"
                  placeholder="Nhập lịch học (vd: 246, 357, LKCD...)"
                  value={filters.schedulePattern}
                  onChange={(e) => setField('schedulePattern', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
                />
              </div>

              {/* Lọc Giờ học: Input text tìm kiếm (20h00, 19:30...) */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                  Giờ học
                </label>
                <input
                  type="text"
                  placeholder="Nhập giờ học (vd: 20h00, 19:30...)"
                  value={filters.startTime}
                  onChange={(e) => setField('startTime', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
