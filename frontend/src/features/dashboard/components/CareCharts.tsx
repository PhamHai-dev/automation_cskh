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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { OUTCOME_META } from '../constants';
import type { CarePayload } from '../types/dashboard.types';

const EmptyHint: React.FC = () => (
  <div className="h-40 flex items-center justify-center text-sm text-text-muted">
    Chưa có dữ liệu chăm sóc trong khoảng đã chọn
  </div>
);

// ---- Care outcome distribution (donut) ----
export const CareOutcomeDonut: React.FC<{ data: CarePayload['outcome_breakdown'] }> = ({ data }) => {
  const rows = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name: OUTCOME_META[d.outcome]?.label || d.outcome,
      value: d.count,
      color: OUTCOME_META[d.outcome]?.color || '#64748b',
    }));
  if (!rows.length) return <EmptyHint />;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v: any) => [`${v} (${((Number(v) / total) * 100).toFixed(1)}%)`, ''] as [string, string]} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ---- Milestone coverage (stacked bar: covered vs missed) ----
export const MilestoneCoverageChart: React.FC<{ data: CarePayload['milestone_coverage'] }> = ({ data }) => {
  if (!data.length) return <EmptyHint />;
  const rows = data.map((d) => ({
    label: `B${d.session_number}`,
    covered: d.covered,
    missed: Math.max(0, d.reached - d.covered),
    coverage_pct: d.coverage_pct,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={32} />
        <Tooltip
          formatter={(v: any, n: any) => [v, n === 'covered' ? 'Đã chăm sóc' : 'Chưa chăm sóc'] as [any, string]}
          labelFormatter={(l: any, p: any) => `Mốc ${l} — bao phủ ${p?.[0]?.payload?.coverage_pct ?? 0}%`}
        />
        <Legend formatter={(v) => (v === 'covered' ? 'Đã chăm sóc' : 'Chưa chăm sóc')} />
        <Bar dataKey="covered" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
        <Bar dataKey="missed" stackId="a" fill="#f1f5f9" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
