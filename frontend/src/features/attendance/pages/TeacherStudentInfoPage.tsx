import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  Plus,
  Search,
  UserRoundCheck,
  Columns3,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { teachersApi } from '../../teachers/api/teachers.api';
import type { Teacher } from '../../teachers/types/teachers.types';
import { classesApi } from '../../classes/api/classes.api';
import type { Class } from '../../classes/types/classes.types';
import { reconciliationApi } from '../api/reconciliation.api';
import type {
  AttendanceStatus,
  TeacherStudentInfoRow,
  TeacherStudentSessionCell,
} from '../types/reconciliation.types';

const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDateDMY = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  const ymd = dateStr.slice(0, 10);
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const formatDateDM = (dateStr?: string | null): string => {
  if (!dateStr) return '—';
  const ymd = dateStr.slice(0, 10);
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
};

const STATUS_BADGE_MAP: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  ATTENDED: {
    label: 'Đã học',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  ABSENT_APPROVED_A: {
    label: 'Nghỉ phép (A)',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  LEAVE_B: {
    label: 'Bảo lưu (B)',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  ABSENT_UNAPPROVED_C: {
    label: 'Vắng (C)',
    className: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  TEACHER_ABSENT_D: {
    label: 'GV nghỉ (D)',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  TECH_ERROR_E: {
    label: 'Lỗi KT (E)',
    className: 'bg-slate-200 text-slate-800 border-slate-400',
  },
};

export const TeacherStudentInfoPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const isPrivileged = !!user?.roles.some(
    (role) => role === 'ADMIN' || role === 'MANAGE'
  );
  const isAdmin = !!user?.roles.includes('ADMIN');
  const isTeacher = !!user?.roles.includes('TEACHER');
  // MANAGE is read-only; TEACHER and ADMIN can edit lesson topics and add sessions
  const canEdit = isAdmin || (isTeacher && !isPrivileged);

  // Teacher selector for ADMIN / MANAGE
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<number | undefined>();
  const hasContext = !isPrivileged || !!selectedTeacherId;

  // Filters
  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  // Data state
  const [rows, setRows] = useState<TeacherStudentInfoRow[]>([]);
  const [maxRecordedSessions, setMaxRecordedSessions] = useState(0);
  const [maxTotalSessions, setMaxTotalSessions] = useState(30);
  const [loading, setLoading] = useState(false);

  // Column display controls
  const [showFullPackage, setShowFullPackage] = useState(false);
  const [extraColumns, setExtraColumns] = useState(0);

  // Inline lesson input drafts & saving states keyed by attendanceId
  const [lessonDrafts, setLessonDrafts] = useState<Record<number, string>>({});
  const [savingAttendanceIds, setSavingAttendanceIds] = useState<Record<number, boolean>>({});
  const [savedAttendanceIds, setSavedAttendanceIds] = useState<Record<number, boolean>>({});

  // Quick 1-click session creation loading state keyed by enrollmentClassId
  const [creatingForEcId, setCreatingForEcId] = useState<Record<number, boolean>>({});

  // Modal: + Thêm cột buổi (Điểm danh mới)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalEnrollmentClassId, setModalEnrollmentClassId] = useState<number | ''>('');
  const [modalSessionDate, setModalSessionDate] = useState(() => toLocalDateString(new Date()));
  const [modalStartTime, setModalStartTime] = useState('');
  const [modalEndTime, setModalEndTime] = useState('');
  const [modalLessonTopic, setModalLessonTopic] = useState('');
  const [modalNote, setModalNote] = useState('');
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);

  useEffect(() => {
    Promise.all([
      classesApi.list(),
      isPrivileged ? teachersApi.list() : Promise.resolve([]),
    ])
      .then(([classItems, teacherItems]) => {
        setClasses(classItems.filter((item) => item.active));
        setTeachers(teacherItems.filter((item) => item.active && item.user_id));
      })
      .catch(() => toast.error('Không thể tải dữ liệu bộ lọc'));
  }, [isPrivileged, toast]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!hasContext) {
        setRows([]);
        setMaxRecordedSessions(0);
        setMaxTotalSessions(30);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await reconciliationApi.getTeacherStudentInfo({
          teacherId: isPrivileged ? selectedTeacherId : undefined,
          classId,
          search: appliedSearch || undefined,
        });
        const items = res?.items || [];
        setRows(items);
        setMaxRecordedSessions(res?.maxRecordedSessions || 0);
        setMaxTotalSessions(res?.maxTotalSessions || 30);

        // Sync drafts from server data
        const nextDrafts: Record<number, string> = {};
        items.forEach((r) => {
          r.sessions.forEach((s) => {
            if (s.attendanceId != null) {
              nextDrafts[s.attendanceId] = s.lessonTopic || '';
            }
          });
        });
        setLessonDrafts(nextDrafts);
      } catch (err: any) {
        toast.error(
          err.response?.data?.message ||
            'Không thể tải danh sách học viên & buổi học'
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [hasContext, isPrivileged, selectedTeacherId, classId, appliedSearch, toast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen to global attendance updates
  useEffect(() => {
    const handleRefresh = () => {
      loadData(true);
    };
    window.addEventListener('teacher-attendance-updated', handleRefresh);
    return () =>
      window.removeEventListener('teacher-attendance-updated', handleRefresh);
  }, [loadData]);

  // Calculate total displayed session columns
  const totalDisplayedColumns = useMemo(() => {
    const base = showFullPackage
      ? Math.max(maxTotalSessions, maxRecordedSessions, 1)
      : Math.max(maxRecordedSessions, 1);
    return base + extraColumns;
  }, [showFullPackage, maxTotalSessions, maxRecordedSessions, extraColumns]);

  const sessionIndices = useMemo(
    () => Array.from({ length: totalDisplayedColumns }, (_, i) => i + 1),
    [totalDisplayedColumns]
  );

  const handleSaveLesson = async (
    cell: TeacherStudentSessionCell,
    rawDraft: string
  ) => {
    if (!canEdit || !cell.attendanceId || !cell.isUnlocked) return;
    const attendanceId = cell.attendanceId;
    const trimmed = rawDraft.trim();
    const original = (cell.lessonTopic || '').trim();
    if (trimmed === original) return;

    setSavingAttendanceIds((prev) => ({ ...prev, [attendanceId]: true }));
    setSavedAttendanceIds((prev) => ({ ...prev, [attendanceId]: false }));

    try {
      await reconciliationApi.updateTeacherStudentLesson(attendanceId, {
        lessonTopic: trimmed || null,
        ...(isPrivileged && selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
      });
      // Update local state optimistically
      setRows((prevRows) =>
        prevRows.map((r) => ({
          ...r,
          sessions: r.sessions.map((s) =>
            s.attendanceId === attendanceId ? { ...s, lessonTopic: trimmed } : s
          ),
        }))
      );
      setSavedAttendanceIds((prev) => ({ ...prev, [attendanceId]: true }));
      window.setTimeout(() => {
        setSavedAttendanceIds((prev) => ({ ...prev, [attendanceId]: false }));
      }, 2200);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Không thể lưu nội dung bài học'
      );
    } finally {
      setSavingAttendanceIds((prev) => ({ ...prev, [attendanceId]: false }));
    }
  };

  // Quick 1-click add attended session for the next session slot of a student
  const handleQuickAddSessionForRow = async (row: TeacherStudentInfoRow) => {
    if (!canEdit) return;
    const ecId = row.enrollmentClassId;
    if (creatingForEcId[ecId]) return;

    setCreatingForEcId((prev) => ({ ...prev, [ecId]: true }));
    try {
      await reconciliationApi.addTeacherStudentSession({
        enrollmentClassId: ecId,
        sessionDate: toLocalDateString(new Date()),
        ...(isPrivileged && selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
      });
      toast.success(
        `Đã điểm danh Có mặt và mở khóa Buổi ${row.sessions.length + 1} cho ${row.studentName}`
      );
      await loadData(true);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Không thể tạo buổi học mới'
      );
    } finally {
      setCreatingForEcId((prev) => ({ ...prev, [ecId]: false }));
    }
  };

  const openAddSessionModal = (defaultEcId?: number) => {
    if (!canEdit) return;
    setModalEnrollmentClassId(
      defaultEcId ?? (rows.length === 1 ? rows[0].enrollmentClassId : '')
    );
    setModalSessionDate(toLocalDateString(new Date()));
    setModalStartTime('');
    setModalEndTime('');
    setModalLessonTopic('');
    setModalNote('');
    setIsAddModalOpen(true);
  };

  const handleConfirmAddSessionModal = async () => {
    if (!modalEnrollmentClassId) {
      toast.warning('Vui lòng chọn học viên');
      return;
    }
    setIsSubmittingModal(true);
    try {
      await reconciliationApi.addTeacherStudentSession({
        enrollmentClassId: Number(modalEnrollmentClassId),
        sessionDate: modalSessionDate || toLocalDateString(new Date()),
        startTime: modalStartTime || undefined,
        endTime: modalEndTime || undefined,
        lessonTopic: modalLessonTopic.trim() || undefined,
        note: modalNote.trim() || undefined,
        ...(isPrivileged && selectedTeacherId ? { teacherId: selectedTeacherId } : {}),
      });
      toast.success(
        'Đã tạo buổi học mới (Có mặt), mở khóa ô buổi học và cập nhật bài học!'
      );
      setIsAddModalOpen(false);
      await loadData(true);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Không thể thêm buổi học mới'
      );
    } finally {
      setIsSubmittingModal(false);
    }
  };

  const resetFilters = () => {
    setClassId(undefined);
    setSearch('');
    setAppliedSearch('');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Danh sách Học viên & Theo dõi Buổi học"
        description="Bảng thông tin học viên chuẩn theo sheet Infoー情報 kèm các cột Buổi học. Ô buổi học sẽ tự động mở khóa để nhập bài học khi học viên đã được điểm danh Có mặt."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExtraColumns((c) => c + 1)}
              title="Thêm 1 cột Buổi hiển thị trên bảng"
            >
              <Columns3 className="w-4 h-4 mr-1.5" />
              + Thêm cột Buổi trống
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => openAddSessionModal()}
                disabled={!hasContext || rows.length === 0}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                + Thêm cột buổi (Điểm danh mới)
              </Button>
            )}
          </div>
        }
      />

      {/* Teacher selector for ADMIN / MANAGE */}
      {isPrivileged && (
        <Card className="mb-5 p-4 sm:p-5 bg-gradient-to-r from-primary-soft/80 to-surface">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-md flex-1">
              <Select
                id="student-info-teacher-select"
                label="Giáo viên cần hỗ trợ / theo dõi"
                value={selectedTeacherId || ''}
                onChange={(event) =>
                  setSelectedTeacherId(
                    event.target.value ? Number(event.target.value) : undefined
                  )
                }
                options={[
                  { value: '', label: 'Chọn giáo viên...' },
                  ...teachers.map((teacher) => ({
                    value: teacher.user_id!,
                    label: `${teacher.name} · ${teacher.code}`,
                  })),
                ]}
                helperText="Bảng thông tin học viên & buổi học sẽ hiển thị theo giáo viên đã chọn."
              />
            </div>
            {!isAdmin && (
              <Badge variant="neutral" size="sm">
                Chế độ MANAGE: Chỉ xem (Read-only)
              </Badge>
            )}
          </div>
        </Card>
      )}

      {!hasContext ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <UserRoundCheck className="h-7 w-7" />
          </div>
          <h2 className="font-bold text-text-primary">
            Chọn giáo viên để bắt đầu
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Hệ thống không trộn dữ liệu của nhiều giáo viên trong cùng một bảng
            Info.
          </p>
        </Card>
      ) : (
        <>
          {/* Filter & Column Mode Toolbar */}
          <Card className="mb-5 p-4">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <form
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAppliedSearch(search.trim());
                }}
              >
                <Input
                  id="student-info-search"
                  label="Tìm học viên"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tên, mã HV hoặc mã lớp..."
                  leftIcon={<Search className="h-4 w-4" />}
                />
                <Select
                  id="student-info-class"
                  label="Lớp học"
                  value={classId || ''}
                  onChange={(e) =>
                    setClassId(e.target.value ? Number(e.target.value) : undefined)
                  }
                  options={[
                    { value: '', label: 'Tất cả lớp phụ trách' },
                    ...classes.map((c) => ({
                      value: c.id,
                      label: c.class_name,
                    })),
                  ]}
                />
                <div className="flex items-end gap-2">
                  <Button type="submit" size="sm" className="h-10 px-4">
                    Lọc
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3"
                    onClick={resetFilters}
                  >
                    Xóa
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 px-2.5"
                    onClick={() => loadData()}
                    title="Tải lại bảng"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </form>

              <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/60">
                <div className="inline-flex rounded-xl border border-border bg-surface-muted p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFullPackage(false);
                      setExtraColumns(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      !showFullPackage
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Hiển thị theo buổi đã học ({Math.max(maxRecordedSessions, 1)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowFullPackage(true);
                      setExtraColumns(0);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      showFullPackage
                        ? 'bg-white text-primary shadow-xs'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Hiển thị toàn khóa ({maxTotalSessions})
                  </button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtraColumns((c) => c + 1)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Thêm cột Buổi ({totalDisplayedColumns})
                </Button>

                {canEdit && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => openAddSessionModal()}
                    disabled={rows.length === 0}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Thêm buổi học
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Infoー情報 Sheet Table */}
          <Card className="overflow-hidden border border-slate-300 shadow-soft">
            <div className="bg-gradient-to-r from-[#1e3a5f] via-[#234876] to-[#1e3a5f] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-white">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-300" />
                <span className="font-bold text-xs sm:text-sm tracking-wide">
                  SHEET: Infoー情報 (THÔNG TIN HỌC VIÊN & THEO DÕI BUỔI HỌC)
                </span>
                <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full font-medium">
                  {rows.length} học viên
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-200">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                  Đã điểm danh Có mặt: Mở khóa nhập bài
                </span>
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-300" />
                  Chưa học / Vắng: Khóa ô
                </span>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center text-sm text-text-muted flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span>Đang tải bảng thông tin học viên...</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <BookOpen className="w-10 h-10 text-text-muted mx-auto opacity-50" />
                <div className="font-semibold text-sm text-text-primary">
                  Chưa có học viên nào trong danh sách
                </div>
                <div className="text-xs text-text-muted">
                  Khi giáo viên được phân công lớp có học viên đang theo học, dữ liệu sẽ hiển thị tại đây.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#D9E1F2] text-slate-900 border-b-2 border-slate-400">
                      {/* 1. Mã học viên - sticky left 1 */}
                      <th className="sticky left-0 z-20 bg-[#D9E1F2] border-r border-slate-300 px-3 py-2.5 text-left font-bold min-w-[110px] w-[110px] shadow-[1px_0_0_0_#cbd5e1]">
                        <div>Mã học viên</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          学籍番号
                        </div>
                      </th>
                      {/* 2. Họ tên học viên - sticky left 2 */}
                      <th className="sticky left-[110px] z-20 bg-[#D9E1F2] border-r border-slate-400 px-3 py-2.5 text-left font-bold min-w-[170px] w-[170px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]">
                        <div>Họ tên học viên</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          お名前
                        </div>
                      </th>
                      {/* 3. Mã lớp */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-left font-bold min-w-[120px] whitespace-nowrap">
                        <div>Mã lớp</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          クラスコード
                        </div>
                      </th>
                      {/* 4. Khoá */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[90px] whitespace-nowrap">
                        <div>Khoá</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          コース
                        </div>
                      </th>
                      {/* 5. Trình độ */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[100px] whitespace-nowrap">
                        <div>Trình độ</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          レベル
                        </div>
                      </th>
                      {/* 6. Tổng số buổi */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[95px] whitespace-nowrap">
                        <div>Tổng số buổi</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          合計日
                        </div>
                      </th>
                      {/* 7. Ghi chú */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-left font-bold min-w-[150px]">
                        <div>Ghi chú</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          メモ
                        </div>
                      </th>
                      {/* 8. Ngày bắt đầu */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[105px] whitespace-nowrap">
                        <div>Ngày bắt đầu</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          始まる日
                        </div>
                      </th>
                      {/* 9. Cố vấn học tập */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[115px] whitespace-nowrap">
                        <div>Cố vấn học tập</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          顧問専門
                        </div>
                      </th>
                      {/* 10. Ngày học */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[130px] whitespace-nowrap">
                        <div>Ngày học</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          曜日
                        </div>
                      </th>
                      {/* 11. Giờ học */}
                      <th className="border-r border-slate-300 px-3 py-2.5 text-center font-bold min-w-[115px] whitespace-nowrap">
                        <div>Giờ học</div>
                        <div className="text-[10px] font-medium text-slate-600 mt-0.5">
                          スケジュール
                        </div>
                      </th>
                      {/* 12. Báo cáo học tập */}
                      <th className="border-r-2 border-slate-400 px-3 py-2.5 text-center font-bold min-w-[155px] whitespace-nowrap bg-[#FFF2CC]">
                        <div>Báo cáo học tập</div>
                        <div className="text-[10px] font-medium text-amber-800 mt-0.5">
                          レポート
                        </div>
                      </th>
                      {/* Các cột động: Buổi 1 .. Buổi N */}
                      {sessionIndices.map((k) => (
                        <th
                          key={k}
                          className="border-r border-slate-300 px-2.5 py-2 text-center font-bold min-w-[150px] whitespace-nowrap bg-[#E2EFDA] text-emerald-950"
                        >
                          <div>Buổi {k}</div>
                          <div className="text-[10px] font-medium text-emerald-700 mt-0.5">
                            第{k}回
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rows.map((row, rIdx) => {
                      const rowBg =
                        rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';

                      return (
                        <tr
                          key={row.enrollmentClassId}
                          className={`${rowBg} hover:bg-blue-50/30 transition-colors`}
                        >
                          {/* 1. Mã học viên */}
                          <td
                            className={`sticky left-0 z-10 ${rowBg} border-r border-slate-200 px-3 py-2.5 font-mono font-bold text-slate-800 whitespace-nowrap`}
                          >
                            {row.studentCode || `HV_${row.studentId}`}
                          </td>

                          {/* 2. Họ tên học viên */}
                          <td
                            className={`sticky left-[110px] z-10 ${rowBg} border-r border-slate-300 px-3 py-2.5 font-semibold text-slate-900 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]`}
                          >
                            <div className="truncate max-w-[155px]" title={row.studentName}>
                              {row.studentName}
                            </div>
                          </td>

                          {/* 3. Mã lớp */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-slate-800 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">
                              {row.classCode || row.className}
                            </div>
                            {row.classCode && row.className && row.classCode !== row.className && (
                              <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                                {row.className}
                              </div>
                            )}
                          </td>

                          {/* 4. Khoá */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-800 whitespace-nowrap">
                            {row.courseType || 'Thường'}
                          </td>

                          {/* 5. Trình độ */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center font-medium text-teal-800 whitespace-nowrap">
                            {row.level || '—'}
                          </td>

                          {/* 6. Tổng số buổi */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center font-bold text-slate-900 whitespace-nowrap">
                            {row.totalSessions || 30}
                          </td>

                          {/* 7. Ghi chú */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-slate-700 max-w-[180px]">
                            <div className="truncate" title={row.note || ''}>
                              {row.note || '—'}
                            </div>
                          </td>

                          {/* 8. Ngày bắt đầu */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-700 whitespace-nowrap">
                            {formatDateDMY(row.startDate)}
                          </td>

                          {/* 9. Cố vấn học tập */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center whitespace-nowrap">
                            <span
                              className="inline-block font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 text-[11px]"
                              title={row.csName || row.csCode}
                            >
                              {row.csCode || row.csName || '—'}
                            </span>
                          </td>

                          {/* 10. Ngày học */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-800 whitespace-nowrap font-medium">
                            {row.scheduleDays || '—'}
                          </td>

                          {/* 11. Giờ học */}
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center text-slate-800 whitespace-nowrap">
                            {row.scheduleTime || '—'}
                          </td>

                          {/* 12. Báo cáo học tập */}
                          <td className="border-r-2 border-slate-300 px-2.5 py-2 text-center whitespace-nowrap bg-amber-50/40">
                            <button
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/students/${row.studentId}/study-report`,
                                  {
                                    state: { from: '/teacher/student-info' },
                                  }
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/90 hover:bg-amber-200 text-amber-950 font-semibold text-xs border border-amber-300 transition-colors max-w-[145px]"
                              title={`Mở Báo cáo học tập của ${row.studentName}`}
                            >
                              <span className="truncate">{row.studentName}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 text-amber-700" />
                            </button>
                          </td>

                          {/* Các cột động: Buổi 1 .. Buổi N */}
                          {sessionIndices.map((k) => {
                            const cell =
                              row.sessions.find((s) => s.sessionIndex === k) ||
                              row.sessions[k - 1];
                            const isNextSlot = k === row.sessions.length + 1;

                            // Trường hợp 1: Đã học (cell && cell.isUnlocked)
                            if (cell && cell.isUnlocked) {
                              const attId = cell.attendanceId;
                              const draftValue =
                                attId != null && lessonDrafts[attId] !== undefined
                                  ? lessonDrafts[attId]
                                  : cell.lessonTopic || '';
                              const isSaving =
                                attId != null && !!savingAttendanceIds[attId];
                              const isSaved =
                                attId != null && !!savedAttendanceIds[attId];

                              return (
                                <td
                                  key={k}
                                  className="border-r border-slate-200 p-1.5 align-top bg-emerald-50/25 min-w-[150px]"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1 px-0.5">
                                    <span className="text-[10px] font-semibold text-slate-600">
                                      {formatDateDM(cell.sessionDate)}
                                    </span>
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      Đã học
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      disabled={!canEdit || attId == null}
                                      value={draftValue}
                                      placeholder="Nhập bài (VD: K1-L16)"
                                      onChange={(e) => {
                                        if (attId == null) return;
                                        const val = e.target.value;
                                        setLessonDrafts((prev) => ({
                                          ...prev,
                                          [attId]: val,
                                        }));
                                      }}
                                      onBlur={(e) =>
                                        handleSaveLesson(cell, e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur();
                                        }
                                      }}
                                      className="w-full rounded-lg border border-emerald-400/80 bg-white px-2 py-1 pr-6 text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-600"
                                    />
                                    {isSaving && (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 absolute right-1.5 top-1/2 -translate-y-1/2" />
                                    )}
                                    {!isSaving && isSaved && (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 absolute right-1.5 top-1/2 -translate-y-1/2" />
                                    )}
                                  </div>
                                </td>
                              );
                            }

                            // Trường hợp 2: Đã có buổi nhưng học viên nghỉ / chưa học (cell && !cell.isUnlocked)
                            if (cell && !cell.isUnlocked) {
                              const eff =
                                cell.effectiveStatus ||
                                cell.teacherStatus ||
                                cell.finalStatus;
                              const badgeInfo = eff
                                ? STATUS_BADGE_MAP[eff]
                                : {
                                    label: 'Chưa điểm danh',
                                    className:
                                      'bg-slate-200 text-slate-700 border-slate-300',
                                  };

                              return (
                                <td
                                  key={k}
                                  className="border-r border-slate-200 p-1.5 align-top bg-slate-50/80 min-w-[150px]"
                                  title="Học viên chưa học buổi này nên ô bị khóa"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1 px-0.5">
                                    <span className="text-[10px] font-medium text-slate-500">
                                      {formatDateDM(cell.sessionDate)}
                                    </span>
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${badgeInfo.className}`}
                                    >
                                      {badgeInfo.label}
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      disabled
                                      value={cell.lessonTopic || ''}
                                      placeholder="Đã khóa"
                                      title="Học viên chưa học buổi này nên ô bị khóa"
                                      className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 pr-6 text-xs text-slate-400 cursor-not-allowed"
                                    />
                                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                </td>
                              );
                            }

                            // Trường hợp 3: Chưa có buổi học thứ k (!cell)
                            const isCreatingThis =
                              !!creatingForEcId[row.enrollmentClassId];

                            return (
                              <td
                                key={k}
                                className="border-r border-slate-200 p-1.5 align-top bg-slate-50/40 min-w-[150px]"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1 px-0.5 min-h-[16px]">
                                  <span className="text-[10px] text-slate-400">
                                    Chưa học
                                  </span>
                                  {isNextSlot && canEdit && (
                                    <button
                                      type="button"
                                      disabled={isCreatingThis}
                                      onClick={() =>
                                        handleQuickAddSessionForRow(row)
                                      }
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-semibold shadow-2xs transition-colors disabled:opacity-50"
                                      title="Điểm danh Có mặt (1 chạm) và mở khóa ngay ô Buổi học này"
                                    >
                                      {isCreatingThis ? (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      ) : (
                                        <Plus className="w-2.5 h-2.5" />
                                      )}
                                      <span>Điểm danh Đã học</span>
                                    </button>
                                  )}
                                </div>
                                <div className="relative">
                                  <input
                                    type="text"
                                    disabled
                                    value=""
                                    placeholder="Chưa học"
                                    title="Học viên chưa học buổi này nên ô bị khóa"
                                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 pr-6 text-xs text-slate-400 cursor-not-allowed"
                                  />
                                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal: + Thêm cột buổi (Điểm danh mới) */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isSubmittingModal && setIsAddModalOpen(false)}
        closeOnOutsideClick={!isSubmittingModal}
        title="Thêm buổi học mới (Điểm danh Đã học)"
        description="Tạo nhanh buổi học với trạng thái Có mặt (ATTENDED), tự động mở khóa cột Buổi tiếp theo và điền tên bài học."
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isSubmittingModal}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmAddSessionModal}
              disabled={!modalEnrollmentClassId || isSubmittingModal}
            >
              {isSubmittingModal ? 'Đang tạo...' : 'Xác nhận & Mở khóa buổi'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            id="modal-student-ec"
            label="Học viên"
            value={modalEnrollmentClassId === '' ? '' : String(modalEnrollmentClassId)}
            onChange={(e) =>
              setModalEnrollmentClassId(
                e.target.value ? Number(e.target.value) : ''
              )
            }
            options={[
              { value: '', label: 'Chọn học viên...' },
              ...rows.map((r) => ({
                value: String(r.enrollmentClassId),
                label: `${r.studentName} (${r.studentCode}) · Lớp ${r.classCode || r.className} · Sắp học Buổi ${r.sessions.length + 1}`,
              })),
            ]}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              type="date"
              label="Ngày học"
              value={modalSessionDate}
              onChange={(e) => setModalSessionDate(e.target.value)}
            />
            <Input
              type="time"
              label="Giờ bắt đầu (tùy chọn)"
              value={modalStartTime}
              onChange={(e) => setModalStartTime(e.target.value)}
            />
            <Input
              type="time"
              label="Giờ kết thúc (tùy chọn)"
              value={modalEndTime}
              onChange={(e) => setModalEndTime(e.target.value)}
            />
          </div>

          <Input
            label="Tên bài học (tùy chọn - có thể nhập sau trên bảng)"
            placeholder="Ví dụ: K1-L16, K2 L4..."
            value={modalLessonTopic}
            onChange={(e) => setModalLessonTopic(e.target.value)}
          />

          <Textarea
            label="Ghi chú giáo viên (tùy chọn)"
            placeholder="Ghi chú thêm về buổi học..."
            rows={2}
            value={modalNote}
            onChange={(e) => setModalNote(e.target.value)}
          />
        </div>
      </Modal>
    </PageContainer>
  );
};
