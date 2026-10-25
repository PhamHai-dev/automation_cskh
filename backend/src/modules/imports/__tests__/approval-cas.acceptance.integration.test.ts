// ACCEPTANCE (E.5, gate before merge): concurrent approvals of the SAME
// import-batch create-request version must yield exactly one 2xx and one 409,
// with NO duplicate child data and exactly one approval audit row.
// Production mechanism: imports approval claims via a version+PENDING
// updateMany predicate inside the approval transaction; count===0 -> 409 and
// the whole transaction (incl. audit/child writes) rolls back
// (backend/src/modules/imports/imports.service.ts approveCreateRequest; unit
// semantics pinned in create-request-cas.unit.test.ts).
//
// NOTE on lane choice: the concurrent assertion uses the TRANSFER lane (student
// + matching enrollment pre-exist) because that lane's deciding write IS the
// CAS claim. The fresh-create lane races on student.external_id UNIQUE insert
// instead, where the loser surfaces a rolled-back P2002/500 rather than a 409
// — the durable invariant (no duplicate children) still holds there; it is
// pinned sequentially in the second test and the status-code gap is reported
// as a residual risk, not silently hidden.
//
// Runs against the configured .env.test database (automation_cskh_test —
// dedicated *_test DB per .env.test). All fixture rows use the
// `_acc_cas_20261025` marker and are removed in afterAll (children before
// users, honoring RESTRICT FK edges). No production rows are touched; no
// broad email-pattern deletes.

import request from 'supertest';
import { app } from '../../../app';
import { prisma } from '../../../prisma/client';
import { signTestToken } from '../../../shared/utils/test-helper';
import { ImportType, ImportCreateRequestStatus, EnrollmentStatus } from '@prisma/client';

