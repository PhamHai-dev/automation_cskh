import React, { useEffect, useState, useMemo } from 'react';
import { enrollmentsApi } from '../api/enrollments.api';
import { Enrollment } from '../types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
  AttendanceMatrix,
  StudentRow,
  formatSessionDate,
} from '../../classes/components/AttendanceMatrix';
import { classSessionsApi, attendanceApi } from '../../classes/api/sessions.api';
import { ClassSession, Attendance, AttendanceStatus } from '../../classes/types/classes.types';
import { Search, UserCheck } from 'lucide-react';

export const EnrollmentsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const isCS = user?.roles.includes('CS') && !user?.roles.includes('ADMIN') && !user?.roles.includes('MANAGE');

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<string>('');

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

  // Extract rich StudentRow list for AttendanceMatrix with all fields A -> AH
  const matrixStudents: StudentRow[] = useMemo(() => {
    const list: StudentRow[] = [];

    enrollments.forEach((enr) => {
      const student = enr.student;
      if (!student) return;

      // Filter by search query if any
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = student.full_name?.toLowerCase().includes(query);
        const matchCode =
          student.external_id?.toLowerCase().includes(query) ||
          enr.external_id?.toLowerCase().includes(query);
        const matchPhone = student.phone?.includes(query);
        if (!matchName && !matchCode && !matchPhone) return;
      }

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
  }, [enrollments, searchQuery]);

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
      <PageHeader
        title="Quản lý Điểm danh & Ghi danh"
        description="Giao diện điểm danh 3 Tab chuẩn hóa Sheet 3: Điểm danh nhanh, Ma trận chi tiết và Báo cáo thống kê chuyên cần theo Sale."
      />

      {/* Filter and Search Bar */}
      <div className="bg-surface rounded-2xl p-4 border border-border/80 shadow-soft flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Role / Sale scope filter */}
        <div className="flex items-center gap-3 flex-wrap">
          {isCS ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-900 border border-blue-200/80 rounded-xl text-xs font-bold">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>Nhân viên Sale (CSKH): {user?.name || user?.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-secondary whitespace-nowrap">
                Lọc theo Sale:
              </span>
              <select
                value={selectedSale}
                onChange={(e) => setSelectedSale(e.target.value)}
                className="text-xs font-semibold px-3 py-1.5 bg-surface-muted border border-border/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-text-primary min-w-[200px]"
              >
                <option value="">-- Tất cả nhân viên Sale --</option>
                {salesList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-xs text-text-muted flex items-center gap-1">
            <span>Sĩ số:</span>
            <strong className="text-text-primary font-bold">{matrixStudents.length}</strong>
            <span>học viên</span>
          </div>
        </div>

        {/* Right: Quick Search */}
        <div className="w-full sm:w-72">
          <Input
            placeholder="Tìm theo tên học viên, SĐT, mã..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          />
        </div>
      </div>

      {/* Main Content Area: 3-Tab Attendance Management */}
      <div className="space-y-4">
        {loading && enrollments.length === 0 ? (
          <div className="flex items-center justify-center p-12 bg-surface rounded-2xl border border-border/80 text-text-muted">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3" />
            <span>Đang tải dữ liệu điểm danh học viên...</span>
          </div>
        ) : (
          <AttendanceMatrix
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
