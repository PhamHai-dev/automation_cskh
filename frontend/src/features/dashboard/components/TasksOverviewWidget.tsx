import React from 'react';
import { TasksOverview } from '../types/dashboard.types';
import { AlertCircle, Clock, Calendar, Zap, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface TasksOverviewWidgetProps {
  data: TasksOverview | null;
  loading?: boolean;
}

export const TasksOverviewWidget: React.FC<TasksOverviewWidgetProps> = ({ data, loading }) => {
  if (loading || !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-5 bg-gray-200 rounded w-1/3" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h4 className="font-semibold text-gray-900 text-base">Tổng quan Nhiệm vụ CS (Care Tasks)</h4>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {data.pending_total} việc đang chờ
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-4">Các nhiệm vụ cần hoàn thành phân bổ theo mức độ khẩn cấp</p>

        <div className="grid grid-cols-2 gap-3">
          {/* Overdue */}
          <div className="p-3 bg-red-50/70 border border-red-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>Đã quá hạn</span>
            </div>
            <div className="text-2xl font-bold text-red-900">{data.overdue}</div>
          </div>

          {/* Due Today */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Hạn hôm nay</span>
            </div>
            <div className="text-2xl font-bold text-amber-900">{data.due_today}</div>
          </div>

          {/* Due This Week */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Hạn tuần này</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">{data.due_this_week}</div>
          </div>

          {/* Urgent / Hot Issue */}
          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
              <Zap className="w-4 h-4 text-purple-600" />
              <span>Gấp / Điểm nóng</span>
            </div>
            <div className="text-2xl font-bold text-purple-900">{data.urgent_hot_issues}</div>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Đã xong gần đây: <strong className="text-gray-700">{data.completed_recent}</strong>
        </span>
        <Link
          to="/care"
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
        >
          Xem danh sách nhiệm vụ
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};
