jest.mock('../../../prisma/client', () => ({
  prisma: {
    $transaction: jest.fn(),
    jlptNormalizationTask: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  },
}));

jest.mock('../../classes/classes.scope', () => ({ getAccessibleClassIds: jest.fn() }));
jest.mock('../../attendance/attendance-lifecycle', () => ({
  deriveAttendanceReconciliationState: jest.fn((teacherStatus, csStatus) => {
    if (!teacherStatus) return 'PENDING_TEACHER';
    if (!csStatus) return 'PENDING_CS';
    return teacherStatus === csStatus ? 'MATCHED' : 'CONFLICT';
  }),
  runAttendancePostCommit: jest.fn(),
}));

import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import { prisma } from '../../../prisma/client';
import { getAccessibleClassIds } from '../../classes/classes.scope';
import { runAttendancePostCommit } from '../../attendance/attendance-lifecycle';
import { JlptWorkbookService } from '../jlpt-workbook.service';

const db = prisma as any;
const scope = getAccessibleClassIds as jest.Mock;
const postCommit = runAttendancePostCommit as jest.Mock;
const actor = { id: 20, email: 'manage@example.com', roles: ['MANAGE'] } as any;

function transactionClient() {
  return {
    attendance: { findUnique: jest.fn(), upsert: jest.fn() },
    jlptLearningRecord: { findUnique: jest.fn(), upsert: jest.fn() },
    jlptNormalizationTask: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  } as any;
}

function parsedCell(overrides: Record<string, unknown> = {}) {
  return {
    block: { sheetName: 'NKHT N4', rowNumber: 2 }, classId: 7, enrollmentClassId: 70, externalId: 'HV001', sessionId: 700, sessionNumber: 1,
    currentAttendance: { id: 9, teacher_status: AttendanceStatus.ATTENDED, teacher_note: 'Ghi chú cũ', cs_status: null, status: AttendanceStatus.ATTENDED },
    currentLearningRecord: { id: 10, preparation_rating: 'A', attitude_rating: 'B', homework_completed: true, test_correct_answers: 8 },
    value: {
      rawAttendance: null, teacherStatus: null, attendancePopulated: false, ambiguousAbsence: false,
      sourceNote: null, notePopulated: false, preparationRating: null, preparationPopulated: false,
      attitudeRating: null, attitudePopulated: false, homeworkCompleted: null, homeworkPopulated: false,
      testCorrectAnswers: null, testPopulated: false, ...overrides,
    },
  } as any;
}

