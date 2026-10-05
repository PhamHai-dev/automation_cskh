import React from 'react';
import { CareTask, TaskFilterParams, TaskPriority, TaskType, TaskStatus } from '../types/care.types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { XCircle, Edit, Calendar, AlertCircle, Clock, Check } from 'lucide-react';

interface CareTaskListProps {
  tasks: CareTask[];
  loading?: boolean;
  filter: TaskFilterParams;
  onFilterChange: (newFilter: TaskFilterParams) => void;
  onComplete: (taskId: number) => Promise<void>;
  onCancel: (taskId: number) => Promise<void>;
  onEdit: (task: CareTask) => void;
  onRefresh?: () => void;
}

const TYPE_BADGES: Record<TaskType, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  CALLBACK: { label: 'Hẹn gọi lại', variant: 'info' },
  HOT_ISSUE: { label: 'Điểm nóng', variant: 'danger' },
  FOLLOW_UP: { label: 'Theo dõi', variant: 'neutral' },
};

const PRIORITY_BADGES: Record<TaskPriority, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  LOW: { label: 'Thấp', variant: 'neutral' },
  NORMAL: { label: 'Thường', variant: 'info' },
  HIGH: { label: 'Cao', variant: 'warning' },
  URGENT: { label: 'Gấp', variant: 'danger' },
};

const STATUS_BADGES: Record<TaskStatus, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  PENDING: { label: 'Chờ xử lý', variant: 'warning' },
  DONE: { label: 'Hoàn thành', variant: 'success' },
  CANCELLED: { label: 'Đã hủy', variant: 'neutral' },
};

export const CareTaskList: React.FC<CareTaskListProps> = ({
  tasks,
  loading = false,
  filter,
  onFilterChange,
  onComplete,
  onCancel,
  onEdit,
  onRefresh: _onRefresh,
}) => {
  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Quick status tabs */}
          <button
            onClick={() => onFilterChange({ ...filter, status: undefined })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter.status === undefined
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => onFilterChange({ ...filter, status: 'PENDING' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter.status === 'PENDING'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Đang chờ
          </button>
          <button
            onClick={() => onFilterChange({ ...filter, status: 'DONE' })}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter.status === 'DONE'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Đã xong
          </button>

          <div className="h-4 w-px bg-gray-300 mx-1 hidden sm:block" />

          {/* Due filter */}
          <select
            value={filter.due_filter || ''}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                due_filter: (e.target.value as any) || undefined,
              })
            }
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tất cả thời hạn</option>
            <option value="overdue">Quá hạn (Overdue)</option>
            <option value="today">Hạn hôm nay</option>
            <option value="this_week">Hạn trong tuần</option>
          </select>

          {/* Priority filter */}
          <select
            value={filter.priority || ''}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                priority: (e.target.value as any) || undefined,
              })
            }
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tất cả độ ưu tiên</option>
            <option value="URGENT">Khẩn cấp</option>
            <option value="HIGH">Cao</option>
            <option value="NORMAL">Bình thường</option>
            <option value="LOW">Thấp</option>
          </select>

          {/* Type filter */}
          <select
            value={filter.type || ''}
            onChange={(e) =>
              onFilterChange({
                ...filter,
                type: (e.target.value as any) || undefined,
              })
            }
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Tất cả loại việc</option>
            <option value="CALLBACK">Hẹn gọi lại</option>
            <option value="HOT_ISSUE">Điểm nóng</option>
            <option value="FOLLOW_UP">Theo dõi</option>
          </select>
        </div>

        <div className="text-xs text-gray-500 font-medium">
          Tổng số: <span className="font-semibold text-gray-800">{tasks.length}</span> nhiệm vụ
        </div>
      </div>

      {/* Task List / Table */}
      {loading ? (
        <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200">
          Đang tải danh sách nhiệm vụ...
        </div>
      ) : tasks.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-dashed border-gray-200">
          <Clock className="w-12 h-12 mx-auto text-gray-300 mb-2" />
          <p className="font-medium text-gray-600">Không có nhiệm vụ nào phù hợp với bộ lọc</p>
          <p className="text-xs text-gray-400 mt-1">Hãy tạo nhiệm vụ mới để ghi nhớ lịch hẹn gọi lại hoặc vấn đề cần xử lý</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const isOverdue =
              task.status === 'PENDING' && task.due_at && new Date(task.due_at) < new Date();
            const typeConfig = TYPE_BADGES[task.type] || { label: task.type, variant: 'neutral' };
            const priorityConfig = PRIORITY_BADGES[task.priority] || { label: task.priority, variant: 'neutral' };
            const statusConfig = STATUS_BADGES[task.status] || { label: task.status, variant: 'neutral' };

            const formattedDue = task.due_at
              ? new Date(task.due_at).toLocaleString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : 'Không đặt hạn';

            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border p-4 shadow-sm transition-all hover:shadow flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isOverdue ? 'border-red-300 bg-red-50/20' : 'border-gray-200'
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
                    <Badge variant={priorityConfig.variant}>{priorityConfig.label}</Badge>
                    <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    {isOverdue && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        <AlertCircle className="w-3 h-3" />
                        Quá hạn
                      </span>
                    )}
                  </div>

                  <div className="font-semibold text-gray-900 text-sm md:text-base leading-snug truncate">
                    {task.title || 'Nhiệm vụ không tiêu đề'}
                  </div>

                  {task.note && (
                    <div className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                      {task.note}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 pt-1">
                    {task.enrollment && (
                      <span>
                        Học viên:{' '}
                        <strong className="text-gray-700">
                          {task.enrollment.student?.full_name || 'Học viên'} (
                          {task.enrollment.student?.phone || 'Chưa có SĐT'})
                        </strong>
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      Hạn: <strong className={isOverdue ? 'text-red-600' : 'text-gray-700'}>{formattedDue}</strong>
                    </span>
                    {task.assigned_to && (
                      <span>
                        Phụ trách: <strong className="text-gray-700">{task.assigned_to.name}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0 border-t md:border-t-0 pt-2 md:pt-0 w-full md:w-auto justify-end">
                  {task.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onComplete(task.id)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        leftIcon={<Check className="w-3.5 h-3.5" />}
                        title="Đánh dấu hoàn thành"
                      >
                        Xong
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCancel(task.id)}
                        className="text-gray-500 hover:text-red-600 hover:border-red-300"
                        leftIcon={<XCircle className="w-3.5 h-3.5" />}
                        title="Hủy nhiệm vụ"
                      >
                        Hủy
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(task)}
                    className="text-gray-600 hover:text-blue-600"
                    leftIcon={<Edit className="w-3.5 h-3.5" />}
                    title="Chỉnh sửa"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
