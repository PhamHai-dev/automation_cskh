import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus } from '@prisma/client';

describe('Care Module Integration Tests', () => {
  let adminToken: string;
  let cs1Token: string;
  let cs2Token: string;
  let teacherToken: string;

  let adminId: number;
  let cs1Id: number;
  let cs2Id: number;
  let teacherId: number;

  let enrollment1Id: number;
  let enrollment2Id: number;
  let student1Id: number;
  let packageId: number;

  beforeAll(async () => {
    // 1. Create Users
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_care_test@example.com' },
      update: {},
      create: {
        email: 'admin_care_test@example.com',
        name: 'Admin Care Test',
        password_hash: 'dummy',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const cs1User = await prisma.user.upsert({
      where: { email: 'cs1_care_test@example.com' },
      update: {},
      create: {
        email: 'cs1_care_test@example.com',
        name: 'CS 1 Care Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    cs1Id = cs1User.id;
    cs1Token = signTestToken(cs1Id, ['CS']);

    const cs2User = await prisma.user.upsert({
      where: { email: 'cs2_care_test@example.com' },
      update: {},
      create: {
        email: 'cs2_care_test@example.com',
        name: 'CS 2 Care Test',
        password_hash: 'dummy',
        roles: ['CS'],
      },
    });
    cs2Id = cs2User.id;
    cs2Token = signTestToken(cs2Id, ['CS']);

    const teacherUser = await prisma.user.upsert({
      where: { email: 'teacher_care_test@example.com' },
      update: {},
      create: {
        email: 'teacher_care_test@example.com',
        name: 'Teacher Care Test',
        password_hash: 'dummy',
        roles: ['TEACHER'],
      },
    });
    teacherId = teacherUser.id;
    teacherToken = signTestToken(teacherId, ['TEACHER']);

    // 2. Create Package
    const pkg = await prisma.package.upsert({
      where: { code: 'PKG_CARE_TEST' },
      update: {},
      create: {
        code: 'PKG_CARE_TEST',
        name: 'Care Test Package',
        default_total_sessions: 10,
      },
    });
    packageId = pkg.id;

    // 3. Create Student
    const st1 = await prisma.student.create({
      data: {
        external_id: 'ST_CARE_001',
        full_name: 'Student Care 1',
        phone: '0901112233',
      },
    });
    student1Id = st1.id;

    // 4. Create Enrollments
    const en1 = await prisma.enrollment.create({
      data: {
        student_id: student1Id,
        package_id: packageId,
        cs_id: cs1Id,
        status: 'STUDYING',
        total_sessions: 10,
      },
    });
    enrollment1Id = en1.id;

    const en2 = await prisma.enrollment.create({
      data: {
        student_id: student1Id,
        package_id: packageId,
        cs_id: cs2Id,
        status: 'STUDYING',
        total_sessions: 10,
      },
    });
    enrollment2Id = en2.id;
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
      where: { id: student1Id },
    });
    await prisma.package.deleteMany({
      where: { id: packageId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, cs1Id, cs2Id, teacherId] } },
    });
    await prisma.$disconnect();
  });

  describe('CareLog Flow', () => {
    it('CS1 should create a CareLog successfully (201)', async () => {
      const res = await request(app)
        .post(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          after_session_number: 1,
          outcome: CareLogOutcome.POSITIVE,
          content: 'Học viên học tốt và hòa đồng',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.after_session_number).toBe(1);
      expect(res.body.data.outcome).toBe('POSITIVE');
      expect(res.body.data.cs_id).toBe(cs1Id);
    });

    it('CS1 should create a 2nd CareLog for same milestone without overwriting (201)', async () => {
      const res = await request(app)
        .post(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          after_session_number: 1,
          outcome: CareLogOutcome.NEGATIVE_WANTS_TO_STOP,
          content: 'Phụ huynh phản ánh giáo viên nói nhanh',
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();

      // Verify list has 2 logs
      const listRes = await request(app)
        .get(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(2);
    });

    it('CS2 should not see CareLogs of CS1 enrollment (403/Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${cs2Token}`);

      expect(res.status).toBe(403);
    });

    it('Teacher should be forbidden from accessing CareLogs (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });

    it('Admin should see all CareLogs for any enrollment (200)', async () => {
      const res = await request(app)
        .get(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  describe('CareTask Flow', () => {
    let createdTaskId: number;

    it('CS1 should create a CareTask (201)', async () => {
      const res = await request(app)
        .post('/api/v1/care-tasks')
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          enrollment_id: enrollment1Id,
          type: CareTaskType.CALLBACK,
          priority: CareTaskPriority.HIGH,
          title: 'Gọi hỏi thăm tình hình buổi 2',
          note: 'Hẹn phụ huynh vào chiều thứ 5',
          due_at: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.title).toBe('Gọi hỏi thăm tình hình buổi 2');
      expect(res.body.data.status).toBe('PENDING');
      createdTaskId = res.body.data.id;
    });

    it('CS1 should list CareTasks and see the created task (200)', async () => {
      const res = await request(app)
        .get('/api/v1/care-tasks')
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const task = res.body.data.find((t: any) => t.id === createdTaskId);
      expect(task).toBeDefined();
    });

    it('CS2 should not see CS1 task in their list (200, empty or not including task)', async () => {
      const res = await request(app)
        .get('/api/v1/care-tasks')
        .set('Authorization', `Bearer ${cs2Token}`);

      expect(res.status).toBe(200);
      const task = res.body.data.find((t: any) => t.id === createdTaskId);
      expect(task).toBeUndefined();
    });

    it('CS1 should update task details (200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/care-tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          title: 'Đã hẹn dời sang sáng thứ 6',
          priority: CareTaskPriority.URGENT,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Đã hẹn dời sang sáng thứ 6');
      expect(res.body.data.priority).toBe('URGENT');
    });

    it('CS1 should mark task as complete (200)', async () => {
      const res = await request(app)
        .post(`/api/v1/care-tasks/${createdTaskId}/complete`)
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DONE');
      expect(res.body.data.completed_at).not.toBeNull();
    });

    it('CS1 should cancel a newly created task (200)', async () => {
      // Create another task
      const newTaskRes = await request(app)
        .post('/api/v1/care-tasks')
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          enrollment_id: enrollment1Id,
          type: CareTaskType.HOT_ISSUE,
          priority: CareTaskPriority.NORMAL,
          title: 'Vấn đề tạm hủy',
        });

      const cancelTaskId = newTaskRes.body.data.id;

      const res = await request(app)
        .post(`/api/v1/care-tasks/${cancelTaskId}/cancel`)
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });
  });
});
