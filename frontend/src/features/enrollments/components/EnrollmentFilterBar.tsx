import React, { useState, useMemo } from 'react';
import {
  EnrollmentFilterState,
  FilterOperator,
  INITIAL_ENROLLMENT_FILTERS,
  KAIWA_LEVEL_OPTIONS,
} from '../types/enrollmentFilter.types';
import { Button } from '../../../components/ui/Button';
import { ActiveFilterChip, ActiveFilterChips } from '../../../components/common/FilterBar';
import { AdvancedFilterDrawer } from '../../../components/common/AdvancedFilterDrawer';
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
  programFilter?: 'ALL' | 'KAIWA' | 'JLPT';
  onProgramChange?: (program: 'ALL' | 'KAIWA' | 'JLPT') => void;
  resultCount?: number;
  isCS?: boolean;
  contextControls?: React.ReactNode;
}

const countAdvancedFilters = (state: EnrollmentFilterState): number => {
  let count = 0;

  if (state.courseLevel) count++;
  if (
    (state.totalSessionsOp === 'EXACT' && state.totalSessionsExact !== '') ||
    (state.totalSessionsOp === 'RANGE' && (state.totalSessionsMin !== '' || state.totalSessionsMax !== ''))
  ) count++;
  if (
    (state.attendedSessionsOp === 'EXACT' && state.attendedSessionsExact !== '') ||
    (state.attendedSessionsOp === 'RANGE' && (state.attendedSessionsMin !== '' || state.attendedSessionsMax !== ''))
  ) count++;
  if (
    (state.remainingSessionsOp === 'EXACT' && state.remainingSessionsExact !== '') ||
    (state.remainingSessionsOp === 'RANGE' && (state.remainingSessionsMin !== '' || state.remainingSessionsMax !== ''))
  ) count++;
  if (state.teacherName) count++;
  if (state.teacherCode) count++;
  if (state.className) count++;
  if (state.selectedSale) count++;
  if (
    (state.startDateOp === 'EXACT' && state.startDateExact) ||
    (state.startDateOp === 'RANGE' && (state.startDateFrom || state.startDateTo))
  ) count++;
  if (
    (state.endDateOp === 'EXACT' && state.endDateExact) ||
    (state.endDateOp === 'RANGE' && (state.endDateFrom || state.endDateTo))
  ) count++;
  if (state.schedulePattern) count++;
  if (state.startTime) count++;

  return count;
};

