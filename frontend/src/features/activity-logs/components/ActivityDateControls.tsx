import { CalendarDays } from 'lucide-react';
import { Input } from '../../../components/ui/Input';

type Preset = 'today' | '7d' | '30d' | 'custom';

function localDate(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function defaultActivityRange() {
  return { fromDate: localDate(-6), toDate: localDate() };
}

export function ActivityDateControls({
  fromDate,
  toDate,
  onChange,
}: {
  fromDate: string;
  toDate: string;
  onChange: (fromDate: string, toDate: string) => void;
}) {
  const today = localDate();
  const activePreset: Preset =
    fromDate === today && toDate === today
      ? 'today'
      : fromDate === localDate(-6) && toDate === today
        ? '7d'
        : fromDate === localDate(-29) && toDate === today
          ? '30d'
          : 'custom';

  const applyPreset = (preset: Preset) => {
    if (preset === 'today') onChange(today, today);
    if (preset === '7d') onChange(localDate(-6), today);
    if (preset === '30d') onChange(localDate(-29), today);
  };

  return (
    <div className="space-y-2 sm:col-span-2 lg:col-span-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Khoảng thời gian nhanh">
        {([
          ['today', 'Hôm nay'],
          ['7d', '7 ngày'],
          ['30d', '30 ngày'],
          ['custom', 'Tùy chỉnh'],
        ] as Array<[Preset, string]>).map(([value, label]) => (
          <button
            id={`activity-range-${value}`}
            key={value}
            type="button"
            onClick={() => value !== 'custom' && applyPreset(value)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${activePreset === value ? 'border-primary-border bg-primary-soft text-primary' : 'border-border bg-surface text-text-secondary hover:bg-surface-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input id="activity-from-date" type="date" label="Từ ngày" value={fromDate} max={toDate || today} onChange={(event) => onChange(event.target.value, toDate)} leftIcon={<CalendarDays className="h-4 w-4" />} />
        <Input id="activity-to-date" type="date" label="Đến ngày" value={toDate} min={fromDate} max={today} onChange={(event) => onChange(fromDate, event.target.value)} leftIcon={<CalendarDays className="h-4 w-4" />} />
      </div>
    </div>
  );
}
