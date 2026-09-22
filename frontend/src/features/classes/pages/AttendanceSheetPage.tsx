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
  Check,
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
  const [editCounts, setEditCounts] = useState<Record<number, number>>({});

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

  // Handle single student attendance toggle
  const handleToggleAttended = (enrollmentClassId: number, checked: boolean) => {
    if (checked) {
      setEdits((prev) => ({ ...prev, [enrollmentClassId]: 'ATTENDED' }));
      setEditCounts((prev) => ({ ...prev, [enrollmentClassId]: prev[enrollmentClassId] || 1 }));
    } else {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[enrollmentClassId];
        return next;
      });
    }
  };

  // Change session count for attended
  const handleCountChange = (enrollmentClassId: number, countVal: number) => {
    setEditCounts((prev) => ({ ...prev, [enrollmentClassId]: countVal }));
    setEdits((prev) => ({ ...prev, [enrollmentClassId]: 'ATTENDED' }));
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
        session_count: status === 'ATTENDED' ? (editCounts[ecIdNum] || 1) : 1,
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
    const newCounts: Record<number, number> = {};
    attendances.forEach((att) => {
      newEdits[att.enrollment_class_id] = 'ATTENDED';
      newCounts[att.enrollment_class_id] = 1;
    });
    setEdits(newEdits);
    setEditCounts(newCounts);
    toast.info('Đã tích chọn Có mặt (1 buổi) cho tất cả học viên. Bấm Lưu thay đổi để xác nhận.');
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

  return (
    <PageContainer>
      <PageHeader
        title={cls ? `Điểm danh Lớp ${cls.class_name}` : 'Điểm danh Lớp học'}
        description={
          session
            ? `Buổi số ${session.session_number} • Ngày ${new Date(session.session_date).toLocaleDateString('vi-VN')} • Mã lớp: ${cls?.class_code || '—'}`
            : `Mã lớp: ${cls?.class_code || '—'} • Mô hình: ${cls?.model_type || '—'}`
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
            Chuẩn mới (Có ô tích chọn)
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
                        <span>CÓ MẶT (ĐIỀN SỐ BUỔI)</span>
                      </div>
                    </th>
                    <th className="px-5 py-3.5 min-w-[260px]">LÝ DO VẮNG / NGHỈ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {attendances.map((att) => {
                    const currentStatus = edits[att.enrollment_class_id] || att.status;
                    const isEdited = edits[att.enrollment_class_id] !== undefined;
                    const isAttended = currentStatus === 'ATTENDED';
                    const currentCount = editCounts[att.enrollment_class_id] || 1;

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

                            {/* Number input for session count */}
                            <div className="flex items-center gap-1 ml-1">
                              <input
                                type="number"
                                min="0.5"
                                max="10"
                                step="0.5"
                                value={currentCount}
                                disabled={!isAttended}
                                onChange={(e) =>
                                  handleCountChange(
                                    att.enrollment_class_id,
                                    Number(e.target.value) || 1
                                  )
                                }
                                className={`w-14 text-center text-xs font-extrabold rounded-lg border py-1 focus:outline-none focus:ring-1 ${
                                  isAttended
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 focus:ring-emerald-500'
                                    : 'bg-slate-100 border-border text-slate-400 cursor-not-allowed'
                                }`}
                              />
                              <span className="text-[11px] text-text-muted">buổi</span>
                            </div>

                            {/* Quick 1, 2, 3 preset buttons */}
                            {isAttended && (
                              <div className="flex items-center gap-1 ml-1">
                                {[1, 2, 3].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() =>
                                      handleCountChange(att.enrollment_class_id, num)
                                    }
                                    className={`w-5 h-5 rounded text-[10px] font-extrabold border ${
                                      currentCount === num
                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                        : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                            )}
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
