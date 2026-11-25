import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Check,
  ExternalLink,
  Loader2,
  Lock,
  Search,
  UserRoundCheck,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { FilterBar, ActiveFilterChip } from '../../../components/common/FilterBar';
import { PaginationFooter } from '../../../components/common/Pagination';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { teachersApi } from '../../teachers/api/teachers.api';
import type { Teacher } from '../../teachers/types/teachers.types';
import { classesApi } from '../../classes/api/classes.api';
import {
  Class,
  cleanClassIdentifier,
  cleanNoteText,
  formatClassCode,
  formatScheduleTimeDisplay,
} from '../../classes/types/classes.types';
import { reconciliationApi } from '../api/reconciliation.api';
import type {
  AttendanceStatus,
  TeacherStudentInfoRow,
  TeacherStudentSessionCell,
} from '../types/reconciliation.types';

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
    className: 'bg-slate-200 text-text-primary border-slate-400',
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

  const [classes, setClasses] = useState<Class[]>([]);
  const [classId, setClassId] = useState<number | undefined>();
  const [search, setSearch] = useState('');
  const [programType, setProgramType] = useState<'ALL' | 'KAIWA' | 'JLPT'>('ALL');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  // Data state
  const [rows, setRows] = useState<TeacherStudentInfoRow[]>([]);
  const [maxRecordedSessions, setMaxRecordedSessions] = useState(0);
  const [maxTotalSessions, setMaxTotalSessions] = useState(30);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Column display controls — mặc định hiển thị đầy đủ số buổi của toàn khóa (Buổi 1 .. Buổi N)
  const [showFullPackage, setShowFullPackage] = useState(true);
  const [extraColumns, setExtraColumns] = useState(0);

  // Inline lesson input drafts & saving states keyed by attendanceId
  const [lessonDrafts, setLessonDrafts] = useState<Record<number, string>>({});
  const [savingAttendanceIds, setSavingAttendanceIds] = useState<Record<number, boolean>>({});
  const [savedAttendanceIds, setSavedAttendanceIds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    Promise.all([
      classesApi.list(),
      isPrivileged
        ? teachersApi.list({ page: 1, pageSize: 100, active: true, account_status: 'PROVISIONED' })
        : Promise.resolve([]),
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
        setTotal(0);
        setTotalPages(0);
        setMaxRecordedSessions(0);
        setMaxTotalSessions(30);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const res = await reconciliationApi.getTeacherStudentInfo({
          teacherId: isPrivileged ? selectedTeacherId : undefined,
          classId,
          search: debouncedSearch || undefined,
          programType: programType === 'ALL' ? undefined : programType,
          page,
          pageSize,
        });
        const items = res?.items || [];
        setRows(items);
        setTotal(res?.total || 0);
        setTotalPages(res?.totalPages || 0);
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
    [hasContext, isPrivileged, selectedTeacherId, classId, debouncedSearch, programType, page, pageSize, toast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [selectedTeacherId, classId, debouncedSearch, programType]);

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

  const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
  const startRecord = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRecord = Math.min((safePage - 1) * pageSize + rows.length, total);

  const activeFiltersCount = useMemo(
    () => [search.trim(), programType !== 'ALL', classId].filter(Boolean).length,
    [search, programType, classId]
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
      toast.success(
        trimmed
          ? `Đã lưu bài học Buổi ${cell.sessionIndex} (${trimmed})`
          : `Đã xóa bài học Buổi ${cell.sessionIndex}`
      );
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (err: any) {
      toast.error(
        err.response?.data?.message || 'Không thể lưu nội dung bài học'
      );
    } finally {
      setSavingAttendanceIds((prev) => ({ ...prev, [attendanceId]: false }));
    }
  };

  const resetFilters = () => {
    setClassId(undefined);
    setSearch('');
    setProgramType('ALL');
    setPage(1);
  };

  const selectedClassLabel = useMemo(() => {
    const selectedClass = classes.find((item) => item.id === classId);
    return selectedClass
      ? cleanClassIdentifier(selectedClass.class_name) || selectedClass.class_name
      : classId
        ? `#${classId}`
        : '';
  }, [classId, classes]);

  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (search.trim()) {
      chips.push({ id: 'search', label: 'Tìm kiếm', value: search.trim(), onRemove: () => setSearch('') });
    }
    if (programType !== 'ALL') {
      chips.push({
        id: 'program',
        label: 'Chương trình',
        value: programType === 'KAIWA' ? 'Kaiwa' : 'JLPT',
        tone: programType === 'KAIWA' ? 'kaiwa' : 'jlpt',
        onRemove: () => setProgramType('ALL'),
      });
    }
    if (classId) {
      chips.push({ id: 'class', label: 'Lớp', value: selectedClassLabel, onRemove: () => setClassId(undefined) });
    }
    return chips;
  }, [search, programType, classId, selectedClassLabel]);

  return (
    <PageContainer>
      <PageHeader
        title={isTeacher && !isPrivileged ? 'Học viên của tôi' : 'Thông tin Học viên & Lộ trình Bài học'}
        actions={
          !isAdmin && isPrivileged ? (
            <Badge variant="neutral" size="sm">
              Chế độ MANAGE: Chỉ xem (Read-only)
            </Badge>
          ) : undefined
        }
      />

      <FilterBar
        viewControls={<>
            {/* Bên trái: Chip thống kê & chú thích */}
            <div className="learning-filter-display-start text-xs font-semibold text-text-secondary">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
                <span>Hiển thị:</span>
                <span className="font-extrabold text-primary">
                  {rows.length}
                </span>
                <span className="text-text-muted">
                  / {total} học viên
                </span>
              </span>

              <div
                className="inline-flex min-h-9 max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-100 p-1"
                role="tablist"
                aria-label="Chọn phạm vi hiển thị cột buổi học"
              >
                <span className="px-2 text-[11px] font-semibold text-text-muted select-none">
                  Cột hiển thị:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowFullPackage(true);
                    setExtraColumns(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    showFullPackage
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-surface/60 text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  Toàn khóa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowFullPackage(false);
                    setExtraColumns(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !showFullPackage
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-surface/60 text-text-secondary hover:bg-surface hover:text-text-primary'
                  }`}
                >
                  Buổi đã học
                </button>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Đã điểm danh Có mặt: Mở khóa nhập bài
              </span>

              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface-muted/70 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                <Lock className="w-3 h-3 text-text-muted" />
                Chưa học / Vắng: Khóa ô
              </span>
            </div>

            {/* Bên phải: Làm mới */}
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => loadData()}
                title="Làm mới dữ liệu"
                aria-label="Làm mới dữ liệu"
                className="px-2.5"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </>}
        variant="learning"
        title="Tìm kiếm & Bộ lọc"
        activeCount={activeFiltersCount}
        chips={activeFilterChips}
        onClear={resetFilters}
      >
        <div className="learning-filter-search relative">
          <label htmlFor="student-info-search" className="sr-only">
            Tìm học viên
          </label>
          <input
            id="student-info-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tên, mã HV, SĐT, email, khóa, gói, lớp..."
            className="h-9 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-xs font-medium text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-surface-muted"
            disabled={!hasContext}
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" aria-hidden="true" />
        </div>

        <div className="w-[138px] shrink-0">
          <label htmlFor="student-info-program" className="sr-only">
            Chương trình
          </label>
          <select
            id="student-info-program"
            value={programType}
            onChange={(event) => setProgramType(event.target.value as 'ALL' | 'KAIWA' | 'JLPT')}
            disabled={!hasContext}
            className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-surface-muted"
          >
            <option value="ALL">Tất cả chương trình</option>
            <option value="KAIWA">Kaiwa</option>
            <option value="JLPT">JLPT</option>
          </select>
        </div>

        {isPrivileged && (
          <div className="min-w-[210px] flex-1 xl:max-w-[270px]">
            <label htmlFor="student-info-teacher-select" className="sr-only">
              Giáo viên phụ trách
            </label>
            <select
              id="student-info-teacher-select"
              value={selectedTeacherId || ''}
              onChange={(event) =>
                setSelectedTeacherId(event.target.value ? Number(event.target.value) : undefined)
              }
              className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Chọn giáo viên...</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.user_id!}>
                  {teacher.name} · {teacher.code}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="min-w-[190px] flex-1 xl:max-w-[270px]">
          <label htmlFor="student-info-class" className="sr-only">
            Lớp học
          </label>
          <select
            id="student-info-class"
            value={classId || ''}
            onChange={(event) => setClassId(event.target.value ? Number(event.target.value) : undefined)}
            disabled={!hasContext}
            className="h-9 w-full cursor-pointer rounded-xl border border-border bg-white px-3 text-xs font-semibold text-text-primary shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-surface-muted"
          >
            <option value="">Tất cả lớp phụ trách</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {cleanClassIdentifier(item.class_name) || item.class_name}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

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
            theo dõi học viên.
          </p>
        </Card>
      ) : (
        <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
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
            <div className="w-full overflow-x-auto select-none">
              <table data-table="native" className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold">
                    <th scope="col" className="sticky left-0 z-30 px-2 py-3 border-r border-border/60 bg-surface-muted text-text-secondary text-center w-10 min-w-[40px] max-w-[40px] whitespace-nowrap">
                      #
                    </th>
                    {/* Cột Mã HV - sticky left 40px */}
                    <th scope="col" className="sticky left-10 z-30 px-3 py-3 border-r border-border/60 bg-surface-muted text-text-secondary w-[110px] min-w-[110px] max-w-[110px] whitespace-nowrap ">
                      Mã HV
                    </th>
                    {/* Cột Họ tên HV - sticky left 150px */}
                    <th scope="col" className="sticky left-[150px] z-30 px-3 py-3 border-r-2 border-border/80 bg-surface-muted text-text-secondary w-[175px] min-w-[175px] max-w-[175px] whitespace-nowrap shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] ">
                      Họ tên HV
                    </th>
                    {/* Lớp học */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 min-w-[125px] whitespace-nowrap">
                      Lớp học
                    </th>
                    {/* Khóa học */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[95px] whitespace-nowrap">
                      Khóa học
                    </th>
                    {/* Trình độ */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[95px] whitespace-nowrap">
                      Trình độ
                    </th>
                    {/* Tổng buổi */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[85px] whitespace-nowrap">
                      Tổng buổi
                    </th>
                    {/* Ghi chú */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 min-w-[150px] whitespace-nowrap">
                      Ghi chú
                    </th>
                    {/* Ngày bắt đầu */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[105px] whitespace-nowrap">
                      Ngày bắt đầu
                    </th>
                    {/* CVHT phụ trách */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[115px] whitespace-nowrap">
                      CVHT phụ trách
                    </th>
                    {/* Ngày học */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[120px] whitespace-nowrap">
                      Ngày học
                    </th>
                    {/* Giờ học */}
                    <th scope="col" className="px-3 py-3 border-r border-border/60 text-center min-w-[105px] whitespace-nowrap">
                      Giờ học
                    </th>
                    {/* Báo cáo học tập */}
                    <th scope="col" className="px-3 py-3 border-r-2 border-border/80 text-center min-w-[150px] whitespace-nowrap bg-amber-50/60 text-amber-900">
                      Báo cáo học tập
                    </th>
                    {/* Các cột động: Buổi 1 .. Buổi N */}
                    {sessionIndices.map((k) => (
                      <th scope="col"
                        key={k}
                        className="px-2.5 py-3 bg-teal-50/70 text-teal-950 border-r border-border/60 text-center min-w-[145px] whitespace-nowrap"
                      >
                        Buổi {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rIdx) => {
                    const stickyBg =
                      rIdx % 2 === 1 ? 'bg-surface-subtle' : 'bg-surface';

                    return (
                      <tr
                        key={row.enrollmentClassId}
                        className={`border-b border-border/60 hover:bg-surface-subtle/80 transition-colors ${
                          rIdx % 2 === 1 ? 'bg-surface-subtle/30' : 'bg-surface'
                        }`}
                      >
                        {/* Cột # (STT) */}
                        <td data-align="center" data-wrap="nowrap" className={`sticky left-0 z-20 ${stickyBg} px-2 py-2.5 border-r border-border/60 text-center text-text-muted font-bold w-10 min-w-[40px]`}>
                          {(safePage - 1) * pageSize + rIdx + 1}
                        </td>

                        {/* Cột Mã HV */}
                        <td data-align="center" data-wrap="nowrap"
                          className={`sticky left-10 z-20 ${stickyBg} px-3 py-2.5 border-r border-border/60 font-mono font-bold text-text-primary whitespace-nowrap w-[110px] min-w-[110px] max-w-[110px] overflow-hidden`}
                        >
                          {row.studentCode || `HV_${row.studentId}`}
                        </td>

                        {/* Cột Họ tên HV */}
                        <td data-align="left" data-wrap="normal"
                          className={`sticky left-[150px] z-20 ${stickyBg} px-3 py-2.5 border-r-2 border-border/80 font-bold text-text-primary w-[175px] min-w-[175px] max-w-[175px] shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] overflow-hidden`}
                        >
                          <div
                            className="truncate max-w-[150px]"
                            title={row.studentName}
                          >
                            {row.studentName}
                          </div>
                        </td>

                        {/* Lớp học */}
                        <td data-align="left" data-wrap="normal" className="px-3 py-2.5 border-r border-border/60 text-text-primary whitespace-nowrap">
                          {(() => {
                            const cCode = formatClassCode(row.classCode, row.classId);
                            const cName =
                              cleanClassIdentifier(row.className) ||
                              cleanClassIdentifier(row.classCode) ||
                              cCode;
                            return (
                              <>
                                <div className="font-semibold text-text-primary">{cName}</div>
                                {cCode && cCode !== '—' && cCode !== cName && (
                                  <div title={String(cCode ?? '')} className="font-mono text-[10px] text-text-muted truncate max-w-[130px]">
                                    {cCode}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>

                        {/* Khóa học */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center font-semibold text-text-secondary whitespace-nowrap">
                          {row.courseType || '—'}
                        </td>

                        {/* Trình độ */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center font-semibold text-teal-800 whitespace-nowrap">
                          {row.level || '—'}
                        </td>

                        {/* Tổng buổi */}
                        <td data-align="right" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center font-bold text-text-primary whitespace-nowrap">
                          {row.totalSessions || 0}
                        </td>

                        {/* Ghi chú */}
                        <td data-align="left" data-wrap="normal" className="px-3 py-2.5 border-r border-border/60 text-text-secondary max-w-[180px]">
                          {(() => {
                            const cleaned = cleanNoteText(row.note);
                            return (
                              <div className="truncate" title={cleaned}>
                                {cleaned || '—'}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Ngày bắt đầu */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center text-text-secondary whitespace-nowrap">
                          {formatDateDMY(row.startDate)}
                        </td>

                        {/* CVHT phụ trách */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center whitespace-nowrap">
                          {row.csCode || row.csName ? (
                            <span
                              className="inline-block font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 text-[11px]"
                              title={row.csName || row.csCode}
                            >
                              {row.csCode || row.csName}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>

                        {/* Ngày học */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center text-text-primary whitespace-nowrap font-semibold">
                          {row.scheduleDays || '—'}
                        </td>

                        {/* Giờ học */}
                        <td data-align="center" data-wrap="nowrap" className="px-3 py-2.5 border-r border-border/60 text-center font-mono text-text-secondary whitespace-nowrap">
                          {formatScheduleTimeDisplay(row.scheduleTime) || row.scheduleTime || '—'}
                        </td>

                        {/* Báo cáo học tập */}
                        <td data-align="center" data-wrap="nowrap" className="px-2.5 py-2 border-r-2 border-border/80 text-center whitespace-nowrap bg-amber-50/25">
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold text-xs border border-amber-200/80 transition-colors max-w-[150px]"
                            title={`Mở Báo cáo học tập của ${row.studentName}`}
                          >
                            <span title={String(row.studentName ?? '')} className="truncate">{row.studentName}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-amber-700" />
                          </button>
                        </td>

                        {/* Các cột động: Buổi 1 .. Buổi N */}
                        {sessionIndices.map((k) => {
                          const cell =
                            row.sessions.find((s) => s.sessionIndex === k) ||
                            row.sessions[k - 1];

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
                              <td data-cell-layout="custom" data-align="center" data-wrap="nowrap"
                                key={k}
                                className="border-r border-border/60 p-1.5 align-top bg-teal-50/15 min-w-[145px]"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1 px-0.5">
                                  <span className="text-[10px] font-semibold text-text-secondary">
                                    {formatDateDM(cell.sessionDate)}
                                  </span>
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
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
                                    className="h-7 w-full rounded-lg border border-teal-300/80 bg-surface px-2 pr-6 text-xs font-semibold text-text-primary placeholder:text-text-muted placeholder:font-normal focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-surface-subtle disabled:text-text-muted"
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
                                    'bg-surface-muted text-text-secondary border-border-strong',
                                };

                            return (
                              <td data-cell-layout="custom" data-align="center" data-wrap="nowrap"
                                key={k}
                                className="border-r border-border/60 p-1.5 align-top bg-surface-subtle/50 min-w-[145px]"
                                title="Học viên chưa học buổi này nên ô bị khóa"
                              >
                                <div className="flex items-center justify-between gap-1 mb-1 px-0.5">
                                  <span className="text-[10px] font-medium text-text-muted">
                                    {formatDateDM(cell.sessionDate)}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${badgeInfo.className}`}
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
                                    className="h-7 w-full rounded-lg border border-border/70 bg-surface-muted/80 px-2 pr-6 text-xs text-text-muted cursor-not-allowed"
                                  />
                                  <Lock className="w-3.5 h-3.5 text-text-muted absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                              </td>
                            );
                          }

                          // Trường hợp 3: Chưa có buổi học thứ k (!cell)
                          return (
                            <td data-cell-layout="custom" data-align="center" data-wrap="nowrap"
                              key={k}
                              className="border-r border-border/60 p-1.5 align-top bg-surface-subtle/25 min-w-[145px]"
                            >
                              <div className="flex items-center justify-between gap-1 mb-1 px-0.5 min-h-[18px]">
                                <span className="text-[10px] text-text-muted">
                                  Chưa học
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  disabled
                                  value=""
                                  placeholder="Chưa học"
                                  title="Học viên chưa học buổi này nên ô bị khóa"
                                  className="h-7 w-full rounded-lg border border-border/70 bg-surface-muted/80 px-2 pr-6 text-xs text-text-muted cursor-not-allowed"
                                />
                                <Lock className="w-3.5 h-3.5 text-text-muted absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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

          {/* Pagination Footer */}
          {!loading && rows.length > 0 && (
            <PaginationFooter
              startRecord={startRecord}
              endRecord={endRecord}
              totalCount={total}
              pageSize={pageSize}
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={(newPage) => setPage(newPage)}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              recordLabel="học viên"
            />
          )}
        </div>
      )}
    </PageContainer>
  );
};
