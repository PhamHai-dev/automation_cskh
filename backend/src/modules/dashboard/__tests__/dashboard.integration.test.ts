import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus, EnrollmentStatus } from '@prisma/client';

describe('Dashboard Module Integration Tests', () => {
  let adminToken: string;
  let csToken: string;
  let adminId: number;
  let csId: number;

  let student1Id: number;
  let student2Id: number;
  let packageId: number;
  let enrollment1Id: number;
  let enrollment2Id: number;

  beforeAll(async () => {
    // 1. Create Users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_dash_test@example.com' },
      update: {},
      create: {
        email: 'admin_dash_test@example.com',
        name: 'Admin Dash Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const csUser = await prisma.user.upsert({
      where: { email: 'cs_dash_test@example.com' },
      update: {},
      create: {
        email: 'cs_dash_test@example.com',
        name: 'CS Dash Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    csId = csUser.id;
    csToken = signTestToken(csId, ['CS']);

    // Clean up any stale data from previous runs
    await prisma.careTask.deleteMany({
      where: { assigned_to_id: { in: [adminId, csId] } },
    });
    await prisma.careLog.deleteMany({
      where: { cs_id: { in: [adminId, csId] } },
    });
    await prisma.enrollment.deleteMany({
      where: { cs_id: { in: [adminId, csId] } },
    });

    // 2. Create Package
    const pkg = await prisma.package.upsert({
      where: { code: 'PKG_DASH_TEST' },
      update: {},
      create: {
        code: 'PKG_DASH_TEST',
        name: 'Dash Test Package',
        default_total_sessions: 10,
      },
    });
    packageId = pkg.id;

    // 3. Create Students
    const st1 = await prisma.student.create({
      data: {
        external_id: 'ST_DASH_001',
        full_name: 'Dash Student 1',
      },
    });
    student1Id = st1.id;

    const st2 = await prisma.student.create({
      data: {
        external_id: 'ST_DASH_002',
        full_name: 'Dash Student 2',
      },
    });
    student2Id = st2.id;

    // 4. Create Enrollments
    const en1 = await prisma.enrollment.create({
      data: {
        student_id: student1Id,
        package_id: packageId,
        cs_id: csId,
        status: EnrollmentStatus.STUDYING,
        total_sessions: 10,
      },
    });
    enrollment1Id = en1.id;

    const en2 = await prisma.enrollment.create({
      data: {
        student_id: student2Id,
        package_id: packageId,
        cs_id: adminId, // assigned to admin
        status: EnrollmentStatus.PAUSED,
        total_sessions: 10,
      },
    });
    enrollment2Id = en2.id;

    // 5. Create Care Logs
    await prisma.careLog.createMany({
      data: [
        {
          enrollment_id: enrollment1Id,
          cs_id: csId,
          created_by_id: csId,
          after_session_number: 1,
          outcome: CareLogOutcome.POSITIVE,
          content: 'Buổi 1 tốt',
        },
        {
          enrollment_id: enrollment1Id,
          cs_id: csId,
          created_by_id: csId,
          after_session_number: 3,
          outcome: CareLogOutcome.NO_RESPONSE,
          content: 'Không bắt máy',
        },
      ],
    });

    // 6. Create Care Tasks
    await prisma.careTask.createMany({
      data: [
        {
          enrollment_id: enrollment1Id,
          assigned_to_id: csId,
          type: CareTaskType.CALLBACK,
          priority: CareTaskPriority.URGENT,
          status: CareTaskStatus.PENDING,
          title: 'Gọi lại gấp',
          due_at: new Date(Date.now() - 2 * 86400000), // overdue (2 days ago)
        },
        {
          enrollment_id: enrollment1Id,
          assigned_to_id: csId,
          type: CareTaskType.HOT_ISSUE,
          priority: CareTaskPriority.HIGH,
          status: CareTaskStatus.PENDING,
          title: 'Khiếu nại giáo viên',
          due_at: new Date(Date.now() + 3600000), // due today
        },
      ],
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.careTask.deleteMany({
      where: { enrollment_id: { in: [enrollment1Id, enrollment2Id] } },
    });
    await prisma.careLog.deleteMany({
      where: { enrollment_id: { in: [enrollment1Id, enrollment2Id] } },
    });
    await prisma.enrollment.deleteMany({
      where: { id: { in: [enrollment1Id, enrollment2Id] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [student1Id, student2Id] } },
    });
    await prisma.package.deleteMany({
      where: { id: packageId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, csId] } },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/dashboard/summary', () => {
    it('CS should see summary for their own assigned enrollments', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${csToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.total_enrollments).toBe(1);
      expect(res.body.data.unique_students).toBe(1);
      expect(res.body.data.status_breakdown.STUDYING).toBe(1);
    });

    it('Admin should see global summary across all enrollments', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.total_enrollments).toBeGreaterThanOrEqual(2);
      expect(res.body.data.unique_students).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/dashboard/attendance', () => {
    it('Should return attendance statistics structure', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/attendance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveProperty('total_sessions');
      expect(res.body.data).toHaveProperty('total_attendances');
      expect(res.body.data).toHaveProperty('attendance_rate');
      expect(res.body.data).toHaveProperty('breakdown');
    });
  });

  describe('GET /api/v1/dashboard/care-pivot', () => {
    it('CS should get care pivot matrix filtered to their logs', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/care-pivot')
        .set('Authorization', `Bearer ${csToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveProperty('session_numbers');
      expect(res.body.data).toHaveProperty('outcomes');
      expect(res.body.data).toHaveProperty('matrix');

      // Session 1 POSITIVE should be 1
      expect(res.body.data.matrix['1']['POSITIVE']).toBe(1);
      // Session 3 NO_RESPONSE should be 1
      expect(res.body.data.matrix['3']['NO_RESPONSE']).toBe(1);
    });
  });

  describe('GET /api/v1/dashboard/tasks-overview', () => {
    it('CS should see tasks overview with overdue and due_today counts', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/tasks-overview')
        .set('Authorization', `Bearer ${csToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.pending_total).toBe(2);
      expect(res.body.data.overdue).toBe(1);
      expect(res.body.data.due_today).toBe(1);
      expect(res.body.data.urgent_hot_issues).toBe(2);
    });
  });
});
