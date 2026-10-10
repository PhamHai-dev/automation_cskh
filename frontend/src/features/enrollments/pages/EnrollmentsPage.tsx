import React, { useEffect, useState, useMemo } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment } from '../types/enrollments.types';
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
  formatSessionDate,
} from '../../classes/components/AttendanceMatrix';
import { classSessionsApi, attendanceApi } from '../../classes/api/sessions.api';
import { ClassSession, Attendance, AttendanceStatus } from '../../classes/types/classes.types';
import { BarChart3, Calendar, Zap } from 'lucide-react';

const DEFAULT_STATUS_BY_TAB: Record<AttendanceTab, string> = {
  quick: 'STUDYING',
  detailed: 'STUDYING',
  stats: '',
};

export const EnrollmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN') && !user?.roles.includes('MANAGE');

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab & Filters state
  const [activeTab, setActiveTab] = useState<AttendanceTab>('quick');
  const [filters, setFilters] = useState<EnrollmentFilterState>(() => ({
    ...INITIAL_ENROLLMENT_FILTERS,
    statusFilter: DEFAULT_STATUS_BY_TAB['quick'],
  }));

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const data = await enrollmentsApi.list({
        sale: filters.selectedSale || undefined,
      });
      setEnrollments(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách ghi danh');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrollments();
  }, [filters.selectedSale]);

  const handleTabChange = (tab: AttendanceTab) => {
    setActiveTab(tab);
    setFilters((prev) => ({
      ...prev,
      statusFilter: DEFAULT_STATUS_BY_TAB[tab],
    }));
  };

  const normalizeClassModel = (model?: string | null): string => {
    const normalized = (model || '').toUpperCase();
    if (normalized === 'ONE_TO_ONE' || model === '1:1' || model === '1-1') return '1:1';
    if (normalized === 'ONE_TO_TWO' || model === '1:2' || model === '1-2') return '1:2';
    if (normalized === 'ONE_TO_N' || normalized === 'GROUP' || model === '1:n' || model === '1-N') return '1:n';
    return model || '1:1';
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
          });
        });
      } else {
        // Enrolled but not yet assigned to a class
        list.push({
          enrollment_class_id: -enr.id,
          class_id: 0,
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

  // Map total attended sessions for each student to enable accurate reactive session filtering
  const attendedSessionsMap = useMemo(() => {
    const map = new Map<number, number>();
    allAttendances.forEach((a) => {
      if ((a as any).deleted_at) return;
      if (a.status === 'ATTENDED') {
        const cur = map.get(a.enrollment_class_id) || 0;
        map.set(a.enrollment_class_id, cur + 1);
      }
    });
    return map;
  }, [allAttendances]);

  // Dynamic lists for filter dropdowns
  const salesList = useMemo(() => {
    const set = new Set<string>();
    enrollments.forEach((e) => {
      if (e.sale_name) set.add(e.sale_name);
      if (e.cs?.name) set.add(e.cs.name);
      if (e.cs?.email) set.add(e.cs.email);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [enrollments]);

  const packagesList = useMemo(() => {
    const set = new Set<string>();
    listStudents.forEach((s) => {
      if (s.package_name && s.package_name !== 'Gói học' && s.package_name !== '-') {
        set.add(s.package_name);
      }
    });
    return Array.from(set).sort();
  }, [listStudents]);

  const teachersList = useMemo(() => {
    const set = new Set<string>();
    listStudents.forEach((s) => {
      if (s.teacher_name && s.teacher_name !== 'Chưa xếp GV' && s.teacher_name !== 'Giáo viên') {
        set.add(s.teacher_name);
      }
    });
    return Array.from(set).sort();
  }, [listStudents]);

  const teacherCodesList = useMemo(() => {
    const set = new Set<string>();
    listStudents.forEach((s) => {
      if (s.teacher_code && s.teacher_code !== '—' && s.teacher_code !== 'GV_--') {
        set.add(s.teacher_code);
      }
    });
    return Array.from(set).sort();
  }, [listStudents]);

  const classesList = useMemo(() => {
    const set = new Set<string>();
    listStudents.forEach((s) => {
      if (s.class_name && s.class_name !== 'Chưa xếp lớp' && s.class_name !== '—' && s.class_name !== 'Lớp học') {
        set.add(s.class_name);
      }
    });
    return Array.from(set).sort();
  }, [listStudents]);

  // Main filtered students list with all requested criteria
  const matrixStudents = useMemo(() => {
    const query = filters.searchQuery.trim().toLocaleLowerCase('vi-VN');
    const pkgQuery = filters.packageName.trim().toLocaleLowerCase('vi-VN');
    const classQuery = filters.className.trim().toLocaleLowerCase('vi-VN');

    return listStudents.filter((student) => {
      // 1. Text search: ID, Name, Phone, Email
      if (query) {
        const matchesSearch = [
          student.external_id,
          student.full_name,
          student.phone,
          student.email,
        ].some((value) => value?.toLocaleLowerCase('vi-VN').includes(query));
        if (!matchesSearch) return false;
      }

      // 2. Tìm kiếm / Lọc Gói học
      if (pkgQuery) {
        const pName = (student.package_name || '').toLocaleLowerCase('vi-VN');
        if (!pName.includes(pkgQuery)) return false;
      }

      // 3. Lọc Khóa học: Kaiwa 1->6, JNPT 1->6
      const levelStr = (student.level || '').toLowerCase();
      const contentStr = (student.course_content || '').toLowerCase();
      const classNameStr = (student.class_name || '').toLowerCase();

      if (filters.courseCategory === 'KAIWA') {
        const isKaiwa =
          levelStr.includes('kaiwa') ||
          contentStr.includes('kaiwa') ||
          classNameStr.includes('kaiwa');
        if (!isKaiwa) return false;
      } else if (filters.courseCategory === 'JNPT') {
        const isJnpt =
          levelStr.includes('jnpt') ||
          levelStr.includes('jlpt') ||
          /\bn[1-6]\b/i.test(levelStr) ||
          contentStr.includes('jnpt') ||
          contentStr.includes('jlpt') ||
          /\bn[1-6]\b/i.test(contentStr) ||
          classNameStr.includes('jnpt') ||
          classNameStr.includes('jlpt');
        if (!isJnpt) return false;
      }

      if (filters.courseLevel) {
        const target = filters.courseLevel.toLowerCase();
        let matchesLevel =
          levelStr.includes(target) ||
          contentStr.includes(target) ||
          classNameStr.includes(target);

        if (!matchesLevel && target.startsWith('jnpt ')) {
          const num = target.replace('jnpt ', '').trim();
          matchesLevel =
            levelStr.includes(`n${num}`) ||
            contentStr.includes(`n${num}`) ||
            levelStr.includes(`jlpt ${num}`) ||
            contentStr.includes(`jlpt ${num}`);
        } else if (!matchesLevel && target.startsWith('n')) {
          const num = target.replace('n', '').trim();
          matchesLevel =
            levelStr.includes(`jnpt ${num}`) ||
            contentStr.includes(`jnpt ${num}`) ||
            levelStr.includes(`jlpt ${num}`) ||
            contentStr.includes(`jlpt ${num}`);
        }

        if (!matchesLevel) return false;
      }

      // 4. Lọc theo Tổng số buổi, Số buổi đã học, Số buổi còn lại
      const total = student.total_sessions || 0;
      const prevAttended = student.attended_previous_years || 0;
      const attendedCurrent = attendedSessionsMap.get(student.enrollment_class_id) || 0;
      const attended = prevAttended + attendedCurrent;
      const remaining = student.total_sessions
        ? student.total_sessions - attended
        : ((student.remaining_sessions ?? 0) - attendedCurrent);

      // 4. Lọc theo Tổng số buổi, Số buổi đã học, Số buổi còn lại (Bằng hoặc Khoảng)
      // Tổng số buổi
      if (filters.totalSessionsOp === 'EXACT') {
        if (filters.totalSessionsExact !== '' && total !== Number(filters.totalSessionsExact)) return false;
      } else {
        if (filters.totalSessionsMin !== '' && total < Number(filters.totalSessionsMin)) return false;
        if (filters.totalSessionsMax !== '' && total > Number(filters.totalSessionsMax)) return false;
      }

      // Số buổi đã học
      if (filters.attendedSessionsOp === 'EXACT') {
        if (filters.attendedSessionsExact !== '' && attended !== Number(filters.attendedSessionsExact)) return false;
      } else {
        if (filters.attendedSessionsMin !== '' && attended < Number(filters.attendedSessionsMin)) return false;
        if (filters.attendedSessionsMax !== '' && attended > Number(filters.attendedSessionsMax)) return false;
      }

      // Số buổi còn lại
      if (filters.remainingSessionsOp === 'EXACT') {
        if (filters.remainingSessionsExact !== '' && remaining !== Number(filters.remainingSessionsExact)) return false;
      } else {
        if (filters.remainingSessionsMin !== '' && remaining < Number(filters.remainingSessionsMin)) return false;
        if (filters.remainingSessionsMax !== '' && remaining > Number(filters.remainingSessionsMax)) return false;
      }

      // 5. Lọc theo Giáo viên, Mã giáo viên, Tên lớp
      if (filters.teacherName && student.teacher_name !== filters.teacherName) return false;
      if (filters.teacherCode && student.teacher_code !== filters.teacherCode) return false;
      if (classQuery && !classNameStr.includes(classQuery)) return false;

      // 6. Lọc theo Ngày bắt đầu học, Ngày kết thúc / Bảo lưu (Bằng hoặc Khoảng)
      const stStartDate = student.start_date ? formatSessionDate(student.start_date) : '';
      const stEndDate = student.end_date ? formatSessionDate(student.end_date) : '';

      if (filters.startDateOp === 'EXACT') {
        if (filters.startDateExact && stStartDate !== filters.startDateExact) return false;
      } else {
        if (filters.startDateFrom && (!stStartDate || stStartDate < filters.startDateFrom)) return false;
        if (filters.startDateTo && (!stStartDate || stStartDate > filters.startDateTo)) return false;
      }

      if (filters.endDateOp === 'EXACT') {
        if (filters.endDateExact && stEndDate !== filters.endDateExact) return false;
      } else {
        if (filters.endDateFrom && (!stEndDate || stEndDate < filters.endDateFrom)) return false;
        if (filters.endDateTo && (!stEndDate || stEndDate > filters.endDateTo)) return false;
      }

      // 7. Lọc theo Lịch học, Giờ học (nhập text tìm kiếm)
      if (
        filters.schedulePattern.trim() &&
        !(student.schedule_pattern || '')
          .toLowerCase()
          .includes(filters.schedulePattern.trim().toLowerCase())
      ) {
        return false;
      }

      if (
        filters.startTime.trim() &&
        !(student.start_time || '')
          .toLowerCase()
          .includes(filters.startTime.trim().toLowerCase())
      ) {
        return false;
      }

      // 8. Mô hình & Trạng thái
      if (filters.modelFilter && normalizeClassModel(student.model_type) !== filters.modelFilter) {
        return false;
      }

      if (filters.statusFilter && student.status !== filters.statusFilter) {
        return false;
      }

      return true;
    });
  }, [listStudents, filters, attendedSessionsMap]);

  const handleResetFilters = () => {
    setFilters({
      ...INITIAL_ENROLLMENT_FILTERS,
      statusFilter: DEFAULT_STATUS_BY_TAB[activeTab],
    });
  };

  // Save changes from Attendance Matrix across student classes
  const handleCustomSaveAll = async (
    pendingEdits: Record<string, AttendanceStatus>,
    _customValues?: Record<string, number>,
    sessionIndex = 0,
    side?: 'TEACHER' | 'CS'
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
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '') || a.session_number - b.session_number || a.id - b.id);
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

  return (
    <PageContainer>
      <PageHeader title="Quản lý Điểm danh & Ghi danh" />

      <HorizontalTabs
        ariaLabel="Nội dung quản lý ghi danh"
        value={activeTab}
        onChange={handleTabChange}
        className="mb-4"
        items={[
          { value: 'quick', label: 'Điểm danh nhanh', icon: <Zap /> },
          { value: 'detailed', label: 'Điểm danh chi tiết', icon: <Calendar /> },
          { value: 'stats', label: 'Thống kê', icon: <BarChart3 /> },
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
                  <span className="text-text-muted">/ {listStudents.length} học viên</span>
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
            onRefresh={fetchEnrollments}
            onSaveCustom={handleCustomSaveAll}
          />
        )}
      </div>
    </PageContainer>
  );
};
