// INTEGRATION (care-group sync data-loss fix, owner ruling 2026-10-26):
// The former syncAndMatchCareGroups orphan sweep — an UNSCOPED
// prisma.zaloContactRelation.deleteMany whose OR branches matched
// (zalo_group_id:null AND friend_zalo_uid:null AND display_name:null) rows and
// archived-account rows — could silently delete freshly created FRIEND
// relations whose metadata had not been backfilled yet when a concurrent
// sync (login / webhook / health-check / import-approval) ran. That was a
// CODE-CONFIRMED data-loss hazard (NOT an observed production loss).
//
// This test pins the NEW contract against the real test DB
// (automation_cskh_test via .env.test):
//   1. FRIEND relations with the three-null metadata shape (same student AND
//      different student, like the historic cross-suite collision shape) and a
//      relation on an ARCHIVED account are created.
//   2. syncAndMatchCareGroups is run CONCURRENTLY twice (the race that used to
//      delete such rows mid-sync).
//   3. Assert: zero deletions — every fixture relation still exists, unchanged
//      (still FRIEND, still null metadata), and the archived-account relation
//      survives too.
// No app server, cron, workers, or external channels are started; the sync is
// invoked directly with refreshLiveGroups:false (no Zalo/LINE SDK use) and
// silent:true (no socket emits; getIo() is null in tests anyway).
//
// Fixtures namespaced `_cgfix_20261026`, removed in afterAll with
// children-before-users teardown (relations -> zalo accounts -> students ->
// user), honoring RESTRICT FKs (pattern: attendance/__tests__/
// no-send-import.acceptance.integration.test.ts). Only rows THIS test creates
// are deleted.

import { prisma } from '../../../prisma/client';
import { syncAndMatchCareGroups } from '../student-care-group-matcher.service';
import { ZaloAccountStatus, ZaloContactRelationStatus } from '@prisma/client';

const NS = 'cgfix_20261026';

