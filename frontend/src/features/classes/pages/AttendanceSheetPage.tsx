import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
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
import { useToast } from '../../../components/ui/Toast';
import { AttendanceMatrix, StudentRow } from '../components/AttendanceMatrix';
import {
  CalendarDays,
  CheckSquare,
  Save,
} from 'lucide-react';

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
}[] = [
  { value: 'ATTENDED', label: '✓ Có mặt', variant: 'success' },
  { value: 'ABSENT_APPROVED_A', label: 'Nghỉ phép (A)', variant: 'warning' },
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
  const toast = useToast();

  const clsId = parseInt(classId || '0', 10);
  const sessId = parseInt(sessionId || '0', 10);

  const [activeTab, setActiveTab] = useState<'matrix' | 'session'>('matrix');

  const [cls, setCls] = useState<Class | null>(null);
  const [session, setSession] = useState<ClassSession | null>(null);
  const [allSessions, setAllSessions] = useState<ClassSession[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [allAttendances, setAllAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track local changes for single session view
  const [edits, setEdits] = useState<Record<number, AttendanceStatus>>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [clsData, sessionData, attendData, sessionsList] = await Promise.all([
        classesApi.get(clsId),
        sessId ? classSessionsApi.get(clsId, sessId) : Promise.resolve(null),
        sessId ? attendanceApi.list(clsId, sessId) : Promise.resolve([]),
        classSessionsApi.list(clsId),
      ]);

      setCls(clsData);
      setSession(sessionData);
      setAttendances(attendData);
      setAllSessions(sessionsList);

      // Fetch attendances for recent sessions to build full matrix
      const recentSessions = sessionsList.slice(0, 15);
      const allAtts = await Promise.all(
        recentSessions.map((s) =>
          attendanceApi.list(clsId, s.id).catch(() => [] as Attendance[])
        )
      );
      setAllAttendances(allAtts.flat());
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải dữ liệu điểm danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clsId) fetchData();
  }, [clsId, sessId]);

  // Extract StudentRow list for the AttendanceMatrix
  const matrixStudents: StudentRow[] = useMemo(() => {
    const studentMap = new Map<number, StudentRow>();

    // 1. Direct enrolled students from class
    if (cls?.enrollment_classes) {
      cls.enrollment_classes.forEach((ec: any) => {
        const student = ec.enrollment?.student;
        const enrollment = ec.enrollment;
        const teacher = cls.class_teachers?.[0]?.teacher;

        studentMap.set(ec.id, {
          enrollment_class_id: ec.id,
          student_id: student?.id || ec.id,
          external_id: student?.external_id || `HV_${student?.id || ec.id}`,
          full_name: student?.full_name || `Học viên #${ec.id}`,
          status: enrollment?.status || 'STUDYING',
          start_date: enrollment?.start_date,
          end_date: enrollment?.end_date,
          start_time: '20h00',
          schedule_pattern: '246',
          duration_minutes: 30,
          teacher_name: teacher?.name || 'Thầy John',
          teacher_code: (teacher as any)?.teacher_code || 'GV_01',
          class_name: cls.class_name || 'Lớp học',
        });
      });
    }

    // 2. Also from attendances (in case there are historical records)
    const sourceAtts = allAttendances.length > 0 ? allAttendances : attendances;
    sourceAtts.forEach((att) => {
      const ecId = att.enrollment_class_id;
      if (!studentMap.has(ecId)) {
        const student = att.enrollment_class?.enrollment?.student;
        const enrollment = att.enrollment_class?.enrollment as any;
        const teacher = cls?.class_teachers?.[0]?.teacher;

        studentMap.set(ecId, {
          enrollment_class_id: ecId,
          student_id: student?.id || ecId,
          external_id: student?.external_id || String(student?.id || ecId),
          full_name: student?.full_name || `Học viên #${ecId}`,
          status: enrollment?.status || 'STUDYING',
          start_date: enrollment?.start_date,
          end_date: enrollment?.end_date,
          start_time: '20h00',
          schedule_pattern: '246',
          duration_minutes: 30,
          teacher_name: teacher?.name || 'Thầy John',
          teacher_code: (teacher as any)?.teacher_code || 'GV_01',
          class_name: cls?.class_name || 'Lớp học',
        });
      }
    });

    return Array.from(studentMap.values());
  }, [allAttendances, attendances, cls]);

  const handleStatusChange = (enrollmentClassId: number, status: AttendanceStatus) => {
    setEdits((prev) => ({ ...prev, [enrollmentClassId]: status }));
  };

  const handleSaveSession = async () => {
    if (!sessId) return;
    const records = Object.entries(edits).map(([ecId, status]) => ({
      enrollment_class_id: parseInt(ecId, 10),
      status,
    }));

    if (records.length === 0) return;

    try {
      setSaving(true);
      await attendanceApi.bulkMark(clsId, sessId, { items: records });
      setEdits({});
      toast.success('Đã lưu kết quả điểm danh thành công!');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Lỗi khi lưu điểm danh');
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
    toast.info('Đã đánh dấu tất cả có mặt. Bấm Lưu thay đổi để xác nhận.');
  };

  const hasChanges = Object.keys(edits).length > 0;

  return (
    <PageContainer>
      <PageHeader
        title={cls ? `Điểm danh Lớp ${cls.class_name}` : 'Điểm danh Lớp học'}
        description={
          session
            ? `Buổi số ${session.session_number} • Ngày ${new Date(session.session_date).toLocaleDateString('vi-VN')} • Mã lớp: ${cls?.class_code || '—'}`
            : `Mã lớp: ${cls?.class_code || '—'} • Mô hình: ${cls?.model_type === 'ONE_TO_ONE' ? '1 kèm 1' : 'Lớp nhóm'}`
        }
        backUrl={`/classes/${clsId}/sessions`}
        breadcrumbs={[
          { label: 'Quản lý Lớp học', href: '/classes' },
          { label: cls?.class_name || 'Chi tiết lớp', href: `/classes/${clsId}/sessions` },
          { label: session ? `Buổi ${session.session_number}` : 'Điểm danh' },
        ]}
        actions={
          activeTab === 'session' && sessId ? (
            <div className="flex items-center gap-2">
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
                onClick={handleSaveSession}
                disabled={!hasChanges || saving}
                isLoading={saving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Lưu thay đổi ({Object.keys(edits).length})
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-border/80">
        <button
          type="button"
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'matrix'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Ma trận Điểm danh theo Ngày</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary-soft text-primary font-bold">
            Chuẩn mới
          </span>
        </button>

        {sessId ? (
          <button
            type="button"
            onClick={() => setActiveTab('session')}
            className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
              activeTab === 'session'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Phiếu Buổi #{session?.session_number || sessId}</span>
          </button>
        ) : null}
      </div>

      {/* Tab 1: Full Attendance Matrix View */}
      {activeTab === 'matrix' && cls && (
        <AttendanceMatrix
          cls={cls}
          students={matrixStudents}
          sessions={allSessions}
          attendances={allAttendances.length > 0 ? allAttendances : attendances}
          onRefresh={fetchData}
        />
      )}

      {/* Tab 2: Single Session Detailed View */}
      {activeTab === 'session' && (
        <>
          {loading ? (
            <div className="p-12 text-center text-text-muted">Đang tải danh sách điểm danh...</div>
          ) : attendances.length === 0 ? (
            <div className="p-12 text-center text-text-muted bg-surface rounded-2xl border border-dashed border-border shadow-soft">
              Chưa có học viên nào được gán vào lớp học này.
            </div>
          ) : (
            <div className="w-full overflow-x-auto rounded-2xl border border-border/80 bg-surface shadow-soft">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-surface-muted/80 border-b border-border/80 text-xs font-bold text-text-secondary uppercase tracking-wider">
                    <th className="px-5 py-3.5">Học viên</th>
                    <th className="px-5 py-3.5">Gói học</th>
                    <th className="px-5 py-3.5">Trạng thái hiện tại</th>
                    <th className="px-5 py-3.5">Cập nhật điểm danh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {attendances.map((att) => {
                    const currentStatus = edits[att.enrollment_class_id] || att.status;
                    const isEdited = edits[att.enrollment_class_id] !== undefined;

                    return (
                      <tr
                        key={att.enrollment_class_id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isEdited ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-text-primary">
                            {att.enrollment_class?.enrollment?.student?.full_name || 'Học viên'}
                          </div>
                          <div className="text-xs text-text-muted mt-0.5">
                            {att.enrollment_class?.enrollment?.student?.phone ||
                              `Mã HV: ${att.enrollment_class?.enrollment?.student?.external_id || '—'}`}
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-xs text-text-secondary font-medium">
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
                            className={`text-xs font-medium rounded-xl border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                              isEdited
                                ? 'border-amber-400 bg-amber-50/50 font-bold text-amber-900 ring-1 ring-amber-400'
                                : 'border-border bg-surface text-text-primary'
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
        </>
      )}
    </PageContainer>
  );
};
