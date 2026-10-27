import React, { useState, useEffect } from 'react';
import { CareTask, CreateCareTaskDTO, UpdateCareTaskDTO, TaskType, TaskPriority } from '../types/care.types';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { EnrollmentSearchSelect } from './EnrollmentSearchSelect';

interface CareTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCareTaskDTO | UpdateCareTaskDTO) => Promise<void>;
  initialTask?: CareTask | null;
  defaultEnrollmentId?: number;
}

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'CALLBACK', label: 'Hẹn gọi lại (Callback)' },
  { value: 'HOT_ISSUE', label: 'Điểm nóng / Khiếu nại (Hot Issue)' },
  { value: 'FOLLOW_UP', label: 'Theo dõi tiến độ (Follow-up)' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'LOW', label: 'Thấp (Low)' },
  { value: 'NORMAL', label: 'Bình thường (Normal)' },
  { value: 'HIGH', label: 'Cao (High)' },
  { value: 'URGENT', label: 'Khẩn cấp (Urgent)' },
];

export const CareTaskModal: React.FC<CareTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialTask,
  defaultEnrollmentId,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<number | null>(
    defaultEnrollmentId ? defaultEnrollmentId : null,
  );
  const [formData, setFormData] = useState({
    type: 'CALLBACK' as TaskType,
    priority: 'NORMAL' as TaskPriority,
    title: '',
    note: '',
    due_at: '',
  });

  useEffect(() => {
    if (initialTask) {
      setEnrollmentId(initialTask.enrollment_id ?? null);
      setFormData({
        type: initialTask.type,
        priority: initialTask.priority,
        title: initialTask.title || '',
        note: initialTask.note || '',
        due_at: initialTask.due_at ? new Date(initialTask.due_at).toISOString().slice(0, 16) : '',
      });
    } else {
      setEnrollmentId(defaultEnrollmentId ? defaultEnrollmentId : null);
      setFormData({
        type: 'CALLBACK',
        priority: 'NORMAL',
        title: '',
        note: '',
        due_at: '',
      });
    }
  }, [initialTask, defaultEnrollmentId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialTask && !enrollmentId) {
      toast.warning('Vui lòng chọn học viên (ghi danh) cho nhiệm vụ');
      return;
    }
    try {
      setLoading(true);
      if (initialTask) {
        const payload: UpdateCareTaskDTO = {
          type: formData.type,
          priority: formData.priority,
          title: formData.title || undefined,
          note: formData.note || undefined,
          due_at: formData.due_at ? new Date(formData.due_at).toISOString() : undefined,
        };
        await onSubmit(payload);
      } else {
        const payload: CreateCareTaskDTO = {
          enrollment_id: enrollmentId as number,
          type: formData.type,
          priority: formData.priority,
          title: formData.title || undefined,
          note: formData.note || undefined,
          due_at: formData.due_at ? new Date(formData.due_at).toISOString() : undefined,
        };
        await onSubmit(payload);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Có lỗi khi lưu nhiệm vụ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 text-base">
            {initialTask ? 'Chỉnh sửa Nhiệm vụ Chăm sóc' : 'Tạo Nhiệm vụ Chăm sóc Mới'}
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
              Học viên / Ghi danh <span className="text-red-500">*</span>
            </label>
            <EnrollmentSearchSelect
              value={enrollmentId}
              onChange={(id) => setEnrollmentId(id)}
              disabled={Boolean(initialTask)}
              fallbackLabel={
                initialTask?.enrollment
                  ? `${initialTask.enrollment.student?.full_name || 'HV'} · ${
                      initialTask.enrollment.student?.external_id || `#${initialTask.enrollment.id}`
                    } · ${
                      initialTask.enrollment.package?.name ||
                      initialTask.enrollment.package?.code ||
                      'Gói chưa rõ'
                    }`
                  : undefined
              }
              placeholder="Tìm theo tên học viên, mã HV, mã ghi danh..."
            />
            {initialTask && (
              <p className="mt-1 text-[10px] text-gray-400">
                Ghi danh gắn với nhiệm vụ đã tạo không thể thay đổi.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                Loại nhiệm vụ
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as TaskType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                Mức độ ưu tiên
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
              Tiêu đề nhiệm vụ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="VD: Gọi lại cho phụ huynh em An lúc 15:00..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
              Hạn hoàn thành (Due Date)
            </label>
            <input
              type="datetime-local"
              value={formData.due_at}
              onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
              Ghi chú nội dung
            </label>
            <textarea
              rows={3}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Ghi chú thêm thông tin cần chuẩn bị trước khi gọi..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Đang lưu...' : initialTask ? 'Lưu cập nhật' : 'Tạo nhiệm vụ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
