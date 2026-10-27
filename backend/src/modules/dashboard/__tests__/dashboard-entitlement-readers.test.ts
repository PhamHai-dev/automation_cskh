/**
 * C.4 + E.3 focused regression tests — dashboard readers unified with the
 * merged enrollment entitlement calculator (enrollment-entitlement.ts).
 *
 * Mock-only (fake Prisma client injected via the repository constructor;
 * broadcast service module mocked). No database, no app server.
 *
 * Invariants under test:
 *  - FINAL consuming rows = MATCHED/RESOLVED with status ATTENDED or
 *    ABSENT_UNAPPROVED_C; deleted and provisional rows never count.
 *  - Two FINAL rows on the SAME session date count 2 (no per-date collapse).
 *  - Milestone BASIS stays (count >= session_number); only WHICH ROWS COUNT
 *    changed.
 *  - broadcast template var `remaining_sessions`: computed value comes from
 *    the calculator (unclamped), external/opening balance keeps EXISTING
 *    external-first precedence (precedence flip awaits owner policy).
 */

import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import { DashboardRepository } from '../dashboard.repository';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    enrollment: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    careMilestoneConfig: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  },
}));

jest.mock('../../zalo/zalo-pool', () => ({
  zaloPool: { getApi: jest.fn(), tryReconnect: jest.fn() },
}));
jest.mock('../../zalo/zalo-rate-limiter', () => ({
  zaloRateLimiter: {
    checkLimits: jest.fn().mockResolvedValue({ allowed: true }),
    recordSend: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../../shared/realtime/socket-singleton', () => ({
  getIo: jest.fn(() => ({ emit: jest.fn() })),
}));

import { broadcastService } from '../../automation/broadcast.service';

// ---------------------------------------------------------------------------
//  Fixtures
// ---------------------------------------------------------------------------

const finalRow = (
  status: AttendanceStatus = AttendanceStatus.ATTENDED,
  deleted = false,
): any => ({
  status,
  reconciliation_state: ReconciliationState.MATCHED,
  deleted_at: deleted ? new Date('2026-10-01T00:00:00.000Z') : null,
});

const resolvedRow = (status: AttendanceStatus = AttendanceStatus.ATTENDED): any => ({
  status,
  reconciliation_state: ReconciliationState.RESOLVED,
  deleted_at: null,
});

const pendingRow = (
  status: AttendanceStatus = AttendanceStatus.ATTENDED,
): any => ({
  status,
  reconciliation_state: ReconciliationState.PENDING_CS,
  deleted_at: null,
});

const makeRepo = (db: any): DashboardRepository => new DashboardRepository(db as never);

// ---------------------------------------------------------------------------
//  dashboard.repository.countNearCompletion
// ---------------------------------------------------------------------------

describe('C.4 dashboard.countNearCompletion uses consuming-final-not-deleted predicate', () => {
  it('counts two same-day FINAL rows as 2 consumed (no per-date collapse)', async () => {
    // total 10, two same-day ATTENDED MATCHED rows → consumed 2 → remaining 8 (<=10 → near)
    // Old behavior counted ec.attendance.length too (=2) here, but a same-day
    // provisional or deleted row was also counted; the predicate path is what
    // the sheet/export readers must agree with, so assert exact consumed value.
    const db = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            total_sessions: 10,
            enrollment_classes: [
              { attendance: [finalRow(), finalRow()] },
            ],
          },
        ]),
      },
    };
    const repo = makeRepo(db);
    await expect(repo.countNearCompletion(null, {})).resolves.toBe(1);
  });

  it('excludes deleted and non-FINAL rows from the consumed count', async () => {
    // total 10; only 2 FINAL consuming rows; deleted-final + pending + A/B/D/E
    // rows must not count. consumed=2 → remaining=8 → near completion (1 enrollment).
    // A second enrollment whose FINAL rows are ALL deleted/pending must show
    // remaining=10 (>10 threshold excludes it) — proving exclusions are applied.
    const db = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            total_sessions: 10,
            enrollment_classes: [
              {
                attendance: [
                  finalRow(),
                  resolvedRow(AttendanceStatus.ABSENT_UNAPPROVED_C),
                  finalRow(AttendanceStatus.ATTENDED, true), // deleted → excluded
                  pendingRow(), // provisional → excluded
                  finalRow(AttendanceStatus.LEAVE_B), // non-consuming → excluded
                ],
              },
            ],
          },
          {
            id: 2,
            total_sessions: 12,
            enrollment_classes: [
              { attendance: [pendingRow(), finalRow(AttendanceStatus.ATTENDED, true)] },
            ],
          },
        ]),
      },
    };
    const repo = makeRepo(db);
    // enrollment 1: consumed 2 → remaining 8 → near. enrollment 2: consumed 0 → remaining 12 → not near.
    await expect(repo.countNearCompletion(null, {})).resolves.toBe(1);
  });

  it('never clamps: over-consumed enrollments (negative remaining) are NOT counted near-completion', async () => {
    const db = {
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            total_sessions: 2,
            enrollment_classes: [
              { attendance: [finalRow(), finalRow(), resolvedRow()] },
            ],
          },
        ]),
      },
    };
    const repo = makeRepo(db);
    // consumed 3 → remaining -1 → `remaining >= 0` guard keeps the existing
    // near-completion semantics; -1 must not wrap into the 0..10 band.
    await expect(repo.countNearCompletion(null, {})).resolves.toBe(0);
  });
});

