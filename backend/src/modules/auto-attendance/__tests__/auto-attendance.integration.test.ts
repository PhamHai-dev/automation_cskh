import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { AutoAttendanceService } from '../auto-attendance.service';
import { ClassModelType } from '@prisma/client';

// D3 (approved 2026-10-25, auto-attendance.service.ts SKIPPED branch):
//   - GROUP classes (fixed schedule): provisional fill — auto-attendance
//     creates the planned ClassSession AND an ATTENDED/AUTO_SCHEDULE row.
//   - ONE_TO_ONE classes: planned-only — the ClassSession calendar item is
//     created but NO Attendance is auto-generated; execution => SKIPPED.
//     Unit coverage already exists (auto-attendance.d3.unit.test.ts); this
//     integration suite now exercises BOTH paths against a real DB.
describe('Auto Attendance Integration Tests', () => {
  let adminToken: string;
  let adminId: number;

  // Group path fixtures (provisional fill)
  let groupClassId: number;
  let groupScheduleId: number;
  let groupEnrollmentId: number;
  let groupEnrollmentClassId: number;
  let groupStudentId: number;

  // 1-1 path fixtures (planned-only, D3)
  let oneToOneClassId: number;
  let oneToOneScheduleId: number;
  let oneToOneEnrollmentId: number;
  let oneToOneEnrollmentClassId: number;
  let oneToOneStudentId: number;

  const service = new AutoAttendanceService();

  // Today's product weekday code for schedule_pattern (2..7, CN).
  function todayDayCode(now = new Date()): string {
    const jsDay = now.getDay(); // 0 = CN, 1 = T2, ..., 6 = T7
    return jsDay === 0 ? 'CN' : String(jsDay + 1);
  }

  async function seedFixture(modelType: ClassModelType, tag: string) {
    const student = await prisma.student.create({
      data: {
        external_id: `AUTO_TEST_${tag}`,
        full_name: `Học Viên Test Auto ${tag}`,
        phone: `09887766${tag === 'GRP' ? '11' : '22'}`,
        email: `auto_test_${tag}@example.com`,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: student.id,
        status: 'STUDYING',
        total_sessions: 20,
        cs_id: adminId,
      },
    });

    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp Test Auto Attendance ${tag}`,
        class_code: `CLS_AUTO_TEST_${tag}`,
        level: 'N3',
        model_type: modelType,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });

    const ec = await prisma.enrollmentClass.create({
      data: {
        enrollment_id: enrollment.id,
        class_id: cls.id,
        status: 'ACTIVE',
        sequence_no: 1,
      },
    });

    const schedule = await prisma.classSchedule.create({
      data: {
        class_id: cls.id,
        schedule_pattern: todayDayCode(),
        start_time: '00:01', // 00:01 + delay is definitely in the past
        duration_minutes: 30,
        active: true,
        valid_from: new Date(Date.now() - 86400000),
        valid_to: new Date(Date.now() + 86400000 * 30),
      },
    });

    return { student, enrollment, ec, cls, schedule };
  }

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

    // Deterministic AppSetting seed: cron-path cycles depend on the SHARED
    // AUTO_ATTENDANCE_ENABLED key; without this the suite silently inherits
    // whatever another lane left behind (order dependence). Seed enabled=true
    // + delay=10 via the API (same state machine production uses).
    await prisma.appSetting.upsert({
      where: { key: 'AUTO_ATTENDANCE_ENABLED' },
      update: { value: true },
      create: { key: 'AUTO_ATTENDANCE_ENABLED', value: true, updated_by_id: adminId },
    });
    await prisma.appSetting.upsert({
      where: { key: 'AUTO_ATTENDANCE_DELAY_MINUTES' },
      update: { value: 10 },
      create: { key: 'AUTO_ATTENDANCE_DELAY_MINUTES', value: 10, updated_by_id: adminId },
    });

    // 2. Group class fixture — D3 provisional-fill path
    const g = await seedFixture(ClassModelType.ONE_TO_N, 'GRP');
    groupStudentId = g.student.id;
    groupEnrollmentId = g.enrollment.id;
    groupClassId = g.cls.id;
    groupEnrollmentClassId = g.ec.id;
    groupScheduleId = g.schedule.id;

    // 3. 1-1 class fixture — D3 planned-only path
    const o = await seedFixture(ClassModelType.ONE_TO_ONE, 'OTO');
    oneToOneStudentId = o.student.id;
    oneToOneEnrollmentId = o.enrollment.id;
    oneToOneClassId = o.cls.id;
    oneToOneEnrollmentClassId = o.ec.id;
    oneToOneScheduleId = o.schedule.id;

    // 4. Purge residue from previously crashed runs (executions are keyed by
    //    schedule; stale rows would short-circuit idempotency on fresh ids —
    //    only matters for same-code fixtures created by an older crash).
    await prisma.classSession.deleteMany({ where: { class_id: { in: [groupClassId, oneToOneClassId] } } });
  });

  async function cleanupFixture(opts: {
    scheduleId: number;
    enrollmentClassId: number;
    enrollmentId: number;
    studentId: number;
    classId: number;
  }) {
    const { scheduleId, enrollmentClassId, enrollmentId, studentId, classId } = opts;
    const attendanceIds = (await prisma.attendance.findMany({
      where: { enrollment_class_id: enrollmentClassId },
      select: { id: true },
    })).map((a) => a.id);
    if (attendanceIds.length > 0) {
      await prisma.messageDelivery.deleteMany({ where: { attendance_id: { in: attendanceIds } } });
    }
    await prisma.autoAttendanceExecution.deleteMany({ where: { class_schedule_id: scheduleId } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.attendance.deleteMany({ where: { enrollment_class_id: enrollmentClassId } });
    await prisma.classSession.deleteMany({ where: { class_id: classId } });
    await prisma.classSchedule.deleteMany({ where: { id: scheduleId } });
    await prisma.enrollmentClass.deleteMany({ where: { id: enrollmentClassId } });
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.class.deleteMany({ where: { id: classId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
  }

  afterAll(async () => {
    // Children before users (pattern: attendance-e2e.acceptance.integration.test.ts).
    await cleanupFixture({
      scheduleId: groupScheduleId,
      enrollmentClassId: groupEnrollmentClassId,
      enrollmentId: groupEnrollmentId,
      studentId: groupStudentId,
      classId: groupClassId,
    });
    await cleanupFixture({
      scheduleId: oneToOneScheduleId,
      enrollmentClassId: oneToOneEnrollmentClassId,
      enrollmentId: oneToOneEnrollmentId,
      studentId: oneToOneStudentId,
      classId: oneToOneClassId,
    });
    const userIds = [adminId];
    await prisma.automationStep.deleteMany({ where: { workflow: { owner_cs_id: { in: userIds } } } });
    await prisma.automationWorkflow.deleteMany({ where: { owner_cs_id: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.cSGroupMember.deleteMany({ where: { user_id: { in: userIds } } });
    // Restore shared AppSettings to defaults so other suites inheriting
    // AUTO_ATTENDANCE_ENABLED are not affected by this lane's last PATCH.
    await prisma.appSetting.deleteMany({ where: { key: { in: ['AUTO_ATTENDANCE_ENABLED', 'AUTO_ATTENDANCE_DELAY_MINUTES'] } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // Settings API
  // ---------------------------------------------------------------------------

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

  it('should skip cron cycle when auto attendance is disabled, but still allow manual run', async () => {
    // 1. Disable auto attendance
    const patch = await request(app)
      .patch('/api/v1/settings/auto-attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delay_minutes: 10, enabled: false });
    expect(patch.status).toBe(200);
    expect(patch.body.data.enabled).toBe(false);

    const get = await request(app)
      .get('/api/v1/settings/auto-attendance')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(get.status).toBe(200);
    expect(get.body.data.enabled).toBe(false);

    // 2. Reset the GROUP schedule to "unprocessed" state (it WILL be filled —
    //    D3 provisional path; using the group fixture also removes the old
    //    pre-D3 dependence on a 1-1 schedule producing attendance).
    await prisma.autoAttendanceExecution.deleteMany({ where: { class_schedule_id: groupScheduleId } });
    await prisma.attendance.deleteMany({ where: { enrollment_class_id: groupEnrollmentClassId } });

    // 3. Cron cycle (ignoreEnabled=false) must skip everything while disabled
    const disabledCycle = await service.processAutoAttendance();
    expect(disabledCycle.processed_schedules).toBe(0);
    expect(disabledCycle.attended_count).toBe(0);

    expect(await prisma.autoAttendanceExecution.count({ where: { class_schedule_id: groupScheduleId } })).toBe(0);
    expect(await prisma.attendance.count({ where: { enrollment_class_id: groupEnrollmentClassId } })).toBe(0);

    // 4. Re-enable; /run (ignoreEnabled=true) must work regardless of cron gating
    await request(app)
      .patch('/api/v1/settings/auto-attendance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delay_minutes: 10, enabled: true });

    const run = await request(app)
      .post('/api/v1/settings/auto-attendance/run')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(run.status).toBe(200);
    expect(run.body.data.attended_count).toBeGreaterThanOrEqual(1);

    // 5. Reset group schedule state for the next tests
    await prisma.autoAttendanceExecution.deleteMany({ where: { class_schedule_id: groupScheduleId } });
    await prisma.attendance.deleteMany({ where: { enrollment_class_id: groupEnrollmentClassId } });
    await prisma.classSession.deleteMany({ where: { class_id: groupClassId } });
  });

  // ---------------------------------------------------------------------------
  // D3 group path — provisional fill
  // ---------------------------------------------------------------------------

  it('processAutoAttendance() should provisionally fill attendance for eligible GROUP schedule', async () => {
    const result = await service.processAutoAttendance();

    expect(result.processed_schedules).toBeGreaterThanOrEqual(1);
    expect(result.attended_count).toBeGreaterThanOrEqual(1);

    const session = await prisma.classSession.findFirst({
      where: { class_id: groupClassId, class_schedule_id: groupScheduleId },
    });
    expect(session).not.toBeNull();

    const attendance = await prisma.attendance.findFirst({
      where: {
        enrollment_class_id: groupEnrollmentClassId,
        class_session_id: session!.id,
      },
    });
    expect(attendance).not.toBeNull();
    expect(attendance!.status).toBe('ATTENDED');
    expect(attendance!.source).toBe('AUTO_SCHEDULE');
    const actor = await prisma.user.findUniqueOrThrow({
      where: { id: attendance!.created_by_id },
    });
    expect(actor.email).toBe('auto-attendance@system.invalid');
    expect(actor.id).not.toBe(adminId);
    expect(actor.active).toBe(false);
    expect(actor.roles).toEqual([]);
    expect(session!.created_by_id).toBe(actor.id);
    const login = await request(app).post('/api/v1/auth/login').send({
      email: actor.email, password: 'not-a-system-password',
    });
    expect(login.status).not.toBe(200);

    const execution = await prisma.autoAttendanceExecution.findFirst({
      where: { class_schedule_id: groupScheduleId },
    });
    expect(execution).not.toBeNull();
    expect(execution!.status).toBe('COMPLETED');
    expect(execution!.attendance_count).toBe(1);
  });

  it('processAutoAttendance() should be idempotent and not duplicate attendance or session (GROUP)', async () => {
    await service.processAutoAttendance();

    const attendances = await prisma.attendance.findMany({
      where: { enrollment_class_id: groupEnrollmentClassId },
    });
    expect(attendances.length).toBe(1);

    const sessions = await prisma.classSession.findMany({
      where: { class_id: groupClassId },
    });
    expect(sessions.length).toBe(1);
  });

  it('only retries FAILED manually and claims concurrent runs once (GROUP)', async () => {
    const execution = await prisma.autoAttendanceExecution.findFirstOrThrow({
      where: { class_schedule_id: groupScheduleId },
    });
    await prisma.autoAttendanceExecution.update({
      where: { id: execution.id }, data: { status: 'FAILED', error_message: 'simulated transient failure' },
    });
    await service.processAutoAttendance();
    expect((await prisma.autoAttendanceExecution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('FAILED');
    const results = await Promise.all([
      service.processAutoAttendance(new Date(), true),
      service.processAutoAttendance(new Date(), true),
    ]);
    expect(results.reduce((sum, result) => sum + result.processed_schedules, 0)).toBe(1);
    expect(await prisma.attendance.count({ where: { enrollment_class_id: groupEnrollmentClassId } })).toBe(1);
    expect((await prisma.autoAttendanceExecution.findUniqueOrThrow({ where: { id: execution.id } })).status).toBe('COMPLETED');
  });

  // ---------------------------------------------------------------------------
  // D3 1-1 path — planned-only (contract change 2026-10-25)
  // ---------------------------------------------------------------------------

  it('D3: 1-1 schedule creates the planned ClassSession but NO Attendance (execution SKIPPED)', async () => {
    // Reset the 1-1 schedule so this test exercises the D3 planned-only branch
    // on a fresh cycle (earlier cycles in this suite have already scanned all
    // active schedules including the 1-1 one).
    await prisma.autoAttendanceExecution.deleteMany({ where: { class_schedule_id: oneToOneScheduleId } });
    await prisma.classSession.deleteMany({ where: { class_id: oneToOneClassId } });

    const result = await service.processAutoAttendance(new Date(), false, true);

    const session = await prisma.classSession.findFirst({
      where: { class_id: oneToOneClassId, class_schedule_id: oneToOneScheduleId },
    });
    expect(session).not.toBeNull(); // planned-only DOES create the calendar item
    const actor = await prisma.user.findUnique({ where: { email: 'auto-attendance@system.invalid' } });
    expect(session!.created_by_id).toBe(actor!.id);

    const attendance = await prisma.attendance.findFirst({
      where: { enrollment_class_id: oneToOneEnrollmentClassId },
    });
    expect(attendance).toBeNull(); // D3: never auto-generate 1-1 attendance

    const execution = await prisma.autoAttendanceExecution.findFirst({
      where: { class_schedule_id: oneToOneScheduleId },
    });
    expect(execution).not.toBeNull();
    expect(execution!.status).toBe('SKIPPED');
    expect(execution!.attendance_count).toBe(0);
    expect(execution!.error_message).toContain('D3');

    // 1-1 never counts as a processed (filled) schedule.
    expect(result.attended_count).toBe(0);
    expect(result.skipped_count).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/v1/settings/auto-attendance/run should trigger auto attendance cycle via API', async () => {
    const res = await request(app)
      .post('/api/v1/settings/auto-attendance/run')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('processed_schedules');
  });
});
