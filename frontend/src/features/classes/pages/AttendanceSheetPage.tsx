import { useEffect, useState, useMemo } from 'react';
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
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { AttendanceMatrix, StudentRow } from '../components/AttendanceMatrix';
import {
  CalendarDays,
  CheckSquare,
  Save,
  Check,
  AlertTriangle,
} from 'lucide-react';

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  short: string;
  variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  bg: string;
  text: string;
  border: string;
}[] = [
  {
    value: 'ATTENDED',
    label: 'Có mặt (Điền số)',
    short: '1',
    variant: 'success',
    bg: 'bg-emerald-100 hover:bg-emerald-200',
    text: 'text-emerald-800 font-extrabold',
    border: 'border-emerald-300',
  },
  {
    value: 'ABSENT_APPROVED_A',
    label: 'Nghỉ phép (A)',
    short: 'A',
    variant: 'warning',
    bg: 'bg-amber-100 hover:bg-amber-200',
    text: 'text-amber-800 font-extrabold',
    border: 'border-amber-300',
  },
  {
    value: 'LEAVE_B',
    label: 'Bảo lưu (B)',
    short: 'B',
    variant: 'info',
    bg: 'bg-blue-100 hover:bg-blue-200',
    text: 'text-blue-800 font-extrabold',
    border: 'border-blue-300',
  },
  {
    value: 'ABSENT_UNAPPROVED_C',
    label: 'Nghỉ không phép (C)',
    short: 'C',
    variant: 'danger',
    bg: 'bg-rose-100 hover:bg-rose-200',
    text: 'text-rose-800 font-extrabold',
    border: 'border-rose-300',
  },
  {
    value: 'TEACHER_ABSENT_D',
    label: 'Giáo viên nghỉ (D)',
    short: 'D',
    variant: 'danger',
    bg: 'bg-red-200 hover:bg-red-300',
    text: 'text-red-900 font-extrabold',
    border: 'border-red-400',
  },
  {
    value: 'TECH_ERROR_E',
    label: 'Lỗi kỹ thuật (E)',
    short: 'E',
    variant: 'neutral',
    bg: 'bg-slate-200 hover:bg-slate-300',
    text: 'text-slate-800 font-extrabold',
    border: 'border-slate-400',
  },
];

const StatusBadgeInline = ({ status }: { status: AttendanceStatus }) => {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  return (
    <Badge variant={opt.variant}>
      {opt.value === 'ATTENDED' ? 'Có mặt (1 buổi)' : opt.label}
    </Badge>
  );
};

