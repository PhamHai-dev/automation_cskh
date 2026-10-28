import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { enrollmentsApi } from '../api/enrollments.api';
import {
  EnrollmentFilterState,
  INITIAL_ENROLLMENT_FILTERS,
} from '../types/enrollmentFilter.types';
import { EnrollmentFilterBar } from '../components/EnrollmentFilterBar';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  AttendanceMatrix,
  AttendanceTab,
  StudentRow,
  compareSessionsInDay,
  formatSessionDate,
  formatClassCode,
  toLocalDateString,
} from '../../classes/components/AttendanceMatrix';
import { classSessionsApi, attendanceApi } from '../../classes/api/sessions.api';
import { ClassSession, Attendance, AttendanceStatus, AttendanceSide } from '../../classes/types/classes.types';
import { BarChart3, Calendar, Zap } from 'lucide-react';
import { useColumnVisibility } from '../../preferences/hooks/useColumnVisibility';
import { PreferenceScope } from '../../preferences/columns';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useQuery, invalidateQueries } from '../../../hooks/useQuery';

const DEFAULT_STATUS_BY_TAB: Record<AttendanceTab, string> = {
  quick: 'STUDYING',
  detailed: 'STUDYING',
  stats: '',
};

export const EnrollmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN') && !user?.roles.includes('MANAGE');

  const [searchParams, setSearchParams] = useSearchParams();

  // Tab, Program, Page & PageSize state synced with URL
  const [activeTab, setActiveTab] = useState<AttendanceTab>(() => {
    const t = searchParams.get('tab');
    return t === 'detailed' || t === 'stats' ? t : 'quick';
  });

  const [programFilter, setProgramFilter] = useState<'ALL' | 'KAIWA' | 'JLPT'>(() => {
    const p = (searchParams.get('program') || '').toUpperCase();
    return p === 'KAIWA' || p === 'JLPT' ? p : 'ALL';
  });

  const [page, setPage] = useState<number>(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [pageSize, setPageSize] = useState<number>(
    () => Math.max(1, Number(searchParams.get('pageSize')) || 20)
  );

  const prefScope: PreferenceScope = `enrollments.${activeTab}`;
  const { visible: visibleColumns } = useColumnVisibility(prefScope);

  const [filters, setFilters] = useState<EnrollmentFilterState>(() => {
    const initTab: AttendanceTab =
      searchParams.get('tab') === 'detailed'
        ? 'detailed'
        : searchParams.get('tab') === 'stats'
        ? 'stats'
        : 'quick';
    const urlStatus = searchParams.get('status');
    return {
      ...INITIAL_ENROLLMENT_FILTERS,
      searchQuery: searchParams.get('search') || '',
      statusFilter: urlStatus !== null ? urlStatus : DEFAULT_STATUS_BY_TAB[initTab],
    };
  });

  // Sync URL -> searchQuery when global search navigates here
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null && q !== filters.searchQuery) {
      setFilters((prev) => ({ ...prev, searchQuery: q }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounce text inputs in EnrollmentFilterBar (300ms)
  const debouncedSearchQuery = useDebouncedValue(filters.searchQuery, 300);
  const debouncedPackageName = useDebouncedValue(filters.packageName, 300);
  const debouncedClassName = useDebouncedValue(filters.className, 300);
  const debouncedSchedulePattern = useDebouncedValue(filters.schedulePattern, 300);
  const debouncedStartTime = useDebouncedValue(filters.startTime, 300);

  // Reset page to 1 when any filter or tab changes
  const isFirstFilterRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstFilterRenderRef.current) {
      isFirstFilterRenderRef.current = false;
      return;
    }
    setPage(1);
  }, [
    activeTab,
    programFilter,
    debouncedSearchQuery,
    debouncedPackageName,
    debouncedClassName,
    debouncedSchedulePattern,
    debouncedStartTime,
    filters.statusFilter,
    filters.modelFilter,
    filters.courseCategory,
    filters.courseLevel,
    filters.teacherName,
    filters.teacherCode,
    filters.selectedSale,
    filters.totalSessionsOp,
    filters.totalSessionsExact,
    filters.totalSessionsMin,
    filters.totalSessionsMax,
    filters.attendedSessionsOp,
    filters.attendedSessionsExact,
    filters.attendedSessionsMin,
    filters.attendedSessionsMax,
    filters.remainingSessionsOp,
    filters.remainingSessionsExact,
    filters.remainingSessionsMin,
    filters.remainingSessionsMax,
    filters.startDateOp,
    filters.startDateExact,
    filters.startDateFrom,
    filters.startDateTo,
    filters.endDateOp,
    filters.endDateExact,
    filters.endDateFrom,
    filters.endDateTo,
  ]);

  // Sync tab, program, search, status, page, pageSize to URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (activeTab !== 'quick') next.set('tab', activeTab);
    else next.delete('tab');

    if (programFilter !== 'ALL') next.set('program', programFilter);
    else next.delete('program');

    if (filters.searchQuery.trim()) next.set('search', filters.searchQuery.trim());
    else next.delete('search');

    if (filters.statusFilter !== DEFAULT_STATUS_BY_TAB[activeTab]) {
      next.set('status', filters.statusFilter);
    } else {
      next.delete('status');
    }

    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    if (pageSize !== 20) next.set('pageSize', String(pageSize));
    else next.delete('pageSize');

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    activeTab,
    programFilter,
    filters.searchQuery,
    filters.statusFilter,
    page,
    pageSize,
    searchParams,
    setSearchParams,
  ]);

  // Visible session date range from AttendanceMatrix
  const [visibleRange, setVisibleRange] = useState<{ from: string; to: string }>(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      from: toLocalDateString(monday),
      to: toLocalDateString(sunday),
    };
  });

  const handleVisibleRangeChange = useCallback((range: { from: string; to: string }) => {
    setVisibleRange((prev) =>
      prev.from === range.from && prev.to === range.to ? prev : range
    );
  }, []);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize,
      search: debouncedSearchQuery.trim() || undefined,
      status: filters.statusFilter || undefined,
      program_type: programFilter !== 'ALL' ? programFilter : undefined,
      sale: filters.selectedSale || undefined,
      package_name: debouncedPackageName.trim() || undefined,
      course_category: filters.courseCategory !== 'ALL' ? filters.courseCategory : undefined,
      course_level: filters.courseLevel || undefined,
      teacher_name: filters.teacherName || undefined,
      teacher_code: filters.teacherCode || undefined,
      class_name: debouncedClassName.trim() || undefined,
      model_filter: filters.modelFilter || undefined,
      schedule_pattern: debouncedSchedulePattern.trim() || undefined,
      start_time: debouncedStartTime.trim() || undefined,
      total_sessions_op:
        filters.totalSessionsOp === 'EXACT' && filters.totalSessionsExact !== ''
          ? 'EXACT'
          : filters.totalSessionsOp === 'RANGE' &&
            (filters.totalSessionsMin !== '' || filters.totalSessionsMax !== '')
          ? 'RANGE'
          : undefined,
      total_sessions_exact:
        filters.totalSessionsOp === 'EXACT' && filters.totalSessionsExact !== ''
          ? filters.totalSessionsExact
          : undefined,
      total_sessions_min:
        filters.totalSessionsOp === 'RANGE' && filters.totalSessionsMin !== ''
          ? filters.totalSessionsMin
          : undefined,
      total_sessions_max:
        filters.totalSessionsOp === 'RANGE' && filters.totalSessionsMax !== ''
          ? filters.totalSessionsMax
          : undefined,
      attended_sessions_op:
        filters.attendedSessionsOp === 'EXACT' && filters.attendedSessionsExact !== ''
          ? 'EXACT'
          : filters.attendedSessionsOp === 'RANGE' &&
            (filters.attendedSessionsMin !== '' || filters.attendedSessionsMax !== '')
          ? 'RANGE'
          : undefined,
      attended_sessions_exact:
        filters.attendedSessionsOp === 'EXACT' && filters.attendedSessionsExact !== ''
          ? filters.attendedSessionsExact
          : undefined,
      attended_sessions_min:
        filters.attendedSessionsOp === 'RANGE' && filters.attendedSessionsMin !== ''
          ? filters.attendedSessionsMin
          : undefined,
      attended_sessions_max:
        filters.attendedSessionsOp === 'RANGE' && filters.attendedSessionsMax !== ''
          ? filters.attendedSessionsMax
          : undefined,
      remaining_sessions_op:
        filters.remainingSessionsOp === 'EXACT' && filters.remainingSessionsExact !== ''
          ? 'EXACT'
          : filters.remainingSessionsOp === 'RANGE' &&
            (filters.remainingSessionsMin !== '' || filters.remainingSessionsMax !== '')
          ? 'RANGE'
          : undefined,
      remaining_sessions_exact:
        filters.remainingSessionsOp === 'EXACT' && filters.remainingSessionsExact !== ''
          ? filters.remainingSessionsExact
          : undefined,
      remaining_sessions_min:
        filters.remainingSessionsOp === 'RANGE' && filters.remainingSessionsMin !== ''
          ? filters.remainingSessionsMin
          : undefined,
      remaining_sessions_max:
        filters.remainingSessionsOp === 'RANGE' && filters.remainingSessionsMax !== ''
          ? filters.remainingSessionsMax
          : undefined,
      start_date_op:
        filters.startDateOp === 'EXACT' && filters.startDateExact
          ? 'EXACT'
          : filters.startDateOp === 'RANGE' && (filters.startDateFrom || filters.startDateTo)
          ? 'RANGE'
          : undefined,
      start_date_exact:
        filters.startDateOp === 'EXACT' && filters.startDateExact
          ? filters.startDateExact
          : undefined,
      start_date_from:
        filters.startDateOp === 'RANGE' && filters.startDateFrom
          ? filters.startDateFrom
          : undefined,
      start_date_to:
        filters.startDateOp === 'RANGE' && filters.startDateTo
          ? filters.startDateTo
          : undefined,
      end_date_op:
        filters.endDateOp === 'EXACT' && filters.endDateExact
          ? 'EXACT'
          : filters.endDateOp === 'RANGE' && (filters.endDateFrom || filters.endDateTo)
          ? 'RANGE'
          : undefined,
      end_date_exact:
        filters.endDateOp === 'EXACT' && filters.endDateExact
          ? filters.endDateExact
          : undefined,
      end_date_from:
        filters.endDateOp === 'RANGE' && filters.endDateFrom
          ? filters.endDateFrom
          : undefined,
      end_date_to:
        filters.endDateOp === 'RANGE' && filters.endDateTo
          ? filters.endDateTo
          : undefined,
      session_from: visibleRange.from,
      session_to: visibleRange.to,
    }),
    [
      page,
      pageSize,
      debouncedSearchQuery,
      debouncedPackageName,
      debouncedClassName,
      debouncedSchedulePattern,
      debouncedStartTime,
      programFilter,
      filters,
      visibleRange.from,
      visibleRange.to,
    ]
  );

  const {
    data: paginatedResult,
    isLoading: loading,
    isFetching,
  } = useQuery({
    queryKey: ['enrollments', 'paginated', queryParams],
    queryFn: (signal) => enrollmentsApi.listPaginated(queryParams, signal),
    staleTime: 30 * 1000,
    keepPreviousData: true,
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách ghi danh');
    },
  });

  const enrollments = useMemo(() => paginatedResult?.data || [], [paginatedResult]);
  const meta = paginatedResult?.meta;

  const fetchEnrollments = useCallback(async () => {
    invalidateQueries(['enrollments', 'classes', 'students']);
  }, []);

  const handleTabChange = (tab: AttendanceTab) => {
    setActiveTab(tab);
    setFilters((prev) => ({
      ...prev,
      statusFilter: DEFAULT_STATUS_BY_TAB[tab],
    }));
  };

  // Extract rich StudentRow list for AttendanceMatrix with all fields A -> AH
  const listStudents: StudentRow[] = useMemo(() => {
    const list: StudentRow[] = [];

    enrollments.forEach((enr) => {
      const student = enr.student;
      if (!student) return;

      const pkg = enr.package;

      // If enrollment has assigned enrollment_classes
      if (enr.enrollment_classes && enr.enrollment_classes.length > 0) {
        enr.enrollment_classes.forEach((ec) => {
          const cls = ec.class;
          const teacher = cls?.class_teachers?.[0]?.teacher;
          const schedule = cls?.class_schedules?.[0];

          list.push({
            enrollment_class_id: ec.id,
            class_id: ec.class_id,
            class_code: cls?.class_code
              ? formatClassCode(cls.class_code, cls.id)
              : cls?.id
              ? formatClassCode(null, cls.id)
              : '—',
            student_id: student.id,
            external_id: student.external_id || enr.external_id || `HV_${student.id}`,
            full_name: student.full_name,
            package_name: pkg?.name || pkg?.code || 'Gói học',
            course_content: enr.course_content || 'Thường',
            total_sessions: enr.total_sessions || 0,
            level: enr.level || (cls as any)?.level || 'Thường',
            email: student.email || '',
            phone: student.phone || '',
            model_type: (cls as any)?.model_type || enr.class_model || '1:1',
            remaining_sessions: enr.external_remaining_sessions,
            attended_previous_years: enr.attended_previous_years ?? 0,
            start_date: enr.start_date,
            status: enr.status,
            end_date: enr.end_date,
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
            sale_name: enr.sale_name || enr.cs?.name || '—',
            program_type: enr.program_type || 'KAIWA',
            cs_staff_code: enr.cs?.staff_code || null,
            attendance_stats: ec.attendance_stats,
          });
        });
      } else {
        // Enrolled but not yet assigned to a class
        list.push({
          enrollment_class_id: -enr.id,
          class_id: 0,
          class_code: '—',
          student_id: student.id,
          external_id: student.external_id || enr.external_id || `HV_${student.id}`,
          full_name: student.full_name,
          package_name: pkg?.name || pkg?.code || 'Gói học',
          course_content: enr.course_content || 'Thường',
          total_sessions: enr.total_sessions || 0,
          level: enr.level || 'Thường',
          email: student.email || '',
          phone: student.phone || '',
          model_type: enr.class_model || '1:1',
          remaining_sessions: enr.external_remaining_sessions,
          attended_previous_years: enr.attended_previous_years ?? 0,
          start_date: enr.start_date,
          status: enr.status,
          end_date: enr.end_date,
          start_time: '20h00',
          schedule_pattern: '246',
          duration_minutes: 30,
          teacher_name: 'Chưa xếp GV',
          teacher_code: '—',
          class_name: 'Chưa xếp lớp',
          sale_name: enr.sale_name || enr.cs?.name || '—',
          program_type: enr.program_type || 'KAIWA',
          cs_staff_code: enr.cs?.staff_code || null,
        });
      }
    });

    return list;
  }, [enrollments]);

  // Aggregate all sessions & attendances across the enrolled classes
  const { allSessions, allAttendances } = useMemo(() => {
    const sessMap = new Map<number, ClassSession>();
    const attList: Attendance[] = [];

    enrollments.forEach((enr) => {
      enr.enrollment_classes?.forEach((ec) => {
        // Collect class sessions
        ec.class?.class_sessions?.forEach((s: any) => {
          if (!sessMap.has(s.id)) {
            sessMap.set(s.id, s);
          }
        });

        // Collect attendances & their class_sessions
        ec.attendance?.forEach((a: any) => {
          attList.push(a);
          if (a.class_session && !sessMap.has(a.class_session.id)) {
            sessMap.set(a.class_session.id, a.class_session);
          }
        });
      });
    });

    return {
      allSessions: Array.from(sessMap.values()),
      allAttendances: attList,
    };
  }, [enrollments]);

  // Dynamic lists for filter dropdowns (combining backend filterOptions with local data)
  const salesList = useMemo(() => {
    const set = new Set<string>(meta?.filterOptions?.salesList || []);
    enrollments.forEach((e) => {
      if (e.sale_name) set.add(e.sale_name);
      if (e.cs?.name) set.add(e.cs.name);
      if (e.cs?.email) set.add(e.cs.email);
    });
    if (filters.selectedSale) set.add(filters.selectedSale);
    return Array.from(set).filter(Boolean).sort();
  }, [enrollments, meta, filters.selectedSale]);

  const packagesList = useMemo(() => {
    const set = new Set<string>(meta?.filterOptions?.packagesList || []);
    listStudents.forEach((s) => {
      if (s.package_name && s.package_name !== 'Gói học' && s.package_name !== '-') {
        set.add(s.package_name);
      }
    });
    if (filters.packageName) set.add(filters.packageName);
    return Array.from(set).sort();
  }, [listStudents, meta, filters.packageName]);

  const teachersList = useMemo(() => {
    const set = new Set<string>(meta?.filterOptions?.teachersList || []);
    listStudents.forEach((s) => {
      if (s.teacher_name && s.teacher_name !== 'Chưa xếp GV' && s.teacher_name !== 'Giáo viên') {
        set.add(s.teacher_name);
      }
    });
    if (filters.teacherName) set.add(filters.teacherName);
    return Array.from(set).sort();
  }, [listStudents, meta, filters.teacherName]);

  const teacherCodesList = useMemo(() => {
    const set = new Set<string>(meta?.filterOptions?.teacherCodesList || []);
    listStudents.forEach((s) => {
      if (s.teacher_code && s.teacher_code !== '—' && s.teacher_code !== 'GV_--') {
        set.add(s.teacher_code);
      }
    });
    if (filters.teacherCode) set.add(filters.teacherCode);
    return Array.from(set).sort();
  }, [listStudents, meta, filters.teacherCode]);

  const classesList = useMemo(() => {
    const set = new Set<string>(meta?.filterOptions?.classesList || []);
    listStudents.forEach((s) => {
      if (s.class_name && s.class_name !== 'Chưa xếp lớp' && s.class_name !== '—' && s.class_name !== 'Lớp học') {
        set.add(s.class_name);
      }
    });
    if (filters.className) set.add(filters.className);
    return Array.from(set).sort();
  }, [listStudents, meta, filters.className]);

  // Counts by program_type for the switcher
  const programCounts = useMemo(() => {
    if (meta?.facets?.programCounts) {
      return meta.facets.programCounts;
    }
    let kaiwa = 0;
    let jlpt = 0;
    listStudents.forEach((s) => {
      const pType = (s.program_type || '').toUpperCase();
      if (pType === 'JLPT') {
        jlpt++;
      } else {
        kaiwa++;
      }
    });
    return { all: meta?.total ?? listStudents.length, kaiwa, jlpt };
  }, [listStudents, meta]);

  // Server already filters and paginates the current page
  const matrixStudents = listStudents;

  const handleResetFilters = () => {
    setFilters({
      ...INITIAL_ENROLLMENT_FILTERS,
      statusFilter: DEFAULT_STATUS_BY_TAB[activeTab],
    });
    setPage(1);
  };

  // Save changes from Attendance Matrix across student classes
  const handleCustomSaveAll = async (
    pendingEdits: Record<string, AttendanceStatus>,
    _customValues?: Record<string, number>,
    sessionIndex = 0,
    side?: AttendanceSide
  ) => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    const byClassAndDate = new Map<
      string,
      { classId: number; dateStr: string; items: { ecId: number; status: AttendanceStatus }[] }
    >();

    entries.forEach(([key, status]) => {
      const [ecIdStr, dateStr] = key.split('_');
      const ecId = parseInt(ecIdStr, 10);
      const student = matrixStudents.find((s) => s.enrollment_class_id === ecId);
      if (!student || student.enrollment_class_id <= 0 || !student.class_id) return;
      const groupKey = `${student.class_id}_${dateStr}`;
      if (!byClassAndDate.has(groupKey)) {
        byClassAndDate.set(groupKey, { classId: student.class_id, dateStr, items: [] });
      }
      byClassAndDate.get(groupKey)!.items.push({ ecId, status });
    });

    for (const { classId, dateStr, items } of byClassAndDate.values()) {
      const existingSessions = (await classSessionsApi.list(classId))
        .filter((s) => formatSessionDate(s.session_date) === dateStr)
        .sort(compareSessionsInDay);
      let session = existingSessions[sessionIndex];
      if (!session) {
        session = await classSessionsApi.create(classId, { session_date: dateStr });
      }

      await attendanceApi.bulkMark(classId, session.id, {
        items: items.map((i) => ({
          enrollment_class_id: i.ecId,
          status: i.status,
        })),
        side,
      });
    }

    await fetchEnrollments();
  };

  const totalStudentsCount = meta?.total ?? matrixStudents.length;

  return (
    <PageContainer>
      <PageHeader
        title="Quản lý Điểm danh & Ghi danh"
        actions={
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 gap-1">
            <button
              type="button"
              onClick={() => setProgramFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                programFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Tất cả</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200/80 text-slate-700 font-extrabold">
                {programCounts.all}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setProgramFilter('KAIWA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                programFilter === 'KAIWA'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-teal-700'
              }`}
            >
              <span>Giao tiếp (Kaiwa)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  programFilter === 'KAIWA'
                    ? 'bg-teal-700 text-white'
                    : 'bg-teal-100 text-teal-800'
                }`}
              >
                {programCounts.kaiwa}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setProgramFilter('JLPT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                programFilter === 'JLPT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-indigo-700'
              }`}
            >
              <span>Luyện thi (JLPT)</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  programFilter === 'JLPT'
                    ? 'bg-indigo-700 text-white'
                    : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {programCounts.jlpt}
              </span>
            </button>
          </div>
        }
      />

      <HorizontalTabs
        ariaLabel="Nội dung quản lý ghi danh"
        value={activeTab}
        onChange={handleTabChange}
        className="mb-4"
        items={[
          { value: 'quick', label: 'Nhập điểm danh', icon: <Zap /> },
          { value: 'detailed', label: 'Lịch sử & Bảng tháng', icon: <Calendar /> },
          { value: 'stats', label: 'Thống kê chuyên cần', icon: <BarChart3 /> },
        ]}
      />

      {/* Bộ lọc Quản lý Ghi danh chuyên nghiệp 2 tầng */}
      <EnrollmentFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        salesList={salesList}
        packagesList={packagesList}
        teachersList={teachersList}
        teacherCodesList={teacherCodesList}
        classesList={classesList}
        isCS={isCS}
      />

      {/* Main Content Area: 3-Tab Attendance Management */}
      <div className="space-y-4">
        {loading && enrollments.length === 0 ? (
          <div className="flex items-center justify-center p-12 bg-surface rounded-2xl border border-border/80 text-text-muted">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
            <span>Đang tải dữ liệu điểm danh học viên...</span>
          </div>
        ) : (
          <AttendanceMatrix
            activeTab={activeTab}
            titleHeader={(
              <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1.5 shadow-2xs">
                  <span>Hiển thị:</span>
                  <span className="font-extrabold text-primary">{matrixStudents.length}</span>
                  <span className="text-text-muted">/ {totalStudentsCount} học viên</span>
                </span>
                {filters.statusFilter && (
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-primary">
                    {filters.statusFilter === 'STUDYING'
                      ? 'Đang học'
                      : filters.statusFilter === 'WAITING_CLASS'
                      ? 'Chờ lớp'
                      : filters.statusFilter === 'PAUSED'
                      ? 'Bảo lưu'
                      : filters.statusFilter === 'FINISHED'
                      ? 'Kết thúc'
                      : filters.statusFilter === 'UPCOMING'
                      ? 'Sắp học'
                      : filters.statusFilter === 'NOT_STARTED'
                      ? 'Chưa học'
                      : filters.statusFilter === 'CANCELLED'
                      ? 'Đã hủy'
                      : filters.statusFilter}
                  </span>
                )}
              </div>
            )}
            students={matrixStudents}
            sessions={allSessions}
            attendances={allAttendances}
            visibleColumns={visibleColumns}
            onRefresh={fetchEnrollments}
            onSaveCustom={handleCustomSaveAll}
            onVisibleRangeChange={handleVisibleRangeChange}
            isFetchingData={isFetching}
            serverPagination={true}
            page={page}
            pageSize={pageSize}
            totalCount={totalStudentsCount}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        )}
      </div>
    </PageContainer>
  );
};
