import React, { useState } from 'react';
import { CareLog, CareOutcome, CreateCareLogDTO } from '../types/care.types';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { MessageSquare, Calendar, User, Plus } from 'lucide-react';

interface CareLogTimelineProps {
  logs: CareLog[];
  enrollmentId: number;
  onAddLog: (data: CreateCareLogDTO) => Promise<void>;
  loading?: boolean;
}

const OUTCOME_LABELS: Record<CareOutcome, { label: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  POSITIVE: { label: 'Tích cực / Hài lòng', variant: 'success' },
  NEED_SUPPORT_SYSTEM: { label: 'Cần hỗ trợ kỹ thuật/hệ thống', variant: 'info' },
  TEMP_PAUSE: { label: 'Tạm bảo lưu / Dừng tạm thời', variant: 'warning' },
  NEED_CURRICULUM_SUPPORT: { label: 'Cần hỗ trợ giáo trình', variant: 'info' },
  NEED_STUDENT_WEAKNESS_FIX: { label: 'Cần kèm yếu', variant: 'info' },
  NEED_TEACHER_SUPPORT: { label: 'Cần đổi/hỗ trợ giáo viên', variant: 'warning' },
  NEGATIVE_WANTS_TO_STOP: { label: 'Tiêu cực / Muốn dừng học', variant: 'danger' },
  NO_RESPONSE: { label: 'Không phản hồi / Không nghe máy', variant: 'neutral' },
};

export const CareLogTimeline: React.FC<CareLogTimelineProps> = ({
  logs,
  enrollmentId: _enrollmentId,
  onAddLog,
  loading = false,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<CreateCareLogDTO>({
    after_session_number: 1,
    outcome: 'POSITIVE',
    content: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await onAddLog(formData);
      setIsModalOpen(false);
      setFormData({ after_session_number: 1, outcome: 'POSITIVE', content: '' });
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Có lỗi khi lưu nhật ký chăm sóc');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Lịch sử Chăm sóc Học viên</h3>
          <p className="text-sm text-gray-500">Ghi chép liên tục theo mốc buổi học và diễn biến tâm lý học viên</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Ghi nhận phản hồi
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500">Đang tải nhật ký...</div>
      ) : logs.length === 0 ? (
        <div className="py-12 border-2 border-dashed border-gray-200 rounded-lg text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 font-medium">Chưa có nhật ký chăm sóc nào cho ghi danh này</p>
          <p className="text-sm text-gray-400 mt-1">Hãy tạo ghi chép đầu tiên sau buổi học để theo dõi tiến độ</p>
        </div>
      ) : (
        <div className="relative pl-6 border-l-2 border-gray-200 space-y-6">
          {logs.map((log) => {
            const outcomeConfig = OUTCOME_LABELS[log.outcome] || { label: log.outcome, variant: 'neutral' };
            const formattedDate = new Date(log.created_at).toLocaleString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });

            return (
              <div key={log.id} className="relative group">
                {/* Dot marker */}
                <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 border-white bg-blue-600 shadow-sm" />

                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow transition-shadow">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        Sau buổi {log.after_session_number}
                      </span>
                      <Badge variant={outcomeConfig.variant}>{outcomeConfig.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formattedDate}
                      </span>
                      {log.cs && (
                        <span className="flex items-center gap-1 font-medium text-gray-600">
                          <User className="w-3.5 h-3.5" />
                          {log.cs.name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {log.content || <span className="italic text-gray-400">Không có ghi chú chi tiết</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm Nhật Ký */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 text-base">Thêm Nhật ký Chăm sóc Mới</h4>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Mốc buổi học (Sau buổi số)
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formData.after_session_number}
                  onChange={(e) =>
                    setFormData({ ...formData, after_session_number: parseInt(e.target.value, 10) || 1 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Kết quả chăm sóc / Tình trạng
                </label>
                <select
                  value={formData.outcome}
                  onChange={(e) => setFormData({ ...formData, outcome: e.target.value as CareOutcome })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {Object.entries(OUTCOME_LABELS).map(([key, val]) => (
                    <option key={key} value={key}>
                      {val.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
                  Nội dung chi tiết / Phản hồi của học viên
                </label>
                <textarea
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Ghi chú chi tiết trao đổi với phụ huynh hoặc học viên..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Đang lưu...' : 'Lưu nhật ký'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
