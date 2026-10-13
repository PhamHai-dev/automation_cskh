import React, { useMemo, useState } from 'react';
import type { CareResponseBucket, CareResponseMatrix } from '../types/dashboard.types';

interface CarePivotTableProps {
  data: CareResponseMatrix | null;
  loading?: boolean;
}

const META: Record<CareResponseBucket, { label: string; color: string; alert?: boolean }> = {
  POSITIVE: { label: 'Phản hồi tích cực', color: '#10b981' },
  NEED_SUPPORT_SYSTEM: { label: 'Cần hỗ trợ về hệ thống', color: '#06b6d4' },
  TEMP_PAUSE: { label: 'Phản hồi tạm, học thêm rồi báo', color: '#3b82f6' },
  NEED_CURRICULUM_SUPPORT: { label: 'Cần hỗ trợ về chương trình học', color: '#6366f1' },
  NEED_STUDENT_WEAKNESS_FIX: { label: 'Cần hỗ trợ về điểm yếu học viên', color: '#f59e0b' },
  NEED_TEACHER_SUPPORT: { label: 'Cần hỗ trợ về giáo viên', color: '#f97316' },
  NEGATIVE_WANTS_TO_STOP: { label: 'Tiêu cực, muốn dừng', color: '#ef4444', alert: true },
  NO_RESPONSE: { label: 'Chưa phản hồi', color: '#94a3b8' },
  OTHER: { label: 'Khác', color: '#8b5cf6' },
  NOT_ENTERED: { label: 'Chưa nhập', color: '#cbd5e1' },
};

function heatColor(hex: string, intensity: number): string {
  const alpha = Math.max(0.06, Math.min(0.9, intensity));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const CarePivotTable: React.FC<CarePivotTableProps> = ({ data, loading }) => {
  const [mode, setMode] = useState<'count' | 'percent'>('count');
  const buckets = data?.buckets || [];
  const maxCell = useMemo(
    () => Math.max(1, ...(data?.rows || []).flatMap((row) => buckets.map((bucket) => row.counts[bucket] || 0))),
    [data, buckets],
  );

  if (loading || !data) {
    return <div className="bg-white rounded-2xl border border-border/80 p-6 shadow-soft animate-pulse"><div className="h-40 bg-slate-100 rounded" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-text-secondary">
          {data.total_entered.toLocaleString('vi-VN')} / {data.total_enrollments.toLocaleString('vi-VN')} lượt đã có phản hồi · {data.response_rate.toFixed(1)}%
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
          {(['count', 'percent'] as const).map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)} className={`px-3 py-1 text-xs font-semibold rounded-md transition ${mode === value ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
              {value === 'count' ? 'Số lượng' : 'Tỷ lệ %'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-left text-xs border-collapse min-w-[1120px]">
          <thead>
            <tr className="border-b border-border bg-surface-muted/80">
              <th className="py-2.5 px-3 font-semibold text-text-secondary sticky left-0 bg-surface-muted z-10 whitespace-nowrap">Mốc chăm sóc</th>
              {buckets.map((bucket) => <th key={bucket} className="py-2.5 px-2 font-semibold text-text-primary text-center min-w-[112px]">{META[bucket].label}</th>)}
              <th className="py-2.5 px-3 font-bold text-text-primary text-center min-w-[90px]">Tổng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.rows.map((row) => (
              <tr key={row.session_number} className="hover:bg-slate-50/60">
                <td className="py-3 px-3 font-bold text-text-primary sticky left-0 bg-white z-10 shadow-[1px_0_0_0_rgba(226,232,240,1)] whitespace-nowrap">Sau buổi {row.session_number}<div className="text-[10px] font-normal text-text-muted mt-0.5">{row.response_rate.toFixed(1)}% phản hồi</div></td>
                {buckets.map((bucket) => {
                  const count = row.counts[bucket] || 0;
                  const intensity = count / maxCell;
                  const shown = mode === 'count' ? String(count) : `${row.total_enrollments ? ((count / row.total_enrollments) * 100).toFixed(0) : 0}%`;
                  return <td key={bucket} className={`py-3 px-2 text-center font-semibold ${META[bucket].alert ? 'text-red-700' : 'text-text-primary'}`} style={{ backgroundColor: count ? heatColor(META[bucket].color, intensity) : undefined, color: count && intensity > 0.65 ? '#fff' : undefined }}>{count ? shown : <span className="text-text-muted">—</span>}</td>;
                })}
                <td className="py-3 px-3 text-center font-bold text-text-primary bg-slate-100/70">{row.total_enrollments}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
