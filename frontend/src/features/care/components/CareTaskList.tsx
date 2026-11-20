import React from 'react';
import { CareTask, TaskPriority, TaskType, TaskStatus } from '../types/care.types';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { XCircle, Edit, Calendar, AlertCircle, Clock, Check, ChevronLeft, ChevronRight } from 'lucide-react';

interface CareTaskListProps {
  tasks: CareTask[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onComplete: (taskId: number) => Promise<void>;
  onCancel: (taskId: number) => Promise<void>;
  onEdit: (task: CareTask) => void;
  onRefresh?: () => void;
}

const TYPE_BADGES: Record<TaskType, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  CALLBACK: { label: 'Hẹn gọi lại', variant: 'info' },
  HOT_ISSUE: { label: 'Điểm nóng', variant: 'danger' },
  FOLLOW_UP: { label: 'Theo dõi', variant: 'neutral' },
  AUTO_ATTENDANCE: { label: 'Điểm danh tự động', variant: 'warning' },
  SCHEDULE_DATA_ISSUE: { label: 'Lỗi dữ liệu lịch', variant: 'danger' },
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
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onComplete,
  onCancel,
  onEdit,
  onRefresh: _onRefresh,
}) => {
  const safePage = Math.min(page, Math.max(1, totalPages));
  const startIdx = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(safePage * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end px-1 text-xs font-semibold text-text-muted">
        Tổng số: <span className="ml-1 font-black text-text-primary">{total.toLocaleString('vi-VN')}</span> nhiệm vụ
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

          {tasks.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
              <span>
                Hiển thị <strong className="text-gray-900">{startIdx}</strong>–
                <strong className="text-gray-900">{endIdx}</strong> /{' '}
                <strong className="text-gray-900">{tasks.length}</strong> nhiệm vụ
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span>Mỗi trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-xs font-semibold text-gray-800"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="px-2 font-semibold text-gray-800">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
