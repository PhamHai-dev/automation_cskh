import React from 'react';
import { AttendanceStats } from '../types/dashboard.types';
import { CheckCircle2, XCircle, Clock, RotateCcw, AlertTriangle } from 'lucide-react';

interface AttendanceChartProps {
  data: AttendanceStats | null;
  loading?: boolean;
}

const ATTENDANCE_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ATTENDED: { label: 'Có mặt', color: 'bg-emerald-500', icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
  ABSENT_PERMITTED: { label: 'Nghỉ có phép', color: 'bg-amber-400', icon: <Clock className="w-4 h-4 text-amber-600" /> },
  ABSENT_UNPERMITTED: { label: 'Nghỉ không phép', color: 'bg-rose-500', icon: <XCircle className="w-4 h-4 text-rose-600" /> },
  LATE: { label: 'Đi muộn', color: 'bg-indigo-400', icon: <AlertTriangle className="w-4 h-4 text-indigo-600" /> },
  MAKEUP: { label: 'Học bù', color: 'bg-blue-400', icon: <RotateCcw className="w-4 h-4 text-blue-600" /> },
};

export const AttendanceChart: React.FC<AttendanceChartProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-100 rounded w-full" />
        </div>
      </div>
    );
  }

  const total = data.total_attendances || 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-gray-900 text-base">Tỷ lệ Chuyên cần & Điểm danh</h4>
          <p className="text-xs text-gray-500">
            Dựa trên {total} lượt điểm danh trong {data.total_sessions} buổi học
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-blue-600">{data.attendance_rate}%</span>
          <p className="text-[11px] text-gray-400">Tỷ lệ tham gia</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-100 rounded-full h-3 flex overflow-hidden">
        {Object.entries(data.breakdown || {}).map(([key, count]) => {
          const cfg = ATTENDANCE_LABELS[key] || { color: 'bg-gray-400' };
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={key}
              style={{ width: `${pct}%` }}
              className={`${cfg.color} h-full transition-all duration-300`}
              title={`${cfg.label || key}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Breakdown Details */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
        {Object.entries(ATTENDANCE_LABELS).map(([key, cfg]) => {
          const count = data.breakdown[key] || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';

          return (
            <div key={key} className="p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                {cfg.icon}
                <span className="truncate">{cfg.label}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-gray-900 text-base">{count}</span>
                <span className="text-xs text-gray-500">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
