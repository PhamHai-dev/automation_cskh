// ACCEPTANCE: CareLog session upsert — PUT /enrollments/:id/sessions/:n/care-log
// (backend/src/modules/care/care.repository.ts upsertCareLogBySession).
//
// OPEN OWNER DECISION (do not read more into these pins than they say): the
// CareLog table's intended role — aggregate-per-milestone (one current record
// per enrollment+session_number, overwritten on re-save) vs per-contact
// history (append a row per contact) — is NOT yet decided by the owner. The
// interim implementation pins the AGGREGATE semantics via a Serializable
// findFirst->update/create $transaction (schema has no
// @@unique([enrollment_id, after_session_number]); adding one is a migration,
// deliberately not done). These tests only pin CURRENT behavior:
//   - a same-retry write for the same (enrollment, session_number) must not
//     duplicate a row (it refreshes the one existing row), and
//   - a deliberate write for a DIFFERENT session number persists as its own
//     row.
// They must not be silently reinterpreted as endorsing either future
// semantics.
//
// Fixtures are namespaced `_acc_carelog_20261025`, run against the configured
// .env.test database (automation_cskh_test), and are removed in afterAll
// (children before users, honoring the care_logs/cs_id RESTRICT FK edge).
// No broad email-pattern deletes.

import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { EnrollmentStatus, CareLogOutcome } from '@prisma/client';

describe('Acceptance: CareLog session upsert pins current aggregate behavior', () => {
  const EMAIL_CS = 'cs_acc_carelog_20261025@example.com';
  const EMAIL_ADMIN = 'admin_acc_carelog_20261025@example.com';
  const EXT_STUDENT = 'HV_ACC_CARELOG_20261025';
  const PKG_CODE = 'PKG_ACC_CARELOG_20261025';

  let csId: number, adminId: number, csToken: string;
  let enrollmentId: number, packageId: number, studentId: number;

  const careLogCount = () =>
    prisma.careLog.count({ where: { enrollment_id: enrollmentId } });

  beforeAll(async () => {
    const cs = await prisma.user.create({
      data: { email: EMAIL_CS, name: 'ACC CareLog CS', password_hash: 'x', roles: ['CS'] },
    });
    const admin = await prisma.user.create({
      data: { email: EMAIL_ADMIN, name: 'ACC CareLog Admin', password_hash: 'x', roles: ['ADMIN'] },
    });
    csId = cs.id; adminId = admin.id;
    csToken = signTestToken(csId, ['CS']);

    const pkg = await prisma.package.create({
      data: { code: PKG_CODE, name: 'ACC CareLog Package', default_total_sessions: 10 },
    });
    packageId = pkg.id;
    const student = await prisma.student.create({
      data: { external_id: EXT_STUDENT, full_name: 'ACC CareLog Learner' },
    });
    studentId = student.id;
    const enrollment = await prisma.enrollment.create({
      data: {
        student_id: studentId,
        package_id: packageId,
        cs_id: csId,
        total_sessions: 10,
        status: EnrollmentStatus.STUDYING,
      },
    });
    enrollmentId = enrollment.id;
  });

  afterAll(async () => {
    await prisma.careLog.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.careTask.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.attendance.deleteMany({
      where: { enrollment_class: { enrollment_id: enrollmentId } },
    });
    await prisma.enrollmentClass.deleteMany({ where: { enrollment_id: enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { id: enrollmentId } });
    await prisma.student.deleteMany({ where: { id: studentId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: [csId, adminId] } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: [csId, adminId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [csId, adminId] } } });
    await prisma.$disconnect();
  });

  it('same-retry PUT for the same (enrollment, session_number) refreshes one row and never duplicates', async () => {
    const body = { content: 'Lần gọi đầu sau buổi 1', outcome: CareLogOutcome.POSITIVE };

    const first = await request(app)
      .put(`/api/v1/enrollments/${enrollmentId}/sessions/1/care-log`)
      .set('Authorization', `Bearer ${csToken}`)
      .send(body);
    expect(first.status).toBe(200);
    const firstId = first.body.data.id;

    // Retry with the SAME payload: current contract = refresh the existing
    // aggregate row, not append.
    const retry = await request(app)
      .put(`/api/v1/enrollments/${enrollmentId}/sessions/1/care-log`)
      .set('Authorization', `Bearer ${csToken}`)
      .send(body);
    expect(retry.status).toBe(200);
    expect(retry.body.data.id).toBe(firstId);
    expect(await careLogCount()).toBe(1);

    // A deliberate different write on the SAME key persists onto the same row.
    const update = await request(app)
      .put(`/api/v1/enrollments/${enrollmentId}/sessions/1/care-log`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ content: 'Cập nhật: học viên cần hỗ trợ', outcome: CareLogOutcome.NEED_SUPPORT_SYSTEM });
    expect(update.status).toBe(200);
    expect(update.body.data.id).toBe(firstId);
    expect(update.body.data.content).toBe('Cập nhật: học viên cần hỗ trợ');
    expect(update.body.data.outcome).toBe(CareLogOutcome.NEED_SUPPORT_SYSTEM);
    expect(await careLogCount()).toBe(1);

    const persisted = await prisma.careLog.findUnique({ where: { id: firstId } });
    expect(persisted?.cs_id).toBe(csId);
    expect(persisted?.created_by_id).toBe(csId);
  });

  it('a deliberate write for a DIFFERENT session number persists as its own row', async () => {
    const session2 = await request(app)
      .put(`/api/v1/enrollments/${enrollmentId}/sessions/2/care-log`)
      .set('Authorization', `Bearer ${csToken}`)
      .send({ content: 'Chăm sóc sau buổi 2', outcome: CareLogOutcome.POSITIVE });
    expect(session2.status).toBe(200);
    expect(session2.body.data.after_session_number).toBe(2);
    expect(await careLogCount()).toBe(2);

    const rows = await prisma.careLog.findMany({
      where: { enrollment_id: enrollmentId },
      orderBy: { after_session_number: 'asc' },
    });
    expect(rows.map((r) => r.after_session_number)).toEqual([1, 2]);
  });
});
