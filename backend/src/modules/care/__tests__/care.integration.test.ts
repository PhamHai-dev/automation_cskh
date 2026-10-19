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

  describe('Care Milestones and Sheet 1 Tab 2 Updates', () => {
    it('should create and retrieve care milestone configs', async () => {
      // Create milestone 5
      const createRes = await request(app)
        .post('/api/v1/milestones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ session_number: 5, label: 'Buổi 5' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.session_number).toBe(5);

      // Get milestones
      const getRes = await request(app)
        .get('/api/v1/milestones')
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(getRes.status).toBe(200);
      const sessionNumbers = getRes.body.data.map((m: any) => m.session_number);
      expect(sessionNumbers).toContain(5);
    });

    it('should update enrollment care fields (study_report_url, exchange_info, etc.)', async () => {
      const res = await request(app)
        .put(`/api/v1/enrollments/${enrollment1Id}/care`)
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          study_report_url: 'https://docs.google.com/spreadsheets/d/test123',
          exchange_info: 'Trao đổi phụ huynh rất hài lòng',
          callback_note: 'Hẹn gọi lại vào thứ 6',
          hot_issue_note: 'Cần đổi lịch học',
          post_course_care: 'Đã hoàn thành khóa học xuất sắc',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.study_report_url).toBe('https://docs.google.com/spreadsheets/d/test123');
      expect(res.body.data.exchange_info).toBe('Trao đổi phụ huynh rất hài lòng');
      expect(res.body.data.callback_note).toBe('Hẹn gọi lại vào thứ 6');
      expect(res.body.data.hot_issue_note).toBe('Cần đổi lịch học');
      expect(res.body.data.post_course_care).toBe('Đã hoàn thành khóa học xuất sắc');

      // Verify that CareTasks were auto-created for callback_note and hot_issue_note
      const tasksRes = await request(app)
        .get(`/api/v1/care-tasks?enrollment_id=${enrollment1Id}`)
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(tasksRes.status).toBe(200);
      const callbackTask = tasksRes.body.data.find((t: any) => t.type === 'CALLBACK');
      expect(callbackTask).toBeDefined();
      const hotIssueTask = tasksRes.body.data.find((t: any) => t.type === 'HOT_ISSUE');
      expect(hotIssueTask).toBeDefined();
    });

    it('should upsert session care log via inline edit endpoint', async () => {
      const res = await request(app)
        .put(`/api/v1/enrollments/${enrollment1Id}/sessions/2/care-log`)
        .set('Authorization', `Bearer ${cs1Token}`)
        .send({
          content: 'Chăm sóc sau buổi 2: Học viên tiếp thu tốt, phát âm chuẩn',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Chăm sóc sau buổi 2: Học viên tiếp thu tốt, phát âm chuẩn');
      expect(res.body.data.after_session_number).toBe(2);

      // Verify care log in getCareLogs
      const logsRes = await request(app)
        .get(`/api/v1/enrollments/${enrollment1Id}/care-logs`)
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(logsRes.status).toBe(200);
      const log2 = logsRes.body.data.find((l: any) => l.after_session_number === 2);
      expect(log2).toBeDefined();
      expect(log2.content).toContain('Học viên tiếp thu tốt');
    });
  });

  describe('Care Notifications Flow', () => {
    let notif1Id: number;
    let notif2Id: number;

    beforeAll(async () => {
      const n1 = await prisma.auditLog.create({
        data: {
          user_id: adminId,
          action: 'ATTENDANCE_ADMIN_NOTIFICATION',
          entity_type: 'UserNotification',
          entity_id: String(cs1Id),
          after_data: {
            recipient_user_id: cs1Id,
            recipient_role: 'CS',
            attendance_id: 9991,
            student_id: student1Id,
            student_name: 'Student Care 1',
            student_code: 'ST_CARE_001',
            class_id: 1,
            class_name: 'Lớp Test Thông Báo',
            session_id: 1,
            session_number: 1,
            session_date: '2026-10-19',
            previous_status: null,
            admin_status: 'ATTENDED',
            actor_id: adminId,
            actor_name: 'Admin Care Test',
            is_read: false,
            read_at: null,
          },
        },
      });
      notif1Id = n1.id;

      const n2 = await prisma.auditLog.create({
        data: {
          user_id: adminId,
          action: 'ATTENDANCE_ADMIN_NOTIFICATION',
          entity_type: 'UserNotification',
          entity_id: String(teacherId),
          after_data: {
            recipient_user_id: teacherId,
            recipient_role: 'TEACHER',
            attendance_id: 9992,
            student_id: student1Id,
            student_name: 'Student Care 1',
            student_code: 'ST_CARE_001',
            class_id: 1,
            class_name: 'Lớp Test Thông Báo',
            session_id: 1,
            session_number: 1,
            session_date: '2026-10-19',
            previous_status: 'ABSENT_APPROVED_A',
            admin_status: 'ATTENDED',
            actor_id: adminId,
            actor_name: 'Admin Care Test',
            is_read: false,
            read_at: null,
          },
        },
      });
      notif2Id = n2.id;
    });

    afterAll(async () => {
      await prisma.auditLog.deleteMany({
        where: { id: { in: [notif1Id, notif2Id] } },
      });
    });

    it('CS1 only sees their own notifications', async () => {
      const res = await request(app)
        .get('/api/v1/care-notifications')
        .set('Authorization', `Bearer ${cs1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((n: any) => n.id === notif1Id)).toBe(true);
      expect(res.body.data.some((n: any) => n.id === notif2Id)).toBe(false);
      expect(res.body.meta.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('CS2 cannot mark CS1 notification as read (403)', async () => {
      const res = await request(app)
        .post(`/api/v1/care-notifications/${notif1Id}/read`)
        .set('Authorization', `Bearer ${cs2Token}`);

      expect(res.status).toBe(403);
    });

    it('Teacher can list and mark all notifications as read', async () => {
      const listRes = await request(app)
        .get('/api/v1/care-notifications?status=unread')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((n: any) => n.id === notif2Id)).toBe(true);

      const readAllRes = await request(app)
        .post('/api/v1/care-notifications/read-all')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(readAllRes.status).toBe(200);
      expect(readAllRes.body.data.updatedCount).toBeGreaterThanOrEqual(1);

      const afterRes = await request(app)
        .get('/api/v1/care-notifications?status=unread')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(afterRes.status).toBe(200);
      expect(afterRes.body.data.some((n: any) => n.id === notif2Id)).toBe(false);
    });
  });
});

