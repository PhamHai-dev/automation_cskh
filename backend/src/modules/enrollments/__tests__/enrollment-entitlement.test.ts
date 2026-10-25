import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import {
  calculateEnrollmentEntitlement,
  isConsumedAttendance,
  AttendanceEntitlementInput,
} from '../enrollment-entitlement';

const final = (status: AttendanceStatus): AttendanceEntitlementInput => ({
  status,
  reconciliation_state: ReconciliationState.MATCHED,
});

const resolved = (status: AttendanceStatus): AttendanceEntitlementInput => ({
  status,
  reconciliation_state: ReconciliationState.RESOLVED,
});

describe('enrollment entitlement calculator (Q-002)', () => {
  it('counts two final sessions on the same date as two Attendance rows', () => {
    const result = calculateEnrollmentEntitlement({
      id: 10,
      total_sessions: 10,
      enrollment_classes: [{
        id: 100,
        attendance: [
          { ...final(AttendanceStatus.ATTENDED), classSessionDate: '2026-10-24' } as AttendanceEntitlementInput,
          { ...resolved(AttendanceStatus.ATTENDED), classSessionDate: '2026-10-24' } as AttendanceEntitlementInput,
        ],
      }],
    });

    expect(result.consumedSessions).toBe(2);
    expect(result.remainingSessions).toBe(8);
  });

  it('excludes pending attendance while counting the final attendance on the same date', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 10,
      enrollment_classes: [{
        attendance: [
          { status: AttendanceStatus.ATTENDED, reconciliation_state: ReconciliationState.PENDING_TEACHER },
          { status: AttendanceStatus.ATTENDED, reconciliation_state: ReconciliationState.MATCHED },
        ],
      }],
    });

    expect(result.consumedSessions).toBe(1);
    expect(result.remainingSessions).toBe(9);
  });

  it('counts C but never counts A, B, D, or E', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 20,
      enrollment_classes: [{
        attendance: [
          final(AttendanceStatus.ABSENT_UNAPPROVED_C),
          final(AttendanceStatus.ABSENT_APPROVED_A),
          final(AttendanceStatus.LEAVE_B),
          final(AttendanceStatus.TEACHER_ABSENT_D),
          final(AttendanceStatus.TECH_ERROR_E),
        ],
      }],
    });

    expect(result.consumedSessions).toBe(1);
    expect(result.remainingSessions).toBe(19);
  });

  it('does not count CONFLICT even when both sides are ATTENDED', () => {
    const conflict = {
      status: AttendanceStatus.ATTENDED,
      reconciliation_state: ReconciliationState.CONFLICT,
      teacher_status: AttendanceStatus.ATTENDED,
      cs_status: AttendanceStatus.ATTENDED,
    } as AttendanceEntitlementInput;

    expect(isConsumedAttendance(conflict)).toBe(false);
    expect(calculateEnrollmentEntitlement({
      total_sessions: 10,
      enrollment_classes: [{ attendance: [conflict] }],
    }).consumedSessions).toBe(0);
  });

  it('counts a RESOLVED row using its resolved status', () => {
    expect(isConsumedAttendance(resolved(AttendanceStatus.ABSENT_UNAPPROVED_C))).toBe(true);
    expect(isConsumedAttendance(resolved(AttendanceStatus.ABSENT_APPROVED_A))).toBe(false);
  });

  it('excludes soft-deleted rows', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 10,
      enrollment_classes: [{
        attendance: [
          { ...final(AttendanceStatus.ATTENDED), deleted_at: new Date('2026-10-24T00:00:00.000Z') },
          final(AttendanceStatus.ATTENDED),
          { ...final(AttendanceStatus.ABSENT_UNAPPROVED_C), deleted_at: '2026-10-24T00:00:00.000Z' },
        ],
      }],
    });

    expect(result.consumedSessions).toBe(1);
  });

  it('sums consumption across all EnrollmentClass rows', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 3,
      enrollment_classes: [
        { id: 101, attendance: [final(AttendanceStatus.ATTENDED)] },
        { id: 102, attendance: [final(AttendanceStatus.ABSENT_UNAPPROVED_C), final(AttendanceStatus.ATTENDED)] },
      ],
    });

    expect(result.consumedSessions).toBe(3);
    expect(result.remainingSessions).toBe(0);
    expect(result.perEnrollmentClass).toEqual([
      { enrollmentClassId: 101, consumedSessions: 1 },
      { enrollmentClassId: 102, consumedSessions: 2 },
    ]);
  });

  it('does not clamp negative remaining sessions', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 1,
      enrollment_classes: [{
        attendance: [final(AttendanceStatus.ATTENDED), final(AttendanceStatus.ABSENT_UNAPPROVED_C)],
      }],
    });

    expect(result.remainingSessions).toBe(-1);
  });

  it('keeps external/opening values separate from computed remaining', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 10,
      attended_previous_years: 4,
      external_remaining_sessions: 99,
      external_synced_at: '2026-10-01T00:00:00.000Z',
      enrollment_classes: [{ attendance: [final(AttendanceStatus.ATTENDED)] }],
    });

    expect(result.remainingSessions).toBe(9);
    expect(result.opening).toEqual({
      attendedPreviousYears: 4,
      externalRemainingSessions: 99,
      externalSyncedAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('treats each Attendance as exactly one session and does not use duration or raw values', () => {
    const result = calculateEnrollmentEntitlement({
      total_sessions: 10,
      enrollment_classes: [{
        attendance: [{
          ...final(AttendanceStatus.ATTENDED),
          duration_minutes: 180,
          teacher_raw_value: '0.5X',
        } as AttendanceEntitlementInput],
      }],
    });

    expect(result.consumedSessions).toBe(1);
  });
});