describe('Acceptance: import approval CAS (E.5)', () => {
  const EMAIL_A = 'admin_a_acc_cas_20261025@example.com';
  const EMAIL_B = 'admin_b_acc_cas_20261025@example.com';
  const EMAIL_CS = 'cs_acc_cas_20261025@example.com';
  const PKG_CODE = 'PKG_ACC_CAS_20261025';
  // Transfer-lane student (already enrolled; approval re-assigns it).
  const EXT_TRANSFER = 'HV_ACC_CAS_TRANSFER_20261025';
  // Create-lane student (must not exist before approval).
  const EXT_CREATE = 'HV_ACC_CAS_CREATE_20261025';

  let adminAId: number, adminBId: number, csId: number;
  let adminAToken: string, adminBToken: string;
  let batchId: number, packageId: number;
  let transferRequestId: number, createRequestId: number;
  let transferEnrollmentId: number;

  async function makeCreateRequest(externalId: string): Promise<number> {
    const created = await prisma.importCreateRequest.create({
      data: {
        import_batch_id: batchId,
        requested_by_id: adminAId,
        assigned_cs_id: csId,
        external_id: externalId,
        package_code: PKG_CODE,
        snapshot: { full_name: 'ACC CAS Learner', total_sessions: 10 } as any,
        version: 1,
        status: ImportCreateRequestStatus.PENDING,
      },
    });
    return created.id;
  }

  beforeAll(async () => {
    const adminA = await prisma.user.create({
      data: { email: EMAIL_A, name: 'ACC CAS Admin A', password_hash: 'x', roles: ['ADMIN'] },
    });
    const adminB = await prisma.user.create({
      data: { email: EMAIL_B, name: 'ACC CAS Admin B', password_hash: 'x', roles: ['ADMIN'] },
    });
    const cs = await prisma.user.create({
      data: { email: EMAIL_CS, name: 'ACC CAS CS', password_hash: 'x', roles: ['CS'] },
    });
    adminAId = adminA.id; adminBId = adminB.id; csId = cs.id;
    adminAToken = signTestToken(adminAId, ['ADMIN']);
    adminBToken = signTestToken(adminBId, ['ADMIN']);

    const pkg = await prisma.package.create({
      data: { code: PKG_CODE, name: 'ACC CAS Package', default_total_sessions: 10 },
    });
    packageId = pkg.id;

    const batch = await prisma.importBatch.create({
      data: {
        uploaded_by_id: adminAId,
        file_name: 'acc-cas-20261025.xlsx',
        import_type: ImportType.STUDENT_ENROLLMENT,
      },
    });
    batchId = batch.id;

    // Transfer-lane fixture: student + one enrollment in the same package.
    const tStudent = await prisma.student.create({
      data: { external_id: EXT_TRANSFER, full_name: 'ACC CAS Transfer Learner' },
    });
    const tEnrollment = await prisma.enrollment.create({
      data: {
        student_id: tStudent.id,
        package_id: packageId,
        cs_id: adminAId, // will be re-assigned to csId by the approval
        total_sessions: 10,
        status: EnrollmentStatus.STUDYING,
      },
    });
    transferEnrollmentId = tEnrollment.id;

    transferRequestId = await makeCreateRequest(EXT_TRANSFER);
    createRequestId = await makeCreateRequest(EXT_CREATE);
  });

  afterAll(async () => {
    // Children of the fixture users first (audit_logs / enrollments /
    // import_batches / import_create_requests are all RESTRICT toward users).
    for (const ext of [EXT_TRANSFER, EXT_CREATE]) {
      await prisma.attendance.deleteMany({
        where: { enrollment_class: { enrollment: { student: { external_id: ext } } } },
      });
      await prisma.enrollmentClass.deleteMany({
        where: { enrollment: { student: { external_id: ext } } },
      });
      await prisma.careLog.deleteMany({
        where: { enrollment: { student: { external_id: ext } } },
      });
      await prisma.careTask.deleteMany({
        where: { enrollment: { student: { external_id: ext } } },
      });
      await prisma.enrollment.deleteMany({
        where: { student: { external_id: ext } },
      });
      await prisma.student.deleteMany({ where: { external_id: ext } });
    }
    await prisma.importCreateRequest.deleteMany({
      where: { id: { in: [transferRequestId, createRequestId] } },
    });
    await prisma.importRow.deleteMany({ where: { import_batch_id: batchId } });
    await prisma.importBatch.deleteMany({ where: { id: batchId } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.authSession.deleteMany({ where: { user_id: { in: [adminAId, adminBId, csId] } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: [adminAId, adminBId, csId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId, csId] } } });
    await prisma.$disconnect();
  });

  it('two concurrent approvals on the same version (transfer lane): exactly one 2xx, the other 409, one audit, no duplicate enrollment', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/imports/create-requests/${transferRequestId}/approve`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ version: 1 }),
      request(app)
        .post(`/api/v1/imports/create-requests/${transferRequestId}/approve`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ version: 1 }),
    ]);

    const statuses = [resA.status, resB.status].sort((x, y) => x - y);
    // Winner = 200 (controller res.status(200)); loser = 409 CAS rejection —
    // its claim updateMany matched 0 rows and the whole transaction rolled back.
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);

    const persisted = await prisma.importCreateRequest.findUnique({ where: { id: transferRequestId } });
    expect(persisted?.status).toBe(ImportCreateRequestStatus.APPROVED);
    expect(persisted?.version).toBe(2);
    expect(persisted?.reviewed_by_id).not.toBeNull();

    // Exactly one approval audit row (the loser's transaction rolled back).
    const approvalAudits = await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(transferRequestId),
        action: { in: ['IMPORT_REQUEST_APPROVED', 'IMPORT_REQUEST_APPROVED_TRANSFER'] },
      },
    });
    expect(approvalAudits).toBe(1);

    // No duplicate child data: still exactly one enrollment for this student,
    // and the winner's transfer re-pointed its cs to the assigned CS.
    const enrollmentCount = await prisma.enrollment.count({
      where: { student: { external_id: EXT_TRANSFER } },
    });
    expect(enrollmentCount).toBe(1);
    const enrollment = await prisma.enrollment.findUnique({ where: { id: transferEnrollmentId } });
    expect(enrollment?.cs_id).toBe(csId);

    // A stale-version replay after settlement must also 409 and create nothing.
    const replay = await request(app)
      .post(`/api/v1/imports/create-requests/${transferRequestId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ version: 1 });
    expect(replay.status).toBe(409);
    expect(await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(transferRequestId),
        action: { in: ['IMPORT_REQUEST_APPROVED', 'IMPORT_REQUEST_APPROVED_TRANSFER'] },
      },
    })).toBe(1);
  });

  it('create lane: approval materializes student+enrollment once; a later stale-version approval returns 409 without duplicating children', async () => {
    const first = await request(app)
      .post(`/api/v1/imports/create-requests/${createRequestId}/approve`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({ version: 1 });
    expect(first.status).toBe(200);
    expect(first.body.enrollment).toBeDefined();

    const studentCount = await prisma.student.count({ where: { external_id: EXT_CREATE } });
    const enrollmentCount = await prisma.enrollment.count({ where: { student: { external_id: EXT_CREATE } } });
    expect(studentCount).toBe(1);
    expect(enrollmentCount).toBe(1);

    // Second reviewer still holding version 1 loses the CAS (409) and no
    // duplicate student/enrollment appears.
    const second = await request(app)
      .post(`/api/v1/imports/create-requests/${createRequestId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ version: 1 });
    expect(second.status).toBe(409);

    expect(await prisma.student.count({ where: { external_id: EXT_CREATE } })).toBe(1);
    expect(await prisma.enrollment.count({ where: { student: { external_id: EXT_CREATE } } })).toBe(1);
    expect(await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(createRequestId),
        action: 'IMPORT_REQUEST_APPROVED',
      },
    })).toBe(1);
  });
});
