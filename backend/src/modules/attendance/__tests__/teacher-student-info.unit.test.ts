jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    teacher: { findFirst: jest.fn() },
    classTeacher: { findMany: jest.fn() },
    classSession: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    enrollmentClass: { findMany: jest.fn(), findUnique: jest.fn() },
    attendance: { findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    student: { findUnique: jest.fn() },
    manageAssignment: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn().mockResolvedValue({}),
  cancelPendingDeliveries: jest.fn().mockResolvedValue(0),
}));

jest.mock('../attendance-lifecycle', () => ({
  runAttendancePostCommit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../classes/classes.scope', () => ({
  getAccessibleClassIds: jest.fn(),
}));

import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { ReconciliationService } from '../reconciliation.service';
import {
  TeacherStudentInfoQuerySchema,
  UpdateTeacherLessonSchema,
  AddTeacherSessionColumnSchema,
} from '../reconciliation.schema';
import { runAttendancePostCommit } from '../attendance-lifecycle';
import { StudentsRepository } from '../../students/students.repository';
import { getAccessibleClassIds } from '../../classes/classes.scope';
import { AppError } from '../../../middlewares/error.middleware';

const mockPrisma = prisma as any;
const mockGetAccessibleClassIds = getAccessibleClassIds as jest.Mock;

const ADMIN = { id: 1, roles: ['ADMIN'] };
const MANAGE = { id: 2, roles: ['MANAGE'] };
const TEACHER = { id: 10, roles: ['TEACHER'] };
const OTHER_TEACHER = { id: 99, roles: ['TEACHER'] };

describe('TeacherStudentInfo schemas', () => {
  it('parses TeacherStudentInfoQuerySchema with coerced numbers', () => {
    const parsed = TeacherStudentInfoQuerySchema.parse({
      teacherId: '10',
      classId: '5',
      search: 'Nguyen',
    });
    expect(parsed).toEqual({ teacherId: 10, classId: 5, search: 'Nguyen' });
  });

  it('parses UpdateTeacherLessonSchema and AddTeacherSessionColumnSchema', () => {
    const lesson = UpdateTeacherLessonSchema.parse({
      lessonTopic: '  Bài 1: Chào hỏi  ',
      note: '  Học tốt ',
      teacherId: '10',
    });
    expect(lesson).toEqual({
      lessonTopic: 'Bài 1: Chào hỏi',
      note: 'Học tốt',
      teacherId: 10,
    });

    const addCol = AddTeacherSessionColumnSchema.parse({
      enrollmentClassId: '42',
      sessionDate: '2026-10-28',
      startTime: '19:30',
      lessonTopic: 'Bài 5',
    });
    expect(addCol.enrollmentClassId).toBe(42);
    expect(addCol.sessionDate).toBe('2026-10-28');
  });
});

