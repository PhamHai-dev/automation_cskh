// C.6 slice: cancelSession(classId, sessionId, reason?, userId?) persists the
// cancel reason through the AuditLog (no schema change), best-effort: an audit
// failure must never block the cancel itself. Pure mock tests — no DB, no app.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    classSession: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../../../prisma/client';
import { ClassSessionsService } from '../class-sessions.service';
import { AppError } from '../../../middlewares/error.middleware';

const mockPrisma = prisma as unknown as {
  classSession: { findFirst: jest.Mock; updateMany: jest.Mock };
  auditLog: { create: jest.Mock };
};

const classId = 5;
const sessionId = 42;

const scheduledSession = {
  id: sessionId,
  class_id: classId,
  status: 'SCHEDULED',
  session_number: 3,
  attendance: [],
};

let service: ClassSessionsService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ClassSessionsService();
  mockPrisma.classSession.findFirst.mockResolvedValue({ ...scheduledSession });
  mockPrisma.classSession.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({ id: 900 });
});

describe('cancelSession — reason persisted via AuditLog (C.6)', () => {
  it('stores the cancel reason in audit after_data (action CANCEL, entity_type ClassSession)', async () => {
    const result = await service.cancelSession(classId, sessionId, 'Giáo viên nghỉ đột xuất', 7);

    expect(result).toEqual({ count: 1 });
    expect(mockPrisma.classSession.updateMany).toHaveBeenCalledWith({
      where: { id: sessionId, class_id: classId },
      data: { status: 'CANCELLED' },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        user_id: 7,
        action: 'CANCEL',
        entity_type: 'ClassSession',
        entity_id: String(sessionId),
        before_data: { status: 'SCHEDULED' },
        after_data: { status: 'CANCELLED', reason: 'Giáo viên nghỉ đột xuất', class_id: classId },
      },
    });
  });

  it('records a null reason when none was provided (still durable audit)', async () => {
    await service.cancelSession(classId, sessionId, undefined, 7);

    const call = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(call.data.action).toBe('CANCEL');
    expect(call.data.entity_type).toBe('ClassSession');
    expect(call.data.after_data).toMatchObject({ status: 'CANCELLED', reason: null, class_id: classId });
  });

  it('skips the audit write entirely when no userId is available', async () => {
    const result = await service.cancelSession(classId, sessionId, 'không có actor');

    expect(result).toEqual({ count: 1 });
    expect(mockPrisma.classSession.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('audit failure does NOT break the cancel (best-effort try/catch)', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('audit table unavailable'));

    await expect(service.cancelSession(classId, sessionId, 'lý do', 7)).resolves.toEqual({ count: 1 });

    expect(mockPrisma.classSession.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('already-cancelled session is rejected with 409 before any write or audit', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue({ ...scheduledSession, status: 'CANCELLED' });

    const err = await service.cancelSession(classId, sessionId, 'dup', 7).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(mockPrisma.classSession.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('missing session fails before cancel/audit', async () => {
    mockPrisma.classSession.findFirst.mockResolvedValue(null);
    await expect(service.cancelSession(classId, 999, 'x', 7)).rejects.toThrow('ClassSession not found');
    expect(mockPrisma.classSession.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
