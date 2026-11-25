import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AttendanceViewControlsProps {
  activeTab: 'quick' | 'detailed' | 'stats';
  selectedDate: string;
  onDateChange: (date: string) => void;
  periodDate: Date;
  onPeriodChange: (date: Date) => void;
  periodMode: 'week' | 'month';
  onPeriodModeChange: (mode: 'week' | 'month') => void;
  viewMode: 'matrix' | 'log';
  onViewModeChange: (mode: 'matrix' | 'log') => void;
}

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const AttendanceViewControls: React.FC<AttendanceViewControlsProps> = ({
  activeTab, selectedDate, onDateChange, periodDate, onPeriodChange,
  periodMode, onPeriodModeChange, viewMode, onViewModeChange,
}) => {
  const isDay = activeTab === 'quick';
  const isWeek = activeTab === 'detailed' && periodMode === 'week';
  const value = isDay ? selectedDate : isWeek ? formatDate(periodDate) : formatDate(periodDate).slice(0, 7);
  const step = (delta: number) => {
    const date = isDay ? new Date(`${selectedDate}T12:00:00`) : new Date(periodDate);
    if (isDay || isWeek) date.setDate(date.getDate() + delta * (isWeek ? 7 : 1));
    else { date.setDate(1); date.setMonth(date.getMonth() + delta); }
    if (isDay) onDateChange(formatDate(date));
    else onPeriodChange(date);
  };
  const group = <T extends string,>(id: string, label: string, options: { value: T; label: string }[], selected: T, onChange: (value: T) => void) => (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button id={`${id}-${option.value}`} key={option.value} type="button" aria-pressed={selected === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${selected === option.value ? 'bg-primary text-white shadow-xs' : 'text-text-secondary hover:bg-surface'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
  return (
    <>
      {activeTab === 'detailed' && <>
        {group('attendance-history-view', 'Kiểu hiển thị lịch sử', [{ value: 'matrix', label: 'Bảng tháng' }, { value: 'log', label: 'Nhật ký buổi học' }], viewMode, onViewModeChange)}
        {group('attendance-period-mode', 'Phạm vi kỳ hiển thị', [{ value: 'week', label: 'Theo tuần' }, { value: 'month', label: 'Theo tháng' }], periodMode, onPeriodModeChange)}
      </>}
      <div className="learning-filter-date inline-flex max-w-full items-center gap-1 rounded-xl border border-border bg-surface p-1" data-display-control="date">
        <button id="attendance-period-prev" type="button" onClick={() => step(-1)} aria-label={isDay ? 'Ngày hôm trước' : 'Kỳ trước'} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary/30"><ChevronLeft className="h-4 w-4" /></button>
        <input id="attendance-period-value" type={isDay || isWeek ? 'date' : 'month'} value={value}
          aria-label={isDay ? 'Ngày điểm danh' : 'Chọn kỳ xem lịch sử'}
          onChange={(event) => {
            if (!event.target.value) return;
            if (isDay) onDateChange(event.target.value);
            else {
              const [year, month, day = 1] = event.target.value.split('-').map(Number);
              onPeriodChange(new Date(year, month - 1, day));
            }
          }} className="min-w-0 rounded-lg border-0 bg-transparent px-1 py-1 text-xs font-bold text-text-primary outline-none focus:ring-2 focus:ring-primary/30" />
        <button id="attendance-period-next" type="button" onClick={() => step(1)} aria-label={isDay ? 'Ngày hôm sau' : 'Kỳ sau'} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary/30"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </>
  );
};
