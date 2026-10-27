// D3 (approved 2026-10-25): auto-attendance is planned-only for flexible 1-1.
// Mock-only — no DB, no app, no worker start.

jest.mock('../../../prisma/client', () => ({ prisma: {} }));
jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn().mockResolvedValue({}),
  cancelPendingDeliveries: jest.fn().mockResolvedValue(0),
}));

import { ClassModelType } from '@prisma/client';
import { AutoAttendanceService } from '../auto-attendance.service';

// 2026-06-15 is a Monday → product weekday 2, contained in pattern '246'.
// 12:00 local is past start_time 09:00 + default 15 min delay.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

function makeRepo(modelType: ClassModelType) {
  return {
    findDelaySetting: jest.fn().mockResolvedValue(null),
    findEnabledSetting: jest.fn().mockResolvedValue(null),
    findActiveSchedules: jest.fn().mockResolvedValue([
      {
        id: 1,
        class_id: 5,
        schedule_pattern: '246',
        start_time: '09:00',
        class: {
          id: 5,
          class_name: 'Lop Test',
          model_type: modelType,
          enrollment_classes: [
            {
              id: 7,
              enrollment_id: 55,
              status: 'ACTIVE',
              enrollment: { id: 55, status: 'STUDYING', cs_id: 9, start_date: null, end_date: null },
            },
          ],
        },
      },
    ]),
    findExecution: jest.fn().mockResolvedValue(null),
    createExecution: jest.fn().mockResolvedValue({ id: 77 }),
    ensureSystemActor: jest.fn().mockResolvedValue({ id: 1 }),
    findOrCreateClassSession: jest.fn().mockResolvedValue({ id: 40 }),
    findExistingAttendance: jest.fn().mockResolvedValue(null),
    createAttendance: jest.fn().mockResolvedValue({ id: 90 }),
    updateExecution: jest.fn().mockResolvedValue(undefined),
  };
}

describe('auto-attendance planned-only for 1-1 (D3)', () => {
  it('1-1 class: planned ClassSession reminder is kept, NO Attendance is auto-created', async () => {
    const repo = makeRepo(ClassModelType.ONE_TO_ONE);
    const service = new AutoAttendanceService(repo as any);

    const result = await service.processAutoAttendance(NOW, false, true);

    expect(repo.findOrCreateClassSession).toHaveBeenCalled(); // calendar item still created
    expect(repo.findExistingAttendance).not.toHaveBeenCalled();
    expect(repo.createAttendance).not.toHaveBeenCalled();
    expect(result.attended_count).toBe(0);
    expect(result.skipped_count).toBe(1);
    expect(repo.updateExecution).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ status: 'SKIPPED', attendance_count: 0 }),
    );
  });

  it('group class (1-2): provisional fill still runs and creates the row', async () => {
    const repo = makeRepo(ClassModelType.ONE_TO_TWO);
    const service = new AutoAttendanceService(repo as any);

    const result = await service.processAutoAttendance(NOW, false, true);

    expect(repo.createAttendance).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_class_id: 7, class_session_id: 40 }),
    );
    expect(result.attended_count).toBe(1);
    expect(repo.updateExecution).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ status: 'COMPLETED', attendance_count: 1 }),
    );
  });

  it('group class (1-n): existing attendance is left untouched (fill-empty-only rule)', async () => {
    const repo = makeRepo(ClassModelType.ONE_TO_N);
    repo.findExistingAttendance.mockResolvedValue({ id: 9 });
    const service = new AutoAttendanceService(repo as any);

    const result = await service.processAutoAttendance(NOW, false, true);

    expect(repo.createAttendance).not.toHaveBeenCalled();
    expect(result.attended_count).toBe(0);
    expect(repo.updateExecution).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ status: 'COMPLETED', attendance_count: 0 }),
    );
  });
});
