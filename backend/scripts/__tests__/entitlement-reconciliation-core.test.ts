/**
 * Mock-only unit test for the PURE row-derivation used by the D10
 * entitlement-reconciliation export (scripts/entitlement-reconciliation.core.ts).
 *
 * No DB: every row is an in-memory fixture. Verifies:
 *  - consumed / remaining come from the canonical calculator (incl. UNCLAMPED
 *    negative remaining),
 *  - delta + flip classification vs external_remaining_sessions,
 *  - risk flags (OPENING_BALANCE / HISTORY_INCOMPLETE / DIVERGES /
 *    NON_ACTIVE_STATUS / NO_EXTERNAL),
 *  - |delta| sorting and worst-10,
 *  - broadcast per-student enrollment selection (active-first, fallback newest)
 *    and the summary's "would change" count (selected rows only),
 *  - hand-rolled CSV escaping.
 */

import {
  AttendanceStatus,
  EnrollmentStatus,
  ReconciliationState,
} from '@prisma/client';
import {
  applyBroadcastSelection,
  compareByAbsDeltaDesc,
  computeBroadcastSelectedIds,
  csvEscape,
  csvRowsFor,
  deriveReconciliationRow,
  selectBroadcastOrder,
  summarizeRows,
  worstByAbsDelta,
  type ReconAttendanceInput,
  type ReconEnrollmentRow,
  type ReconThresholds,
} from '../entitlement-reconciliation.core';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const THRESHOLDS: ReconThresholds = { staleExternalSyncDays: 30, now: NOW };

const finalAttended = (): ReconAttendanceInput => ({
  status: AttendanceStatus.ATTENDED,
  reconciliation_state: ReconciliationState.MATCHED,
});
const finalC = (): ReconAttendanceInput => ({
  status: AttendanceStatus.ABSENT_UNAPPROVED_C,
  reconciliation_state: ReconciliationState.RESOLVED,
});
const finalApprovedA = (): ReconAttendanceInput => ({
  status: AttendanceStatus.ABSENT_APPROVED_A,
  reconciliation_state: ReconciliationState.MATCHED,
});
const pendingAttended = (): ReconAttendanceInput => ({
  status: AttendanceStatus.ATTENDED,
  reconciliation_state: ReconciliationState.PENDING_CS,
});
const deletedFinal = (): ReconAttendanceInput => ({
  status: AttendanceStatus.ATTENDED,
  reconciliation_state: ReconciliationState.MATCHED,
  deleted_at: new Date('2026-10-01'),
});

function row(overrides: Partial<ReconEnrollmentRow> & Pick<ReconEnrollmentRow, 'id'>): ReconEnrollmentRow {
  return {
    status: EnrollmentStatus.STUDYING,
    updated_at: new Date('2026-10-20'),
    student_id: overrides.id, // 1:1 default unless overridden
    student_code: `HV${overrides.id}`,
    total_sessions: 10,
    attended_previous_years: 0,
    external_remaining_sessions: null,
    external_synced_at: null,
    enrollment_classes: [],
    ...overrides,
  };
}

describe('deriveReconciliationRow — canonical calculator passthrough', () => {
  it('consumed/remaining match the calculator: FINAL ATTENDED/C count, PENDING and A do not, deleted excluded', () => {
    const d = deriveReconciliationRow(
      row({
        id: 1,
        total_sessions: 10,
        enrollment_classes: [
          {
            id: 100,
            attendance: [
              finalAttended(),
              finalAttended(),
              finalC(),
              finalApprovedA(), // FINAL but not consuming
              pendingAttended(), // consuming status but not FINAL
              deletedFinal(), // FINAL consuming but soft-deleted
            ],
          },
        ],
      }),
      THRESHOLDS,
    );
    expect(d.consumedComputed).toBe(3);
    expect(d.remainingComputed).toBe(7);
    // Diagnostics: raw=6, final non-deleted=4 (2A? no: 2 attended + C + A =4), deleted=1, pending excluded from final
    expect(d.rawAttendanceRowCount).toBe(6);
    expect(d.finalRowCount).toBe(4);
    expect(d.deletedRowCount).toBe(1);
  });

  it('remaining is UNCLAMPED: over-consumption yields negative remaining + no clamp', () => {
    const d = deriveReconciliationRow(
      row({
        id: 2,
        total_sessions: 5,
        enrollment_classes: [{ id: 200, attendance: [finalAttended(), finalAttended(), finalC(), finalAttended(), finalAttended(), finalC()] }],
      }),
      THRESHOLDS,
    );
    expect(d.consumedComputed).toBe(6);
    expect(d.remainingComputed).toBe(-1);
  });
});

