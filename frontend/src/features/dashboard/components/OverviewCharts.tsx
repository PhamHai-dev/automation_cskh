import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';
import { STATUS_META, GRANULARITY_LABEL } from '../constants';
import type { OverviewPayload } from '../types/dashboard.types';

const EmptyHint: React.FC = () => (
  <div className="h-40 flex items-center justify-center text-sm text-text-muted">
    Chưa có dữ liệu trong khoảng đã chọn
  </div>
);

export const StatusDonut: React.FC<{ breakdown: Record<string, number>; total: number }> = ({
  breakdown,
  total,
}) => {
  const rows = Object.entries(breakdown)
    .filter(([, c]) => c > 0)
    .map(([status, count]) => ({
      status,
      name: STATUS_META[status]?.label || status,
      value: count,
      color: STATUS_META[status]?.color || '#64748b',
    }));

  if (!rows.length) return <EmptyHint />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
        >
          {rows.map((r) => (
            <Cell key={r.status} fill={r.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: any) => {
            const n = Number(v) || 0;
            return [`${n} (${total > 0 ? ((n / total) * 100).toFixed(1) : 0}%)`, ''] as [string, string];
          }}
        />
        <Legend verticalAlign="bottom" align="center" layout="horizontal" iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const EnrollmentTrendArea: React.FC<{ data: OverviewPayload['enrollment_trend'] }> = ({ data }) => {
  if (!data.points.length) return <EmptyHint />;
  return (
    <div>
      <p className="text-[11px] text-text-muted mb-2">Độ hạt: {GRANULARITY_LABEL[data.granularity]}</p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data.points}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={32} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="total"
            name="Ghi danh"
            stroke="#4f46e5"
            strokeWidth={2}
            fill="url(#trendFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const EnrollmentByCSBar: React.FC<{ data: OverviewPayload['enrollment_by_cs'] }> = ({ data }) => {
  if (!data.length) return <EmptyHint />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="cs_name"
          tick={{ fontSize: 11, fill: '#475569' }}
          width={120}
        />
        <Tooltip />
        <Bar dataKey="count" name="Ghi danh" fill="#4f46e5" radius={[0, 6, 6, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
};
