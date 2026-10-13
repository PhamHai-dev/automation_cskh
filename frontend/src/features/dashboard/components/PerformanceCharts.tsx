import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TASK_TYPE_META } from '../constants';
import type { PerformancePayload } from '../types/dashboard.types';

const EmptyHint: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="h-32 flex items-center justify-center text-sm text-text-muted">{msg}</div>
);

// ---- Tasks by type (stacked pending vs done) ----
export const TasksByTypeBar: React.FC<{ data: PerformancePayload['tasks_by_type'] }> = ({ data }) => {
  if (!data.length) return <EmptyHint msg="Chưa có nhiệm vụ nào trong khoảng đã chọn" />;
  const rows = data.map((d) => ({
    label: TASK_TYPE_META[d.type]?.label || d.type,
    done: d.done,
    pending: d.pending,
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={32} />
        <Tooltip />
        <Legend />
        <Bar dataKey="done" name="Hoàn thành" stackId="a" fill="#10b981" />
        <Bar dataKey="pending" name="Đang chờ" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};

// ---- CS Leaderboard (table, ADMIN/MANAGE only) ----
export const CSLeaderboard: React.FC<{ data: PerformancePayload['cs_leaderboard'] }> = ({ data }) => {
  if (!data.length) return <EmptyHint msg="Không có dữ liệu bảng xếp hạng" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="bg-surface-muted/80 border-b border-border">
            <th className="py-2.5 px-3 font-semibold text-text-secondary">#</th>
            <th className="py-2.5 px-3 font-semibold text-text-secondary">CVHT</th>
            <th className="py-2.5 px-3 font-semibold text-text-secondary text-right">Ghi danh</th>
            <th className="py-2.5 px-3 font-semibold text-text-secondary text-right">Log CS</th>
            <th className="py-2.5 px-3 font-semibold text-text-secondary text-right">% Tích cực</th>
            <th className="py-2.5 px-3 font-semibold text-text-secondary text-right">NV hoàn thành</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {data.map((r, idx) => (
            <tr key={r.cs_id} className="hover:bg-slate-50/60">
              <td className="py-2.5 px-3 text-text-muted font-bold">{idx + 1}</td>
              <td className="py-2.5 px-3 font-medium text-text-primary">{r.cs_name}</td>
              <td className="py-2.5 px-3 text-right text-text-secondary">{r.total_enrollments}</td>
              <td className="py-2.5 px-3 text-right text-text-secondary font-semibold">{r.total_logs}</td>
              <td className="py-2.5 px-3 text-right">
                <PillPct value={r.positive_pct} tone="good" />
              </td>
              <td className="py-2.5 px-3 text-right">
                <span className="text-text-secondary">
                  {r.tasks_done}/{r.tasks_total}
                </span>
                <span className="ml-1.5 text-xs text-text-muted">({r.tasks_done_pct}%)</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PillPct: React.FC<{ value: number; tone: 'good' | 'warn' }> = ({ value }) => {
  const cls =
    value >= 60
      ? 'bg-emerald-50 text-emerald-700'
      : value >= 30
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {value}%
    </span>
  );
};

// ---- Task completion ring (CSS, simple) ----
export const CompletionBar: React.FC<{ data: PerformancePayload['task_completion'] }> = ({ data }) => {
  const pct = data.completion_pct;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-extrabold text-text-primary">{pct}%</span>
        <span className="text-xs text-text-muted">
          {data.month_done}/{data.month_total} NV tháng này
        </span>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