describe('deriveReconciliationRow — delta, flip, display', () => {
  it('delta = computed − external; FLIP yes iff external set and differs', () => {
    const same = deriveReconciliationRow(
      row({ id: 3, external_remaining_sessions: 8, external_synced_at: NOW }),
      THRESHOLDS,
    );
    expect(same.delta).toBe(2); // computed 10 − external 8
    expect(same.changesIfFlippedThisEnrollment).toBe(true);
    expect(same.currentBroadcastDisplay).toBe('8');
    expect(same.riskFlags).toContain('DIVERGES');
    expect(same.riskFlags).toContain('OPENING_BALANCE');

    const equal = deriveReconciliationRow(
      row({ id: 4, external_remaining_sessions: 10, external_synced_at: NOW }),
      THRESHOLDS,
    );
    expect(equal.delta).toBe(0);
    expect(equal.changesIfFlippedThisEnrollment).toBe(false);
    expect(equal.riskFlags).not.toContain('DIVERGES');
    // External present but synced NOW → not stale; zero attendance rows total → no incomplete flag
    expect(equal.riskFlags).not.toContain('HISTORY_INCOMPLETE');
  });

  it('external null → NO_EXTERNAL, delta null, display falls through to computed', () => {
    const d = deriveReconciliationRow(row({ id: 5 }), THRESHOLDS);
    expect(d.delta).toBeNull();
    expect(d.currentBroadcastDisplay).toBe('10');
    expect(d.changesIfFlippedThisEnrollment).toBe(false);
    expect(d.riskFlags).toContain('NO_EXTERNAL');
    expect(d.riskFlags).not.toContain('OPENING_BALANCE');
  });
});

describe('deriveReconciliationRow — history-incomplete flags', () => {
  it('stale external_synced_at (older than threshold) while external is set', () => {
    const d = deriveReconciliationRow(
      row({ id: 6, external_remaining_sessions: 4, external_synced_at: new Date('2026-01-01') }),
      THRESHOLDS,
    );
    expect(d.riskFlags).toContain('HISTORY_INCOMPLETE');
  });

  it('external value set but external_synced_at null', () => {
    const d = deriveReconciliationRow(
      row({ id: 7, external_remaining_sessions: 4, external_synced_at: null }),
      THRESHOLDS,
    );
    expect(d.riskFlags).toContain('HISTORY_INCOMPLETE');
  });

  it('zero FINAL rows but nonzero attendance rows', () => {
    const d = deriveReconciliationRow(
      row({ id: 8, enrollment_classes: [{ id: 800, attendance: [pendingAttended()] }] }),
      THRESHOLDS,
    );
    expect(d.finalRowCount).toBe(0);
    expect(d.riskFlags).toContain('HISTORY_INCOMPLETE');
  });

  it('deleted rows or mixed-state FINAL rows flag incomplete history', () => {
    const withDeleted = deriveReconciliationRow(
      row({ id: 9, enrollment_classes: [{ id: 900, attendance: [finalAttended(), deletedFinal()] }] }),
      THRESHOLDS,
    );
    expect(withDeleted.riskFlags).toContain('HISTORY_INCOMPLETE');

    const mixed = deriveReconciliationRow(
      row({
        id: 10,
        enrollment_classes: [
          {
            id: 1000,
            attendance: [
              {
                status: AttendanceStatus.ATTENDED,
                reconciliation_state: ReconciliationState.MATCHED,
                teacher_status: AttendanceStatus.ABSENT_APPROVED_A,
                cs_status: AttendanceStatus.ATTENDED,
              },
            ],
          },
        ],
      }),
      THRESHOLDS,
    );
    expect(mixed.mixedStateRowCount).toBe(1);
    expect(mixed.riskFlags).toContain('HISTORY_INCOMPLETE');
    // Calculator deliberately ignores per-side columns: still consumed via final status
    expect(mixed.consumedComputed).toBe(1);
  });

  it('NON_ACTIVE_STATUS only for statuses outside broadcast active list', () => {
    const finished = deriveReconciliationRow(
      row({ id: 11, status: EnrollmentStatus.FINISHED }),
      THRESHOLDS,
    );
    expect(finished.riskFlags).toContain('NON_ACTIVE_STATUS');
    const studying = deriveReconciliationRow(row({ id: 12 }), THRESHOLDS);
    expect(studying.riskFlags).not.toContain('NON_ACTIVE_STATUS');
  });
});

