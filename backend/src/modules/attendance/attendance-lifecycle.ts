import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import {
  cancelPendingDeliveries,
  handleAttendanceEvent,
  reconcileEnrollmentMilestonesForAttendance,
} from '../automation/automation-trigger.service';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('AttendanceLifecycle');

/**
 * Delivery policy is a per-write option (request/batch context), never derived
 * from or persisted inside the reconciliation state itself. NO_SEND is
 * orthogonal to PROVISIONAL/FINAL.
 */
export type AttendanceDeliveryPolicy = 'SEND' | 'NO_SEND';
export type AttendanceLifecycle = 'PROVISIONAL' | 'FINAL';

/**
 * Shared opinion reconciliation used by live manual writers and the importer
 * commit path. Finality derives from existing fields only (no lifecycle
 * columns): MATCHED and RESOLVED are FINAL; PENDING_CS, PENDING_TEACHER and
 * CONFLICT are PROVISIONAL.
 */
export function deriveAttendanceReconciliationState(
  teacherStatus: AttendanceStatus | null | undefined,
  csStatus: AttendanceStatus | null | undefined,
): ReconciliationState {
  if (!teacherStatus) return ReconciliationState.PENDING_TEACHER;
  if (!csStatus) return ReconciliationState.PENDING_CS;
  return teacherStatus === csStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
}

export function deriveAttendanceLifecycle(state: ReconciliationState): AttendanceLifecycle {
  return state === ReconciliationState.MATCHED || state === ReconciliationState.RESOLVED
    ? 'FINAL'
    : 'PROVISIONAL';
}

export interface AttendancePostCommitInput {
  attendanceId: number;
  reconciliationState: ReconciliationState;
  deliveryPolicy?: AttendanceDeliveryPolicy;
  /** Set when an existing record's opinion was overwritten by the write. */
  invalidatePendingDeliveries?: boolean;
  /** Optional enrollment context for post-commit milestone re-evaluation. */
  enrollmentId?: number;
}

/**
 * Shared downstream step for post-commit attendance writes.
 *
 * - Cancellation/invalidation safety is independent of send policy: queued work
 *   invalidated by a conflict or an opinion change is always cancelled, even
 *   under NO_SEND. cancelPendingDeliveries() only selects SCHEDULED/QUEUED, so
 *   sent history is never touched and no replacement delivery is emitted.
 * - Forward milestone re-evaluation (S1a/S2c) runs across the enrollment
 *   whenever reconciliation state changes — including transitions INTO CONFLICT
 *   (where a neighbour row may shift into the vacated milestone ordinal under
 *   SEND, or an unsent milestone may drop below its ordinal).
 * - Triggering (creation of NEW outbound deliveries) happens only when the
 *   derived state is FINAL (or a neighbour remains FINAL at the milestone) and
 *   the policy is SEND.
 * - Read model and audit rows are written by the caller before this runs and
 *   are never suppressed by NO_SEND.
 *
 * Failures are logged and swallowed by design (existing writer semantics).
 */
export async function runAttendancePostCommit(input: AttendancePostCommitInput): Promise<void> {
  const policy = input.deliveryPolicy ?? 'SEND';
  const shouldCancel =
    input.reconciliationState === ReconciliationState.CONFLICT ||
    input.invalidatePendingDeliveries === true;

  if (shouldCancel) {
    await cancelPendingDeliveries(input.attendanceId).catch((err: any) =>
      log.error('Cancel pending attendance deliveries failed', {
        attendanceId: input.attendanceId,
        reconciliationState: input.reconciliationState,
        deliveryPolicy: policy,
        error: err?.message || String(err),
      }),
    );
  }

  const isFinal = deriveAttendanceLifecycle(input.reconciliationState) === 'FINAL';
  if (!isFinal || policy === 'NO_SEND') {
    if (typeof reconcileEnrollmentMilestonesForAttendance === 'function') {
      await reconcileEnrollmentMilestonesForAttendance(input.attendanceId, {
        deliveryPolicy: policy,
        enrollmentId: input.enrollmentId,
      }).catch((err: any) =>
        log.error('Attendance milestone re-evaluation failed', {
          attendanceId: input.attendanceId,
          reconciliationState: input.reconciliationState,
          deliveryPolicy: policy,
          error: err?.message || String(err),
        }),
      );
    }
    return;
  }

  await handleAttendanceEvent(input.attendanceId).catch((err: any) =>
    log.error('Attendance automation trigger failed', {
      attendanceId: input.attendanceId,
      reconciliationState: input.reconciliationState,
      deliveryPolicy: policy,
      error: err?.message || String(err),
    }),
  );
}

