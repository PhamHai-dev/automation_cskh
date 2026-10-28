import { DashboardService } from '../dashboard.service';
import { DashboardRepository } from '../dashboard.repository';
import {
  AttendanceStatus,
  CareTaskPriority,
  CareTaskStatus,
  CareTaskType,
  ClassModelType,
  ClassSessionStatus,
  TeacherType,
} from '@prisma/client';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    manageAssignment: {
      findMany: jest.fn(),
    },
  },
}));

describe('DashboardService — getHome & globalSearch', () => {
  let service: DashboardService;
  let mockRepo: jest.Mocked<Partial<DashboardRepository>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo = {
      getHomeRawData: jest.fn(),
      getTeacherAssignedClassIds: jest.fn(),
      searchStudents: jest.fn(),
      searchClasses: jest.fn(),
      searchTeachers: jest.fn(),
    };
    service = new DashboardService(mockRepo as unknown as DashboardRepository);
  });

  describe('getHome', () => {
    it('computes 4 KPI metrics with 7-point sparklines, badge rules, and session status rules', async () => {
      const now = new Date();
      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const todayUtcDate = new Date(`${todayYMD}T00:00:00.000Z`);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);

      (mockRepo.getHomeRawData as jest.Mock).mockResolvedValue({
        enrollmentsForStudents: [
          { student_id: 1, created_at: sixtyDaysAgo },
          { student_id: 2, created_at: now },
        ],
        activeClasses: [
          { id: 10, created_at: sixtyDaysAgo },
          { id: 11, created_at: now },
        ],
        recentAttendances: [
          { status: AttendanceStatus.ATTENDED, class_session: { session_date: todayUtcDate } },
          { status: AttendanceStatus.ATTENDED, class_session: { session_date: todayUtcDate } },
          { status: AttendanceStatus.ABSENT_UNAPPROVED_C, class_session: { session_date: todayUtcDate } },
        ],
        pendingTaskCount: 3,
        recentTasksCreated: [{ created_at: now }, { created_at: now }],
        pendingTasksList: [
          {
            id: 101,
            title: 'Liên hệ sau buổi 1',
            type: CareTaskType.CALLBACK,
            priority: CareTaskPriority.NORMAL,
            status: CareTaskStatus.PENDING,
            due_at: new Date(now.getTime() + 2 * 3600000),
            created_at: now,
            enrollment_id: 501,
            enrollment: {
              student_id: 1,
              student: { full_name: 'Trần Bảo Ngọc' },
              package: { name: 'IELTS Foundation', code: 'IELTS_FD' },
              enrollment_classes: [{ class: { class_name: 'IELTS Foundation K12' } }],
            },
          },
          {
            id: 102,
            title: 'Phản hồi nóng về lịch học',
            type: CareTaskType.HOT_ISSUE,
            priority: CareTaskPriority.URGENT,
            status: CareTaskStatus.PENDING,
            due_at: twoDaysAgo,
            created_at: twoDaysAgo,
            enrollment_id: 502,
            enrollment: {
              student_id: 2,
              student: { full_name: 'Nguyễn Minh Anh' },
              package: { name: 'Kaiwa N4', code: 'KAIWA_N4' },
              enrollment_classes: [],
            },
          },
          {
            id: 103,
            title: null,
            type: CareTaskType.AUTO_ATTENDANCE,
            priority: CareTaskPriority.LOW,
            status: CareTaskStatus.PENDING,
            due_at: null,
            created_at: now,
            enrollment_id: 503,
            enrollment: {
              student_id: 3,
              student: { full_name: 'Lê Hoàng Nam' },
              package: null,
              enrollment_classes: [],
            },
          },
        ],
        candidateSessions: [
          {
            id: 201,
            class_id: 10,
            session_date: todayUtcDate,
            start_time: '00:00',
            end_time: '23:59',
            status: ClassSessionStatus.SCHEDULED,
            teacher_id: 99,
            class_schedule: { start_time: '00:00', duration_minutes: 90 },
            class: {
              class_name: 'Kaiwa Sơ cấp 1',
              class_code: 'class_0010',
              level: 'N5',
              model_type: ClassModelType.ONE_TO_N,
              class_teachers: [{ role: 'MAIN', teacher: { name: 'Nguyễn Văn A' } }],
              enrollment_classes: [{ id: 1 }, { id: 2 }, { id: 3 }],
            },
          },
          {
            id: 202,
            class_id: 11,
            session_date: todayUtcDate,
            start_time: null,
            end_time: null,
            status: ClassSessionStatus.COMPLETED,
            teacher_id: null,
            class_schedule: null,
            class: {
              class_name: 'Kaiwa 1-1 VIP',
              class_code: 'class_0011',
              level: 'N3',
              model_type: ClassModelType.ONE_TO_ONE,
              class_teachers: [{ role: 'MAIN', teacher: { name: 'Tanaka Ken' } }],
              enrollment_classes: [{ id: 4 }],
            },
          },
        ],
        sessionTeacherNameMap: new Map([[99, 'Phạm Thị B']]),
      });

      const payload = await service.getHome(1, ['ADMIN']);

      // KPIs check
      expect(payload.kpis.total_students.value).toBe(2);
      expect(payload.kpis.total_students.delta).toBe(100);
      expect(payload.kpis.total_students.delta_unit).toBe('percent');
      expect(payload.kpis.total_students.comparison_label).toBe('so với tháng trước');
      expect(payload.kpis.total_students.sparkline).toHaveLength(7);

      expect(payload.kpis.active_classes.value).toBe(2);
      expect(payload.kpis.active_classes.delta_unit).toBe('percent');
      expect(payload.kpis.active_classes.sparkline).toHaveLength(7);

      // 2 attended out of 3 = 66.7%
      expect(payload.kpis.attendance_today.value).toBe(66.7);
      expect(payload.kpis.attendance_today.delta_unit).toBe('percent');
      expect(payload.kpis.attendance_today.comparison_label).toBe('so với hôm qua');
      expect(payload.kpis.attendance_today.sparkline).toHaveLength(7);

      expect(payload.kpis.pending_tasks.value).toBe(3);
      expect(payload.kpis.pending_tasks.delta).toBe(2);
      expect(payload.kpis.pending_tasks.delta_unit).toBe('count');
      expect(payload.kpis.pending_tasks.comparison_label).toBe('so với hôm qua');

      // Tasks ordering & badge rules: URGENT (id 102) first, then NORMAL CALLBACK (id 101), then LOW AUTO_ATTENDANCE (id 103)
      expect(payload.today_tasks.map((t) => t.id)).toEqual([102, 101, 103]);
      expect(payload.today_tasks[0]).toMatchObject({
        id: 102,
        badge_label: 'Ưu tiên',
        badge_variant: 'danger',
        date_label: 'Quá hạn',
        student_name: 'Nguyễn Minh Anh',
      });
      expect(payload.today_tasks[1]).toMatchObject({
        id: 101,
        badge_label: 'Đang xử lý',
        badge_variant: 'info',
        subtitle: 'Học viên Trần Bảo Ngọc - Lớp IELTS Foundation K12',
      });
      expect(payload.today_tasks[2]).toMatchObject({
        id: 103,
        badge_label: 'Chờ xử lý',
        badge_variant: 'warning',
      });

      // Upcoming sessions check
      expect(payload.upcoming_sessions).toHaveLength(2);
      const ongoingSession = payload.upcoming_sessions.find((s) => s.session_id === 201)!;
      expect(ongoingSession).toMatchObject({
        class_id: 10,
        model_type: '1:n',
        teacher_name: 'Phạm Thị B',
        display_status: 'ONGOING',
        display_status_label: 'Đang diễn ra',
        student_count: 3,
      });

      const completedSession = payload.upcoming_sessions.find((s) => s.session_id === 202)!;
      expect(completedSession).toMatchObject({
        class_id: 11,
        model_type: '1:1',
        teacher_name: 'Tanaka Ken',
        start_time: '08:00',
        end_time: '09:30',
        display_status: 'COMPLETED',
        display_status_label: 'Đã hoàn thành',
        student_count: 1,
      });
    });
  });

  describe('globalSearch', () => {
    it('returns empty arrays immediately when query is empty or whitespace', async () => {
      const res = await service.globalSearch('   ', 5, 1, ['ADMIN']);
      expect(res).toEqual({ students: [], classes: [], teachers: [] });
      expect(mockRepo.searchStudents).not.toHaveBeenCalled();
    });

    it('scopes TEACHER (without ADMIN/MANAGE/CS) to assigned classes and hides teachers list', async () => {
      (mockRepo.getTeacherAssignedClassIds as jest.Mock).mockResolvedValue([10, 20]);
      (mockRepo.searchStudents as jest.Mock).mockResolvedValue([
        {
          id: 1,
          full_name: 'Học viên A',
          external_id: 'HV001',
          phone: '0901234567',
          enrollments: [{ package: { name: 'Kaiwa N5', code: 'KW_N5' } }],
        },
      ]);
      (mockRepo.searchClasses as jest.Mock).mockResolvedValue([
        {
          id: 10,
          class_name: 'Lớp Kaiwa 10',
          class_code: 'class_0010',
          level: 'N5',
          model_type: ClassModelType.ONE_TO_TWO,
          class_teachers: [{ role: 'MAIN', teacher: { name: 'Sensei A' } }],
        },
      ]);

      const res = await service.globalSearch('Kaiwa', 5, 77, ['TEACHER']);

      expect(mockRepo.getTeacherAssignedClassIds).toHaveBeenCalledWith(77);
      expect(mockRepo.searchStudents).toHaveBeenCalledWith('Kaiwa', 5, {
        mode: 'TEACHER',
        classIds: [10, 20],
      });
      expect(mockRepo.searchClasses).toHaveBeenCalledWith('Kaiwa', 5, {
        mode: 'TEACHER',
        classIds: [10, 20],
      });
      expect(mockRepo.searchTeachers).not.toHaveBeenCalled();
      expect(res.teachers).toEqual([]);
      expect(res.students).toHaveLength(1);
      expect(res.classes[0].subtitle).toContain('Mô hình 1:2');
    });

    it('allows ADMIN to search students, classes, and teachers with limit capped at 10', async () => {
      (mockRepo.searchStudents as jest.Mock).mockResolvedValue([]);
      (mockRepo.searchClasses as jest.Mock).mockResolvedValue([]);
      (mockRepo.searchTeachers as jest.Mock).mockResolvedValue([
        {
          id: 5,
          name: 'Yamada Taro',
          code: 'GV_005',
          teacher_type: TeacherType.JAPANESE,
        },
      ]);

      const res = await service.globalSearch('Yamada', 99, 1, ['ADMIN']);

      expect(mockRepo.searchTeachers).toHaveBeenCalledWith('Yamada', 10, false);
      expect(res.teachers).toEqual([
        {
          id: 5,
          name: 'Yamada Taro',
          code: 'GV_005',
          teacher_type: 'JAPANESE',
          subtitle: 'GV_005 • GV Bản ngữ (Nhật)',
        },
      ]);
    });
  });
});
