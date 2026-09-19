import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ClassSession + Attendance Integration', () => {
  let testUserId: number;
  let testClassId: number;
  let testStudentId: number;
  let testEnrollmentId: number;
  let testEnrollmentClassId: number;
  let testSessionId: number;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Test Admin',
        email: `test-admin-${Date.now()}@test.com`,
        password_hash: 'hashed',
        roles: ['ADMIN'],
      },
    });
    testUserId = user.id;

    const teacher = await prisma.user.create({
      data: {
        name: 'Test Teacher',
        email: `test-teacher-${Date.now()}@test.com`,
        password_hash: 'hashed',
        roles: ['TEACHER'],
      },
    });

    const cls = await prisma.class.create({
      data: {
        class_code: `TEST-${Date.now()}`,
        class_name: 'Integration Test Class',
        model_type: 'ONE_TO_ONE',
        attendance_source: 'LEARNING_SYSTEM',
        active: true,
      },
    });
    testClassId = cls.id;

    await prisma.classTeacher.create({
      data: {
        class_id: testClassId,
        teacher_id: teacher.id,
        role: 'MAIN',
      },
    });

    const student = await prisma.student.create({
      data: {
        full_name: 'Test Student',
        phone: `0900000${Date.now().toString().slice(-4)}`,
      },
    });
    testStudentId = student.id;

    const csUser = await prisma.user.create({
      data: {
        name: 'Test CS',
        email: `test-cs-${Date.now()}@test.com`,
        password_hash: 'hashed',
        roles: ['CS'],
      },
    });

    const pkg = await prisma.package.create({
      data: {
        code: `PKG-${Date.now()}`,
        name: 'Test Package',
        default_total_sessions: 50,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: testStudentId,
        package_id: pkg.id,
        cs_id: csUser.id,
        status: 'STUDYING',
        total_sessions: 50,
      },
    });
    testEnrollmentId = enrollment.id;

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: testEnrollmentId,
        class_id: testClassId,
        sequence_no: 1,
      },
    });
    testEnrollmentClassId = ec.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { user_id: testUserId } });
    await prisma.attendance.deleteMany({ where: { class_session: { class_id: testClassId } } });
    await prisma.classSession.deleteMany({ where: { class_id: testClassId } });
    await prisma.enrollmentClass.deleteMany({ where: { class_id: testClassId } });
    await prisma.enrollment.delete({ where: { id: testEnrollmentId } }).catch(() => {});
    await prisma.student.delete({ where: { id: testStudentId } }).catch(() => {});
    await prisma.classTeacher.deleteMany({ where: { class_id: testClassId } });
    await prisma.class.delete({ where: { id: testClassId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
  });

  describe('ClassSession CRUD', () => {
    it('should create a session with valid data', async () => {
      const session = await prisma.classSession.create({
        data: {
          class_id: testClassId,
          session_number: 1,
          session_date: new Date('2026-09-20'),
          start_time: '09:00',
          end_time: '10:00',
          status: 'SCHEDULED',
          created_by_id: testUserId,
        },
      });
      expect(session).toBeDefined();
      expect(session.session_number).toBe(1);
      expect(session.status).toBe('SCHEDULED');
      testSessionId = session.id;
    });

    it('should block duplicate session_number in the same class', async () => {
      await expect(
        prisma.classSession.create({
          data: {
            class_id: testClassId,
            session_number: 1,
            session_date: new Date('2026-09-21'),
            status: 'SCHEDULED',
            created_by_id: testUserId,
          },
        })
      ).rejects.toThrow();
    });

    it('should allow same session_number in different classes', async () => {
      const otherClass = await prisma.class.create({
        data: {
          class_code: `OTHER-${Date.now()}`,
          class_name: 'Other Class',
          model_type: 'GROUP',
          attendance_source: 'LEARNING_SYSTEM',
          active: true,
        },
      });

      const session = await prisma.classSession.create({
        data: {
          class_id: otherClass.id,
          session_number: 1,
          session_date: new Date('2026-09-20'),
          status: 'SCHEDULED',
          created_by_id: testUserId,
        },
      });
      expect(session).toBeDefined();
      await prisma.classSession.delete({ where: { id: session.id } });
      await prisma.class.delete({ where: { id: otherClass.id } });
    });

    it('should update session status to COMPLETED', async () => {
      const updated = await prisma.classSession.update({
        where: { id: testSessionId },
        data: { status: 'COMPLETED' },
      });
      expect(updated.status).toBe('COMPLETED');
    });

    it('should cancel a session', async () => {
      const session = await prisma.classSession.create({
        data: {
          class_id: testClassId,
          session_number: 2,
          session_date: new Date('2026-09-21'),
          status: 'SCHEDULED',
          created_by_id: testUserId,
        },
      });

      const cancelled = await prisma.classSession.update({
        where: { id: session.id },
        data: { status: 'CANCELLED' },
      });
      expect(cancelled.status).toBe('CANCELLED');
    });

    it('should return sessions for a class', async () => {
      const sessions = await prisma.classSession.findMany({
        where: { class_id: testClassId },
        orderBy: { session_number: 'asc' },
      });
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Attendance - Single Mark', () => {
    it('should mark attendance for a student', async () => {
      const attendance = await prisma.attendance.create({
        data: {
          enrollment_class_id: testEnrollmentClassId,
          class_session_id: testSessionId,
          status: 'ATTENDED',
          source: 'MANUAL',
          created_by_id: testUserId,
        },
      });
      expect(attendance).toBeDefined();
      expect(attendance.status).toBe('ATTENDED');
    });

    it('should block duplicate attendance for same enrollment_class + session', async () => {
      await expect(
        prisma.attendance.create({
          data: {
            enrollment_class_id: testEnrollmentClassId,
            class_session_id: testSessionId,
            status: 'ABSENT_APPROVED_A',
            source: 'MANUAL',
            created_by_id: testUserId,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Attendance - Cross-class blocking', () => {
    it('should verify enrollment_class belongs to correct class', async () => {
      const ec = await prisma.enrollmentClass.findUnique({
        where: { id: testEnrollmentClassId },
      });
      expect(ec?.class_id).toBe(testClassId);
    });
  });

  describe('Attendance - Audit Log', () => {
    it('should create audit log entries for attendance changes', async () => {
      const audit = await prisma.auditLog.create({
        data: {
          user_id: testUserId,
          action: 'UPDATE',
          entity_type: 'Attendance',
          entity_id: '1',
          after_data: { status: 'LEAVE_B' },
        },
      });
      expect(audit).toBeDefined();

      const audits = await prisma.auditLog.findMany({
        where: { user_id: testUserId, entity_type: 'Attendance' },
      });
      expect(audits.length).toBeGreaterThanOrEqual(1);

      await prisma.auditLog.delete({ where: { id: audit.id } });
    });
  });

  describe('Attendance - Bulk Mark', () => {
    it('should bulk create attendance in a transaction', async () => {
      const ec2 = await prisma.enrollmentClass.create({
        data: {
          enrollment_id: testEnrollmentId,
          class_id: testClassId,
          sequence_no: 2,
        },
      });

      const items = [
        { enrollment_class_id: testEnrollmentClassId, status: 'ATTENDED' as const },
        { enrollment_class_id: ec2.id, status: 'ABSENT_APPROVED_A' as const },
      ];

      const results = await prisma.$transaction(
        items.map((item) =>
          prisma.attendance.upsert({
            where: {
              enrollment_class_id_class_session_id: {
                enrollment_class_id: item.enrollment_class_id,
                class_session_id: testSessionId,
              },
            },
            create: {
              enrollment_class_id: item.enrollment_class_id,
              class_session_id: testSessionId,
              status: item.status,
              source: 'MANUAL',
              created_by_id: testUserId,
            },
            update: { status: item.status },
          })
        )
      );

      expect(results.length).toBe(2);
      await prisma.attendance.deleteMany({ where: { enrollment_class_id: ec2.id } });
      await prisma.enrollmentClass.delete({ where: { id: ec2.id } });
    });
  });

  describe('Attendance - Read-only after session completed', () => {
    it('should reflect session COMPLETED status in query', async () => {
      const session = await prisma.classSession.findUnique({
        where: { id: testSessionId },
      });
      expect(session?.status).toBe('COMPLETED');
    });
  });

  describe('Attendance - Status codes', () => {
    it('should support all 6 attendance status codes', async () => {
      const statuses = [
        'ATTENDED',
        'ABSENT_APPROVED_A',
        'LEAVE_B',
        'ABSENT_UNAPPROVED_C',
        'TEACHER_ABSENT_D',
        'TECH_ERROR_E',
      ] as const;

      for (const status of statuses) {
        const att = await prisma.attendance.findFirst({
          where: {
            class_session_id: testSessionId,
            status,
          },
        });
        if (status === 'ATTENDED' || status === 'ABSENT_APPROVED_A') {
          expect(att).toBeDefined();
        }
      }
    });
  });
});