export const AttendanceSheetPage = () => {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
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
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);

  // Track local changes for single session view
  const [edits, setEdits] = useState<Record<number, AttendanceStatus>>({});
  

  const fetchData = async () => {
    try {
      setLoading(true);
      setForbiddenError(null);
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

      const recentSessions = sessionsList.slice(0, 15);
      const allAtts = await Promise.all(
        recentSessions.map((s) =>
          attendanceApi.list(clsId, s.id).catch(() => [] as Attendance[])
        )
      );
      setAllAttendances(allAtts.flat());
    } catch (err: any) {
      if (err.response?.status === 403) {
        setForbiddenError(
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Bạn không được phân công phụ trách lớp học này nên không thể xem hoặc thực hiện điểm danh.'
        );
      } else {
        toast.error(err.response?.data?.error?.message || 'Không thể tải dữ liệu điểm danh');
      }
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

    if (cls?.enrollment_classes) {
      cls.enrollment_classes.forEach((ec: any) => {
        const student = ec.enrollment?.student;
        const enrollment = ec.enrollment;
        const teacher = cls.class_teachers?.[0]?.teacher;
        const schedule = cls.class_schedules?.[0];

        studentMap.set(ec.id, {
          enrollment_class_id: ec.id,
          student_id: student?.id || ec.id,
          external_id: student?.external_id || `HV_${student?.id || ec.id}`,
          full_name: student?.full_name || `Học viên #${ec.id}`,
          package_name: enrollment?.package?.name || enrollment?.package?.code || 'Gói học',
          course_content: enrollment?.course_content || 'Thường',
          total_sessions: enrollment?.total_sessions || 0,
          level: enrollment?.level || cls.level || 'Thường',
          email: student?.email || '',
          model_type: cls.model_type || enrollment?.class_model || '1:1',
          remaining_sessions: enrollment?.external_remaining_sessions,
          attended_previous_years: enrollment?.attended_previous_years ?? 0,
          status: enrollment?.status || 'STUDYING',
          start_date: enrollment?.start_date,
          end_date: enrollment?.end_date,
          start_time: schedule?.start_time || '20h00',
          schedule_pattern: schedule?.schedule_pattern || '246',
          duration_minutes: schedule?.duration_minutes || 30,
          teacher_name: teacher?.name || '—',
          teacher_code:
            (teacher as any)?.code ||
            (teacher as any)?.teacher_profile?.teacher_code ||
            (teacher as any)?.teacher_code ||
            '—',
          class_name: cls.class_name || '—',
        });
      });
    }

    const sourceAtts = allAttendances.length > 0 ? allAttendances : attendances;
    sourceAtts.forEach((att) => {
      const ecId = att.enrollment_class_id;
      if (!studentMap.has(ecId)) {
        const student = att.enrollment_class?.enrollment?.student;
        const enrollment = att.enrollment_class?.enrollment as any;
        const teacher = cls?.class_teachers?.[0]?.teacher;
        const schedule = cls?.class_schedules?.[0];

        studentMap.set(ecId, {
          enrollment_class_id: ecId,
          student_id: student?.id || ecId,
          external_id: student?.external_id || String(student?.id || ecId),
          full_name: student?.full_name || `Học viên #${ecId}`,
          package_name: enrollment?.package?.name || enrollment?.package?.code || 'Gói học',
          course_content: enrollment?.course_content || 'Thường',
          total_sessions: enrollment?.total_sessions || 0,
          level: enrollment?.level || cls?.level || 'Thường',
          email: student?.email || '',
          model_type: cls?.model_type || enrollment?.class_model || '1:1',
          remaining_sessions: enrollment?.external_remaining_sessions,
          attended_previous_years: enrollment?.attended_previous_years ?? 0,
          status: enrollment?.status || 'STUDYING',
          start_date: enrollment?.start_date,
          end_date: enrollment?.end_date,
          start_time: schedule?.start_time || '20h00',
          schedule_pattern: schedule?.schedule_pattern || '246',
          duration_minutes: schedule?.duration_minutes || 30,
          teacher_name: teacher?.name || '—',
          teacher_code:
            (teacher as any)?.code ||
            (teacher as any)?.teacher_profile?.teacher_code ||
            (teacher as any)?.teacher_code ||
            '—',
          class_name: cls?.class_name || '—',
        });
      }
    });

    return Array.from(studentMap.values());
  }, [allAttendances, attendances, cls]);

  // Handle single student attendance toggle
  const handleToggleAttended = (enrollmentClassId: number, checked: boolean) => {
    if (checked) {
      setEdits((prev) => ({ ...prev, [enrollmentClassId]: 'ATTENDED' }));
    } else {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[enrollmentClassId];
        return next;
      });
    }
  };

  // Handle absent status change
  const handleAbsentSelect = (enrollmentClassId: number, status: AttendanceStatus) => {
    setEdits((prev) => ({ ...prev, [enrollmentClassId]: status }));
  };

  // Save session edits
  const handleSaveSession = async () => {
    if (!sessId) return;
    const records = Object.entries(edits).map(([ecId, status]) => {
      const ecIdNum = parseInt(ecId, 10);
      return {
        enrollment_class_id: ecIdNum,
        status,
      };
    });

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

  // Mark all attended
  const handleMarkAllAttended = () => {
    const newEdits: Record<number, AttendanceStatus> = {};
    attendances.forEach((att) => {
      newEdits[att.enrollment_class_id] = 'ATTENDED';
    });
    setEdits(newEdits);
    toast.info('Đã tích chọn Có mặt cho tất cả học viên. Bấm Lưu thay đổi để xác nhận.');
  };

  // Toggle all attended checkbox
  const isAllAttended =
    attendances.length > 0 &&
    attendances.every((att) => {
      const current = edits[att.enrollment_class_id] || att.status;
      return current === 'ATTENDED';
    });

  const handleToggleAll = () => {
    if (isAllAttended) {
      setEdits({});
      toast.info('Đã bỏ chọn tất cả');
    } else {
      handleMarkAllAttended();
    }
  };

  const hasChanges = Object.keys(edits).length > 0;

  if (forbiddenError) {
    return (
      <PageContainer>
        <PageHeader
          title="Điểm danh Lớp học"
          backUrl="/classes"
          breadcrumbs={[
            { label: 'Lớp học phụ trách', href: '/classes' },
            { label: 'Điểm danh' },
          ]}
        />
        <div className="bg-surface rounded-2xl border border-rose-200/80 p-8 text-center max-w-lg mx-auto my-12 shadow-soft">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-2xs">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Không có quyền truy cập lớp học</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            {forbiddenError}
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/classes')}
            >
              Về danh sách lớp phụ trách
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={cls ? `Điểm danh Lớp ${cls.class_name}` : 'Điểm danh Lớp học'}
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

      <HorizontalTabs
        ariaLabel="Chế độ điểm danh"
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
        items={[
          {
            value: 'matrix',
            label: 'Ma trận theo ngày',
            icon: <CalendarDays />,
            badge: 'Có tích chọn',
          },
          ...(sessId
            ? [{
                value: 'session' as const,
                label: `Phiếu buổi #${session?.session_number || sessId}`,
                icon: <CheckSquare />,
              }]
            : []),
        ]}
      />

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
                  <tr className="bg-surface-muted/80 border-b border-border/80 text-xs font-bold text-text-secondary">
                    <th className="px-5 py-3.5">Học viên</th>
                    <th className="px-5 py-3.5">Gói học</th>
                    <th className="px-5 py-3.5">Trạng thái hiện tại</th>
                    {/* Checkbox column for Có mặt */}
                    <th className="px-5 py-3.5 min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isAllAttended}
                          onChange={handleToggleAll}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                          title="Tích chọn tất cả có mặt"
                        />
                        <span>Có mặt</span>
                      </div>
                    </th>
                    <th className="px-5 py-3.5 min-w-[260px]">Lý do vắng / nghỉ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {attendances.map((att) => {
                    const currentStatus = edits[att.enrollment_class_id] || att.status;
                    const isEdited = edits[att.enrollment_class_id] !== undefined;
                    const isAttended = currentStatus === 'ATTENDED';

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

                        {/* Interactive Checkbox & Number Input */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isAttended}
                                onChange={(e) =>
                                  handleToggleAttended(
                                    att.enrollment_class_id,
                                    e.target.checked
                                  )
                                }
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer accent-emerald-600"
                              />
                              <span
                                className={`text-xs font-bold ${
                                  isAttended ? 'text-emerald-700' : 'text-text-muted'
                                }`}
                              >
                                Có mặt
                              </span>
                            </label>


                          </div>
                        </td>

                        {/* Absent status badges */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {STATUS_OPTIONS.filter((o) => o.value !== 'ATTENDED').map((opt) => {
                              const isSelected = currentStatus === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() =>
                                    handleAbsentSelect(
                                      att.enrollment_class_id,
                                      opt.value
                                    )
                                  }
                                  className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1 ${
                                    isSelected
                                      ? `${opt.bg} ${opt.text} ${opt.border} ring-2 ring-primary/40`
                                      : 'bg-surface-muted text-text-muted border-border/60 hover:text-text-primary hover:bg-slate-100'
                                  }`}
                                  title={opt.label}
                                >
                                  <span>{opt.short}</span>
                                  {isSelected && <Check className="w-3 h-3" />}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await attendanceApi.remove(clsId, sessId, att.id);
                                  toast.success('Đã reset trạng thái điểm danh');
                                  fetchData();
                                } catch (err: any) {
                                  toast.error('Lỗi khi reset điểm danh: ' + (err.response?.data?.error?.message || err.message));
                                }
                              }}
                              className="px-2 py-1 rounded-lg text-xs font-semibold border border-border/60 bg-surface-muted text-text-muted hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-all"
                              title="Chuyển sang Chưa điểm danh (-)"
                            >
                              -
                            </button>
                          </div>
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
