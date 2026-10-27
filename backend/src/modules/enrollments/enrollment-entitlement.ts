import {
  AttendanceStatus,
  ReconciliationState,
} from '@prisma/client';

/**
 * Read-model calculator for enrollment session entitlement.
 *
 * Source of truth (docs/product/business-rules.md §2, §3 — Q-002 RESOLVED
 * 2026-10-10; decisions/summary.md #19):
 *
 *   total_sessions      ← Enrollment.total_sessions
 *   consumed_sessions   ← count of FINAL Attendance rows whose resolved status
 *                          is ATTENDED or ABSENT_UNAPPROVED_C
 *   remaining_sessions  ← total_sessions - consumed_sessions   (NO clamp; a
 *                          negative value is an ops "nợ buổi" signal — see
 *                          Q-012, frontend badges on remaining < 0)
 *
 * "FINAL" means reconciliation_state ∈ { MATCHED, RESOLVED } (decisions #19,
 * #34). For those states the single `status` column already carries the
 * resolved/final result, so this calculator reads `status` and ignores the
 * per-side columns (teacher_status / cs_status). Any other state —
 * PENDING_CS, PENDING_TEACHER, CONFLICT — is provisional and NEVER counted,
 * even when both sides already agree on a consuming status (a CONFLICT row
 * with both sides ATTENDED stays at 0 until it is reconciled).
 *
 * Consumption status set (business-rules §2): ATTENDED and ABSENT_UNAPPROVED_C
 * consume exactly 1 session; ABSENT_APPROVED_A / LEAVE_B / TEACHER_ABSENT_D /
 * TECH_ERROR_E consume 0.
 *
 * Identity rule (Q-002, decisions #19-20): each Attendance represents exactly
 * ONE ClassSession. There is no `session_count` multiplier and NO duration
 * weighting. Raw/`0.5x`-style teacher values are NOT interpreted here; they are
 * normalized upstream before a final Attendance row exists (D7 unconfirmed — do
 * not infer fractional consumption from raw data).
 *
 * Scope rule: consumption is summed across ALL EnrollmentClass rows of the one
 * Enrollment (cross-class journeys share a single total_sessions budget —
 * decisions #4). Soft-deleted rows are excluded, mirroring the repository /
 * sheet-backup convention (`if (att.deleted_at) continue;`).
 *
 * External / opening balances (external_remaining_sessions,
 * attended_previous_years, external_synced_at) are imported/đối-soát data only
 * (decisions #9). They are returned as an isolated `opening` block and are NEVER
 * mixed into `consumedSessions` / `remainingSessions`.
 *
 * Per-EnrollmentClass: this calculator reports the per-EC *consumed* count only.
 * A per-EC *remaining* is intentionally NOT computed because `total_sessions`
 * lives on the Enrollment, not the EnrollmentClass — splitting the remaining
 * budget across classes requires an allocation policy that is not yet defined.
 * When such a policy is confirmed, per-EC remaining can be exposed by extending
 * `EnrollmentClassEntitlement` with an `allocatedSessions` field fed from that
 * policy; the consumed counts computed here would be its unchanged subtractend.
 *
 * This module is pure and dependency-free (no Prisma client, no DB) so it can be
 * reused by any reader (matrix, dashboard, sheet-backup, export) without
 * coupling them to a service instance or the database.
 */

/** Minimal final-state fields read from one Attendance row. */
export interface AttendanceEntitlementInput {
  /** Final/resolved attendance status; authoritative when reconciliation is FINAL. */
  status: AttendanceStatus;
  /** Reconciliation state; only MATCHED / RESOLVED count as FINAL. */
  reconciliation_state: ReconciliationState;
  /** Soft-delete marker; non-null rows are excluded from consumption. */
  deleted_at?: Date | string | null;
}

/** Minimal fields read from one EnrollmentClass (a journey segment of the Enrollment). */
export interface EnrollmentClassEntitlementInput {
  id?: number;
  attendance?: readonly AttendanceEntitlementInput[] | null;
}

/** Minimal fields read from one Enrollment. */
export interface EnrollmentEntitlementInput {
  id?: number;
  total_sessions: number;
  attended_previous_years?: number | null;
  external_remaining_sessions?: number | null;
  external_synced_at?: Date | string | null;
  enrollment_classes?: readonly EnrollmentClassEntitlementInput[] | null;
}

/** Per-EnrollmentClass consumption breakdown (consumed only; see header note). */
export interface EnrollmentClassEntitlement {
  enrollmentClassId: number | null;
  consumedSessions: number;
}

