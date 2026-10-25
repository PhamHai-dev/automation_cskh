jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn(),
  cancelPendingDeliveries: jest.fn(),
}));

import { ReconciliationState, AttendanceStatus } from '@prisma/client';
import { cancelPendingDeliveries, handleAttendanceEvent } from '../../automation/automation-trigger.service';
import {
  deriveAttendanceLifecycle,
  deriveAttendanceReconciliationState,
  runAttendancePostCommit,
} from '../attendance-lifecycle';

const trigger = handleAttendanceEvent as jest.Mock;
const cancel = cancelPendingDeliveries as jest.Mock;

describe('attendance lifecycle downstream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    trigger.mockResolvedValue({ attendanceId: 1, deliveriesCreated: 1, deliveriesSkipped: 0, details: [] });
    cancel.mockResolvedValue(0);
  });

  it.each([
    [ReconciliationState.PENDING_CS, 'PROVISIONAL'],
    [ReconciliationState.PENDING_TEACHER, 'PROVISIONAL'],
    [ReconciliationState.CONFLICT, 'PROVISIONAL'],
    [ReconciliationState.MATCHED, 'FINAL'],
    [ReconciliationState.RESOLVED, 'FINAL'],
  ] as const)('derives %s as %s from persisted reconciliation state', (state, lifecycle) => {
    expect(deriveAttendanceLifecycle(state)).toBe(lifecycle);
  });

  it('derives reconciliation from the two existing opinions without a lifecycle column', () => {
    expect(deriveAttendanceReconciliationState(AttendanceStatus.ATTENDED, null)).toBe(ReconciliationState.PENDING_CS);
    expect(deriveAttendanceReconciliationState(null, AttendanceStatus.ATTENDED)).toBe(ReconciliationState.PENDING_TEACHER);
    expect(deriveAttendanceReconciliationState(AttendanceStatus.ATTENDED, AttendanceStatus.ATTENDED)).toBe(ReconciliationState.MATCHED);
    expect(deriveAttendanceReconciliationState(AttendanceStatus.ATTENDED, AttendanceStatus.ABSENT_APPROVED_A)).toBe(ReconciliationState.CONFLICT);
  });

  it('FINAL + NO_SEND updates read model/audit in caller but creates no outbound delivery', async () => {
    await runAttendancePostCommit({
      attendanceId: 101,
      reconciliationState: ReconciliationState.MATCHED,
      deliveryPolicy: 'NO_SEND',
    });

    expect(trigger).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('PROVISIONAL never triggers outbound delivery', async () => {
    await runAttendancePostCommit({
      attendanceId: 102,
      reconciliationState: ReconciliationState.PENDING_CS,
      deliveryPolicy: 'SEND',
    });

    expect(trigger).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('FINAL normal path triggers downstream delivery creation', async () => {
    await runAttendancePostCommit({
      attendanceId: 103,
      reconciliationState: ReconciliationState.MATCHED,
      deliveryPolicy: 'SEND',
    });

    expect(cancel).not.toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith(103);
  });

  it('NO_SEND still cancels existing pending delivery when the imported opinion invalidates it', async () => {
    await runAttendancePostCommit({
      attendanceId: 104,
      reconciliationState: ReconciliationState.CONFLICT,
      deliveryPolicy: 'NO_SEND',
      invalidatePendingDeliveries: true,
    });

    expect(cancel).toHaveBeenCalledWith(104);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('does not cancel sent history: cancellation is delegated to the pending-only helper', async () => {
    await runAttendancePostCommit({
      attendanceId: 105,
      reconciliationState: ReconciliationState.MATCHED,
      deliveryPolicy: 'NO_SEND',
      invalidatePendingDeliveries: true,
    });

    expect(cancel).toHaveBeenCalledWith(105);
    expect(trigger).not.toHaveBeenCalled();
  });
});
