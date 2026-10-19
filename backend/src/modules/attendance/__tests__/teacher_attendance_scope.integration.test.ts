import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';

describe('Teacher Attendance Scope Integration Tests', () => {
  let adminToken: string;
  let adminId: number;

  let teacher1User: any;
  let teacher1Token: string;
  let teacher1Record: any;

  let teacher2User: any;
  let teacher2Token: string;
  let teacher2Record: any;

  let class1: any;
  let class2: any;

  let session1: any;
  let session2: any;

  let ec1: any;
  let ec2: any;

  let student1: any;
  let student2: any;

  let attendance1Id: number;

  beforeAll(async () => {
    // 1. Create Admin
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_scope_test@example.com' },
      update: {},
      create: {
        email: 'admin_scope_test@example.com',
        name: 'Admin Scope Test',
        password_hash: 'hash',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    // 2. Create Teacher 1
    teacher1User = await prisma.user.upsert({
      where: { email: 'teacher1_scope_test@example.com' },
      update: {},
      create: {
        email: 'teacher1_scope_test@example.com',
        name: 'Teacher 1 Scope Test',
        password_hash: 'hash',
        roles: ['TEACHER'],
      },
    });
    teacher1Token = signTestToken(teacher1User.id, ['TEACHER']);

    teacher1Record = await prisma.teacher.upsert({
      where: { code: 'GV_SCOPE_T1' },
      update: { user_id: teacher1User.id },
      create: {
        code: 'GV_SCOPE_T1',
        name: 'Teacher 1 Scope Test',
        email: 'teacher1_scope_test@example.com',
        user_id: teacher1User.id,
      },
    });

    // 3. Create Teacher 2
    teacher2User = await prisma.user.upsert({
      where: { email: 'teacher2_scope_test@example.com' },
      update: {},
      create: {
        email: 'teacher2_scope_test@example.com',
        name: 'Teacher 2 Scope Test',
        password_hash: 'hash',
        roles: ['TEACHER'],
      },
    });
    teacher2Token = signTestToken(teacher2User.id, ['TEACHER']);

    teacher2Record = await prisma.teacher.upsert({
      where: { code: 'GV_SCOPE_T2' },
      update: { user_id: teacher2User.id },
      create: {
        code: 'GV_SCOPE_T2',
        name: 'Teacher 2 Scope Test',
        email: 'teacher2_scope_test@example.com',
        user_id: teacher2User.id,
      },
    });

    // 4. Create Classes
    class1 = await prisma.class.create({
      data: {
        class_name: 'Lớp Giáo Viên 1 Dạy',
        class_code: 'CLS_T1_SCOPE',
        model_type: 'ONE_TO_ONE' as any,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });

    class2 = await prisma.class.create({
      data: {
        class_name: 'Lớp Giáo Viên 2 Dạy',
        class_code: 'CLS_T2_SCOPE',
        model_type: 'ONE_TO_ONE' as any,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });

    // 5. Assign Teacher 1 to Class 1, Teacher 2 to Class 2
    await prisma.classTeacher.create({
      data: {
        class_id: class1.id,
        teacher_id: teacher1Record.id,
        role: 'MAIN',
        active: true,
      },
    });

    await prisma.classTeacher.create({
      data: {
        class_id: class2.id,
        teacher_id: teacher2Record.id,
        role: 'MAIN',
        active: true,
      },
    });

    // 6. Create Sessions
    session1 = await prisma.classSession.create({
      data: {
        class_id: class1.id,
        session_number: 1,
        session_date: new Date('2026-10-10'),
        start_time: '19:00',
        end_time: '20:00',
        created_by_id: adminId,
      },
    });

    session2 = await prisma.classSession.create({
      data: {
        class_id: class2.id,
        session_number: 1,
        session_date: new Date('2026-10-10'),
        start_time: '19:00',
        end_time: '20:00',
        created_by_id: adminId,
      },
    });

    // 7. Create Students, Enrollments, EnrollmentClasses
    student1 = await prisma.student.create({
      data: {
        full_name: 'Học Viên Lớp 1',
        external_id: 'HV_T1_SCOPE',
      },
    });
    const enroll1 = await prisma.enrollment.create({
      data: {
        student_id: student1.id,
        cs_id: adminId,
        total_sessions: 10,
      },
    });
    ec1 = await prisma.enrollmentClass.create({
      data: {
        class_id: class1.id,
        enrollment_id: enroll1.id,
        sequence_no: 1,
      },
    });

    student2 = await prisma.student.create({
      data: {
        full_name: 'Học Viên Lớp 2',
        external_id: 'HV_T2_SCOPE',
      },
    });
    const enroll2 = await prisma.enrollment.create({
      data: {
        student_id: student2.id,
        cs_id: adminId,
        total_sessions: 10,
      },
    });
    ec2 = await prisma.enrollmentClass.create({
      data: {
        class_id: class2.id,
        enrollment_id: enroll2.id,
        sequence_no: 1,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.attendance.deleteMany({
      where: {
        class_session_id: { in: [session1.id, session2.id] },
      },
    });
    await prisma.classSession.deleteMany({
      where: { id: { in: [session1.id, session2.id] } },
    });
    await prisma.enrollmentClass.deleteMany({
      where: { id: { in: [ec1.id, ec2.id] } },
    });
    await prisma.enrollment.deleteMany({
      where: { student_id: { in: [student1.id, student2.id] } },
    });
    await prisma.student.deleteMany({
      where: { id: { in: [student1.id, student2.id] } },
    });
    await prisma.classTeacher.deleteMany({
      where: { class_id: { in: [class1.id, class2.id] } },
    });
    await prisma.class.deleteMany({
      where: { id: { in: [class1.id, class2.id] } },
    });
    await prisma.auditLog.deleteMany({
      where: { user_id: { in: [adminId, teacher1User.id, teacher2User.id] } },
    });
    await prisma.teacher.updateMany({
      where: { id: { in: [teacher1Record.id, teacher2Record.id] } },
      data: { user_id: null },
    });
    await prisma.teacher.deleteMany({
      where: { id: { in: [teacher1Record.id, teacher2Record.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, teacher1User.id, teacher2User.id] } },
    });
    await prisma.$disconnect();
  });

  describe('1. Class List & Detail Scoping', () => {
    it('Teacher 1 listing classes only sees Class 1, NOT Class 2', async () => {
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(200);
      const classIds = res.body.data.map((c: any) => c.id);
      expect(classIds).toContain(class1.id);
      expect(classIds).not.toContain(class2.id);
    });

    it('Teacher 2 listing classes only sees Class 2, NOT Class 1', async () => {
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${teacher2Token}`);

      expect(res.status).toBe(200);
      const classIds = res.body.data.map((c: any) => c.id);
      expect(classIds).toContain(class2.id);
      expect(classIds).not.toContain(class1.id);
    });

    it('Admin listing classes sees both Class 1 and Class 2', async () => {
      const res = await request(app)
        .get('/api/v1/classes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const classIds = res.body.data.map((c: any) => c.id);
      expect(classIds).toContain(class1.id);
      expect(classIds).toContain(class2.id);
    });

    it('Teacher 1 can view details of Class 1 (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class1.id}`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(class1.id);
    });

    it('Teacher 1 cannot view details of Class 2 (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class2.id}`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(403);
      expect(res.body.message || res.body.error?.message).toMatch(/không có quyền|phụ trách/i);
    });
  });

  describe('2. Class Sessions Scoping', () => {
    it('Teacher 1 can list sessions of Class 1', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class1.id}/sessions`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('Teacher 1 cannot list sessions of Class 2 (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class2.id}/sessions`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('3. Attendance Scoping & Operations', () => {
    it('Teacher 1 can view attendance for Class 1 Session 1', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(200);
    });

    it('Teacher 1 cannot view attendance for Class 2 Session 2 (403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/v1/classes/${class2.id}/sessions/${session2.id}/attendance`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(403);
    });

    it('Teacher 1 cannot mark attendance for Class 2 Session 2 (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${class2.id}/sessions/${session2.id}/attendance`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          enrollment_class_id: ec2.id,
          status: 'ATTENDED',
        });

      expect(res.status).toBe(403);
    });

    it('Teacher 1 cannot bulk mark attendance for Class 2 Session 2 (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${class2.id}/sessions/${session2.id}/attendance/bulk`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          items: [
            {
              enrollment_class_id: ec2.id,
              status: 'ATTENDED',
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it('Teacher 1 can mark attendance for Class 1 Session 1 (201 Created)', async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          enrollment_class_id: ec1.id,
          status: 'ATTENDED',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      attendance1Id = res.body.data.id;
    });

    it('Teacher 2 cannot update attendance for Class 1 (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance/${attendance1Id}`)
        .set('Authorization', `Bearer ${teacher2Token}`)
        .send({
          status: 'ABSENT_APPROVED_A',
        });

      expect(res.status).toBe(403);
    });

    it('Teacher 1 can update attendance for Class 1 (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance/${attendance1Id}`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          status: 'ABSENT_APPROVED_A',
          lesson_topic: 'Kaiwa Bài 1',
          teacher_note: 'Xin nghỉ phép',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.teacher_status).toBe('ABSENT_APPROVED_A');
      expect(res.body.data.lesson_topic).toBe('Kaiwa Bài 1');
      expect(res.body.data.teacher_note).toBe('Xin nghỉ phép');
    });

    it('Admin cannot mark TEACHER or CS side directly (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          enrollment_class_id: ec1.id,
          status: 'ATTENDED',
          side: 'TEACHER',
        });

      expect(res.status).toBe(403);
    });

    it('Teacher cannot mark ADMIN side (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          enrollment_class_id: ec1.id,
          status: 'ATTENDED',
          side: 'ADMIN',
        });

      expect(res.status).toBe(403);
    });

    it('Admin marking attendance updates final status (ADMIN side), ignores lesson_topic/teacher_note, and generates notifications', async () => {
      const res = await request(app)
        .patch(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance/${attendance1Id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'ATTENDED',
          lesson_topic: 'Admin không được ghi đè bài học',
          teacher_note: 'Admin không được ghi đè ghi chú GV',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ATTENDED');
      expect(res.body.data.reconciliation_state).toBe('RESOLVED');
      expect(res.body.data.teacher_status).toBe('ABSENT_APPROVED_A');
      expect(res.body.data.lesson_topic).toBe('Kaiwa Bài 1');
      expect(res.body.data.teacher_note).toBe('Xin nghỉ phép');

      // Check teacher notification via care-notifications API
      const notifRes = await request(app)
        .get('/api/v1/care-notifications?status=unread')
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(notifRes.status).toBe(200);
      const notif = notifRes.body.data.find((n: any) => n.attendance_id === attendance1Id);
      expect(notif).toBeDefined();
      expect(notif.recipient_role).toBe('TEACHER');
      expect(notif.previous_status).toBe('ABSENT_APPROVED_A');
      expect(notif.admin_status).toBe('ATTENDED');
      expect(notif.is_read).toBe(false);

      // Mark notification read
      const readRes = await request(app)
        .post(`/api/v1/care-notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.is_read).toBe(true);
    });

    it('Teacher 2 cannot reset attendance for Class 1 (403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance/${attendance1Id}`)
        .set('Authorization', `Bearer ${teacher2Token}`);

      expect(res.status).toBe(403);
    });

    it('Teacher 1 can reset attendance for Class 1 (204 No Content)', async () => {
      const res = await request(app)
        .delete(`/api/v1/classes/${class1.id}/sessions/${session1.id}/attendance/${attendance1Id}`)
        .set('Authorization', `Bearer ${teacher1Token}`);

      expect(res.status).toBe(204);
    });
  });
});
