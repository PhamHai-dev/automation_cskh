// D8 owner ruling 2026-10-26 — privileged ASSIST-MARK branch (ruling A) +
// explicit-termination-date (ruling B1).
//
// Assist-mark must enforce TWO independent conditions:
//   1. Operator is privileged (ADMIN/MANAGE — existing policy, unchanged);
//   2. The recorded teacher was validly assigned AT THE SESSION DATE, where an
//      inactive row authorizes ONLY with an explicit end_date whose bounded
//      window covers the session date (active=false + end_date=null -> 403;
//      no script-time inference anywhere).
// Plus (B1): the classes API that writes `active=false` requires an explicit
// end_date -> 422 when missing.
//
// Real HTTP API + real DB (.env.test -> automation_cskh_test). BullMQ adapter
// jest-module-mocked: no queue job, no Redis, no worker. Namespace
// `d8_assist_20261026`; teardown deletes children before users; zero residue.

jest.mock('../../automation/automation-bullmq-adapter', () => ({
  enqueueDelivery: jest.fn().mockResolvedValue(null),
  cancelDelivery: jest.fn().mockResolvedValue(undefined),
  closeAutomationQueue: jest.fn().mockResolvedValue(undefined),
}));

import request from 'supertest';
import ExcelJS from 'exceljs';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import {
  AttendanceStatus,
  ReconciliationState,
  ClassModelType,
  EnrollmentStatus,
  EnrollmentClassStatus,
  AttendanceSource,
} from '@prisma/client';

const NS = 'd8_assist_20261026';
const SESSION_DATE = new Date('2026-06-15T00:00:00.000Z');

