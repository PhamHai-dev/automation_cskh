import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { classSessionsApi, attendanceApi } from '../api/sessions.api';
import { classesApi } from '../api/classes.api';
import {
  Class,
  ClassSession,
  Attendance,
  AttendanceStatus,
} from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ArrowLeft, Save, CheckCircle } from 'lucide-react';

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
}[] = [
  { value: 'ATTENDED', label: '✓ Có mặt', variant: 'success' },
  { value: 'ABSENT_APPROVED_A', label: 'Nghỉ có phép (A)', variant: 'warning' },
  { value: 'LEAVE_B', label: 'Bảo lưu (B)', variant: 'info' },
  { value: 'ABSENT_UNAPPROVED_C', label: 'Nghỉ không phép (C)', variant: 'danger' },
  { value: 'TEACHER_ABSENT_D', label: 'Giáo viên nghỉ (D)', variant: 'danger' },
  { value: 'TECH_ERROR_E', label: 'Lỗi kỹ thuật (E)', variant: 'neutral' },
];

const StatusBadgeInline = ({ status }: { status: AttendanceStatus }) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  return <Badge variant={opt.variant}>{opt.label}</Badge>;
};

export const AttendanceSheetPage = () => {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
  const clsId = parseInt(classId || '0', 10);
  const sessId = parseInt(sessionId || '0', 10);

  const [cls, setCls] = useState<Class | null>(null);
  const [session, setSession] = useState<ClassSession | null>(null);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Track local changes
  const [edits, setEdits] = useState<Record<number, AttendanceStatus>>({});

  const fetchData = async () => {
    try {
      const [clsData, sessionData, attendData] = await Promise.all([
        classesApi.get(clsId),
        classSessionsApi.get(clsId, sessId),
        attendanceApi.list(clsId, sessId),
      ]);
      setCls(clsData);
      setSession(sessionData);
      setAttendances(attendData);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Không thể tải phiếu điểm danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clsId && sessId) fetchData();
  }, [clsId, sessId]);

  const handleStatusChange = (enrollmentClassId: number, status: AttendanceStatus) => {
    setEdits((prev) => ({ ...prev, [enrollmentClassId]: status }));
  };

  const handleSave = async () => {
    const records = Object.entries(edits).map(([ecId, status]) => ({
      enrollment_class_id: parseInt(ecId, 10),
      status,
    }));

    if (records.length === 0) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await attendanceApi.bulkMark(clsId, sessId, { items: records });
      setEdits({});
      setSuccess('Đã lưu kết quả điểm danh thành công!');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lỗi khi lưu điểm danh');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllAttended = () => {
    const newEdits: Record<number, AttendanceStatus> = {};
    attendances.forEach((att) => {
      newEdits[att.enrollment_class_id] = 'ATTENDED';
    });
    setEdits(newEdits);
  };

  const hasChanges = Object.keys(edits).length > 0;

  return (
    <PageContainer>
      <div className="mb-4">
        <button
          onClick={() => navigate(`/classes/${clsId}/sessions`)}
          className="inline-flex items-center text-xs font-semibold text-gray-500 hover:text-blue-600 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Quay lại danh sách buổi học
        </button>
      </div>

      <PageHeader
        title={`Phiếu Điểm danh — Buổi số ${session?.session_number || ''}`}
        description={`${cls?.class_name || ''} | Ngày học: ${
          session ? new Date(session.session_date).toLocaleDateString('vi-VN') : ''
        }`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllAttended}
              disabled={loading || attendances.length === 0}
            >
              Đánh dấu tất cả có mặt
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : `Lưu thay đổi (${Object.keys(edits).length})`}
            </Button>
          </div>
        }
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-4 text-sm">{error}</div>}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl mb-4 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-gray-500">Đang tải danh sách điểm danh...</div>
      ) : attendances.length === 0 ? (
        <div className="p-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
          Chưa có học viên nào được gán vào lớp học này.
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50/80 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">Học viên</th>
                <th className="px-5 py-3">Gói học</th>
                <th className="px-5 py-3">Trạng thái hiện tại</th>
                <th className="px-5 py-3">Cập nhật điểm danh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendances.map((att) => {
                const currentStatus = edits[att.enrollment_class_id] || att.status;
                const isEdited = edits[att.enrollment_class_id] !== undefined;

                return (
                  <tr
                    key={att.enrollment_class_id}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isEdited ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-gray-900">
                        {att.enrollment_class?.enrollment?.student?.full_name || 'Học viên'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {att.enrollment_class?.enrollment?.student?.phone ||
                          `Mã HV: ${att.enrollment_class?.enrollment?.student?.external_id || '—'}`}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-gray-600">
                      {att.enrollment_class?.enrollment?.package?.name || '—'}
                    </td>

                    <td className="px-5 py-3.5">
                      <StatusBadgeInline status={att.status} />
                    </td>

                    <td className="px-5 py-3.5">
                      <select
                        value={currentStatus}
                        onChange={(e) =>
                          handleStatusChange(
                            att.enrollment_class_id,
                            e.target.value as AttendanceStatus
                          )
                        }
                        className={`text-xs rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isEdited
                            ? 'border-amber-400 bg-amber-50/50 font-semibold text-amber-900'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
};
