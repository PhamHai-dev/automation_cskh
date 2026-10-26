// ACCEPTANCE (E.5, gate before merge): concurrent approvals of the SAME
// import-batch create-request version must yield exactly one 2xx and one 409,
// with NO duplicate child data and exactly one approval audit row.
// Production mechanism: imports approval claims via a version+PENDING
// updateMany predicate inside the approval transaction; count===0 -> 409 and
// the whole transaction (incl. audit/child writes) rolls back
// (backend/src/modules/imports/imports.service.ts approveCreateRequest; unit
// semantics pinned in create-request-cas.unit.test.ts).
//
// NOTE on lane choice: BOTH lanes are now asserted under true concurrency.
// Since the 2026-10-26 restructure, the create lane claims the request-row CAS
// (status+version updateMany) as the FIRST write inside the approval
// transaction, before materializing any student/enrollment/class children, so
// a concurrent loser gets 409 (not a P2002/500 surfacing off the unique
// Student insert). The cross-request race that still cannot be front-ordered —
// two DIFFERENT requests for the same new external_id — is precisely mapped:
// P2002 on students.external_id => 409 with reload guidance; every other P2002
// remains 500 so real data bugs stay visible (imports.service.ts
// approveCreateRequest).
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
  // Create-lane student (must not exist before approval) — sequential replay.
  const EXT_CREATE = 'HV_ACC_CAS_CREATE_20261025';
  // Create-lane student for true concurrent same-request race (owner item #2).
  const EXT_CREATE_RACE = 'HV_ACC_CAS_CREATE_RACE_20261026';
  const CLASS_CREATE_RACE = 'CLS_ACC_CAS_CREATE_RACE_20261026';
  // Create-lane student for cross-request race (two distinct requests, same new external_id).
  const EXT_CROSS_REQ = 'HV_ACC_CAS_CROSS_REQ_20261026';
  // Create-lane student where approve loses to a concurrent version bump/reject -> literally ZERO child rows.
  const EXT_LOSER_ZERO = 'HV_ACC_CAS_LOSER_ZERO_20261026';
  const CLASS_LOSER_ZERO = 'CLS_ACC_CAS_LOSER_ZERO_20261026';

  let adminAId: number, adminBId: number, csId: number;
  let adminAToken: string, adminBToken: string;
  let batchId: number, batchBId: number, packageId: number;
  let transferRequestId: number, createRequestId: number;
  let createRaceRequestId: number;
  let crossReqAId: number, crossReqBId: number;
  let loserZeroRequestId: number;
  let transferEnrollmentId: number;

  const ALL_EXTS = [EXT_TRANSFER, EXT_CREATE, EXT_CREATE_RACE, EXT_CROSS_REQ, EXT_LOSER_ZERO];
  const ALL_EMAILS = [EMAIL_A, EMAIL_B, EMAIL_CS];

  async function cleanupFixtures() {
    // Children of the fixture users first (audit_logs / enrollments /
    // import_batches / import_create_requests are all RESTRICT toward users).
    for (const ext of ALL_EXTS) {
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
      await prisma.zaloContactRelation.deleteMany({
        where: { student: { external_id: ext } },
      });
      await prisma.lineContactRelation.deleteMany({
        where: { student: { external_id: ext } },
      });
      await prisma.enrollment.deleteMany({
        where: { student: { external_id: ext } },
      });
      await prisma.student.deleteMany({ where: { external_id: ext } });
    }
    await prisma.class.deleteMany({ where: { class_name: { in: [CLASS_CREATE_RACE, CLASS_LOSER_ZERO] } } });
    await prisma.importCreateRequest.deleteMany({
      where: { external_id: { in: ALL_EXTS } },
    });
    const fixtureUsers = await prisma.user.findMany({
      where: { email: { in: ALL_EMAILS } },
      select: { id: true },
    });
    const userIds = fixtureUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.importRow.deleteMany({ where: { import_batch: { uploaded_by_id: { in: userIds } } } });
      await prisma.importBatch.deleteMany({ where: { uploaded_by_id: { in: userIds } } });
      await prisma.authSession.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.package.deleteMany({ where: { code: PKG_CODE } });
  }

  async function makeCreateRequest(
    externalId: string,
    extraSnapshot: Record<string, unknown> = {},
    overrideBatchId?: number,
  ): Promise<number> {
    const created = await prisma.importCreateRequest.create({
      data: {
        import_batch_id: overrideBatchId ?? batchId,
        requested_by_id: adminAId,
        assigned_cs_id: csId,
        external_id: externalId,
        package_code: PKG_CODE,
        snapshot: { full_name: `ACC CAS Learner ${externalId}`, total_sessions: 10, ...extraSnapshot } as any,
        version: 1,
        status: ImportCreateRequestStatus.PENDING,
      },
    });
    return created.id;
  }

  beforeAll(async () => {
    await cleanupFixtures();

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

    const batchB = await prisma.importBatch.create({
      data: {
        uploaded_by_id: adminBId,
        file_name: 'acc-cas-b-20261026.xlsx',
        import_type: ImportType.STUDENT_ENROLLMENT,
      },
    });
    batchBId = batchB.id;

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
    createRaceRequestId = await makeCreateRequest(EXT_CREATE_RACE, {
      class_name: CLASS_CREATE_RACE,
      class_model: '1-1',
    });
    // Cross-request race: two distinct import batches each queued a PENDING
    // create-request for the same new external_id (satisfies
    // import_create_requests_batch_ext_pkg_key while racing on
    // students.external_id UNIQUE at approval time).
    crossReqAId = await makeCreateRequest(EXT_CROSS_REQ, {}, batchId);
    crossReqBId = await makeCreateRequest(EXT_CROSS_REQ, {}, batchBId);
    loserZeroRequestId = await makeCreateRequest(EXT_LOSER_ZERO, {
      class_name: CLASS_LOSER_ZERO,
      class_model: '1-1',
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
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

  it('create lane under TRUE concurrency (same request): one 2xx, one 409, loser leaves no children, one audit', async () => {
    // Owner item #2 regression: before the CAS-claim-first restructure, the
    // loser of this race surfaced P2002/500 from the unique Student insert
    // after racing past its pre-read. Now both reviewers lock the SAME
    // request row first (updateMany predicate on status+version), so the
    // loser blocks, then matches 0 rows -> 409 before creating anything.
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/imports/create-requests/${createRaceRequestId}/approve`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ version: 1 }),
      request(app)
        .post(`/api/v1/imports/create-requests/${createRaceRequestId}/approve`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ version: 1 }),
    ]);

    const statuses = [resA.status, resB.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const loser = resA.status === 409 ? resA : resB;
    expect(loser.body.status).toBe('error');
    expect(loser.body.message).toBe('Yêu cầu đã thay đổi, vui lòng tải lại');

    const persisted = await prisma.importCreateRequest.findUnique({ where: { id: createRaceRequestId } });
    expect(persisted?.status).toBe(ImportCreateRequestStatus.APPROVED);
    expect(persisted?.version).toBe(2);

    // Exactly one set of children: the loser's transaction never materialized
    // (or already rolled back) its student/enrollment/class writes.
    expect(await prisma.student.count({ where: { external_id: EXT_CREATE_RACE } })).toBe(1);
    expect(await prisma.enrollment.count({ where: { student: { external_id: EXT_CREATE_RACE } } })).toBe(1);
    expect(await prisma.enrollmentClass.count({
      where: { enrollment: { student: { external_id: EXT_CREATE_RACE } } },
    })).toBe(1);
    expect(await prisma.class.count({ where: { class_name: CLASS_CREATE_RACE } })).toBe(1);
    expect(await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(createRaceRequestId),
        action: 'IMPORT_REQUEST_APPROVED',
      },
    })).toBe(1);

    // Stale-version replay after settlement => 409, no new audit, no children.
    const replay = await request(app)
      .post(`/api/v1/imports/create-requests/${createRaceRequestId}/approve`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ version: 1 });
    expect(replay.status).toBe(409);
    expect(await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(createRaceRequestId),
        action: 'IMPORT_REQUEST_APPROVED',
      },
    })).toBe(1);
    expect(await prisma.student.count({ where: { external_id: EXT_CREATE_RACE } })).toBe(1);
  });

  it('create lane CROSS-REQUEST race (two requests, same new external_id): never duplicates children; if the race hits the unique Student insert, the loser gets 409 via the precise P2002 mapping and its request stays PENDING', async () => {
    // This race cannot be front-ordered by the single-row CAS claim: both
    // requests are distinct rows, so each wins its own claim, then they race
    // on students.external_id UNIQUE. imports.service.ts maps ONLY
    // P2002-on-external_id to 409 ("vừa được tạo bởi yêu cầu khác"); the
    // loser's whole transaction (claim included) rolls back, so its request
    // remains PENDING for the reviewer to re-decide after reload. Every other
    // P2002 stays a 500 so real data bugs remain visible (pinned in
    // create-request-cas.unit.test.ts).
    //
    // Timing note: if the loser's student pre-read lands AFTER the winner
    // commits, it legitimately takes the transfer branch and also returns 200
    // (re-assigning the same enrollment). The durable invariants asserted here
    // hold in both schedules; the 409 body is asserted whenever it occurs.
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/imports/create-requests/${crossReqAId}/approve`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ version: 1 }),
      request(app)
        .post(`/api/v1/imports/create-requests/${crossReqBId}/approve`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ version: 1 }),
    ]);

    const statuses = [resA.status, resB.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    const any409 = [resA, resB].find((r) => r.status === 409);
    if (any409) {
      expect(any409.body).toEqual({
        status: 'error',
        message: 'Học viên với mã này vừa được tạo bởi yêu cầu khác, vui lòng tải lại',
      });
    }

    // ONE student and exactly ONE enrollment in the package across both
    // requests regardless of schedule; no orphan/duplicate children.
    expect(await prisma.student.count({ where: { external_id: EXT_CROSS_REQ } })).toBe(1);
    expect(await prisma.enrollment.count({ where: { student: { external_id: EXT_CROSS_REQ } } })).toBe(1);
    expect(await prisma.enrollmentClass.count({
      where: { enrollment: { student: { external_id: EXT_CROSS_REQ } } },
    })).toBe(0);

    // A request that returned 409 must have rolled back its CAS claim too:
    // still PENDING at version 1 with zero approval audit.
    for (const [res, reqId] of [[resA, crossReqAId], [resB, crossReqBId]] as const) {
      if (res.status === 409) {
        const req = await prisma.importCreateRequest.findUnique({ where: { id: reqId } });
        expect(req?.status).toBe(ImportCreateRequestStatus.PENDING);
        expect(req?.version).toBe(1);
        expect(await prisma.auditLog.count({
          where: { entity_type: 'ImportCreateRequest', entity_id: String(reqId) },
        })).toBe(0);
      }
    }
  });

  it('losing create-lane approval leaves ZERO Student / Enrollment / EnrollmentClass / relation rows for its fixture marker', async () => {
    // Reviewer A rejects at version 1 while Reviewer B attempts to approve with
    // a stale version (and then replays at version 1 after rejection). Because
    // the CAS claim happens BEFORE child materialization inside the approve
    // transaction, the losing approve attempts leave literally ZERO Student,
    // Enrollment, EnrollmentClass, Class, and contact-relation rows.
    const rejectRes = await request(app)
      .post(`/api/v1/imports/create-requests/${loserZeroRequestId}/reject`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ version: 1, reason: 'Hồ sơ trùng lặp — từ chối trước' });
    expect(rejectRes.status).toBe(200);

    const [loseAttempt1, loseAttempt2] = await Promise.all([
      request(app)
        .post(`/api/v1/imports/create-requests/${loserZeroRequestId}/approve`)
        .set('Authorization', `Bearer ${adminBToken}`)
        .send({ version: 1 }),
      request(app)
        .post(`/api/v1/imports/create-requests/${loserZeroRequestId}/approve`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ version: 2 }),
    ]);

    expect(loseAttempt1.status).toBe(409);
    expect(loseAttempt1.body).toEqual({
      status: 'error',
      message: 'Yêu cầu đã thay đổi, vui lòng tải lại',
    });
    expect(loseAttempt2.status).toBe(409);
    expect(loseAttempt2.body).toEqual({
      status: 'error',
      message: 'Yêu cầu đã thay đổi, vui lòng tải lại',
    });

    // ZERO child/relation rows materialized for this fixture marker.
    expect(await prisma.student.count({ where: { external_id: EXT_LOSER_ZERO } })).toBe(0);
    expect(await prisma.enrollment.count({ where: { external_id: EXT_LOSER_ZERO } })).toBe(0);
    expect(await prisma.enrollmentClass.count({
      where: { enrollment: { external_id: EXT_LOSER_ZERO } },
    })).toBe(0);
    expect(await prisma.class.count({ where: { class_name: CLASS_LOSER_ZERO } })).toBe(0);
    expect(await prisma.zaloContactRelation.count({
      where: { student: { external_id: EXT_LOSER_ZERO } },
    })).toBe(0);
    expect(await prisma.lineContactRelation.count({
      where: { student: { external_id: EXT_LOSER_ZERO } },
    })).toBe(0);
    expect(await prisma.auditLog.count({
      where: {
        entity_type: 'ImportCreateRequest',
        entity_id: String(loserZeroRequestId),
        action: 'IMPORT_REQUEST_APPROVED',
      },
    })).toBe(0);
  });
});
