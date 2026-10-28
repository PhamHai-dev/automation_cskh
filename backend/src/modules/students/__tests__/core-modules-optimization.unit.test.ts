jest.mock('../../../prisma/client', () => ({
  prisma: {
    manageAssignment: { findMany: jest.fn() },
    student: { findMany: jest.fn(), findUnique: jest.fn() },
    enrollment: { findMany: jest.fn(), findUnique: jest.fn() },
    class: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    teacher: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    package: { findMany: jest.fn() },
    attendance: { findMany: jest.fn() },
    classTeacher: { findMany: jest.fn() },
    classSession: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '../../../prisma/client';
import { StudentsRepository, SAFE_USER_SELECT as STUDENT_SAFE_USER_SELECT } from '../students.repository';
import { StudentsService } from '../students.service';
import { StudentsController } from '../students.controller';
import { EnrollmentsRepository, SAFE_USER_SELECT as ENROLLMENT_SAFE_USER_SELECT } from '../../enrollments/enrollments.repository';
import { EnrollmentsService } from '../../enrollments/enrollments.service';
import { EnrollmentsController } from '../../enrollments/enrollments.controller';
import { ClassesRepository, SAFE_USER_SELECT as CLASS_SAFE_USER_SELECT } from '../../classes/classes.repository';
import { ClassesService } from '../../classes/classes.service';
import { ClassesController } from '../../classes/classes.controller';
import { TeachersRepository, SAFE_USER_SELECT as TEACHER_SAFE_USER_SELECT } from '../../teachers/teachers.repository';
import { PackagesRepository } from '../../packages/packages.repository';
import {
  parsePaginationQuery,
  parseSearchQuery,
  parseIsoDateParam,
} from '../../../shared/utils/query-validation';

const mockPrisma = prisma as any;

const EXPECTED_SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
};

describe('Query Validation & Security/Pagination across 5 modules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Password hash leak prevention (SAFE_USER_SELECT)', () => {
    it('exports identical SAFE_USER_SELECT without password_hash across students, enrollments, classes, teachers', () => {
      expect(STUDENT_SAFE_USER_SELECT).toEqual(EXPECTED_SAFE_USER_SELECT);
      expect(ENROLLMENT_SAFE_USER_SELECT).toEqual(EXPECTED_SAFE_USER_SELECT);
      expect(CLASS_SAFE_USER_SELECT).toEqual(EXPECTED_SAFE_USER_SELECT);
      expect(TEACHER_SAFE_USER_SELECT).toEqual(EXPECTED_SAFE_USER_SELECT);
      expect((STUDENT_SAFE_USER_SELECT as any).password_hash).toBeUndefined();
    });

    it('StudentsRepository.findAll and findById never use user: true and omit heavy relations in findAll', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.student.findUnique.mockResolvedValue({
        id: 1,
        enrollments: [{ id: 10, cs_id: 5 }],
      });

      const repo = new StudentsRepository();
      await repo.findAll({ actor: { id: 1, roles: ['ADMIN'] } });

      const findAllArgs = mockPrisma.student.findMany.mock.calls[0][0];
      // Verify heavy relations are removed from findAll
      expect(findAllArgs.include.zalo_contact_relations).toBeUndefined();
      expect(findAllArgs.include.line_contact_relations).toBeUndefined();
      expect(findAllArgs.include.enrollments.include.care_tasks).toBeUndefined();
      // Verify compact attendance select in findAll
      expect(findAllArgs.include.enrollments.include.enrollment_classes.include.attendance).toEqual({
        where: { deleted_at: null },
        select: {
          id: true,
          status: true,
          reconciliation_state: true,
          class_session: {
            select: {
              id: true,
              session_date: true,
            },
          },
        },
      });
      // Verify teacher -> user select in findAll
      const findAllUserInclude =
        findAllArgs.include.enrollments.include.enrollment_classes.include.class.include.class_teachers.include.teacher.include.user;
      expect(findAllUserInclude).toEqual({ select: EXPECTED_SAFE_USER_SELECT });

      // Verify teacher -> user select in findById
      await repo.findById(1, { id: 1, roles: ['ADMIN'] });
      const findByIdArgs = mockPrisma.student.findUnique.mock.calls[0][0];
      const findByIdUserInclude =
        findByIdArgs.include.enrollments.include.enrollment_classes.include.class.include.class_teachers.include.teacher.include.user;
      expect(findByIdUserInclude).toEqual({ select: EXPECTED_SAFE_USER_SELECT });
    });

    it('TeachersRepository.findByCode and findByName select only safe user fields', async () => {
      mockPrisma.teacher.findUnique.mockResolvedValue(null);
      mockPrisma.teacher.findFirst.mockResolvedValue(null);

      const repo = new TeachersRepository();
      await repo.findByCode('GV_01');
      await repo.findByName('Yamada');

      expect(mockPrisma.teacher.findUnique).toHaveBeenCalledWith({
        where: { code: 'GV_01' },
        include: { user: { select: EXPECTED_SAFE_USER_SELECT } },
      });
      expect(mockPrisma.teacher.findFirst).toHaveBeenCalledWith({
        where: { name: { contains: 'Yamada' } },
        include: { user: { select: EXPECTED_SAFE_USER_SELECT } },
      });
    });

    it('ClassesRepository.findById selects only safe user fields on class_teachers -> teacher -> user', async () => {
      mockPrisma.class.findUnique.mockResolvedValue(null);
      const repo = new ClassesRepository();
      await repo.findById(99);

      const args = mockPrisma.class.findUnique.mock.calls[0][0];
      expect(args.include.class_teachers.include.teacher.include.user).toEqual({
        select: EXPECTED_SAFE_USER_SELECT,
      });
    });
  });

  describe('2. Query Params Validation (parsePaginationQuery, parseSearchQuery, parseIsoDateParam)', () => {
    it('validates page and pageSize, clamping pageSize > 100 to 100 and rejecting <= 0 or non-integers with 400', () => {
      expect(parsePaginationQuery({})).toEqual({
        isPaginated: false,
        page: 1,
        pageSize: 50,
      });

      expect(parsePaginationQuery({ page: '2', pageSize: '25' })).toEqual({
        isPaginated: true,
        page: 2,
        pageSize: 25,
        skip: 25,
        take: 25,
      });

      expect(parsePaginationQuery({ page: '1', pageSize: '500' })).toEqual({
        isPaginated: true,
        page: 1,
        pageSize: 100,
        skip: 0,
        take: 100,
      });

      expect(() => parsePaginationQuery({ page: '0' })).toThrow();
      expect(() => parsePaginationQuery({ page: '-3' })).toThrow();
      expect(() => parsePaginationQuery({ page: 'abc' })).toThrow();
      expect(() => parsePaginationQuery({ pageSize: '0' })).toThrow();
      expect(() => parsePaginationQuery({ pageSize: '-10' })).toThrow();
    });

    it('truncates search query to 100 characters and trims whitespace', () => {
      const longStr = '   ' + 'a'.repeat(150) + '   ';
      const parsed = parseSearchQuery(longStr, 100);
      expect(parsed).toHaveLength(100);
      expect(parseSearchQuery('   ')).toBeUndefined();
    });

    it('validates YYYY-MM-DD dates and rejects invalid calendar dates with 400', () => {
      const valid = parseIsoDateParam('2026-10-25', 'session_from');
      expect(valid?.dateStr).toBe('2026-10-25');

      expect(() => parseIsoDateParam('25-10-2026', 'session_from')).toThrow();
      expect(() => parseIsoDateParam('2026-02-30', 'session_from')).toThrow();
      expect(() => parseIsoDateParam('2026-13-01', 'session_to')).toThrow();
    });
  });

  describe('3. Students pagination, filtering, facets, and strict CS scope', () => {
    it('combines CS scope with sale/cvht/status filters via AND so sale never widens CS scope', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        {
          id: 1,
          full_name: 'Nguyen Van A',
          enrollments: [
            {
              id: 10,
              cs_id: 10,
              program_type: 'KAIWA',
              status: 'STUDYING',
              sale_name: 'Sale X',
              cs: { id: 10, name: 'CS 10', email: 'cs10@test.com', staff_code: 'CVHT01' },
            },
          ],
        },
      ]);

      const service = new StudentsService();
      const result = await service.getStudentsWithMeta({
        actor: { id: 10, roles: ['CS'] },
        page: 1,
        pageSize: 20,
        isPaginated: true,
        search: 'Nguyen',
        programType: 'KAIWA',
        status: 'STUDYING',
        sale: 'Other CS Name',
        cvht: 'CVHT01',
      });

      const callArgs = mockPrisma.student.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(20);
      expect(callArgs.orderBy).toEqual([{ id: 'asc' }]);

      // Ensure enrollment filter has AND containing cs_id: 10 (or { in: [10] }) alongside sale/status/cvht
      const enrSome = callArgs.where.AND[0].enrollments.some;
      expect(enrSome.AND).toEqual(
        expect.arrayContaining([
          { cs_id: { in: [10] } },
          { program_type: 'KAIWA' },
          { status: 'STUDYING' },
        ]),
      );

      expect(result.meta).toMatchObject({
        page: 1,
        pageSize: 20,
        facets: {
          programCounts: { all: 1, kaiwa: 1, jlpt: 0 },
          statusCounts: { STUDYING: 1 },
        },
      });
      expect(result.meta.filterOptions.cvhtList).toContain('CVHT01');
      expect(result.meta.filterOptions.salesList).toContain('Sale X');
    });
  });

  describe('4. Enrollments session_from/session_to windowing + full-course attendance_stats', () => {
    it('filters class_sessions and attendance by [session_from, session_to] while computing full-course attendance_stats in 1 batch query', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          id: 500,
          cs_id: 10,
          program_type: 'JLPT',
          status: 'STUDYING',
          total_sessions: 30,
          sale_name: 'Sale JLPT',
          package: { name: 'Gói N3', code: 'PKG_N3' },
          cs: { id: 10, name: 'CS 10', email: 'cs10@test.com', staff_code: 'CVHT02' },
          enrollment_classes: [
            {
              id: 700,
              class: {
                id: 80,
                class_name: 'Lớp N3-01',
                class_teachers: [{ teacher: { name: 'Sensei Tanaka', code: 'GV_TNK' } }],
                class_schedules: [],
                class_sessions: [],
              },
              attendance: [],
            },
          ],
        },
      ]);

      // Full-course attendance rows across multiple months (outside the 1-day session window)
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          enrollment_class_id: 700,
          status: 'ATTENDED',
          teacher_status: 'ATTENDED',
          cs_status: 'ATTENDED',
        },
        {
          enrollment_class_id: 700,
          status: 'ATTENDED',
          teacher_status: 'ATTENDED',
          cs_status: null,
        },
        {
          enrollment_class_id: 700,
          status: 'ABSENT_APPROVED_A',
          teacher_status: 'ABSENT_APPROVED_A',
          cs_status: 'ABSENT_APPROVED_A',
        },
        {
          enrollment_class_id: 700,
          status: 'ABSENT_UNAPPROVED_C',
          teacher_status: 'ABSENT_UNAPPROVED_C',
          cs_status: 'ABSENT_UNAPPROVED_C',
        },
        {
          enrollment_class_id: 700,
          status: 'TEACHER_ABSENT_D',
          teacher_status: 'TEACHER_ABSENT_D',
          cs_status: 'TEACHER_ABSENT_D',
        },
      ]);

      const service = new EnrollmentsService();
      const result = await service.getEnrollmentsWithMeta(10, ['CS'], 'IgnoredSaleForCS', {
        sessionFrom: '2026-10-25',
        sessionTo: '2026-10-25',
      });

      const findManyCall = mockPrisma.enrollment.findMany.mock.calls[0][0];
      // Verify CS scope is strictly cs_id: 10 and ignores sale override
      expect(findManyCall.where).toEqual({ cs_id: 10 });
      // Verify class_sessions in ENROLLMENT_INCLUDES does NOT include duplicate attendance
      const classSessionsInclude =
        findManyCall.include.enrollment_classes.include.class.include.class_sessions;
      expect(classSessionsInclude.include).toBeUndefined();
      expect(classSessionsInclude.where).toEqual({
        session_date: {
          gte: new Date('2026-10-25T00:00:00.000Z'),
          lte: new Date('2026-10-25T00:00:00.000Z'),
        },
      });

      // Verify full-course attendance_stats attached on enrollment_class
      const ec = result.data[0].enrollment_classes[0];
      expect(ec.attendance_stats).toEqual({
        ADMIN: { totalAttended: 2, totalAbsentA: 1, totalAbsentC: 1, totalTeacherD: 1 },
        TEACHER: { totalAttended: 2, totalAbsentA: 1, totalAbsentC: 1, totalTeacherD: 1 },
        CS: { totalAttended: 1, totalAbsentA: 1, totalAbsentC: 1, totalTeacherD: 1 },
      });

      expect(result.meta.facets.programCounts).toEqual({ all: 1, kaiwa: 0, jlpt: 1 });
      expect(result.meta.filterOptions.packagesList).toContain('Gói N3');
      expect(result.meta.filterOptions.teachersList).toContain('Sensei Tanaka');
      expect(result.meta.filterOptions.teacherCodesList).toContain('GV_TNK');
      expect(result.meta.filterOptions.classesList).toContain('Lớp N3-01');
    });
  });

  describe('5. Classes N+1 elimination, session windowing, and full-course attendance_stats', () => {
    it('skips findByCode/update when class_code is already valid and attaches full-course + monthly attendance_stats', async () => {
      mockPrisma.class.findMany.mockResolvedValue([
        {
          id: 12,
          class_code: 'class_0012',
          class_name: 'Lớp Kaiwa 12',
          model_type: 'ONE_TO_ONE',
          active: true,
          class_teachers: [],
          class_schedules: [{ schedule_pattern: '246' }],
          class_sessions: [],
          enrollment_classes: [
            {
              id: 901,
              enrollment: { id: 300, student: { id: 1, full_name: 'HV 1' } },
              attendance: [],
            },
          ],
        },
      ]);

      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          enrollment_class_id: 901,
          status: 'ATTENDED',
          teacher_status: 'ATTENDED',
          cs_status: 'ATTENDED',
          class_session: { session_date: new Date('2026-09-15T00:00:00.000Z') },
        },
        {
          enrollment_class_id: 901,
          status: 'ATTENDED',
          teacher_status: 'ATTENDED',
          cs_status: null,
          class_session: { session_date: new Date('2026-10-20T00:00:00.000Z') },
        },
      ]);

      const service = new ClassesService();
      const result = await service.getClassesWithMeta(
        { id: 1, roles: ['ADMIN'] },
        {
          sessionFrom: '2026-10-25',
          sessionTo: '2026-10-25',
          summaryMonth: '2026-10',
        },
      );

      // Verify N+1 findByCode / update was NOT called for valid class_0012
      expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.class.update).not.toHaveBeenCalled();

      // Verify class_sessions in findAll does NOT include duplicate attendance
      const findManyCall = mockPrisma.class.findMany.mock.calls[0][0];
      expect(findManyCall.include.class_sessions.include).toBeUndefined();

      // Verify full-course + month stats attached to enrollment_class
      const ec = result.data[0].enrollment_classes[0];
      expect(ec.attendance_stats).toEqual({
        totalAttendedAdmin: 2,
        totalAttendedTeacher: 2,
        monthAttendedAdmin: 1,
        monthAttendedTeacher: 1,
      });
    });

    it('enforces TEACHER accessibleClassIds via AND with search/model filters', async () => {
      mockPrisma.teacher.findFirst.mockResolvedValue({ id: 55 });
      mockPrisma.classTeacher.findMany.mockResolvedValue([{ class_id: 101 }, { class_id: 102 }]);
      mockPrisma.classSession.findMany.mockResolvedValue([]);
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.class.count.mockResolvedValue(0);

      const service = new ClassesService();
      await service.getClassesWithMeta(
        { id: 77, roles: ['TEACHER'], email: 'gv@test.com' },
        {
          isPaginated: true,
          page: 1,
          pageSize: 10,
          search: 'Kaiwa',
          modelType: '1:1',
        },
      );

      const findManyCall = mockPrisma.class.findMany.mock.calls[0][0];
      expect(findManyCall.where.AND).toEqual(
        expect.arrayContaining([
          { id: { in: [101, 102] } },
          { model_type: 'ONE_TO_ONE' },
        ]),
      );
    });
  });

  describe('6. Packages & Teachers stable ordering and filtering', () => {
    it('orders packages and teachers by [{ created_at: desc }, { id: desc }] and applies search/active/teacher_type filters', async () => {
      mockPrisma.package.findMany.mockResolvedValue([]);
      mockPrisma.teacher.findMany.mockResolvedValue([]);

      const pkgRepo = new PackagesRepository();
      await pkgRepo.findAll({ search: 'VIP', active: true });
      expect(mockPrisma.package.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { active: true },
            { OR: [{ code: { contains: 'VIP' } }, { name: { contains: 'VIP' } }] },
          ],
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      });

      const teacherRepo = new TeachersRepository();
      await teacherRepo.findAll({ search: 'Sato', active: true, teacherType: 'JAPANESE' });
      expect(mockPrisma.teacher.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { active: true },
            { teacher_type: 'JAPANESE' },
            {
              OR: [
                { name: { contains: 'Sato' } },
                { code: { contains: 'Sato' } },
                { phone: { contains: 'Sato' } },
                { email: { contains: 'Sato' } },
              ],
            },
          ],
        },
        include: { user: { select: EXPECTED_SAFE_USER_SELECT } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      });
    });
  });
});
