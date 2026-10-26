import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Upload,
  CheckCircle2,
  BookOpen,
  User,
  Check,
  UserRoundCheck,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { teachersApi } from '../../teachers/api/teachers.api';
import type { Teacher } from '../../teachers/types/teachers.types';
import { reconciliationApi } from '../api/reconciliation.api';
import { AttendanceStatus } from '../types/reconciliation.types';
import { classSessionsApi, attendanceApi } from '../../classes/api/sessions.api';
import { classesApi } from '../../classes/api/classes.api';

// Mint a fresh, opaque intent key (backend regex allows letters/digits/_/-).
const mintIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `actual-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const MyTeachingSessionsPage: React.FC = () => {
  const toast = useToast();

  const { user } = useAuth();
  const isPrivileged = !!user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE');
  // D8 assist-mark ("chấm hộ giáo viên") is ADMIN-only per backend
  // isAssistMarkPrivileged (reconciliation.service.ts); MANAGE keeps read-only
  // viewing of another teacher's schedule via teacher-sessions (ADMIN/MANAGE).
  const isAdmin = !!user?.roles.includes('ADMIN');
  const canRecordActual = !!user?.roles.includes('TEACHER') && !isPrivileged;

  const [sessions, setSessions] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Teacher scope (only for ADMIN/MANAGE — backend requires an explicit teacherId)
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | undefined>();
  const hasContext = !isPrivileged || !!selectedTeacherId;

  // Date filters
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month'>('today');

  // Mark Attendance Modal
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [selectedEnrollmentClass, setSelectedEnrollmentClass] = useState<any | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<any | null>(null);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('ATTENDED');
  const [lessonTopic, setLessonTopic] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Actual-session modal
  const [isActualSessionModalOpen, setIsActualSessionModalOpen] = useState(false);
  const [actualClassId, setActualClassId] = useState<number | ''>('');
  const [actualEnrollmentClassId, setActualEnrollmentClassId] = useState<number | ''>('');
  const [actualDate, setActualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualStartTime, setActualStartTime] = useState('');
  const [actualEndTime, setActualEndTime] = useState('');
  const [actualStatus, setActualStatus] = useState<AttendanceStatus>('ATTENDED');
  const [actualLessonTopic, setActualLessonTopic] = useState('');
  const [actualTeacherNote, setActualTeacherNote] = useState('');
  const [actualSessionKey, setActualSessionKey] = useState<string | null>(null);

  const calculateDates = useCallback(() => {
    const today = new Date();
    if (dateRangeFilter === 'today') {
      const ymd = today.toISOString().slice(0, 10);
      return { start: ymd, end: ymd };
    }
    if (dateRangeFilter === 'week') {
      const curr = new Date(today);
      const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
      const firstDay = new Date(curr.setDate(first));
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);
      return {
        start: firstDay.toISOString().slice(0, 10),
        end: lastDay.toISOString().slice(0, 10),
      };
    }
    // month
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: firstDay.toISOString().slice(0, 10),
      end: lastDay.toISOString().slice(0, 10),
    };
  }, [dateRangeFilter]);

  // Load teacher list once for ADMIN/MANAGE so they can pick whose schedule to view.
  useEffect(() => {
    if (!isPrivileged) return;
    teachersApi.list()
      .then((items) => setTeachers(items.filter((t) => t.active && t.user_id)))
      .catch(() => toast.error('Không thể tải danh sách giáo viên'));
  }, [isPrivileged, toast]);

  const loadSessions = useCallback(async () => {
    if (!hasContext) {
      setSessions([]);
      return;
    }
    setIsLoading(true);
    try {
      const { start, end } = calculateDates();
      const data = await reconciliationApi.getTeacherSessions({
        startDate: start,
        endDate: end,
        ...(isPrivileged ? { teacherId: selectedTeacherId } : {}),
      });
      setSessions(data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải lịch dạy của bạn');
    } finally {
      setIsLoading(false);
    }
  }, [calculateDates, hasContext, isPrivileged, selectedTeacherId, toast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!hasContext) {
      setAvailableClasses([]);
      return;
    }
    classesApi.list()
      .then((items) => setAvailableClasses(items.filter((item) => item.active)))
      .catch(() => toast.error('Không thể tải danh sách lớp phụ trách'));
  }, [hasContext, toast]);

  const handleOpenMarkModal = (session: any, ec: any, status: AttendanceStatus) => {
    if (isPrivileged && !isAdmin) return;
    setSelectedSession(session);
    setSelectedEnrollmentClass(ec);
    const existingAtt = ec.attendance?.find((a: any) => a.class_session_id === session.id && !a.deleted_at);
    setSelectedAttendance(existingAtt || null);
    setSelectedStatus(status);
    setLessonTopic(existingAtt?.lesson_topic || '');
    setTeacherNote(existingAtt?.teacher_note || '');
    setIsMarkModalOpen(true);
  };

  const handleConfirmMark = async () => {
    if (!selectedSession || !selectedEnrollmentClass) return;
    if (isPrivileged && !isAdmin) return;
    if (isPrivileged && !selectedTeacherId) {
      toast.warning('Hãy chọn giáo viên cần hỗ trợ');
      return;
    }

    const rawValue = selectedStatus === 'ATTENDED'
      ? `${selectedEnrollmentClass.enrollment?.student?.external_id || ''}-${lessonTopic.trim()}`
      : undefined;

    setIsSubmitting(true);
    try {
      const attendanceId = selectedAttendance?.id;

      if (attendanceId) {
        // Existing attendance row (skeleton from a prior create, or an already-recorded mark):
        // write the teacher opinion onto THAT single record via the reconciliation route so the
        // CSKH/teacher dual-opinion state is derived and downstream automation runs once.
        await reconciliationApi.markByTeacher(attendanceId, {
          status: selectedStatus,
          ...(isPrivileged ? { teacherId: selectedTeacherId } : {}),
          lessonTopic: selectedStatus === 'ATTENDED' ? lessonTopic.trim() || undefined : undefined,
          note: teacherNote.trim() || undefined,
          rawValue,
        });
      } else {
        // Scheduled session that has no attendance row yet: use the existing per-session
        // attendance upsert route. Its (enrollment_class_id + class_session_id) unique key means
        // a retry of the same student/session replays onto the SAME row (one record) and records
        // the teacher opinion there — never a second row, and CVHT keeps its own column on it.
        // The dedicated "Ghi ca thực học" flow is what creates a brand-new ClassSession.
        await attendanceApi.mark(selectedSession.class.id, selectedSession.id, {
          enrollment_class_id: selectedEnrollmentClass.id,
          status: selectedStatus,
          side: 'TEACHER',
          lesson_topic: selectedStatus === 'ATTENDED' ? lessonTopic.trim() || undefined : undefined,
          teacher_note: teacherNote.trim() || undefined,
        });
      }

      toast.success('Điểm danh thành công! Dữ liệu đã được gửi đối soát với CSKH.');
      setIsMarkModalOpen(false);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateActualSession = async () => {
    if (!actualClassId || !actualEnrollmentClassId || !actualDate) {
      toast.warning('Hãy chọn lớp, học viên và ngày dạy');
      return;
    }
    setIsSubmitting(true);
    try {
      const key = actualSessionKey || mintIdempotencyKey();
      setActualSessionKey(key);
      const session = await classSessionsApi.createActual(Number(actualClassId), {
        idempotency_key: key,
        enrollment_class_id: Number(actualEnrollmentClassId),
        session_date: actualDate,
        start_time: actualStartTime || undefined,
        end_time: actualEndTime || undefined,
      });
      const attendance = session.attendance?.find((item: any) => item.enrollment_class_id === Number(actualEnrollmentClassId));
      if (!attendance?.id) throw new Error('Không nhận được hồ sơ điểm danh của ca thực học');
      await reconciliationApi.markByTeacher(attendance.id, {
        status: actualStatus,
        ...(isPrivileged && selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
        lessonTopic: actualStatus === 'ATTENDED' ? actualLessonTopic.trim() || undefined : undefined,
        note: actualTeacherNote.trim() || undefined,
        rawValue: actualStatus === 'ATTENDED' ? `${actualEnrollmentClassId}-${actualLessonTopic.trim()}` : undefined,
      });
      toast.success('Đã ghi nhận ca thực học và điểm danh giáo viên.');
      setActualSessionKey(null);
      setIsActualSessionModalOpen(false);
      loadSessions();
    } catch (err: any) {
      // Keep actualSessionKey while the modal stays open so a retry replays one session.
      toast.error(err.response?.data?.message || err.message || 'Không thể ghi nhận ca thực học');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openActualSessionModal = () => {
    setActualSessionKey(null);
    setActualClassId('');
    setActualEnrollmentClassId('');
    setActualStartTime('');
    setActualEndTime('');
    setActualStatus('ATTENDED');
    setActualLessonTopic('');
    setActualTeacherNote('');
    setActualDate(new Date().toISOString().slice(0, 10));
    setIsActualSessionModalOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Lịch Dạy & Điểm Danh Của Tôi"
        description="Xem ca học hôm nay/tuần này, điểm danh nhanh bài học hoặc nhập workbook qua luồng preview/xác nhận an toàn."
        actions={
          <div className="flex items-center gap-2">
            {canRecordActual && (
              <Button
                variant="primary"
                onClick={openActualSessionModal}
                title="Ghi ca thực học sau khi dạy"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Ghi ca thực học
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => { window.location.assign('/imports?tab=attendance'); }}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Nhập workbook điểm danh
            </Button>
          </div>
        }
      />

      {/* MODAL: Ghi ca thực học — create session + attendance skeleton, then chain the teacher mark */}
      <Modal
        isOpen={isActualSessionModalOpen}
        closeOnOutsideClick={!isSubmitting}
        onClose={() => {
          // Do not discard the in-flight intent while a request is pending; closing mid-retry
          // would let a reopen mint a fresh key and create an unintended duplicate session.
          if (isSubmitting) return;
          setActualSessionKey(null);
          setIsActualSessionModalOpen(false);
        }}
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <CheckCircle2 className="w-5 h-5 text-teal-600" />
            <span>Ghi nhận ca thực học</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => {
                if (isSubmitting) return;
                setActualSessionKey(null);
                setIsActualSessionModalOpen(false);
              }}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreateActualSession} disabled={isSubmitting}>
              {isSubmitting ? 'Đang lưu...' : 'Ghi nhận & điểm danh'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Lịch 1-1 linh hoạt: bạn có thể ghi nhận ca sau khi dạy, kể cả khi chưa có buổi học được lên lịch trước.
            Hai ca trong cùng một ngày là hợp lệ — mỗi lần bấm tạo mới dùng một khóa ý định riêng, còn bấm lại do lỗi
            mạng dùng cùng khóa và chỉ tạo một bản ghi.
          </p>
          <fieldset disabled={isSubmitting || !!actualSessionKey} className="space-y-4">
          <Select
            id="actual-class-select"
            label="Lớp học"
            value={actualClassId === '' ? '' : String(actualClassId)}
            onChange={(event) => {
              setActualClassId(event.target.value ? Number(event.target.value) : '');
              setActualEnrollmentClassId('');
            }}
            options={[
              { value: '', label: 'Chọn lớp...' },
              ...availableClasses.map((cls: any) => ({ value: String(cls.id), label: cls.class_name })),
            ]}
          />
          <Select
            id="actual-enrollment-class-select"
            label="Học viên (enrollment trong lớp)"
            value={actualEnrollmentClassId === '' ? '' : String(actualEnrollmentClassId)}
            onChange={(event) => setActualEnrollmentClassId(event.target.value ? Number(event.target.value) : '')}
            options={[
              { value: '', label: actualClassId ? 'Chọn học viên...' : 'Chọn lớp trước' },
              ...((availableClasses.find((cls: any) => String(cls.id) === String(actualClassId))?.enrollment_classes || [])
                .filter((ec: any) => ec.status === 'ACTIVE')
                .map((ec: any) => ({
                  value: String(ec.id),
                  label: `${ec.enrollment?.student?.full_name || ec.id} • ${ec.enrollment?.student?.external_id || 'N/A'}`,
                }))),
            ]}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input type="date" label="Ngày dạy" value={actualDate} onChange={(event) => setActualDate(event.target.value)} />
            <Input type="time" label="Bắt đầu (tùy chọn)" value={actualStartTime} onChange={(event) => setActualStartTime(event.target.value)} />
            <Input type="time" label="Kết thúc (tùy chọn)" value={actualEndTime} onChange={(event) => setActualEndTime(event.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái buổi học
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant={actualStatus === 'ATTENDED' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('ATTENDED')}
              >
                🟢 Đã học
              </Button>
              <Button
                type="button"
                variant={actualStatus === 'ABSENT_APPROVED_A' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('ABSENT_APPROVED_A')}
              >
                🟡 Nghỉ phép (A)
              </Button>
              <Button
                type="button"
                variant={actualStatus === 'ABSENT_UNAPPROVED_C' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('ABSENT_UNAPPROVED_C')}
              >
                🔴 Vắng (C)
              </Button>
              <Button
                type="button"
                variant={actualStatus === 'LEAVE_B' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('LEAVE_B')}
              >
                ⚪ Bảo lưu (B)
              </Button>
              <Button
                type="button"
                variant={actualStatus === 'TEACHER_ABSENT_D' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('TEACHER_ABSENT_D')}
              >
                🟣 GV nghỉ (D)
              </Button>
              <Button
                type="button"
                variant={actualStatus === 'TECH_ERROR_E' ? 'primary' : 'outline'}
                className="justify-start text-xs h-8 px-2.5"
                onClick={() => setActualStatus('TECH_ERROR_E')}
              >
                🟠 Lỗi kỹ thuật (E)
              </Button>
            </div>
          </div>
          {actualStatus === 'ATTENDED' && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Tên bài học / Chủ đề bài giảng <span className="text-teal-600 font-normal">(VD: K2 L4, K1-L1...)</span>
              </label>
              <Input
                placeholder="Ví dụ: K2 L4 hoặc Kaiwa 2 Bài 4"
                value={actualLessonTopic}
                onChange={(e) => setActualLessonTopic(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của giáo viên (tùy chọn)
            </label>
            <Textarea
              placeholder="Ghi nhận thái độ học viên, lỗi phát âm, nhắc nhở làm BTVN..."
              rows={2}
              value={actualTeacherNote}
              onChange={(e) => setActualTeacherNote(e.target.value)}
            />
          </div>
          </fieldset>
        </div>
      </Modal>

      {/* Teacher selector — only for ADMIN/MANAGE */}
      {isPrivileged && (
        <Card className="mb-5 p-4 sm:p-5 bg-gradient-to-r from-primary-soft/80 to-surface">
          <div className="max-w-md">
            <Select
              id="sessions-teacher-select"
              label="Giáo viên cần hỗ trợ"
              value={selectedTeacherId || ''}
              onChange={(event) => setSelectedTeacherId(event.target.value ? Number(event.target.value) : undefined)}
              options={[{ value: '', label: 'Chọn giáo viên...' }, ...teachers.map((teacher) => ({ value: teacher.user_id!, label: `${teacher.name} · ${teacher.code}` }))]}
              helperText="Lịch dạy và điểm danh sẽ được giới hạn theo giáo viên đã chọn."
            />
          </div>
        </Card>
      )}

      {/* Date Filter Bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={dateRangeFilter === 'today' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('today')}
            >
              Hôm nay
            </Button>
            <Button
              size="sm"
              variant={dateRangeFilter === 'week' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('week')}
            >
              Tuần này
            </Button>
            <Button
              size="sm"
              variant={dateRangeFilter === 'month' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('month')}
            >
              Tháng này
            </Button>
          </div>

          <div className="text-xs text-text-muted flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-muted" />
            <span>
              Tổng số ca dạy: <strong className="text-text-primary font-bold">{sessions.length}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Sessions Grid */}
      {!hasContext ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><UserRoundCheck className="h-7 w-7" /></div>
          <h2 className="font-bold text-text-primary">Chọn giáo viên để bắt đầu</h2>
          <p className="mt-1 text-sm text-text-muted">Hệ thống không trộn lịch dạy của nhiều giáo viên trong cùng một danh sách.</p>
        </Card>
      ) : isLoading ? (
        <div className="py-12 text-center text-text-muted">Đang tải lịch dạy...</div>
      ) : sessions.length === 0 ? (
        <Card className="py-12 text-center">
          <Calendar className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-text-primary">Không có ca dạy nào trong khoảng thời gian này</h3>
          <p className="text-xs text-text-secondary mt-1">
            Chọn bộ lọc "Tuần này" hoặc "Tháng này" để xem các buổi học sắp tới.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const dateStr = new Date(session.session_date).toLocaleDateString('vi-VN', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });

            return (
              <Card key={session.id} className="p-4 flex flex-col justify-between border-border/80 hover:border-teal-500/50 transition-all">
                <div>
                  {/* Top Header */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-600" />
                      <span className="font-bold text-sm text-text-primary">
                        {session.start_time || '19:00'} - {session.end_time || '19:30'}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted font-medium">{dateStr}</span>
                  </div>

                  {/* Class & Student info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">Lớp học:</span>
                      <span className="font-semibold text-text-primary">{session.class?.class_name}</span>
                    </div>

                    {session.class?.enrollment_classes?.map((ec: any) => {
                      const student = ec.enrollment?.student;
                      const att = ec.attendance?.find((a: any) => a.class_session_id === session.id && !a.deleted_at);

                      return (
                        <div key={ec.id} className="bg-surface-muted/60 p-3 rounded-xl border border-border/60">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-text-muted" />
                                {student?.full_name}
                              </div>
                              <div className="text-xs text-text-muted mt-0.5">
                                Mã HV: {student?.external_id || 'N/A'} • {student?.phone || 'Chưa có SĐT'}
                              </div>
                            </div>
                            <div>
                              {att?.reconciliation_state === 'MATCHED' ? (
                                <Badge variant="success" size="sm" dot>
                                  Khớp CSKH
                                </Badge>
                              ) : att?.reconciliation_state === 'CONFLICT' ? (
                                <Badge variant="danger" size="sm" dot>
                                  Lệch ý kiến
                                </Badge>
                              ) : att?.teacher_status ? (
                                <Badge variant="warning" size="sm" dot>
                                  Chờ CS duyệt
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  Chưa điểm danh
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Attendance Info if marked */}
                          {att?.teacher_status && (
                            <div className="mt-2 text-xs text-text-secondary bg-surface p-2 rounded-lg border border-border/40">
                              <span className="font-semibold text-teal-700">Đã báo: </span>
                              {att.teacher_status === 'ATTENDED' ? (
                                <span>Đã học {att.lesson_topic ? `(Bài: ${att.lesson_topic})` : ''}</span>
                              ) : (
                                <span>{att.teacher_status}</span>
                              )}
                              {att.teacher_note && <div className="italic mt-0.5">"{att.teacher_note}"</div>}
                            </div>
                          )}

                          {/* Quick Mark Buttons for this student */}
                          <div className="mt-3 pt-2.5 border-t border-border/40">
                            {isPrivileged && !isAdmin ? (
                              <Badge variant="neutral" size="sm">
                                MANAGE chỉ xem lịch dạy — chỉ Admin mới chấm hộ giáo viên
                              </Badge>
                            ) : (
                              <>
                                <span className="text-[11px] font-semibold text-text-muted block mb-1.5">
                                  Điểm danh nhanh:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700"
                                    onClick={() => handleOpenMarkModal(session, ec, 'ATTENDED')}
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1" />
                                    Đã học
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2"
                                    onClick={() => handleOpenMarkModal(session, ec, 'ABSENT_APPROVED_A')}
                                  >
                                    Nghỉ phép (A)
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2 text-rose-600 border-rose-300 hover:bg-rose-50"
                                    onClick={() => handleOpenMarkModal(session, ec, 'ABSENT_UNAPPROVED_C')}
                                  >
                                    Vắng (C)
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs px-2 text-text-muted"
                                    onClick={() => handleOpenMarkModal(session, ec, 'LEAVE_B')}
                                  >
                                    Bảo lưu (B)
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL: Điểm danh buổi học */}
      <Modal
        isOpen={isMarkModalOpen}
        onClose={() => setIsMarkModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <span>Điểm danh ca dạy: {selectedSession?.start_time || '19:00'} - {selectedSession?.end_time || '19:30'}</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsMarkModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmMark}
              disabled={isSubmitting || (isPrivileged && !isAdmin)}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Điểm Danh'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-surface-muted/60 p-3 rounded-xl border border-border/60 text-xs">
            <p className="font-bold text-text-primary text-sm">
              {selectedEnrollmentClass?.enrollment?.student?.full_name}
            </p>
            <p className="text-text-muted mt-0.5">
              Mã HV: {selectedEnrollmentClass?.enrollment?.student?.external_id || 'N/A'} • Lớp: {selectedSession?.class?.class_name}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái điểm danh
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={selectedStatus === 'ATTENDED' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ATTENDED')}
              >
                🟢 Đã học (ATTENDED)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'ABSENT_APPROVED_A' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ABSENT_APPROVED_A')}
              >
                🟡 Nghỉ có phép (A)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'ABSENT_UNAPPROVED_C' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ABSENT_UNAPPROVED_C')}
              >
                🔴 Nghỉ không phép (C)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'LEAVE_B' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('LEAVE_B')}
              >
                ⚪ Bảo lưu (B)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'TEACHER_ABSENT_D' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('TEACHER_ABSENT_D')}
              >
                🟣 GV nghỉ (D)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'TECH_ERROR_E' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('TECH_ERROR_E')}
              >
                🟠 Lỗi kỹ thuật (E)
              </Button>
            </div>
          </div>

          {selectedStatus === 'ATTENDED' && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Tên bài học / Chủ đề bài giảng <span className="text-teal-600 font-normal">(VD: K2 L4, K1-L1...)</span>
              </label>
              <Input
                placeholder="Ví dụ: K2 L4 hoặc Kaiwa 2 Bài 4"
                value={lessonTopic}
                onChange={(e) => setLessonTopic(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của giáo viên (tùy chọn)
            </label>
            <Textarea
              placeholder="Ghi nhận thái độ học viên, lỗi phát âm, nhắc nhở làm BTVN..."
              rows={2}
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