describe('JLPT workbook sync hardening', () => {
  beforeEach(() => jest.clearAllMocks());

  it('absolute sync clears blank source fields and runs Attendance lifecycle only after commit', async () => {
    const tx = transactionClient();
    tx.attendance.findUnique
      .mockResolvedValueOnce(parsedCell().currentAttendance)
      .mockResolvedValueOnce({ ...parsedCell().currentAttendance, teacher_status: null });
    tx.attendance.upsert
      .mockResolvedValueOnce({ id: 9, teacher_status: null, teacher_note: 'Ghi chú cũ', cs_status: null, reconciliation_state: ReconciliationState.PENDING_TEACHER })
      .mockResolvedValueOnce({ id: 9, teacher_status: null, teacher_note: null, cs_status: null, reconciliation_state: ReconciliationState.PENDING_TEACHER });
    tx.jlptLearningRecord.findUnique.mockResolvedValue(parsedCell().currentLearningRecord);
    tx.jlptLearningRecord.upsert.mockResolvedValue({ id: 10 });
    db.$transaction.mockImplementation(async (callback: any) => callback(tx));
    const service = new JlptWorkbookService() as any;
    service.buildPreview = jest.fn().mockResolvedValue({ errors: [], issues: [], cells: [parsedCell()] });

    const result = await service.syncAbsolute(Buffer.from('fixture'), 2026, 1, 99);

    expect(result.updatedFields).toBe(6);
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    expect(tx.attendance.upsert.mock.calls[0][0].update.teacher_status).toBeNull();
    expect(tx.attendance.upsert.mock.calls[1][0].update.teacher_note).toBeNull();
    expect(tx.jlptLearningRecord.upsert).toHaveBeenCalledTimes(4);
    expect(postCommit).toHaveBeenCalledTimes(1);
    expect(postCommit).toHaveBeenCalledWith(expect.objectContaining({ attendanceId: 9, reconciliationState: ReconciliationState.PENDING_TEACHER, deliveryPolicy: 'NO_SEND', invalidatePendingDeliveries: true }));
  });

  it('ambiguous X preserves teacher status, syncs other fields and creates one pending task', async () => {
    const tx = transactionClient();
    tx.attendance.findUnique.mockResolvedValue(parsedCell().currentAttendance);
    tx.attendance.upsert.mockResolvedValue({ id: 9, teacher_status: AttendanceStatus.ATTENDED, teacher_note: 'Cần xác minh', cs_status: null, reconciliation_state: ReconciliationState.PENDING_CS });
    tx.jlptLearningRecord.findUnique.mockResolvedValue(parsedCell().currentLearningRecord);
    tx.jlptLearningRecord.upsert.mockResolvedValue({ id: 10 });
    tx.jlptNormalizationTask.findUnique.mockResolvedValueOnce(null);
    tx.jlptNormalizationTask.create.mockResolvedValue({ id: 30 });
    db.$transaction.mockImplementation(async (callback: any) => callback(tx));
    const service = new JlptWorkbookService() as any;
    service.buildPreview = jest.fn().mockResolvedValue({
      errors: [], issues: [{ issue_type: 'AMBIGUOUS_ABSENCE', enrollment_class_id: 70, class_session_id: 700 }],
      cells: [parsedCell({ rawAttendance: 'X', ambiguousAbsence: true, sourceNote: 'Cần xác minh', notePopulated: true, preparationRating: 'C', preparationPopulated: true })],
    });

    const result = await service.syncAbsolute(Buffer.from('fixture'), 2026, 1, 99);

    expect(result.taskCount).toBe(1);
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(1);
    expect(tx.attendance.upsert.mock.calls[0][0].update.teacher_status).toBe(AttendanceStatus.ATTENDED);
    expect(tx.jlptLearningRecord.upsert).toHaveBeenCalled();
    expect(tx.jlptNormalizationTask.create.mock.calls[0][0].data.pending_key).toBe('GOOGLE_SHEET_SYNC:AMBIGUOUS_ABSENCE:7:70:700');
  });

  it('reuses an existing pending task on repeated sync', async () => {
    const tx = transactionClient();
    tx.jlptNormalizationTask.findUnique.mockResolvedValue({ id: 30 });
    tx.jlptNormalizationTask.update.mockResolvedValue({ id: 30 });
    const service = new JlptWorkbookService() as any;

    const created = await service.upsertPendingTask(tx, { issueType: 'AMBIGUOUS_ABSENCE', syncRunItemId: 100, classId: 7, enrollmentClassId: 70, classSessionId: 700, rawPayload: { raw_attendance: 'X' }, sourceNote: 'Cần xác minh' });

    expect(created).toBe(false);
    expect(tx.jlptNormalizationTask.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 30 } }));
    expect(tx.jlptNormalizationTask.create).not.toHaveBeenCalled();
  });

  it('does not execute downstream lifecycle when the transaction rolls back', async () => {
    const tx = transactionClient();
    tx.attendance.findUnique.mockResolvedValue(parsedCell().currentAttendance);
    tx.attendance.upsert.mockRejectedValue(new Error('forced transaction failure'));
    db.$transaction.mockImplementation(async (callback: any) => callback(tx));
    const service = new JlptWorkbookService() as any;
    service.buildPreview = jest.fn().mockResolvedValue({ errors: [], issues: [], cells: [parsedCell({ teacherStatus: AttendanceStatus.ABSENT_APPROVED_A, attendancePopulated: true })] });

    await expect(service.syncAbsolute(Buffer.from('fixture'), 2026, 1, 99)).rejects.toThrow('forced transaction failure');
    expect(postCommit).not.toHaveBeenCalled();
  });

  it('enforces MANAGE class scope when listing normalization tasks', async () => {
    scope.mockResolvedValue([7, 8]);
    db.jlptNormalizationTask.findMany.mockResolvedValue([]);
    db.jlptNormalizationTask.count.mockResolvedValue(0);
    db.$transaction.mockImplementation(async (operations: any[]) => Promise.all(operations));
    const service = new JlptWorkbookService();

    await service.listTasks(actor, { status: 'PENDING' });

    expect(db.jlptNormalizationTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ class_id: { in: [7, 8] }, status: 'PENDING' }) }));
    await expect(service.listTasks(actor, { classId: 99 })).rejects.toMatchObject({ status: 403 });
  });
});
