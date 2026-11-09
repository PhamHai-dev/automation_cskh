jest.mock('../../../prisma/client', () => ({
  prisma: {
    manageAssignment: { findMany: jest.fn() },
    student: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    enrollment: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../../../prisma/client';
import {
  buildJlptAttendanceReportRow,
  cleanJlptClassCode,
  computeJlptExamScheduleColumns,
  computeJlptReportSummary,
  deriveJlptCourseTrack,
  matchesJlptWarningFilter,
  normalizeJlptStatus,
} from '../jlpt-attendance-report.util';
import { StudentsRepository } from '../students.repository';
import { AuthUser } from '../../../middlewares/auth.middleware';

const mockPrisma = prisma as any;

describe('jlpt-attendance-report.util & RBAC scope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanJlptClassCode & deriveJlptCourseTrack (Columns A & O)', () => {
    it('strips date and sequence suffixes from raw class codes', () => {
      expect(cleanJlptClassCode('N4VIP16001 (03/08/2021) - 001')).toBe('N4VIP16001');
      expect(cleanJlptClassCode('N3A110005 (12/05/2026)')).toBe('N3A110005');
      expect(cleanJlptClassCode('N2VIP16008 - 002')).toBe('N2VIP16008');
      expect(cleanJlptClassCode('')).toBe('');
    });

    it('derives course_track following Excel IF(LEFT(A,3)="N3A","N3-LuyenDe", IF(LEFT(A,3)="N4A","N4-LuyenDe", LEFT(A,2)))', () => {
      expect(deriveJlptCourseTrack('N3A110005')).toBe('N3-LuyenDe');
      expect(deriveJlptCourseTrack('N4AVIP11001')).toBe('N4-LuyenDe');
      expect(deriveJlptCourseTrack('N5VIP16001')).toBe('N5');
      expect(deriveJlptCourseTrack('N4VIP16001')).toBe('N4');
      expect(deriveJlptCourseTrack('N3VIP16001')).toBe('N3');
      expect(deriveJlptCourseTrack('N2VIP16008')).toBe('N2');
      // Fallback to package.code / level when class_code is empty
      expect(deriveJlptCourseTrack('', 'N3A_VIP', 'N3')).toBe('N3-LuyenDe');
      expect(deriveJlptCourseTrack('', '', 'N4A')).toBe('N4-LuyenDe');
      expect(deriveJlptCourseTrack('', 'N5_INHOUSE', '')).toBe('N5');
    });
  });

  describe('normalizeJlptStatus (Column M)', () => {
    it('normalizes statuses and converts WAITING_CLASS with assigned class to STUDYING', () => {
      expect(normalizeJlptStatus('STUDYING', true)).toEqual({
        status: 'STUDYING',
        status_label: 'Đang học',
      });
      expect(normalizeJlptStatus('WAITING_CLASS', true)).toEqual({
        status: 'STUDYING',
        status_label: 'Đang học',
      });
      expect(normalizeJlptStatus('WAITING_CLASS', false)).toEqual({
        status: 'WAITING_CLASS',
        status_label: 'Chờ lớp',
      });
      expect(normalizeJlptStatus('PAUSED', true)).toEqual({
        status: 'PAUSED',
        status_label: 'Bảo lưu',
      });
      expect(normalizeJlptStatus('FINISHED', true)).toEqual({
        status: 'FINISHED',
        status_label: 'Kết thúc',
      });
      expect(normalizeJlptStatus('CANCELLED', false)).toEqual({
        status: 'CANCELLED',
        status_label: 'Đã hủy',
      });
    });
  });

  describe('computeJlptExamScheduleColumns (Columns P -> V & Lich_Kiem_Tra)', () => {
    it('computes N3 session 41 with joined milestone "KT10 + KT11"', () => {
      // At session 40 (KT9 completed, 1 session until KT10 + KT11 at session 41)
      const at40 = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N3',
        totalMarkedSessions: 40,
        testScores: { l9: '85' },
        nkhtSessions: [],
      });
      expect(at40.last_exam_name).toBe('KT9');
      expect(at40.last_exam_session).toBe(40);
      expect(at40.sessions_since_last_exam).toBe(0);
      expect(at40.next_exam_name).toBe('KT10 + KT11');
      expect(at40.next_exam_session).toBe(41);
      expect(at40.sessions_until_next_exam).toBe(1);
      // U = 1 (<=2) and KT9 has score -> upcoming exam warning
      expect(at40.exam_schedule_warning).toBe('🔔 Còn 1 buổi tới KT10 + KT11 — nhắc HV chuẩn bị');

      // At session 41 with only KT10 scored (missing KT11)
      const at41Missing = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N3',
        totalMarkedSessions: 41,
        testScores: { kt10: '78' },
        nkhtSessions: [],
      });
      expect(at41Missing.last_exam_name).toBe('KT10 + KT11');
      expect(at41Missing.last_exam_session).toBe(41);
      expect(at41Missing.exam_schedule_warning).toBe(
        '❗ Chưa có đủ điểm KT10 + KT11 — kiểm tra/nhắc HV',
      );

      // At session 41 with both KT10 and KT11 scored
      const at41Complete = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N3',
        totalMarkedSessions: 41,
        testScores: { kt10: '78', kt11: '82' },
        nkhtSessions: [],
      });
      expect(at41Complete.exam_schedule_warning).toBe(
        '✅ Đã hoàn thành KT10 + KT11 — vào hệ thống xem điểm',
      );
    });

    it('produces all 4 warning states (❗, 🔔, ✅, ⏳) accurately', () => {
      // 1. ❗ Missing exam score at KT1 (N5 session 5)
      const missing = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N5',
        totalMarkedSessions: 6,
        testScores: {},
        nkhtSessions: [],
      });
      expect(missing.last_exam_name).toBe('KT1');
      expect(missing.last_exam_session).toBe(5);
      expect(missing.exam_schedule_warning).toBe('❗ Chưa có đủ điểm KT1 — kiểm tra/nhắc HV');

      // 2. 🔔 Upcoming exam (N5 session 9 -> 2 sessions before KT2 at session 11, KT1 has score)
      const upcoming = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N5',
        totalMarkedSessions: 9,
        testScores: { l1: '90' },
        nkhtSessions: [],
      });
      expect(upcoming.next_exam_name).toBe('KT2');
      expect(upcoming.sessions_until_next_exam).toBe(2);
      expect(upcoming.exam_schedule_warning).toBe('🔔 Còn 2 buổi tới KT2 — nhắc HV chuẩn bị');

      // 3. ✅ Just completed exam with score (N5 session 6 -> R = 1 after KT1 at session 5)
      const completed = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N5',
        totalMarkedSessions: 6,
        testScores: { l1: '90' },
        nkhtSessions: [],
      });
      expect(completed.sessions_since_last_exam).toBe(1);
      expect(completed.exam_schedule_warning).toBe('✅ Đã hoàn thành KT1 — vào hệ thống xem điểm');

      // 4. ⏳ Not yet time to remind (N5 session 7 -> R = 2, U = 4 until KT2 at 11)
      const waiting = computeJlptExamScheduleColumns({
        statusLabel: 'Đang học',
        courseTrack: 'N5',
        totalMarkedSessions: 7,
        testScores: { l1: '90' },
        nkhtSessions: [],
      });
      expect(waiting.exam_schedule_warning).toBe('⏳ Chưa tới thời điểm nhắc');
    });

    it('returns empty P..V when student is not STUDYING or track is N2 (no schedule rows)', () => {
      const paused = computeJlptExamScheduleColumns({
        statusLabel: 'Bảo lưu',
        courseTrack: 'N4',
        totalMarkedSessions: 10,
        testScores: {},
        nkhtSessions: [],
      });
      expect(paused.last_exam_name).toBe('');
      expect(paused.exam_schedule_warning).toBe('');
    });
  });

  describe('buildJlptAttendanceReportRow (22 columns A -> V)', () => {
    it('computes attendance rate, absent streak H & I, homework streak J & K, and average score F', () => {
      const student = {
        id: 12,
        external_id: '1001168',
        full_name: 'Nguyễn Hoàng Tuấn',
      };
      const enrollment = {
        id: 34,
        student_id: 12,
        program_type: 'JLPT',
        status: 'STUDYING',
        cs_id: 3,
        exchange_info: 'Đã nhắn nhắc học viên làm bài',
        cs: { id: 3, staff_code: 'CVHT01', name: 'CSKH 1' },
        package: { code: 'N4_VIP' },
        enrollment_classes: [
          {
            class: { class_code: 'N4VIP16001 (03/08/2021) - 001', class_name: 'N4VIP16001' },
            attendance: [
              { status: 'ATTENDED', class_session: { session_number: 1 } },
              { status: 'ABSENT_UNAPPROVED_C', class_session: { session_number: 2 } },
              { status: 'ABSENT_APPROVED_A', class_session: { session_number: 3 } },
              { status: 'ATTENDED', class_session: { session_number: 4 } },
              { status: 'ATTENDED', class_session: { session_number: 5 } },
            ],
          },
        ],
        program_metadata: {
          test_scores: { l1: '80', l2: '85' },
          jlpt_nkht_sessions: [
            { session_number: 1, attendance: 'O', homework_status: 'Có' },
            { session_number: 2, attendance: 'X', homework_status: 'Không' },
            { session_number: 3, attendance: 'X', homework_status: 'Không' },
            { session_number: 4, attendance: 'O', homework_status: 'Không' },
            { session_number: 5, attendance: 'O', homework_status: 'Có' },
          ],
        },
      };

      const row = buildJlptAttendanceReportRow({ student, enrollment });
      expect(row.class_code).toBe('N4VIP16001'); // A
      expect(row.full_name).toBe('Nguyễn Hoàng Tuấn'); // B
      expect(row.attended_sessions).toBe(3); // C
      expect(row.total_marked_sessions).toBe(5); // D
      expect(row.attendance_rate).toBe(0.6); // E
      expect(row.average_exam_score).toBe(82.5); // F
      expect(row.homework_completed_sessions).toBe(2); // G
      expect(row.max_consecutive_absent).toBe(2); // H
      expect(row.absent_warning).toBe('⚠ Vắng liên tiếp ≥2 buổi'); // I
      expect(row.max_consecutive_no_homework).toBe(3); // J
      expect(row.no_homework_warning).toBe('⚠ Không làm bài ≥2 buổi'); // K
      expect(row.exchange_info).toBe('Đã nhắn nhắc học viên làm bài'); // L
      expect(row.status).toBe('STUDYING'); // M
      expect(row.status_label).toBe('Đang học'); // M
      expect(row.cvht_code).toBe('CVHT01'); // N
      expect(row.course_track).toBe('N4'); // O
      expect(row.last_exam_name).toBe('KT1'); // P (N4 KT1 is session 1)
      expect(row.last_exam_session).toBe(1); // Q
      expect(row.sessions_since_last_exam).toBe(4); // R (5 - 1)
      expect(row.next_exam_name).toBe('KT2'); // S (N4 KT2 is session 8)
      expect(row.next_exam_session).toBe(8); // T
      expect(row.sessions_until_next_exam).toBe(3); // U (8 - 5)
      expect(row.exam_schedule_warning).toBe('⏳ Chưa tới thời điểm nhắc'); // V

      // Check warning filter helper & summary
      expect(matchesJlptWarningFilter(row, 'ABSENT_WARN')).toBe(true);
      expect(matchesJlptWarningFilter(row, 'NO_HW_WARN')).toBe(true);
      expect(matchesJlptWarningFilter(row, 'LOW_ATTENDANCE')).toBe(true);
      const summary = computeJlptReportSummary([row]);
      expect(summary.totalStudents).toBe(1);
      expect(summary.absentWarningCount).toBe(1);
      expect(summary.noHomeworkWarningCount).toBe(1);
      expect(summary.lowAttendanceRedCount).toBe(1);
    });

    it('prioritizes synced jlpt_chuyen_can values from sheet Chuyên cần HV when present in program_metadata', () => {
      const student = {
        id: 25,
        external_id: 'JLPT_SYNC_01',
        full_name: 'Đặng Tuấn Anh',
      };
      const enrollment = {
        id: 99,
        student_id: 25,
        program_type: 'JLPT',
        status: 'STUDYING',
        cs_id: 3,
        exchange_info: 'Đã trao đổi qua Zalo',
        cs: { id: 3, staff_code: 'CVHT01', name: 'CSKH 1' },
        package: { code: 'N3A' },
        enrollment_classes: [{ class: { class_code: 'N3A110005', class_name: 'N3A110005' }, attendance: [] }],
        program_metadata: {
          course_track: 'N3-LuyenDe',
          jlpt_chuyen_can_overrides: {
            attended_sessions: 10,
            total_marked_sessions: 10,
            average_exam_score: 17.2,
            homework_completed_sessions: 16,
            max_consecutive_absent: 0,
            max_consecutive_no_homework: 2,
          },
          jlpt_chuyen_can: {
            rowNumber: 12,
            classCode: 'N3A110005',
            studentName: 'Đặng Tuấn Anh',
            attendedSessions: 10,
            totalMarkedSessions: 10,
            attendanceRate: 1,
            averageExamScore: 17.2,
            homeworkCompletedSessions: 16,
            maxConsecutiveAbsent: 0,
            absentWarning: '',
            maxConsecutiveNoHomework: 2,
            noHomeworkWarning: '⚠ Không làm bài ≥2 buổi',
            exchangeInfo: 'Đã trao đổi qua Zalo',
            statusText: 'Đang học',
            cvhtCode: 'CVHT01',
            courseTrack: 'N3-LuyenDe',
            lastExamName: 'KT1',
            lastExamSession: 6,
            sessionsSinceLastExam: 4,
            nextExamName: 'KT2',
            nextExamSession: 12,
            sessionsUntilNextExam: 2,
            examScheduleWarning: '🔔 Còn 2 buổi tới KT2 — nhắc HV chuẩn bị',
          },
        },
      };

      const row = buildJlptAttendanceReportRow({ student, enrollment });
      expect(row.class_code).toBe('N3A110005');
      expect(row.attended_sessions).toBe(10);
      expect(row.total_marked_sessions).toBe(10);
      expect(row.attendance_rate).toBe(1);
      expect(row.average_exam_score).toBe(17.2);
      expect(row.homework_completed_sessions).toBe(16);
      expect(row.max_consecutive_no_homework).toBe(2);
      expect(row.no_homework_warning).toBe('⚠ Không làm bài ≥2 buổi');
      expect(row.course_track).toBe('N3-LuyenDe');
      expect(row.last_exam_name).toBe('KT1');
      expect(row.last_exam_session).toBe(6);
      expect(row.sessions_since_last_exam).toBe(4);
      expect(row.next_exam_name).toBe('KT2');
      expect(row.next_exam_session).toBe(12);
      expect(row.sessions_until_next_exam).toBe(2);
      expect(row.exam_schedule_warning).toBe('🔔 Còn 2 buổi tới KT2 — nhắc HV chuẩn bị');
    });
  });

  describe('RBAC scope on getJlptAttendanceReport & updateJlptAttendanceReport', () => {
    const adminActor: AuthUser = { id: 1, roles: ['ADMIN'] };
    const cskh1Actor: AuthUser = { id: 3, roles: ['CS'] };

    it('restricts cskh1 to own or viewer JLPT enrollments while admin sees all', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 12,
          external_id: '1001168',
          full_name: 'HV của CSKH 1',
          enrollments: [
            {
              id: 34,
              student_id: 12,
              program_type: 'JLPT',
              cs_id: 3,
              status: 'STUDYING',
              cs: { id: 3, staff_code: 'CVHT01', name: 'CSKH 1' },
              enrollment_classes: [{ class: { class_code: 'N3VIP16001' }, attendance: [] }],
            },
          ],
        },
      ]);

      const repo = new StudentsRepository();
      await repo.getJlptAttendanceReport({ actor: cskh1Actor });
      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            enrollments: {
              some: {
                program_type: 'JLPT',
                OR: [{ cs_id: { in: [3] } }, { cs_viewers: { some: { cs_id: { in: [3] } } } }],
              },
            },
          },
        }),
      );

      await repo.getJlptAttendanceReport({ actor: adminActor });
      expect(mockPrisma.student.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            enrollments: {
              some: { program_type: 'JLPT' },
            },
          },
        }),
      );
    });

    it('rejects update with 403 when CS actor is only in cs_viewers (read-only mode)', async () => {
      const repo = new StudentsRepository();
      const tx = {
        student: { findUnique: jest.fn().mockResolvedValue({ id: 12, full_name: 'HV' }) },
        enrollment: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null) // primary cs_id lookup returns null
            .mockResolvedValueOnce({ id: 34 }), // cs_viewers lookup returns match
          update: jest.fn(),
        },
      };
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      await expect(
        repo.updateJlptAttendanceReport(12, { exchange_info: 'Test' }, cskh1Actor),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Chế độ Chỉ xem, không có quyền chỉnh sửa',
      });
    });
  });
});
