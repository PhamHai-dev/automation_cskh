import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { CarePayload } from '../types/dashboard.types';

export const AtRiskTable: React.FC<{ data: CarePayload['at_risk'] }> = ({ data }) => {
  const navigate = useNavigate();

  if (!data.length) {
    return (
      <div className="py-8 text-center text-sm text-text-muted">
        <div className="inline-flex items-center gap-2 text-emerald-600 font-semibold">
          ✓ Không có học viên rủi ro muốn dừng học
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-red-200">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-red-50/60 border-b border-red-200">
            <th className="py-2.5 px-3 font-semibold text-red-700">Học viên</th>
            <th className="py-2.5 px-3 font-semibold text-red-700">Mốc buổi</th>
            <th className="py-2.5 px-3 font-semibold text-red-700">CSKH</th>
            <th className="py-2.5 px-3 font-semibold text-red-700">Ngày log</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {data.map((r) => (
            <tr key={r.enrollment_id} className="hover:bg-red-50/40">
              <td className="py-2.5 px-3 font-medium text-text-primary">
                <button
                  type="button"
                  onClick={() => navigate(`/care?tab=logs&enrollment_id=${r.enrollment_id}`)}
                  className="inline-flex items-center gap-1.5 text-left font-semibold text-text-primary hover:text-primary hover:underline cursor-pointer"
                  title={`Xem nhật ký chăm sóc (Ghi danh #${r.enrollment_id})`}
                >
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{r.student_name}</span>
                </button>
              </td>
              <td className="py-2.5 px-3 text-text-secondary">
                {r.after_session_number ? `Buổi ${r.after_session_number}` : '—'}
              </td>
              <td className="py-2.5 px-3 text-text-secondary">{r.cs_name || '—'}</td>
              <td className="py-2.5 px-3 text-text-muted">{new Date(r.last_log_at).toLocaleDateString('vi-VN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