/** Isolated external/opening balance block — never folded into computed numbers. */
export interface EnrollmentOpeningBalance {
  attendedPreviousYears: number;
  externalRemainingSessions: number | null;
  externalSyncedAt: Date | string | null;
}

/** Result of the entitlement calculation for a single Enrollment. */
export interface EnrollmentEntitlement {
  enrollmentId: number | null;
  totalSessions: number;
  consumedSessions: number;
  /** totalSessions - consumedSessions; may be negative (nợ buổi). */
  remainingSessions: number;
  perEnrollmentClass: EnrollmentClassEntitlement[];
  opening: EnrollmentOpeningBalance;
}

/** Attendance statuses that consume exactly one session (business-rules §2). */
const CONSUMING_STATUSES: ReadonlySet<AttendanceStatus> = new Set<AttendanceStatus>([
  AttendanceStatus.ATTENDED,
  AttendanceStatus.ABSENT_UNAPPROVED_C,
]);

/** Reconciliation states whose `status` is the final result (business-rules §3). */
const FINAL_RECONCILIATION_STATES: ReadonlySet<ReconciliationState> = new Set<ReconciliationState>([
  ReconciliationState.MATCHED,
  ReconciliationState.RESOLVED,
]);

/** True when an Attendance row is soft-deleted and must be excluded. */
function isDeleted(attendance: AttendanceEntitlementInput): boolean {
  return attendance.deleted_at != null;
}

/**
 * A single Attendance row consumes one session iff it is not deleted, its
 * reconciliation is FINAL (MATCHED/RESOLVED), and its final status is ATTENDED
 * or ABSENT_UNAPPROVED_C.
 */
export function isConsumedAttendance(attendance: AttendanceEntitlementInput): boolean {
  if (isDeleted(attendance)) return false;
  if (!FINAL_RECONCILIATION_STATES.has(attendance.reconciliation_state)) return false;
  return CONSUMING_STATUSES.has(attendance.status);
}

/**
 * Care-milestone basis (K7), D1 APPROVED by the project owner 2026-10-25:
 * a row counts toward "đã học đủ N buổi" for CARE milestones iff it is not
 * deleted, FINAL, and its final status is ATTENDED. Rest-without-permit (C)
 * consumes entitlement (K5) but does NOT advance a care milestone. Two
 * deliberate same-day final sessions count as 2 (each row = 1 session, D7).
 * Evaluation milestones are a separate catalog and must not reuse this count.
 * This is intentionally distinct from isConsumedAttendance — the invariant
 * K7 ≠ K5 (05 §A.3) is enforced by keeping the two predicates separate.
 */
export function isCareMilestoneAttendance(attendance: AttendanceEntitlementInput): boolean {
  if (isDeleted(attendance)) return false;
  if (!FINAL_RECONCILIATION_STATES.has(attendance.reconciliation_state)) return false;
  return attendance.status === AttendanceStatus.ATTENDED;
}

function normalizeTotalSessions(value: number): number {
  // Guard against non-finite/NaN input so `remaining` never becomes NaN. The
  // schema types total_sessions as a required Int; this only defends the
  // boundary where a caller passes a malformed in-memory fixture.
  return Number.isFinite(value) ? value : 0;
}

/**
 * Computes session entitlement for one Enrollment from an in-memory graph
 * (Enrollment → enrollment_classes → attendance). Pure: no DB, no mutation of
 * the input.
 */
export function calculateEnrollmentEntitlement(
  enrollment: EnrollmentEntitlementInput,
): EnrollmentEntitlement {
  const totalSessions = normalizeTotalSessions(enrollment.total_sessions);

  const perEnrollmentClass: EnrollmentClassEntitlement[] = [];
  let consumedSessions = 0;

  for (const enrollmentClass of enrollment.enrollment_classes ?? []) {
    let classConsumed = 0;
    for (const attendance of enrollmentClass.attendance ?? []) {
      if (isConsumedAttendance(attendance)) classConsumed += 1;
    }
    consumedSessions += classConsumed;
    perEnrollmentClass.push({
      enrollmentClassId: enrollmentClass.id ?? null,
      consumedSessions: classConsumed,
    });
  }

  return {
    enrollmentId: enrollment.id ?? null,
    totalSessions,
    consumedSessions,
    // No clamp: negative remaining is a deliberate ops signal (Q-012).
    remainingSessions: totalSessions - consumedSessions,
    perEnrollmentClass,
    opening: {
      attendedPreviousYears: enrollment.attended_previous_years ?? 0,
      externalRemainingSessions: enrollment.external_remaining_sessions ?? null,
      externalSyncedAt: enrollment.external_synced_at ?? null,
    },
  };
}
