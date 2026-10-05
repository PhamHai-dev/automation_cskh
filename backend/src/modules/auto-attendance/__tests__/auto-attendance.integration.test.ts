import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { AutoAttendanceService } from '../auto-attendance.service';

describe('Auto Attendance Integration Tests', () => {
  let adminToken: string;
  let adminId: number;
  let testClassId: number;
  let testScheduleId: number;
  let testStudentId: number;
  let testEnrollmentId: number;
  let testEnrollmentClassId: number;
  const service = new AutoAttendanceService();

  beforeAll(async () => {
    // 1. Create admin user
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin_auto_att_test@example.com' },
      update: {},
      create: {
        email: 'admin_auto_att_test@example.com',
        name: 'Admin Auto Attendance Test',
        password_hash: 'hash',
        roles: ['ADMIN'],
      },
    });
    adminId = adminUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    // 2. Create student & enrollment
    const student = await prisma.student.create({
      data: {
        external_id: 'AUTO_TEST_HV001',
        full_name: 'Học Viên Test Auto Attendance',
        phone: '0988776655',
        email: 'auto_test_hv001@example.com',
      },
    });
    testStudentId = student.id;

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: testStudentId,
        status: 'STUDYING',
        total_sessions: 20,
        cs_id: adminId,
      },
    });
    testEnrollmentId = enrollment.id;

    // 3. Create class
    const cls = await prisma.class.create({
      data: {
        class_name: 'Lớp Test Auto Attendance 246',
        class_code: 'CLS_AUTO_TEST_001',
        level: 'N3',
        model_type: 'ONE_TO_ONE',
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    testClassId = cls.id;

    // 4. Enroll student in class
    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: testEnrollmentId,
        class_id: testClassId,
        status: 'ACTIVE',
        sequence_no: 1,
      },
    });
    testEnrollmentClassId = ec.id;

    // 5. Determine today's day of week character for schedule_pattern
    const today = new Date();
    const jsDay = today.getDay(); // 0 = CN, 1 = T2, 2 = T3, 3 = T4, 4 = T5, 5 = T6, 6 = T7
    const dayCode = jsDay === 0 ? 'CN' : String(jsDay + 1);

    // 6. Create schedule for today with start_time earlier than now
    const schedule = await prisma.classSchedule.create({
      data: {
        class_id: testClassId,
        schedule_pattern: dayCode,
        start_time: '00:01', // 00:01 AM -> definitely past (start_time + 15m)
        duration_minutes: 30,
        active: true,
        valid_from: new Date(Date.now() - 86400000), // yesterday
        valid_to: new Date(Date.now() + 86400000 * 30), // 30 days later
      },
    });
    testScheduleId = schedule.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.autoAttendanceExecution.deleteMany({
      where: { class_schedule_id: testScheduleId },
    });
    await prisma.careTask.deleteMany({
      where: { enrollment_id: testEnrollmentId },
    });
    await prisma.attendance.deleteMany({
      where: { enrollment_class_id: testEnrollmentClassId },
    });
    await prisma.classSession.deleteMany({
      where: { class_id: testClassId },
    });
    await prisma.classSchedule.deleteMany({
      where: { id: testScheduleId },
    });
    await prisma.enrollmentClass.deleteMany({
      where: { id: testEnrollmentClassId },
    });
    await prisma.enrollment.deleteMany({
      where: { id: testEnrollmentId },
    });
    await prisma.class.deleteMany({
      where: { id: testClassId },
    });
    await prisma.student.deleteMany({
      where: { id: testStudentId },
    });
    await prisma.user.deleteMany({
      where: { id: adminId },
    });
    await prisma.$disconnect();
  });

  it('GET /api/v1/settings/auto-attendance should return delay settings', async () => {
    const res = await request(app)
      .get('/api/v1/settings/auto-attendance')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('delay_minutes');
  });

  it('PATCH /api/v1/settings/auto-attendance should update delay settings', async () => {
    const res = await request(app)
      .patch('/api/v1/settings/auto-attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delay_minutes: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.delay_minutes).toBe(10);
  });

  it('processAutoAttendance() should automatically mark attendance for eligible class schedule', async () => {
    const result = await service.processAutoAttendance();

    expect(result.processed_schedules).toBeGreaterThanOrEqual(1);
    expect(result.attended_count).toBeGreaterThanOrEqual(1);

    // Verify ClassSession was created
    const session = await prisma.classSession.findFirst({
      where: { class_id: testClassId, class_schedule_id: testScheduleId },
    });
    expect(session).not.toBeNull();

    // Verify Attendance was created with source AUTO_SCHEDULE
    const attendance = await prisma.attendance.findFirst({
      where: {
        enrollment_class_id: testEnrollmentClassId,
        class_session_id: session!.id,
      },
    });
    expect(attendance).not.toBeNull();
    expect(attendance!.status).toBe('ATTENDED');
    expect(attendance!.source).toBe('AUTO_SCHEDULE');

    // Verify AutoAttendanceExecution was marked COMPLETED
    const execution = await prisma.autoAttendanceExecution.findFirst({
      where: { class_schedule_id: testScheduleId },
    });
    expect(execution).not.toBeNull();
    expect(execution!.status).toBe('COMPLETED');
    expect(execution!.attendance_count).toBe(1);
  });

  it('processAutoAttendance() should be idempotent and not duplicate attendance or session', async () => {
    // Run second time
    const result = await service.processAutoAttendance();

    // Should not re-process this schedule
    const attendances = await prisma.attendance.findMany({
      where: { enrollment_class_id: testEnrollmentClassId },
    });
    expect(attendances.length).toBe(1);

    const sessions = await prisma.classSession.findMany({
      where: { class_id: testClassId },
    });
    expect(sessions.length).toBe(1);
  });

  it('POST /api/v1/settings/auto-attendance/run should trigger auto attendance cycle via API', async () => {
    const res = await request(app)
      .post('/api/v1/settings/auto-attendance/run')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('processed_schedules');
  });
});