describe('sorting & worst-10', () => {
  const rows = [
    Object.assign(deriveReconciliationRow(row({ id: 1, external_remaining_sessions: 8, external_synced_at: NOW }), THRESHOLDS), {}), // delta 2
    Object.assign(deriveReconciliationRow(row({ id: 2, external_remaining_sessions: -5, external_synced_at: NOW }), THRESHOLDS), {}), // delta 15
    Object.assign(deriveReconciliationRow(row({ id: 3 }), THRESHOLDS), {}), // delta null
    Object.assign(deriveReconciliationRow(row({ id: 4, external_remaining_sessions: 9, external_synced_at: NOW }), THRESHOLDS), {}), // delta 1
  ];

  it('worstByAbsDelta orders by |delta| desc and excludes delta-null', () => {
    const worst = worstByAbsDelta(rows, 10);
    expect(worst.map((r) => r.id)).toEqual([2, 1, 4]);
  });

  it('comparator puts nulls last and breaks ties by id asc', () => {
    const sorted = [...rows].sort(compareByAbsDeltaDesc);
    expect(sorted.map((r) => r.id)).toEqual([2, 1, 4, 3]);
    const tie = [
      { ...rows[0], id: 7, delta: -2 },
      { ...rows[0], id: 5, delta: 2 },
    ];
    expect(tie.sort(compareByAbsDeltaDesc).map((r) => r.id)).toEqual([5, 7]);
  });
});

describe('broadcast enrollment selection', () => {
  it('prefers the newest ACTIVE enrollment over a newer non-active one', () => {
    const ordered = [
      { id: 2, status: EnrollmentStatus.FINISHED }, // newer but not active
      { id: 1, status: EnrollmentStatus.STUDYING },
    ];
    expect(selectBroadcastOrder(ordered)?.id).toBe(1);
  });

  it('falls back to [0] when no active status exists', () => {
    const ordered = [
      { id: 9, status: EnrollmentStatus.FINISHED },
      { id: 3, status: EnrollmentStatus.CANCELLED },
    ];
    expect(selectBroadcastOrder(ordered)?.id).toBe(9);
  });

  it('summary counts a flip only on the selected enrollment per student', () => {
    // Student 50: two enrollments. Selected = newest STUDYING one (id 52).
    const d51 = deriveReconciliationRow(
      row({ id: 51, student_id: 50, status: EnrollmentStatus.FINISHED, updated_at: new Date('2026-10-01'), external_remaining_sessions: 0, external_synced_at: NOW }),
      THRESHOLDS,
    ); // delta 10 — would change, but NOT selected
    const d52 = deriveReconciliationRow(
      row({ id: 52, student_id: 50, status: EnrollmentStatus.STUDYING, updated_at: new Date('2026-10-20'), external_remaining_sessions: 10, external_synced_at: NOW }),
      THRESHOLDS,
    ); // delta 0 — selected, would NOT change
    const groups = new Map<number, typeof d51[]>([[50, [d52, d51]]]); // updated_at desc
    const selected = computeBroadcastSelectedIds(groups);
    expect(selected).toEqual(new Set([52]));
    const stamped = applyBroadcastSelection([d51, d52], selected);
    const summary = summarizeRows(stamped);
    expect(summary.enrollments).toBe(2);
    expect(summary.students).toBe(1);
    expect(summary.wouldChangeBroadcastIfFlipped).toBe(0);
    expect(summary.divergingEnrollments).toBe(1);
  });
});

describe('csv escaping', () => {
  it('quotes on comma/quote/newline, doubles embedded quotes', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('row line ends without a trailing newline inside records; header emitted', () => {
    const d = deriveReconciliationRow(row({ id: 13, student_code: 'HV,13"X' }), THRESHOLDS);
    const csv = csvRowsFor([d]);
    expect(csv.split('\r\n')[0]).toContain('enrollment_id,student_id,student_code_ma_hv');
    expect(csv).toContain('"HV,13""X"');
  });
});
