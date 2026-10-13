import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ATTENDANCE_META, GRANULARITY_LABEL } from '../constants';
import type { AttendancePayload, AttendanceStats } from '../types/dashboard.types';

const EmptyHint: React.FC = () => (
  <div className="h-40 flex items-center justify-center text-sm text-text-muted">
    Chưa có dữ liệu điểm danh trong khoảng đã chọn
  </div>
);

// ---- Attendance status distribution (donut) ----
export const AttendanceDonut: React.FC<{ data: AttendanceStats }> = ({ data }) => {
  const rows = Object.entries(data.breakdown || {})
    .filter(([, c]) => c > 0)
    .map(([status, count]) => ({
      name: ATTENDANCE_META[status]?.label || status,
      value: count,
      color: ATTENDANCE_META[status]?.color || '#64748b',
    }));
  if (!rows.length) return <EmptyHint />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {rows.map((r, i) => (
            <Cell key={i} fill={r.color} />
          ))}
        </Pie>
        <Tooltip formatter={(v: any) => [`${v} (${data.total_attendances ? ((Number(v) / data.total_attendances) * 100).toFixed(1) : 0}%)`, ''] as [string, string]} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
};

// ---- Attendance rate trend (line + 90% target) ----
export const AttendanceTrendLine: React.FC<{ data: AttendancePayload['trend'] }> = ({ data }) => {
  if (!data.points.length) return <EmptyHint />;
  return (
    <div>
      <p className="text-[11px] text-text-muted mb-2">Độ hạt: {GRANULARITY_LABEL[data.granularity]}</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data.points}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} unit="%" width={42} />
          <Tooltip formatter={(v: any, n: any) => [n === 'rate' ? `${v}%` : v, n === 'rate' ? 'Chuyên cần' : n] as [any, string]} />
          <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Mục tiêu 90%', fontSize: 11, fill: '#b45309', position: 'insideTopRight' }} />
          <Line type="monotone" dataKey="rate" name="Chuyên cần" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ---- Attendance rate by class (bar) ----
export const AttendanceByClassBar: React.FC<{ data: AttendancePayload['by_class'] }> = ({ data }) => {
  if (!data.length) return <EmptyHint />;
  const rows = data.slice(-12); // last 12 classes (worst first)
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis type="category" dataKey="class_name" tick={{ fontSize: 11, fill: '#475569' }} width={140} />
        <Tooltip formatter={(v: any) => [`${v}%`, 'Chuyên cần'] as [string, string]} />
        <Bar dataKey="rate" name="Chuyên cần" fill="#4f46e5" radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
};