describe('ReconciliationService — Teacher Student Info (sheet Infoー情報)', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReconciliationService();
  });

  describe('getTeacherStudentInfo', () => {
    it('rejects non-privileged teacher selecting another teacherId (403)', async () => {
      await expect(
        service.getTeacherStudentInfo(TEACHER, { teacherId: OTHER_TEACHER.id })
      ).rejects.toMatchObject({
        status: 403,
        message: 'Chỉ ADMIN/MANAGE được chọn giáo viên khác',
      });
    });

    it('rejects privileged user without TEACHER role when teacherId is omitted (400)', async () => {
      await expect(
        service.getTeacherStudentInfo(ADMIN, {})
      ).rejects.toMatchObject({
        status: 400,
        message: 'Vui lòng chọn giáo viên cần hỗ trợ',
      });
    });

    it('returns 404 when active teacher profile does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 10, teacher: null });
      mockPrisma.teacher.findFirst.mockResolvedValue(null);

      await expect(
        service.getTeacherStudentInfo(TEACHER, {})
      ).rejects.toMatchObject({
        status: 404,
        message: 'Không tìm thấy hồ sơ giáo viên đang hoạt động',
      });
    });

    it('maps 12 student columns + dynamic session columns and unlocks only ATTENDED sessions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: TEACHER.id,
        teacher: { id: 7, user_id: TEACHER.id, active: true },
      });
      mockPrisma.classTeacher.findMany.mockResolvedValue([
        { class_id: 101, active: true, start_date: null, end_date: null },
      ]);
      mockPrisma.enrollmentClass.findMany.mockResolvedValue([
        {
          id: 501,
          enrollment_id: 301,
          class_id: 101,
          status: 'ACTIVE',
          start_date: new Date('2026-03-01T00:00:00.000Z'),
          enrollment: {
            id: 301,
            external_id: 'ENR-01',
            program_type: 'KAIWA',
            program_metadata: { course_type: 'Thường' },
            level: 'N4',
            total_sessions: 5,
            sales_note: 'Học viên chăm chỉ',
            start_date: new Date('2026-03-01T00:00:00.000Z'),
            study_report_url: null,
            student: {
              id: 201,
              external_id: 'HV001',
              full_name: 'Nguyễn Văn A',
              phone: '0901234567',
              note: null,
            },
            package: { id: 1, name: 'Kaiwa N4' },
            cs: {
              id: 30,
              name: 'CVHT Lan',
              email: 'lan@example.com',
              code: 'CVHT01',
              staff_code: 'CS01',
            },
          },
          class: {
            id: 101,
            class_code: 'KAIWA-101',
            class_name: 'Lớp Kaiwa 101',
            level: 'N4',
            class_schedules: [
              { id: 1, schedule_pattern: '2,4,6', start_time: '19:30', active: true },
            ],
            class_sessions: [
              {
                id: 1001,
                session_number: 1,
                session_date: new Date('2026-03-02T00:00:00.000Z'),
                start_time: '19:30',
                end_time: '21:00',
                status: 'COMPLETED',
              },
              {
                id: 1002,
                session_number: 2,
                session_date: new Date('2026-03-04T00:00:00.000Z'),
                start_time: '19:30',
                end_time: '21:00',
                status: 'COMPLETED',
              },
              {
                id: 1003,
                session_number: 3,
                session_date: new Date('2026-03-06T00:00:00.000Z'),
                start_time: '19:30',
                end_time: '21:00',
                status: 'SCHEDULED',
              },
            ],
          },
          attendance: [
            {
              id: 9001,
              class_session_id: 1001,
              teacher_status: AttendanceStatus.ATTENDED,
              status: AttendanceStatus.ATTENDED,
              reconciliation_state: ReconciliationState.MATCHED,
              lesson_topic: 'Bài 1: Giới thiệu',
              teacher_note: 'Phát âm tốt',
              teacher_raw_value: 'HV001-Bài 1: Giới thiệu',
              deleted_at: null,
              class_session: {
                id: 1001,
                session_number: 1,
                session_date: new Date('2026-03-02T00:00:00.000Z'),
                start_time: '19:30',
                end_time: '21:00',
                status: 'COMPLETED',
              },
            },
            {
              id: 9002,
              class_session_id: 1002,
              teacher_status: AttendanceStatus.ABSENT_APPROVED_A,
              status: AttendanceStatus.ABSENT_APPROVED_A,
              reconciliation_state: ReconciliationState.PENDING_CS,
              lesson_topic: null,
              teacher_note: 'Xin nghỉ phép',
              teacher_raw_value: 'HV001-A',
              deleted_at: null,
              class_session: {
                id: 1002,
                session_number: 2,
                session_date: new Date('2026-03-04T00:00:00.000Z'),
                start_time: '19:30',
                end_time: '21:00',
                status: 'COMPLETED',
              },
            },
          ],
        },
      ]);

      const res = await service.getTeacherStudentInfo(TEACHER, {});

      expect(res.maxRecordedSessions).toBe(3);
      expect(res.maxTotalSessions).toBe(5);
      expect(res.items).toHaveLength(1);

      const row = res.items[0];
      expect(row).toMatchObject({
        enrollmentClassId: 501,
        enrollmentId: 301,
        studentId: 201,
        studentCode: 'HV001',
        studentName: 'Nguyễn Văn A',
        classId: 101,
        classCode: 'KAIWA-101',
        courseType: 'Thường',
        level: 'N4',
        totalSessions: 5,
        note: 'Học viên chăm chỉ',
        startDate: '2026-03-01',
        csCode: 'CVHT01',
        scheduleDays: '月・水・金（T246）',
        scheduleTime: '19h30 (VNT)',
        studyReportUrl: '/students/201/study-report',
      });

      expect(row.sessions).toHaveLength(3);
      // Session 1: ATTENDED -> unlocked
      expect(row.sessions[0]).toMatchObject({
        sessionIndex: 1,
        classSessionId: 1001,
        attendanceId: 9001,
        isAttended: true,
        isUnlocked: true,
        lessonTopic: 'Bài 1: Giới thiệu',
      });
      // Session 2: ABSENT_APPROVED_A -> locked
      expect(row.sessions[1]).toMatchObject({
        sessionIndex: 2,
        classSessionId: 1002,
        attendanceId: 9002,
        isAttended: false,
        isUnlocked: false,
      });
      // Session 3: Not marked yet -> locked
      expect(row.sessions[2]).toMatchObject({
        sessionIndex: 3,
        classSessionId: 1003,
        attendanceId: null,
        isAttended: false,
        isUnlocked: false,
      });
    });
  });

  describe('updateTeacherStudentLesson', () => {
    it('rejects with 409 when student has NOT attended the session (cell is locked)', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 9002,
        teacher_status: AttendanceStatus.ABSENT_APPROVED_A,
        status: AttendanceStatus.ABSENT_APPROVED_A,
        class_session: {
          id: 1002,
          class_id: 101,
          status: 'COMPLETED',
          session_date: new Date('2026-03-04T00:00:00.000Z'),
        },
        enrollment_class: {
          id: 501,
          enrollment: { student: { id: 201, external_id: 'HV001' } },
        },
      });
      mockPrisma.classTeacher.findMany.mockResolvedValue([
        { active: true, start_date: null, end_date: null },
      ]);

      await expect(
        service.updateTeacherStudentLesson(
          9002,
          { lessonTopic: 'Bài 2' },
          TEACHER
        )
      ).rejects.toMatchObject({
        status: 409,
        message: 'Học viên chưa học buổi này nên ô nhập đang bị khóa',
      });
    });

    it('rejects MANAGE actor with 403 (assist authority belongs to ADMIN only)', async () => {
      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 9001,
        teacher_status: AttendanceStatus.ATTENDED,
        status: AttendanceStatus.ATTENDED,
        class_session: {
          id: 1001,
          class_id: 101,
          status: 'COMPLETED',
          session_date: new Date('2026-03-02T00:00:00.000Z'),
        },
        enrollment_class: {
          id: 501,
          enrollment: { student: { id: 201, external_id: 'HV001' } },
        },
      });

      await expect(
        service.updateTeacherStudentLesson(
          9001,
          { lessonTopic: 'Bài 1 sửa' },
          MANAGE
        )
      ).rejects.toMatchObject({ status: 403 });
    });

    it('updates lesson_topic, teacher_raw_value and writes AuditLog when session is ATTENDED', async () => {
      const existing = {
        id: 9001,
        enrollment_class_id: 501,
        teacher_status: AttendanceStatus.ATTENDED,
        status: AttendanceStatus.ATTENDED,
        lesson_topic: 'Old topic',
        teacher_note: 'Old note',
        teacher_raw_value: 'HV001-Old topic',
        class_session: {
          id: 1001,
          class_id: 101,
          status: 'COMPLETED',
          session_date: new Date('2026-03-02T00:00:00.000Z'),
        },
        enrollment_class: {
          id: 501,
          enrollment: {
            external_id: 'ENR-01',
            student: { id: 201, external_id: 'HV001' },
          },
        },
      };
      mockPrisma.attendance.findFirst.mockResolvedValue(existing);
      mockPrisma.classTeacher.findMany.mockResolvedValue([
        { active: true, start_date: null, end_date: null },
      ]);

      const updatedRecord = {
        ...existing,
        lesson_topic: 'Bài 1: Ngữ pháp N4',
        teacher_note: 'Hiểu bài nhanh',
        teacher_raw_value: 'HV001-Bài 1: Ngữ pháp N4',
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        mockPrisma.attendance.update.mockResolvedValue(updatedRecord);
        return fn({
          attendance: mockPrisma.attendance,
          auditLog: mockPrisma.auditLog,
        });
      });

      const result = await service.updateTeacherStudentLesson(
        9001,
        { lessonTopic: 'Bài 1: Ngữ pháp N4', note: 'Hiểu bài nhanh' },
        TEACHER
      );

      expect(result.lesson_topic).toBe('Bài 1: Ngữ pháp N4');
      expect(mockPrisma.attendance.update).toHaveBeenCalledWith({
        where: { id: 9001 },
        data: {
          lesson_topic: 'Bài 1: Ngữ pháp N4',
          teacher_note: 'Hiểu bài nhanh',
          teacher_raw_value: 'HV001-Bài 1: Ngữ pháp N4',
        },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            user_id: TEACHER.id,
            action: 'ATTENDANCE_TEACHER_LESSON_UPDATED',
            entity_type: 'Attendance',
            entity_id: '9001',
          }),
        })
      );
    });
  });

  describe('addTeacherStudentSessionColumn', () => {
    it('creates a new ClassSession + ATTENDED Attendance and triggers downstream lifecycle', async () => {
      mockPrisma.enrollmentClass.findUnique.mockResolvedValue({
        id: 501,
        class_id: 101,
        class: {
          id: 101,
          class_schedules: [{ id: 1, start_time: '19:30', active: true }],
        },
        enrollment: {
          id: 301,
          student: { id: 201, external_id: 'HV001' },
        },
      });
      mockPrisma.classTeacher.findMany.mockResolvedValue([
        { active: true, start_date: null, end_date: null },
      ]);
      mockPrisma.classSession.findFirst.mockResolvedValue({
        id: 1003,
        session_number: 3,
      });
      mockPrisma.classSession.create.mockResolvedValue({
        id: 1004,
        class_id: 101,
        session_number: 4,
        session_date: new Date('2026-10-28T00:00:00.000Z'),
        start_time: '19:30',
        status: 'COMPLETED',
      });
      mockPrisma.attendance.upsert.mockResolvedValue({
        id: 9004,
        enrollment_class_id: 501,
        class_session_id: 1004,
        teacher_status: AttendanceStatus.ATTENDED,
        status: AttendanceStatus.ATTENDED,
        reconciliation_state: ReconciliationState.PENDING_CS,
        lesson_topic: 'Bài 4: Đọc hiểu',
        teacher_raw_value: 'HV001-Bài 4: Đọc hiểu',
      });

      const res = await service.addTeacherStudentSessionColumn(
        {
          enrollmentClassId: 501,
          sessionDate: '2026-10-28',
          lessonTopic: 'Bài 4: Đọc hiểu',
        },
        TEACHER
      );

      expect(mockPrisma.classSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          class_id: 101,
          session_number: 4,
          start_time: '19:30',
          status: 'COMPLETED',
          created_by_id: TEACHER.id,
          teacher_id: TEACHER.id,
        }),
      });
      expect(mockPrisma.attendance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            enrollment_class_id: 501,
            class_session_id: 1004,
            teacher_status: AttendanceStatus.ATTENDED,
            status: AttendanceStatus.ATTENDED,
            reconciliation_state: ReconciliationState.PENDING_CS,
            lesson_topic: 'Bài 4: Đọc hiểu',
            teacher_raw_value: 'HV001-Bài 4: Đọc hiểu',
          }),
        })
      );
      expect(runAttendancePostCommit).toHaveBeenCalledWith({
        attendanceId: 9004,
        reconciliationState: ReconciliationState.PENDING_CS,
      });
      expect(res.session.session_number).toBe(4);
      expect(res.attendance.teacher_status).toBe(AttendanceStatus.ATTENDED);
    });
  });
});

