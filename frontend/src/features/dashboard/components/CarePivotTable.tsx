import React from 'react';
import { CarePivotMatrix } from '../types/dashboard.types';

interface CarePivotTableProps {
  data: CarePivotMatrix | null;
  loading?: boolean;
}

const OUTCOME_LABELS: Record<string, { label: string; badgeColor?: string }> = {
  POSITIVE: { label: 'Tích cực / Hài lòng' },
  NEED_SUPPORT_SYSTEM: { label: 'Cần hỗ trợ kỹ thuật/hệ thống' },
  TEMP_PAUSE: { label: 'Tạm bảo lưu / Dừng' },
  NEED_CURRICULUM_SUPPORT: { label: 'Cần hỗ trợ giáo trình' },
  NEED_STUDENT_WEAKNESS_FIX: { label: 'Cần kèm yếu' },
  NEED_TEACHER_SUPPORT: { label: 'Cần đổi/hỗ trợ GV' },
  NEGATIVE_WANTS_TO_STOP: { label: 'Muốn dừng học', badgeColor: 'text-red-700 bg-red-50 font-bold' },
  NO_RESPONSE: { label: 'Không phản hồi' },
};

export const CarePivotTable: React.FC<CarePivotTableProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse space-y-3">
        <div className="h-5 bg-gray-200 rounded w-1/4" />
        <div className="h-32 bg-gray-100 rounded" />
      </div>
    );
  }

  const sessionNumbers = data.session_numbers || [];
  const outcomes = data.outcomes || [];
  const matrix = data.matrix || {};

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-gray-900 text-base">Ma trận Phản hồi Chăm sóc (Care Pivot Matrix)</h4>
          <p className="text-xs text-gray-500">
            Tổng hợp {data.total_logs} nhật ký chăm sóc phân bổ theo mốc buổi học và tâm lý học viên
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="py-2.5 px-3 font-semibold text-gray-600 sticky left-0 bg-gray-50">
                Tình trạng / Phản hồi
              </th>
              {sessionNumbers.map((s) => (
                <th key={s} className="py-2.5 px-3 font-semibold text-gray-700 text-center min-w-[80px]">
                  Sau buổi {s}
                </th>
              ))}
              <th className="py-2.5 px-3 font-bold text-gray-800 text-center min-w-[70px] bg-gray-100/60">
                Tổng cộng
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {outcomes.map((outcomeKey) => {
              const labelInfo = OUTCOME_LABELS[outcomeKey] || { label: outcomeKey };
              let rowTotal = 0;

              return (
                <tr key={outcomeKey} className="hover:bg-blue-50/20 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-gray-800 sticky left-0 bg-white shadow-[1px_0_0_0_#f3f4f6]">
                    <span className={labelInfo.badgeColor}>{labelInfo.label}</span>
                  </td>

                  {sessionNumbers.map((s) => {
                    const count = matrix[String(s)]?.[outcomeKey] || 0;
                    rowTotal += count;
                    const isAlert = outcomeKey === 'NEGATIVE_WANTS_TO_STOP' && count > 0;

                    return (
                      <td
                        key={s}
                        className={`py-2.5 px-3 text-center ${
                          isAlert
                            ? 'bg-red-100 text-red-700 font-bold'
                            : count > 0
                            ? 'bg-blue-50/70 text-blue-700 font-semibold'
                            : 'text-gray-400'
                        }`}
                      >
                        {count > 0 ? count : '—'}
                      </td>
                    );
                  })}

                  <td className="py-2.5 px-3 text-center font-bold text-gray-900 bg-gray-50/60">
                    {rowTotal > 0 ? rowTotal : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