// ---------------------------------------------------------------------------
//  dashboard.repository.getMilestoneCoverage
// ---------------------------------------------------------------------------

describe('D1/C.4 dashboard.getMilestoneCoverage counts only FINAL personal ATTENDED rows (K7)', () => {
  const milestonesDb = (enrollments: any[]) => ({
    careMilestoneConfig: {
      findMany: jest.fn().mockResolvedValue([{ session_number: 2 }]),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue(enrollments) },
  });

  it('two same-day FINAL rows reach milestone 2 (each row counts)', async () => {
    const db = milestonesDb([
      {
        id: 1,
        enrollment_classes: [{ attendance: [finalRow(), finalRow()] }],
        care_logs: [{ after_session_number: 2 }],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage).toHaveLength(1);
    expect(coverage[0].reached).toBe(1);
    expect(coverage[0].covered).toBe(1);
  });

  it('deleted + provisional rows do not reach the milestone', async () => {
    const db = milestonesDb([
      {
        id: 1,
        enrollment_classes: [
          {
            attendance: [
              finalRow(AttendanceStatus.ATTENDED, true),
              pendingRow(),
              pendingRow(AttendanceStatus.ABSENT_UNAPPROVED_C),
            ],
          },
        ],
        care_logs: [],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage[0].reached).toBe(0);
    expect(coverage[0].covered).toBe(0);
    expect(coverage[0].coverage_pct).toBe(0);
  });

  it('D1 (K7): a FINAL ABSENT_UNAPPROVED_C does NOT advance the care milestone (C ≠ attended)', async () => {
    // K7 milestone basis is personal ATTENDED finals only. A C row consumes
    // entitlement (K5) but must not push the care milestone; here 1 ATTENDED +
    // 1 C final = 1 attended for the milestone → below milestone 2.
    const db = milestonesDb([
      {
        id: 1,
        enrollment_classes: [
          {
            attendance: [
              finalRow(AttendanceStatus.ATTENDED),
              finalRow(AttendanceStatus.ABSENT_UNAPPROVED_C),
            ],
          },
        ],
        care_logs: [{ after_session_number: 2 }],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage[0].reached).toBe(0);
    expect(coverage[0].covered).toBe(0);
  });

  it('external/opening balances never alter the reached count', async () => {
    // Enrollment carries attended_previous_years / external_remaining_sessions;
    // the milestone reader is computed-only, so 0 FINAL rows must still not
    // reach the milestone despite a large external balance.
    const db = milestonesDb([
      {
        id: 1,
        total_sessions: 50,
        attended_previous_years: 40,
        external_remaining_sessions: 38,
        enrollment_classes: [{ attendance: [] }],
        care_logs: [],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage[0].reached).toBe(0);
  });

  it('D1 (K7 care milestone): FINAL C consumes entitlement but does NOT advance the care milestone', async () => {
    // One ATTENDED final + one ABSENT_UNAPPROVED_C final → consumed (K5) = 2
    // which WOULD reach milestone 2 under the old merged basis, but care
    // milestone (K7) counts ATTENDED finals only = 1 → not reached.
    // This pins the approved K7 ≠ K5 invariant.
    const db = milestonesDb([
      {
        id: 1,
        enrollment_classes: [
          { attendance: [finalRow(AttendanceStatus.ATTENDED), resolvedRow(AttendanceStatus.ABSENT_UNAPPROVED_C)] },
        ],
        care_logs: [{ after_session_number: 2 }],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage[0].reached).toBe(0);
    expect(coverage[0].covered).toBe(0);
  });

  it('D1: two same-day FINAL ATTENDED rows still reach milestone 2 (C never inflates, ATTENDED counts each row)', async () => {
    const db = milestonesDb([
      {
        id: 1,
        enrollment_classes: [
          { attendance: [finalRow(AttendanceStatus.ATTENDED), finalRow(AttendanceStatus.ATTENDED)] },
        ],
        care_logs: [],
      },
    ]);
    const repo = makeRepo(db);
    const coverage = await repo.getMilestoneCoverage(null, {});
    expect(coverage[0].reached).toBe(1);
  });
});

// ---------------------------------------------------------------------------
//  broadcast.service.extractStudentTemplateVars (E.3)
// ---------------------------------------------------------------------------

describe('E.3 broadcast remaining_sessions computed via entitlement calculator', () => {
  const extract = (student: any) =>
    (broadcastService as any).extractStudentTemplateVars(student);

  const studentWith = (
    attendance: any[],
    extras: Record<string, unknown> = {},
  ): any => ({
    full_name: 'Test Student',
    phone: '0900000000',
    enrollments: [
      {
        status: 'STUDYING',
        total_sessions: 10,
        attended_previous_years: 0,
        external_remaining_sessions: null,
        package: { code: 'PKG', name: 'Package' },
        cs: { name: 'CS A' },
        enrollment_classes: [
          {
            class: { class_name: 'L1', class_teachers: [{ teacher: { name: 'T' } }] },
            attendance,
          },
        ],
        ...extras,
      },
    ],
  });

  it('two same-day FINAL rows consume 2 → remaining 8', () => {
    const vars = extract(studentWith([finalRow(), finalRow()]));
    expect(vars.remaining_sessions).toBe(8);
  });

  it('deleted and non-FINAL rows are excluded', () => {
    const vars = extract(
      studentWith([
        finalRow(AttendanceStatus.ATTENDED, true),
        pendingRow(),
        finalRow(AttendanceStatus.ABSENT_APPROVED_A),
        resolvedRow(AttendanceStatus.ABSENT_UNAPPROVED_C),
      ]),
    );
    // only the RESOLVED C row consumes → remaining 9
    expect(vars.remaining_sessions).toBe(9);
  });

  it('computed remaining is NOT clamped (overshoot surfaces as negative nợ buổi)', () => {
    const vars = extract(
      studentWith([finalRow(), finalRow(), finalRow()], { total_sessions: 2 }),
    );
    expect(vars.remaining_sessions).toBe(-1);
  });

  it('external balance keeps existing precedence and never alters the computed value', () => {
    // Precedence (external-first) is the current display contract; flipping it
    // awaits the owner policy decision. A non-null external must win over the
    // calculator value…
    const vars = extract(studentWith([finalRow(), finalRow()], { external_remaining_sessions: 3 }));
    expect(vars.remaining_sessions).toBe(3);
    // …and a null external falls through to the calculator (NOT to the raw
    // total_sessions fallback that ignored consumed rows before E.3).
    const varsNoExt = extract(studentWith([finalRow(), finalRow()], { external_remaining_sessions: null }));
    expect(varsNoExt.remaining_sessions).toBe(8);
  });

  it('no enrollment at all → empty value (unchanged guard)', () => {
    const vars = extract({ full_name: 'X', phone: '', enrollments: [] });
    expect(vars.remaining_sessions).toBe('');
  });
});