describe('StudentsRepository — TEACHER study report access', () => {
  let repo: StudentsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new StudentsRepository();
  });

  it('allows TEACHER to findById when student belongs to an accessible class', async () => {
    mockGetAccessibleClassIds.mockResolvedValue([101]);
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 201,
      full_name: 'Nguyễn Văn A',
      enrollments: [{ id: 301, enrollment_classes: [{ class_id: 101 }] }],
    });

    const student = await repo.findById(201, TEACHER);
    expect(student?.id).toBe(201);
    expect(mockPrisma.student.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 201 },
        include: expect.objectContaining({
          enrollments: expect.objectContaining({
            where: {
              enrollment_classes: { some: { class_id: { in: [101] } } },
            },
          }),
        }),
      })
    );
  });

  it('rejects TEACHER findById with 403 when student is not in any accessible class', async () => {
    mockGetAccessibleClassIds.mockResolvedValue([101]);
    mockPrisma.student.findUnique.mockResolvedValue({
      id: 202,
      full_name: 'Trần Thị B',
      enrollments: [],
    });

    await expect(repo.findById(202, TEACHER)).rejects.toMatchObject({
      status: 403,
      message: 'Bạn không phụ trách học viên này',
    });
  });

  it('allows TEACHER to update study report fields (program_metadata, exchange_info, study_report_url) for assigned student', async () => {
    mockGetAccessibleClassIds.mockResolvedValue([101]);
    const tx = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ id: 301, student_id: 201 }),
        update: jest.fn().mockResolvedValue({ id: 301 }),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 201, full_name: 'Nguyễn Văn A' }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const updated = await repo.update(
      201,
      {
        enrollment_id: 301,
        program_metadata: { study_report: { summary: 'Tiến bộ tốt' } },
        exchange_info: 'Trao đổi buổi 5',
        study_report_url: '/students/201/study-report',
      },
      TEACHER
    );

    expect(updated?.id).toBe(201);
    expect(tx.enrollment.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: {
        program_metadata: { study_report: { summary: 'Tiến bộ tốt' } },
        exchange_info: 'Trao đổi buổi 5',
        study_report_url: '/students/201/study-report',
      },
    });
  });
});
