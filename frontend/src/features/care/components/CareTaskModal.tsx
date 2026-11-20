import { Textarea } from '../../../components/ui/Textarea';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import React, { useState, useEffect } from 'react';
import { CareTask, CreateCareTaskDTO, UpdateCareTaskDTO, TaskType, TaskPriority } from '../types/care.types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { EnrollmentSearchSelect } from './EnrollmentSearchSelect';
import { getEnrollmentPackageLabel } from '../../enrollments/utils/enrollmentDisplay';

interface CareTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateCareTaskDTO | UpdateCareTaskDTO) => Promise<void>;
  initialTask?: CareTask | null;
  defaultEnrollmentId?: number;
}

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'CALLBACK', label: 'Hẹn gọi lại' },
  { value: 'HOT_ISSUE', label: 'Điểm nóng / Khiếu nại' },
  { value: 'FOLLOW_UP', label: 'Theo dõi tiến độ' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'NORMAL', label: 'Bình thường' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'URGENT', label: 'Khẩn cấp' },
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
    <Modal isOpen={isOpen} onClose={onClose} title={initialTask ? 'Chỉnh sửa nhiệm vụ chăm sóc' : 'Tạo nhiệm vụ chăm sóc'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary uppercase tracking-wider mb-1">
            Học viên / Ghi danh <span className="text-red-500">*</span>
          </label>
          <EnrollmentSearchSelect
            value={enrollmentId}
            onChange={(id) => setEnrollmentId(id)}
            disabled={Boolean(initialTask)}
            fallbackLabel={
              initialTask?.enrollment
                ? `${initialTask.enrollment.student?.full_name || 'HV'} · ${initialTask.enrollment.student?.external_id || `#${initialTask.enrollment.id}`
                } · ${getEnrollmentPackageLabel(initialTask.enrollment)
                }`
                : undefined
            }
            placeholder="Tìm theo tên học viên, mã HV, mã ghi danh..."
          />
          {initialTask && (
            <p className="mt-1 text-[10px] text-text-muted">
              Ghi danh gắn với nhiệm vụ đã tạo không thể thay đổi.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label={"Loại nhiệm vụ"} value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as TaskType })}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>

          <Select label={"Mức độ ưu tiên"} value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <Input label={"Tiêu đề nhiệm vụ *"} type="text"
          required
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="VD: Gọi lại cho phụ huynh em An lúc 15:00..." />

        <Input label="Hạn hoàn thành" type="datetime-local"
          value={formData.due_at}
          onChange={(e) => setFormData({ ...formData, due_at: e.target.value })} />

        <Textarea label={"Ghi chú nội dung"} rows={3}
          value={formData.note}
          onChange={(e) => setFormData({ ...formData, note: e.target.value })}
          placeholder="Ghi chú thêm thông tin cần chuẩn bị trước khi gọi..."></Textarea>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Đang lưu...' : initialTask ? 'Lưu cập nhật' : 'Tạo nhiệm vụ'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