describe('care-group sync never deletes relations (owner ruling 2026-10-26)', () => {
  let csUserId = 0;
  let accountIdActive = 0;
  let accountIdArchived = 0;
  let studentAId = 0;
  let studentBId = 0;
  const relationIds: number[] = [];

  beforeAll(async () => {
    // Pre-clean leftovers from an interrupted previous run (only own namespace).
    const staleStudents = await prisma.student.findMany({
      where: { external_id: { in: [`HVA_${NS}`, `HVB_${NS}`] } },
      select: { id: true },
    });
    if (staleStudents.length > 0) {
      const staleIds = staleStudents.map((s) => s.id);
      await prisma.zaloContactRelation.deleteMany({ where: { student_id: { in: staleIds } } });
      await prisma.student.deleteMany({ where: { id: { in: staleIds } } });
    }
    await prisma.zaloAccount.deleteMany({
      where: { zalo_uid: { in: [`zalo_${NS}_a`, `zalo_${NS}_b`] } },
    });
    await prisma.user.deleteMany({ where: { email: `cs_${NS}@example.com` } });

    // Unique non-CVHT code so ensureAllCsUsersHaveCodes() leaves it alone and
    // cannot assign it a sequential CVHT number.
    const cs = await prisma.user.create({
      data: {
        email: `cs_${NS}@example.com`,
        name: `CG Fix CS ${NS}`,
        password_hash: 'x',
        roles: ['CS'],
        code: `X_${NS}`,
      },
    });
    csUserId = cs.id;

    const active = await prisma.zaloAccount.create({
      data: {
        cs_id: csUserId,
        zalo_uid: `zalo_${NS}_a`,
        display_name: `CG Fix Active ${NS}`,
        status: ZaloAccountStatus.ACTIVE,
      },
    });
    accountIdActive = active.id;

    const archived = await prisma.zaloAccount.create({
      data: {
        cs_id: csUserId,
        zalo_uid: `zalo_${NS}_b`,
        display_name: `CG Fix Archived ${NS}`,
        status: ZaloAccountStatus.DISABLED,
        archived_at: new Date('2026-10-01T00:00:00Z'),
      },
    });
    accountIdArchived = archived.id;

    const studentA = await prisma.student.create({
      data: { external_id: `HVA_${NS}`, full_name: `CG Fix Learner A ${NS}` },
    });
    const studentB = await prisma.student.create({
      data: { external_id: `HVB_${NS}`, full_name: `CG Fix Learner B ${NS}` },
    });
    studentAId = studentA.id;
    studentBId = studentB.id;

    // Three-null metadata FRIEND relations — the exact shape the old sweep
    // deleted (freshly created, not yet backfilled). Same student + different
    // student, plus one on the archived account (old sweep's second OR branch).
    const r1 = await prisma.zaloContactRelation.create({
      data: {
        student_id: studentAId,
        zalo_account_id: accountIdActive,
        relation_status: ZaloContactRelationStatus.FRIEND,
        target_type: 'USER',
        // zalo_group_id / friend_zalo_uid / display_name stay null
      },
    });
    const r2 = await prisma.zaloContactRelation.create({
      data: {
        student_id: studentBId,
        zalo_account_id: accountIdActive,
        relation_status: ZaloContactRelationStatus.FRIEND,
        target_type: 'USER',
      },
    });
    const r3 = await prisma.zaloContactRelation.create({
      data: {
        student_id: studentAId,
        zalo_account_id: accountIdArchived,
        relation_status: ZaloContactRelationStatus.FRIEND,
        target_type: 'USER',
      },
    });
    relationIds.push(r1.id, r2.id, r3.id);
  });

  afterAll(async () => {
    // Children before parents, honoring RESTRICT FKs; only own fixture rows.
    if (relationIds.length > 0) {
      await prisma.zaloContactRelation.deleteMany({ where: { id: { in: relationIds } } });
    }
    const accountIds = [accountIdActive, accountIdArchived].filter((n) => n > 0);
    if (accountIds.length > 0) {
      await prisma.zaloGroup.deleteMany({ where: { zalo_account_id: { in: accountIds } } });
      await prisma.zaloAccount.deleteMany({ where: { id: { in: accountIds } } });
    }
    const studentIds = [studentAId, studentBId].filter((n) => n > 0);
    if (studentIds.length > 0) {
      await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    }
    if (csUserId > 0) {
      await prisma.user.deleteMany({ where: { id: csUserId } });
    }
  });

  it('concurrent sync runs keep three-null-metadata and archived-account FRIEND relations (zero deletions)', async () => {
    // Two concurrent syncs — the race shape that used to delete these rows.
    // Scoped to our students so the matcher's heavy includes stay bounded;
    // refreshLiveGroups:false keeps Zalo/LINE SDKs untouched; silent:true
    // avoids socket emits.
    const reports = await Promise.all([
      syncAndMatchCareGroups({
        triggeredBy: 'manual',
        studentIds: [studentAId, studentBId],
        refreshLiveGroups: false,
        silent: true,
      }),
      syncAndMatchCareGroups({
        triggeredBy: 'manual',
        studentIds: [studentAId, studentBId],
        refreshLiveGroups: false,
        silent: true,
      }),
    ]);

    for (const report of reports) {
      expect(report.totalEligibleStudents).toBe(2);
    }

    // NEW CONTRACT: every fixture relation survives, unchanged.
    const survivors = await prisma.zaloContactRelation.findMany({
      where: { id: { in: relationIds } },
    });
    expect(survivors).toHaveLength(3);

    const byId = new Map(survivors.map((r) => [r.id, r]));
    for (const id of relationIds) {
      const rel = byId.get(id);
      expect(rel).toBeDefined();
      expect(rel!.relation_status).toBe(ZaloContactRelationStatus.FRIEND);
      expect(rel!.zalo_group_id).toBeNull();
      expect(rel!.friend_zalo_uid).toBeNull();
      expect(rel!.display_name).toBeNull();
    }

    // The archived-account relation specifically survived (old second OR
    // branch would have deleted it).
    const archivedRel = byId.get(relationIds[2]);
    expect(archivedRel!.zalo_account_id).toBe(accountIdArchived);

    // And the accounts themselves are still linked (no cascade happened).
    expect(
      await prisma.zaloContactRelation.count({ where: { student_id: studentAId } }),
    ).toBe(2);
    expect(
      await prisma.zaloContactRelation.count({ where: { student_id: studentBId } }),
    ).toBe(1);
  });
});