export const EnrollmentFilterBar: React.FC<EnrollmentFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  salesList,
  packagesList,
  teachersList,
  teacherCodesList,
  classesList,
  programFilter = 'ALL',
  onProgramChange,
  resultCount,
  isCS = false,
  contextControls,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [draftFilters, setDraftFilters] = useState<EnrollmentFilterState>(filters);

  const advancedFilters = showAdvanced ? draftFilters : filters;
  const openAdvancedFilters = () => {
    setDraftFilters(filters);
    setShowAdvanced(true);
  };
  const closeAdvancedFilters = () => {
    setDraftFilters(filters);
    setShowAdvanced(false);
  };
  const applyAdvancedFilters = () => {
    onChange(() => draftFilters);
    setShowAdvanced(false);
  };
  const setAdvancedField = <K extends keyof EnrollmentFilterState>(
    field: K,
    val: EnrollmentFilterState[K]
  ) => {
    setDraftFilters((previous) => ({ ...previous, [field]: val }));
  };

  // Helper to update individual filter field
  const setField = <K extends keyof EnrollmentFilterState>(
    field: K,
    val: EnrollmentFilterState[K]
  ) => {
    onChange((prev) => ({ ...prev, [field]: val }));
  };

  const advancedActiveCount = useMemo(() => countAdvancedFilters(filters), [filters]);
  const draftAdvancedActiveCount = useMemo(
    () => countAdvancedFilters(draftFilters),
    [draftFilters],
  );
  const totalActiveCount =
    advancedActiveCount +
    (filters.searchQuery ? 1 : 0) +
    (filters.packageName ? 1 : 0) +
    (filters.statusFilter ? 1 : 0) +
    (filters.modelFilter ? 1 : 0);

  const clearAdvancedDraft = () => {
    setDraftFilters((previous) => ({
      ...previous,
      courseLevel: INITIAL_ENROLLMENT_FILTERS.courseLevel,
      totalSessionsOp: INITIAL_ENROLLMENT_FILTERS.totalSessionsOp,
      totalSessionsExact: INITIAL_ENROLLMENT_FILTERS.totalSessionsExact,
      totalSessionsMin: INITIAL_ENROLLMENT_FILTERS.totalSessionsMin,
      totalSessionsMax: INITIAL_ENROLLMENT_FILTERS.totalSessionsMax,
      attendedSessionsOp: INITIAL_ENROLLMENT_FILTERS.attendedSessionsOp,
      attendedSessionsExact: INITIAL_ENROLLMENT_FILTERS.attendedSessionsExact,
      attendedSessionsMin: INITIAL_ENROLLMENT_FILTERS.attendedSessionsMin,
      attendedSessionsMax: INITIAL_ENROLLMENT_FILTERS.attendedSessionsMax,
      remainingSessionsOp: INITIAL_ENROLLMENT_FILTERS.remainingSessionsOp,
      remainingSessionsExact: INITIAL_ENROLLMENT_FILTERS.remainingSessionsExact,
      remainingSessionsMin: INITIAL_ENROLLMENT_FILTERS.remainingSessionsMin,
      remainingSessionsMax: INITIAL_ENROLLMENT_FILTERS.remainingSessionsMax,
      teacherName: INITIAL_ENROLLMENT_FILTERS.teacherName,
      teacherCode: INITIAL_ENROLLMENT_FILTERS.teacherCode,
      className: INITIAL_ENROLLMENT_FILTERS.className,
      selectedSale: INITIAL_ENROLLMENT_FILTERS.selectedSale,
      startDateOp: INITIAL_ENROLLMENT_FILTERS.startDateOp,
      startDateExact: INITIAL_ENROLLMENT_FILTERS.startDateExact,
      startDateFrom: INITIAL_ENROLLMENT_FILTERS.startDateFrom,
      startDateTo: INITIAL_ENROLLMENT_FILTERS.startDateTo,
      endDateOp: INITIAL_ENROLLMENT_FILTERS.endDateOp,
      endDateExact: INITIAL_ENROLLMENT_FILTERS.endDateExact,
      endDateFrom: INITIAL_ENROLLMENT_FILTERS.endDateFrom,
      endDateTo: INITIAL_ENROLLMENT_FILTERS.endDateTo,
      schedulePattern: INITIAL_ENROLLMENT_FILTERS.schedulePattern,
      startTime: INITIAL_ENROLLMENT_FILTERS.startTime,
    }));
  };

  const hasAnyFilter = totalActiveCount > 0 || programFilter !== 'ALL';

  const levelOptions = programFilter === 'KAIWA' ? KAIWA_LEVEL_OPTIONS : [];

  const clearField = <K extends keyof EnrollmentFilterState>(field: K) => {
    setField(field, INITIAL_ENROLLMENT_FILTERS[field]);
  };

  const activeChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    const clearFields = (fields: (keyof EnrollmentFilterState)[]) => {
      onChange((previous) => {
        const next = { ...previous };
        fields.forEach((field) => {
          (next as Record<keyof EnrollmentFilterState, EnrollmentFilterState[keyof EnrollmentFilterState]>)[field] =
            INITIAL_ENROLLMENT_FILTERS[field];
        });
        return next;
      });
    };
    const formatRange = (minimum: string, maximum: string, unit = '') => {
      if (minimum && maximum) return `${minimum}–${maximum}${unit}`;
      if (minimum) return `≥ ${minimum}${unit}`;
      return `≤ ${maximum}${unit}`;
    };
    const addNumericChip = (
      id: string,
      label: string,
      operator: FilterOperator,
      exact: string,
      minimum: string,
      maximum: string,
      fields: (keyof EnrollmentFilterState)[],
    ) => {
      const value = operator === 'EXACT' && exact !== '' ? `= ${exact}` : formatRange(minimum, maximum);
      if ((operator === 'EXACT' && exact !== '') || (operator === 'RANGE' && (minimum !== '' || maximum !== ''))) {
        chips.push({ id, label, value, onRemove: () => clearFields(fields) });
      }
    };
    const addDateChip = (
      id: string,
      label: string,
      operator: FilterOperator,
      exact: string,
      from: string,
      to: string,
      fields: (keyof EnrollmentFilterState)[],
    ) => {
      const value = operator === 'EXACT' && exact ? exact : formatRange(from, to);
      if ((operator === 'EXACT' && exact) || (operator === 'RANGE' && (from || to))) {
        chips.push({ id, label, value, onRemove: () => clearFields(fields) });
      }
    };

    if (programFilter !== 'ALL') {
      chips.push({
        id: 'program',
        label: 'Chương trình',
        value: programFilter === 'KAIWA' ? 'Kaiwa' : 'JLPT',
        tone: programFilter === 'KAIWA' ? 'kaiwa' : 'jlpt',
        onRemove: () => onProgramChange?.('ALL'),
      });
    }
    if (filters.searchQuery) chips.push({ id: 'search', label: 'Tìm kiếm', value: filters.searchQuery, onRemove: () => clearField('searchQuery') });
    if (filters.packageName) chips.push({ id: 'package', label: 'Gói học', value: filters.packageName, onRemove: () => clearField('packageName') });
    if (filters.statusFilter) chips.push({ id: 'status', label: 'Trạng thái', value: filters.statusFilter, onRemove: () => clearField('statusFilter') });
    if (filters.modelFilter) chips.push({ id: 'model', label: 'Mô hình', value: filters.modelFilter, onRemove: () => clearField('modelFilter') });
    if (filters.courseLevel) chips.push({ id: 'level', label: 'Trình độ Kaiwa', value: filters.courseLevel, tone: 'kaiwa', onRemove: () => clearField('courseLevel') });
    addNumericChip('total-sessions', 'Tổng số buổi', filters.totalSessionsOp, filters.totalSessionsExact, filters.totalSessionsMin, filters.totalSessionsMax, ['totalSessionsOp', 'totalSessionsExact', 'totalSessionsMin', 'totalSessionsMax']);
    addNumericChip('attended-sessions', 'Số buổi đã học', filters.attendedSessionsOp, filters.attendedSessionsExact, filters.attendedSessionsMin, filters.attendedSessionsMax, ['attendedSessionsOp', 'attendedSessionsExact', 'attendedSessionsMin', 'attendedSessionsMax']);
    addNumericChip('remaining-sessions', 'Số buổi còn lại', filters.remainingSessionsOp, filters.remainingSessionsExact, filters.remainingSessionsMin, filters.remainingSessionsMax, ['remainingSessionsOp', 'remainingSessionsExact', 'remainingSessionsMin', 'remainingSessionsMax']);
    if (filters.teacherName) chips.push({ id: 'teacher', label: 'Giáo viên', value: filters.teacherName, onRemove: () => clearField('teacherName') });
    if (filters.teacherCode) chips.push({ id: 'teacher-code', label: 'Mã GV', value: filters.teacherCode, onRemove: () => clearField('teacherCode') });
    if (filters.className) chips.push({ id: 'class', label: 'Lớp', value: filters.className, onRemove: () => clearField('className') });
    if (filters.selectedSale) chips.push({ id: 'sale', label: 'Sale', value: filters.selectedSale, onRemove: () => clearField('selectedSale') });
    addDateChip('start-date', 'Ngày bắt đầu', filters.startDateOp, filters.startDateExact, filters.startDateFrom, filters.startDateTo, ['startDateOp', 'startDateExact', 'startDateFrom', 'startDateTo']);
    addDateChip('end-date', 'Ngày kết thúc', filters.endDateOp, filters.endDateExact, filters.endDateFrom, filters.endDateTo, ['endDateOp', 'endDateExact', 'endDateFrom', 'endDateTo']);
    if (filters.schedulePattern) chips.push({ id: 'schedule', label: 'Lịch học', value: filters.schedulePattern, onRemove: () => clearField('schedulePattern') });
    if (filters.startTime) chips.push({ id: 'start-time', label: 'Giờ học', value: filters.startTime, onRemove: () => clearField('startTime') });
    return chips;
  }, [filters, onChange, onProgramChange, programFilter]);

  return (
    <section className="mb-3 rounded-2xl border border-border/80 bg-surface p-3 shadow-soft transition-all" aria-label="Tìm kiếm và lọc dữ liệu học tập">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">Tìm kiếm & bộ lọc học tập</p>
          <p className="mt-0.5 text-[11px] text-text-muted">Trường riêng Kaiwa/JLPT tự thay đổi theo chương trình đang chọn.</p>
        </div>
        {typeof resultCount === 'number' && <span className="text-xs font-semibold text-text-muted">{resultCount.toLocaleString('vi-VN')} kết quả</span>}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TẦNG 1: ONE-LINE CONTEXT, SEARCH & BASIC FILTERS              */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
        {/* Search input: ID, Name, Phone, Email */}
        <div className="relative min-w-[220px] flex-[1_1_260px] xl:max-w-[360px]">
          <input
            type="text"
            placeholder="Mã HV, họ tên, SĐT, email..."
            value={filters.searchQuery}
            onChange={(e) => setField('searchQuery', e.target.value)}
            className="h-9 w-full rounded-xl border border-border/80 bg-surface pl-9 pr-3 text-xs font-semibold text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
            aria-label="Tìm kiếm học viên"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>

        {/* Ngữ cảnh chương trình đứng ngay sau tìm kiếm. */}
        <div className="min-w-[132px] shrink-0">
          <select
            value={programFilter}
            onChange={(event) => onProgramChange?.(event.target.value as 'ALL' | 'KAIWA' | 'JLPT')}
            aria-label="Ngữ cảnh chương trình"
            className="h-9 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-bold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="ALL">Tất cả chương trình</option>
            <option value="KAIWA">Kaiwa</option>
            <option value="JLPT">JLPT</option>
          </select>
        </div>

        {contextControls && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:flex-nowrap">
            {contextControls}
          </div>
        )}

        {/* Tìm kiếm / Lọc Gói học */}
        <div className="min-w-[138px] flex-initial">
          <select
            value={filters.packageName}
            onChange={(e) => setField('packageName', e.target.value)}
            aria-label="Lọc theo Gói học"
            className="h-9 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
        <div className="min-w-[128px] flex-initial">
          <select
            value={filters.statusFilter}
            onChange={(e) => setField('statusFilter', e.target.value)}
            aria-label="Lọc theo trạng thái"
            className="h-9 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
        <div className="min-w-[115px] flex-initial">
          <select
            value={filters.modelFilter}
            onChange={(e) => setField('modelFilter', e.target.value)}
            aria-label="Lọc theo mô hình"
            className="h-9 w-full rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-text-primary outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
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
          onClick={openAdvancedFilters}
          className="h-9 shrink-0 gap-1.5 px-3 text-xs font-bold"
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
            className="h-9 shrink-0 px-2.5 text-xs text-text-muted hover:text-danger"
            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Xóa lọc ({totalActiveCount + (programFilter !== 'ALL' ? 1 : 0)})
          </Button>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TẦNG 2: RESPONSIVE ADVANCED FILTER DRAWER                     */}
      {/* ------------------------------------------------------------- */}
      <AdvancedFilterDrawer
        open={showAdvanced}
        onClose={closeAdvancedFilters}
        onApply={applyAdvancedFilters}
        applyLabel={`Áp dụng${draftAdvancedActiveCount > 0 ? ` • ${draftAdvancedActiveCount} điều kiện` : ''}`}
        activeCount={draftAdvancedActiveCount}
        onReset={clearAdvancedDraft}
        title="Bộ lọc học tập nâng cao"
        description="Lọc theo khóa học, tiến độ, giáo viên, lớp và thời gian học."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ========================================================= */}
          {/* KHỐI 1: KHÓA HỌC & TIẾN ĐỘ BUỔI HỌC                       */}
          {/* ========================================================= */}
          <div className="rounded-xl border border-border/70 bg-surface-muted/50 p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-bold text-text-primary">
              <Layers className="h-4 w-4 text-primary" />
              <span>Khóa học & Tiến độ buổi</span>
            </div>

            <div className="space-y-2.5">
              {/* Ngữ cảnh chương trình được chọn ở hàng chính; Kaiwa có thêm trình độ độc lập. */}
              {programFilter === 'KAIWA' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-text-secondary">
                    Trình độ Kaiwa
                  </label>
                  <select
                    value={advancedFilters.courseLevel}
                    onChange={(e) => setAdvancedField('courseLevel', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-xs font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Trình độ Kaiwa"
                  >
                    <option value="">Tất cả trình độ Kaiwa</option>
                    {levelOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Lọc Tổng số buổi */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-text-secondary">
                    Tổng số buổi
                  </label>
                  <select
                    value={advancedFilters.totalSessionsOp}
                    onChange={(e) => setAdvancedField('totalSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Tổng số buổi"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {advancedFilters.totalSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập số buổi chính xác (vd: 30)"
                    value={advancedFilters.totalSessionsExact}
                    onChange={(e) => setAdvancedField('totalSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối thiểu"
                      value={advancedFilters.totalSessionsMin}
                      onChange={(e) => setAdvancedField('totalSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối đa"
                      value={advancedFilters.totalSessionsMax}
                      onChange={(e) => setAdvancedField('totalSessionsMax', e.target.value)}
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
                    value={advancedFilters.attendedSessionsOp}
                    onChange={(e) => setAdvancedField('attendedSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Số buổi đã học"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {advancedFilters.attendedSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập số buổi chính xác (vd: 10)"
                    value={advancedFilters.attendedSessionsExact}
                    onChange={(e) => setAdvancedField('attendedSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối thiểu"
                      value={advancedFilters.attendedSessionsMin}
                      onChange={(e) => setAdvancedField('attendedSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tối đa"
                      value={advancedFilters.attendedSessionsMax}
                      onChange={(e) => setAdvancedField('attendedSessionsMax', e.target.value)}
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
                    value={advancedFilters.remainingSessionsOp}
                    onChange={(e) => setAdvancedField('remainingSessionsOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Số buổi còn lại"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {advancedFilters.remainingSessionsOp === 'EXACT' ? (
                  <input
                    type="number"
                    placeholder="Nhập số buổi chính xác (vd: 0, 5, -2...)"
                    value={advancedFilters.remainingSessionsExact}
                    onChange={(e) => setAdvancedField('remainingSessionsExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Tối thiểu"
                      value={advancedFilters.remainingSessionsMin}
                      onChange={(e) => setAdvancedField('remainingSessionsMin', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none focus:border-primary"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="number"
                      placeholder="Tối đa"
                      value={advancedFilters.remainingSessionsMax}
                      onChange={(e) => setAdvancedField('remainingSessionsMax', e.target.value)}
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
                  value={advancedFilters.teacherName}
                  onChange={(e) => setAdvancedField('teacherName', e.target.value)}
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
                  value={advancedFilters.teacherCode}
                  onChange={(e) => setAdvancedField('teacherCode', e.target.value)}
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
                  value={advancedFilters.className}
                  onChange={(e) => setAdvancedField('className', e.target.value)}
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
                    value={advancedFilters.selectedSale}
                    onChange={(e) => setAdvancedField('selectedSale', e.target.value)}
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
                    value={advancedFilters.startDateOp}
                    onChange={(e) => setAdvancedField('startDateOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Ngày bắt đầu"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {advancedFilters.startDateOp === 'EXACT' ? (
                  <input
                    type="date"
                    value={advancedFilters.startDateExact}
                    onChange={(e) => setAdvancedField('startDateExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Đúng ngày bắt đầu"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={advancedFilters.startDateFrom}
                      onChange={(e) => setAdvancedField('startDateFrom', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày bắt đầu từ"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="date"
                      value={advancedFilters.startDateTo}
                      onChange={(e) => setAdvancedField('startDateTo', e.target.value)}
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
                    value={advancedFilters.endDateOp}
                    onChange={(e) => setAdvancedField('endDateOp', e.target.value as FilterOperator)}
                    className="h-6 rounded-md border border-border/80 bg-surface px-1.5 text-[10px] font-bold text-text-secondary outline-none transition focus:border-primary"
                    aria-label="Toán tử Ngày kết thúc"
                  >
                    <option value="RANGE">Khoảng</option>
                    <option value="EXACT">Bằng</option>
                  </select>
                </div>

                {advancedFilters.endDateOp === 'EXACT' ? (
                  <input
                    type="date"
                    value={advancedFilters.endDateExact}
                    onChange={(e) => setAdvancedField('endDateExact', e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                    aria-label="Đúng ngày kết thúc"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={advancedFilters.endDateFrom}
                      onChange={(e) => setAdvancedField('endDateFrom', e.target.value)}
                      className="h-9 w-1/2 rounded-lg border border-border bg-surface px-2 text-[11px] font-semibold text-text-primary outline-none focus:border-primary"
                      aria-label="Ngày kết thúc từ"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="date"
                      value={advancedFilters.endDateTo}
                      onChange={(e) => setAdvancedField('endDateTo', e.target.value)}
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
                  value={advancedFilters.schedulePattern}
                  onChange={(e) => setAdvancedField('schedulePattern', e.target.value)}
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
                  value={advancedFilters.startTime}
                  onChange={(e) => setAdvancedField('startTime', e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </AdvancedFilterDrawer>
      <ActiveFilterChips chips={activeChips} onClear={onReset} className="mt-3 border-t border-border/60 pt-3" />
    </section>
  );
};