describe('D8 assist-mark ruling A + termination-date ruling B1 (owner 2026-10-26)', () => {
  let adminId: number;
  let adminToken: string;
  let csId: number;
  let teacherUserId: number;
  let teacherRecId: number;

  let studentId: number;
  let packageId: number;
  let enrollmentId: number;

  const classIds: number[] = [];
  const attendanceIds: number[] = [];

  /** Create class + assignment for the shared teacher + enrollment link +
   *  session at SESSION_DATE + PENDING_TEACHER attendance. Returns ids. */
  async function fixtureClass(
    tag: string,
    assignment: { active: boolean; start_date: Date | null; end_date: Date | null },
  ) {
    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp ${tag} ${NS}`,
        class_code: `CLS_${tag}_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    classIds.push(cls.id);
    await prisma.classTeacher.create({
      data: { class_id: cls.id, teacher_id: teacherRecId, role: 'MAIN', ...assignment },
    });
    const ec = await prisma.enrollmentClass.create({
      data: { enrollment_id: enrollmentId, class_id: cls.id, sequence_no: 1, status: EnrollmentClassStatus.ACTIVE },
    });
    const session = await prisma.classSession.create({
      data: { class_id: cls.id, session_number: 1, session_date: SESSION_DATE, created_by_id: adminId },
    });
    const attendance = await prisma.attendance.create({
      data: {
        enrollment_class_id: ec.id,
        class_session_id: session.id,
        status: AttendanceStatus.ATTENDED,
        source: AttendanceSource.MANUAL,
        created_by_id: adminId,
        reconciliation_state: ReconciliationState.PENDING_TEACHER,
      },
    });
    attendanceIds.push(attendance.id);
    return { classId: cls.id, attendanceId: attendance.id };
  }

  beforeAll(async () => {
    const admin = await prisma.user.create({ data: { email: `admin_${NS}@example.com`, name: 'Assist Admin', password_hash: 'x', roles: ['ADMIN'] } });
    const cs = await prisma.user.create({ data: { email: `cs_${NS}@example.com`, name: 'Assist CS', password_hash: 'x', roles: ['CS'] } });
    const teacherUser = await prisma.user.create({ data: { email: `teacher_${NS}@example.com`, name: 'Assist Teacher', password_hash: 'x', roles: ['TEACHER'] } });
    adminId = admin.id; csId = cs.id; teacherUserId = teacherUser.id;
    adminToken = signTestToken(adminId, ['ADMIN']);

    const teacherRec = await prisma.teacher.create({
      data: { user_id: teacherUserId, code: `GV_${NS}`, name: 'Assist Teacher Rec', active: true },
    });
    teacherRecId = teacherRec.id;

    const student = await prisma.student.create({ data: { external_id: `HV_${NS}`, full_name: 'Assist Learner' } });
    studentId = student.id;
    const pkg = await prisma.package.create({ data: { code: `PKG_${NS}`, name: 'Assist Package', default_total_sessions: 10 } });
    packageId = pkg.id;
    const enrollment = await prisma.enrollment.create({
      data: { student_id: studentId, package_id: packageId, cs_id: csId, total_sessions: 10, status: EnrollmentStatus.STUDYING },
    });
    enrollmentId = enrollment.id;
  });

  afterAll(async () => {
    // Children before users (RESTRICT FK edges), same idiom as d8_hist tests.
    await prisma.messageDelivery.deleteMany({
      where: {
        OR: [
          { attendance_id: { in: attendanceIds } },
          { attendance: { class_session: { class_id: { in: classIds } } } },
        ],
      },
    });
    await prisma.attendance.deleteMany({
      where: {
        OR: [
          { id: { in: attendanceIds } },
          { class_session: { class_id: { in: classIds } } },
        ],
      },
    });
    await prisma.classSession.deleteMany({ where: { class_id: { in: classIds } } });
    await prisma.classTeacher.deleteMany({ where: { class_id: { in: classIds } } });
    await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careLog.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.teacher.deleteMany({ where: { id: teacherRecId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    const userIds = [adminId, csId, teacherUserId];
    await prisma.automationStep.deleteMany({ where: { workflow: { owner_cs_id: { in: userIds } } } });
    await prisma.automationWorkflow.deleteMany({ where: { owner_cs_id: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    // Zero-residue assertions: nothing named by this namespace survives.
    const residue = await Promise.all([
      prisma.class.count({ where: { class_code: { contains: NS } } }),
      prisma.teacher.count({ where: { code: { contains: NS } } }),
      prisma.student.count({ where: { external_id: { contains: NS } } }),
      prisma.user.count({ where: { email: { contains: NS } } }),
    ]);
    expect(residue.every((c) => c === 0)).toBe(true);
    await prisma.$disconnect();
  });

  it('ADMIN assists a teacher whose assignment is active=false WITH end_date AFTER the session date -> 200', async () => {
    const { attendanceId } = await fixtureClass('RVK', {
      active: false,
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: new Date('2026-12-31T00:00:00.000Z'), // revoked AFTER the session date
    });

    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId, lessonTopic: 'D8 assist trong window' });

    expect(res.status).toBe(200);
    expect(res.body.data.reconciliation_state).toBe(ReconciliationState.PENDING_CS);
    const row = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    expect(row?.teacher_user_id).toBe(adminId); // operator recorded, per unchanged semantics
  });

  it('ADMIN assists the same teacher but session date is AFTER end_date -> 403', async () => {
    const { classId, attendanceId } = await fixtureClass('AFT', {
      active: false,
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: new Date('2026-05-01T00:00:00.000Z'), // revoked BEFORE the session date
    });
    expect(classId).toBeGreaterThan(0);

    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Giáo viên được chọn không phụ trách lớp này tại ngày dạy của buổi học');
  });

  it('ADMIN assists a teacher whose assignment is active=false WITHOUT end_date (ambiguous boundary) -> 403, never inferred', async () => {
    const { classId, attendanceId } = await fixtureClass('NOEND', {
      active: false,
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: null, // strict 2026-10-26 boundary: start without end proves nothing after departure
    });

    const res = await request(app)
      .post(`/api/v1/attendance-reconciliation/${attendanceId}/teacher-mark`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: AttendanceStatus.ATTENDED, teacherId: teacherUserId });

    expect(res.status).toBe(403);

    // The DB row is untouched — no end_date was silently stamped.
    const ct = await prisma.classTeacher.findFirst({ where: { class_id: classId } });
    expect(ct?.end_date).toBeNull();
  });

  it('POST /classes/:id/teachers with active=false and NO end_date -> 422 (B1: termination needs explicit end date)', async () => {
    const cls = await prisma.class.create({
      data: { class_name: `Lớp B1 ${NS}`, class_code: `CLSB1_${NS}`, model_type: ClassModelType.ONE_TO_ONE, attendance_source: 'LEARNING_SYSTEM' },
    });
    classIds.push(cls.id);

    const missing = await request(app)
      .post(`/api/v1/classes/${cls.id}/teachers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacher_id: teacherRecId, role: 'MAIN', start_date: '2026-01-01', active: false });
    expect(missing.status).toBe(422);
    expect(missing.body.message).toBe('Vui lòng nhập ngày kết thúc phân công khi cho GV ngừng phụ trách lớp');

    const withEnd = await request(app)
      .post(`/api/v1/classes/${cls.id}/teachers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacher_id: teacherRecId, role: 'MAIN', start_date: '2026-01-01', end_date: '2026-06-30', active: false });
    expect(withEnd.status).toBe(201);
    expect(withEnd.body.data.end_date).toBeTruthy();
    expect(withEnd.body.data.active).toBe(false);
  });

  it('PATCH /classes/:id/teachers/:assignmentId/end ("Kết thúc phân công") ends assignment on 2026-10-22 with AuditLog, and teacher Excel import allows 2026-10-15 (in window) while blocking 2026-10-25 (after end_date)', async () => {
    // Use a dedicated class + student so the teacher workbook matches a single active EnrollmentClass.
    const importStudent = await prisma.student.create({
      data: { external_id: `HV_IMP_${NS}`, full_name: 'Import D8 Learner' },
    });
    const importEnrollment = await prisma.enrollment.create({
      data: {
        student_id: importStudent.id,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 10,
        status: EnrollmentStatus.STUDYING,
      },
    });
    const cls = await prisma.class.create({
      data: {
        class_name: `Lớp EndAssign ${NS}`,
        class_code: `CLSEND_${NS}`,
        model_type: ClassModelType.ONE_TO_ONE,
        attendance_source: 'LEARNING_SYSTEM',
      },
    });
    classIds.push(cls.id);

    const assignment = await prisma.classTeacher.create({
      data: {
        class_id: cls.id,
        teacher_id: teacherRecId,
        role: 'MAIN',
        active: true,
        start_date: new Date('2026-10-01T00:00:00.000Z'),
        end_date: null,
      },
    });
    await prisma.enrollmentClass.create({
      data: {
        enrollment_id: importEnrollment.id,
        class_id: cls.id,
        sequence_no: 1,
        status: EnrollmentClassStatus.ACTIVE,
      },
    });

    const teacherToken = signTestToken(teacherUserId, ['TEACHER']);
    const csToken = signTestToken(csId, ['CS']);

    try {
      // 1. Non-Admin rejected with 403
      const forbiddenRes = await request(app)
        .patch(`/api/v1/classes/${cls.id}/teachers/${assignment.id}/end`)
        .set('Authorization', `Bearer ${csToken}`)
        .send({ end_date: '2026-10-22' });
      expect(forbiddenRes.status).toBe(403);

      // 2. Missing end_date rejected with 422 (never defaulted to today)
      const missingEndRes = await request(app)
        .patch(`/api/v1/classes/${cls.id}/teachers/${assignment.id}/end`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(missingEndRes.status).toBe(422);
      expect(missingEndRes.body.message).toBe('Vui lòng nhập ngày kết thúc phân công khi cho GV ngừng phụ trách lớp');

      // 3. end_date < start_date rejected with 422
      const invertedRes = await request(app)
        .patch(`/api/v1/classes/${cls.id}/teachers/${assignment.id}/end`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: '2026-09-30' });
      expect(invertedRes.status).toBe(422);
      expect(invertedRes.body.message).toBe('Ngày kết thúc phân công phải lớn hơn hoặc bằng ngày bắt đầu');

      // 4. Wrong classId rejected with 404
      const wrongClassRes = await request(app)
        .patch(`/api/v1/classes/99999999/teachers/${assignment.id}/end`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: '2026-10-22' });
      expect(wrongClassRes.status).toBe(404);

      // 5. Admin ends assignment on 2026-10-22 -> 200, row preserved in place, AuditLog written
      const endRes = await request(app)
        .patch(`/api/v1/classes/${cls.id}/teachers/${assignment.id}/end`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ end_date: '2026-10-22' });
      expect(endRes.status).toBe(200);
      expect(endRes.body.data.id).toBe(assignment.id);
      expect(endRes.body.data.active).toBe(false);
      expect(new Date(endRes.body.data.end_date).toISOString().slice(0, 10)).toBe('2026-10-22');

      const dbAssignment = await prisma.classTeacher.findUnique({ where: { id: assignment.id } });
      expect(dbAssignment).not.toBeNull();
      expect(dbAssignment?.active).toBe(false);
      expect(dbAssignment?.start_date?.toISOString().slice(0, 10)).toBe('2026-10-01');
      expect(dbAssignment?.end_date?.toISOString().slice(0, 10)).toBe('2026-10-22');

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'CLASS_TEACHER_ASSIGNMENT_ENDED',
          entity_type: 'class_teacher',
          entity_id: String(assignment.id),
          user_id: adminId,
        },
      });
      expect(audit).not.toBeNull();
      expect((audit?.before_data as any)?.active).toBe(true);
      expect((audit?.after_data as any)?.active).toBe(false);

      // 6. Teacher imports Excel with 2026-10-15 (inside [2026-10-01, 2026-10-22]) and 2026-10-25 (after end_date)
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Lịch dạy');
      ws.getRow(1).getCell(1).value = 'Model';
      ws.getRow(1).getCell(2).value = 'Mã HV';
      ws.getRow(1).getCell(6).value = 'Giờ học';
      ws.getRow(1).getCell(7).value = '2026-10-15';
      ws.getRow(1).getCell(8).value = '2026-10-25';

      ws.getRow(2).getCell(1).value = '1:1';
      ws.getRow(2).getCell(2).value = `HV_IMP_${NS}`;
      ws.getRow(2).getCell(6).value = '19:00 - 19:30';
      ws.getRow(2).getCell(7).value = 'X';
      ws.getRow(2).getCell(8).value = 'X';
      const xlsxBuf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

      const previewRes = await request(app)
        .post('/api/v1/attendance-reconciliation/import-excel/preview')
        .set('Authorization', `Bearer ${teacherToken}`)
        .field('source', 'TEACHER')
        .field('targetYear', '2026')
        .attach('file', xlsxBuf, 'teacher-schedule.xlsx');

      expect(previewRes.status).toBe(200);
      const items = previewRes.body.data.items as Array<{ targetDate: string; classification: string; defaultAction: string }>;
      expect(items).toHaveLength(2);
      const item15 = items.find((i) => i.targetDate === '2026-10-15')!;
      const item25 = items.find((i) => i.targetDate === '2026-10-25')!;
      expect(item15.classification).toBe('CREATE');
      expect(item15.defaultAction).toBe('APPLY');
      expect(item25.classification).toBe('OUT_OF_SCOPE');
      expect(item25.defaultAction).toBe('SKIP');

      const confirmRes = await request(app)
        .post('/api/v1/attendance-reconciliation/import-excel/confirm')
        .set('Authorization', `Bearer ${teacherToken}`)
        .field('source', 'TEACHER')
        .field('targetYear', '2026')
        .attach('file', xlsxBuf, 'teacher-schedule.xlsx');

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.data.createdAttendances).toBe(1);
      expect(confirmRes.body.data.skipped).toBe(1);

      const sessions = await prisma.classSession.findMany({ where: { class_id: cls.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_date.toISOString().slice(0, 10)).toBe('2026-10-15');
    } finally {
      await prisma.attendance.deleteMany({ where: { class_session: { class_id: cls.id } } });
      await prisma.classSession.deleteMany({ where: { class_id: cls.id } });
      await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: importEnrollment.id } });
      await prisma.enrollment.deleteMany({ where: { id: importEnrollment.id } });
      await prisma.student.deleteMany({ where: { id: importStudent.id } });
    }
  });
});
