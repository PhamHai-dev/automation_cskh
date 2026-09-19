import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { classSessionsApi, attendanceApi } from '../api/sessions.api';
import { classesApi } from '../api/classes.api';
import {
  Class, ClassSession, Attendance, AttendanceStatus,
  SESSION_STATUS_LABELS,
} from '../types/classes.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { ArrowLeft, Save, CheckCircle } from 'lucide-react';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }[] = [
  { value: 'ATTENDED', label: '✓ Có mặt', variant: 'success' },
  { value: 'ABSENT_APPROVED_A', label: 'Nghỉ phép (A)', variant: 'warning' },
  { value: 'LEAVE_B', label: 'Bảo lưu (B)', variant: 'info' },
  { value: 'ABSENT_UNAPPROVED_C', label: 'Nghỉ sai (C)', variant: 'danger' },
  { value: 'TEACHER_ABSENT_D', label: 'GV nghỉ (D)', variant: 'danger' },
  { value: 'TECH_ERROR_E', label: 'Lỗi KT (E)', variant: 'neutral' },
];

const StatusBadgeInline = ({ status }: { status: AttendanceStatus }) => {
  const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
  return <Badge variant={opt.variant}>{opt.label}</Badge>;
};

export const AttendanceSheetPage = () => {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
  const clsId = parseInt(classId || '0');
  const sessId = parseInt(sessionId || '0');

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
      setError(err.response?.data?.error?.message || 'Failed to load attendance sheet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clsId && sessId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clsId, sessId]);

  const isReadOnly = session?.status !== 'SCHEDULED';

  const getStudentName = (a: Attendance) =>
    a.enrollment_class?.enrollment?.student?.full_name || `Học viên #${a.enrollment_class_id}`;


  const handleStatusChange = (attendanceId: number, status: AttendanceStatus) => {
    setEdits(prev => ({ ...prev, [attendanceId]: status }));
  };

  const handleBulkUpdate = async () => {
    if (!Object.keys(edits).length) return;
    setSaving(true);
    try {
      const items = Object.entries(edits).map(([attId, status]) => {
        const att = attendances.find(a => a.id === parseInt(attId));
        return { enrollment_class_id: att?.enrollment_class_id || 0, status };
      });
      await attendanceApi.bulkMark(clsId, sessId, { items });
      setSuccess('Đã lưu điểm danh!');
      setEdits({});
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getSummary = () => {
    const activeEdits = Object.keys(edits).length;
    return { total: attendances.length, edited: activeEdits, hasChanges: activeEdits > 0 };
  };

  const summary = getSummary();

  return (
    <PageContainer>
      <PageHeader
        title={cls ? `Điểm danh - ${cls.class_name}` : 'Điểm danh'}
        description={
          session
            ? `Buổi ${session.session_number} · ${new Date(session.session_date).toLocaleDateString('vi-VN')} · ${SESSION_STATUS_LABELS[session.status]}`
            : 'Danh sách học viên và trạng thái điểm danh.'
        }
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/classes/${clsId}/sessions`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
            </Button>
            {!isReadOnly && (
              <Button onClick={handleBulkUpdate} variant="primary" disabled={!summary.hasChanges || saving} isLoading={saving}>
                <Save className="w-4 h-4 mr-1" /> Lưu điểm danh
              </Button>
            )}
          </>
        }
      />

      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 p-4 rounded-md mb-6 flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {success}</div>}

      {/* Legend */}
      <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Chú thích trạng thái:</h3>
        <div className="flex flex-wrap gap-3">
          {STATUS_OPTIONS.map(opt => (
            <Badge key={opt.value} variant={opt.variant}>{opt.label}</Badge>
          ))}
        </div>
      </div>

      {/* Attendance Table */}
      <div className="w-full overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-medium">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">Trạng thái hiện tại</th>
              <th className="px-4 py-3 min-w-[280px]">
                {isReadOnly ? 'Trạng thái' : 'Thay đổi trạng thái'}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Đang tải...</td></tr>
            ) : attendances.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Chưa có dữ liệu điểm danh.</td></tr>
            ) : (
              attendances.map((att, idx) => (
                <tr key={att.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{getStudentName(att)}</td>
                  <td className="px-4 py-3"><StatusBadgeInline status={att.status} /></td>
                  <td className="px-4 py-3">
                    {isReadOnly ? (
                      <StatusBadgeInline status={att.status} />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map(opt => (
                          <Button
                            key={opt.value}
                            variant={edits[att.id] === opt.value || (!edits[att.id] && att.status === opt.value) ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => handleStatusChange(att.id, opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
};
