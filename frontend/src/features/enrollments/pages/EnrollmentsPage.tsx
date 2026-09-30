import React, { useEffect, useState, useMemo } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment } from '../types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Input } from '../../../components/ui/Input';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Button } from '../../../components/ui/Button';
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
import { BarChart3, Calendar, Search, SlidersHorizontal, Zap, X } from 'lucide-react';

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

  // Search, filter & view state
  const [activeTab, setActiveTab] = useState<AttendanceTab>('quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<string>('');
  const [modelFilter, setModelFilter] = useState('');
  const [statusFilterByTab, setStatusFilterByTab] = useState<Record<AttendanceTab, string>>(DEFAULT_STATUS_BY_TAB);

  const statusFilter = statusFilterByTab[activeTab];
  const setStatusFilter = (val: string) => {
    setStatusFilterByTab((prev) => ({
      ...prev,
      [activeTab]: val,
    }));
  };

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      const data = await enrollmentsApi.list({
        sale: selectedSale || undefined,
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
  }, [selectedSale]);

  // Extract unique Sales list for Admin filter
  const salesList = useMemo(() => {
    const set = new Set<string>();
    enrollments.forEach((e) => {
      if (e.sale_name) set.add(e.sale_name);
      if (e.cs?.name) set.add(e.cs.name);
      if (e.cs?.email) set.add(e.cs.email);
    });
    return Array.from(set).filter(Boolean);
  }, [enrollments]);

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
            start_date: enr.start_date,
            status: enr.status,
            end_date: enr.end_date,
            start_time: schedule?.start_time || '20h00',
            schedule_pattern: schedule?.schedule_pattern || '246',
            duration_minutes: schedule?.duration_minutes || 30,
            teacher_name: teacher?.name || 'Giáo viên',
            teacher_code:
              (teacher as any)?.teacher_profile?.teacher_code ||
              (teacher as any)?.teacher_code ||
              'GV_--',
            class_name: cls?.class_name || 'Lớp học',
            sale_name: enr.sale_name || enr.cs?.name || 'Sale',
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
          start_date: enr.start_date,
          status: enr.status,
          end_date: enr.end_date,
          start_time: '20h00',
          schedule_pattern: '246',
          duration_minutes: 30,
          teacher_name: 'Chưa xếp GV',
          teacher_code: 'GV_--',
          class_name: 'Chưa xếp lớp',
          sale_name: enr.sale_name || enr.cs?.name || 'Sale',
        });
      }
    });

    return list;
  }, [enrollments]);

  const matrixStudents = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('vi-VN');

    return listStudents.filter((student) => {
      const matchesSearch =
        !query ||
        [student.external_id, student.full_name, student.phone, student.email]
          .some((value) => value?.toLocaleLowerCase('vi-VN').includes(query));
      const matchesModel = !modelFilter || normalizeClassModel(student.model_type) === modelFilter;
      const matchesStatus = !statusFilter || student.status === statusFilter;
      return matchesSearch && matchesModel && matchesStatus;
    });
  }, [listStudents, searchQuery, modelFilter, statusFilter]);

  const defaultStatus = DEFAULT_STATUS_BY_TAB[activeTab];
  const hasActiveFilters = Boolean(
    searchQuery ||
    modelFilter ||
    statusFilter !== defaultStatus
  );
  const clearFilters = () => {
    setSearchQuery('');
    setModelFilter('');
    setStatusFilter(defaultStatus);
  };

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

  // Save changes from Attendance Matrix across student classes
  const handleCustomSaveAll = async (
    pendingEdits: Record<string, AttendanceStatus>,
    customValues?: Record<string, number>
  ) => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;

    // Group edits by class_id and dateStr
    const byClassAndDate = new Map<
      string,
      { classId: number; dateStr: string; items: { ecId: number; status: AttendanceStatus }[] }
    >();

    entries.forEach(([key, status]) => {
      const [ecIdStr, dateStr] = key.split('_');
      const ecId = parseInt(ecIdStr, 10);
      const student = matrixStudents.find((s) => s.enrollment_class_id === ecId);
      if (!student || student.enrollment_class_id <= 0 || !student.class_id) {
        return;
      }
      const classId = student.class_id;

      const groupKey = `${classId}_${dateStr}`;
      if (!byClassAndDate.has(groupKey)) {
        byClassAndDate.set(groupKey, { classId, dateStr, items: [] });
      }
      byClassAndDate.get(groupKey)!.items.push({ ecId, status });
    });

    for (const { classId, dateStr, items } of byClassAndDate.values()) {
      const existingSessions = await classSessionsApi.list(classId);
      let session = existingSessions.find(
        (s) => formatSessionDate(s.session_date) === dateStr
      );

      if (!session) {
        session = await classSessionsApi.create(classId, {
          session_number: existingSessions.length + 1,
          session_date: dateStr,
        });
      }

      await attendanceApi.bulkMark(classId, session.id, {
        items: items.map((i) => ({
          enrollment_class_id: i.ecId,
          status: i.status,
          session_count:
            i.status === 'ATTENDED' ? customValues?.[`${i.ecId}_${dateStr}`] ?? 1 : 1,
        })),
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
        onChange={setActiveTab}
        className="mb-5"
        items={[
          { value: 'quick', label: 'Điểm danh nhanh', icon: <Zap /> },
          { value: 'detailed', label: 'Điểm danh chi tiết', icon: <Calendar /> },
          { value: 'stats', label: 'Thống kê', icon: <BarChart3 /> },
        ]}
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
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <div className="min-w-[220px] flex-[1_1_320px] xl:max-w-[420px]">
                  <Input
                    placeholder="Tìm ID, tên, SĐT hoặc email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    leftIcon={<Search className="h-4 w-4 text-text-muted" />}
                  />
                </div>
                <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-text-muted xl:block" aria-hidden="true" />
                {!isCS && (
                  <select
                    aria-label="Lọc theo nhân viên Sale"
                    value={selectedSale}
                    onChange={(e) => setSelectedSale(e.target.value)}
                    className="h-10 w-[148px] rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-semibold text-text-primary outline-none transition focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Tất cả Sale</option>
                    {salesList.map((sale) => <option key={sale} value={sale}>{sale}</option>)}
                  </select>
                )}
                <select
                  aria-label="Lọc theo mô hình lớp"
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className="h-10 w-[132px] rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-semibold text-text-primary outline-none transition focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Tất cả mô hình</option>
                  <option value="1:1">Mô hình 1:1</option>
                  <option value="1:2">Mô hình 1:2</option>
                  <option value="1:n">Mô hình 1:n</option>
                </select>
                <select
                  aria-label="Lọc theo trạng thái ghi danh"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 w-[146px] rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-semibold text-text-primary outline-none transition focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="WAITING_CLASS">Chờ lớp</option>
                  <option value="STUDYING">Đang học</option>
                  <option value="PAUSED">Bảo lưu</option>
                  <option value="FINISHED">Kết thúc</option>
                  <option value="UPCOMING">Sắp học</option>
                  <option value="NOT_STARTED">Chưa học</option>
                  <option value="CANCELLED">Đã hủy</option>
                </select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} leftIcon={<X className="h-4 w-4" />}>
                    Xóa lọc
                  </Button>
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
