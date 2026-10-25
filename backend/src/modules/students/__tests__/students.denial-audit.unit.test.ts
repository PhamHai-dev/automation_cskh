// B.1 denial-audit lane (mock-only): a 403 from the scoped repository must be
// recorded in AuditLog best-effort and the ORIGINAL error must still propagate.
// 404s and successful reads must not be audited.

jest.mock('../../../prisma/client', () => ({
  prisma: {
    auditLog: { create: jest.fn() },
  },
}));

const mockRepository = {
  findById: jest.fn(),
  update: jest.fn(),
  findByPhone: jest.fn(),
  findByEmail: jest.fn(),
};

jest.mock('../students.repository', () => ({
  StudentsRepository: jest.fn().mockImplementation(() => mockRepository),
}));

jest.mock('../../zalo/student-care-group.contract', () => ({
  runStudentCareGroupAutoSync: jest.fn().mockResolvedValue(null),
}));

import { prisma } from '../../../prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../../../middlewares/error.middleware';
import { AuthUser } from '../../../middlewares/auth.middleware';
import { StudentsService } from '../students.service';

const mockAuditLogCreate = (prisma as any).auditLog.create as jest.Mock;

const cs: AuthUser = { id: 10, roles: ['CS'] };
// UpdateStudentDTO requires an explicit enrollment_id (D9: writes target one
// named enrollment, never an implicitly-resolved one).
const updateDto = { full_name: 'X', enrollment_id: 7 };

describe('student access-denied audit (B.1)', () => {
  let service: StudentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository.findById.mockReset();
    mockRepository.update.mockReset();
    mockRepository.findByPhone.mockReset();
    mockRepository.findByEmail.mockReset();
    mockAuditLogCreate.mockReset();
    service = new StudentsService();
  });

  it('audits a 403 on read once and re-throws the same error', async () => {
    const denial = new AppError(403, 'Bạn không phụ trách học viên này');
    mockRepository.findById.mockRejectedValue(denial);

    await expect(service.getStudentById(42, cs)).rejects.toBe(denial);
    await expect(service.getStudentById(42, cs)).rejects.toMatchObject({ status: 403 });

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(2);
    const [first] = mockAuditLogCreate.mock.calls;
    expect(first[0].data).toMatchObject({
      user_id: 10,
      action: 'STUDENT_ACCESS_DENIED',
      entity_type: 'Student',
      entity_id: '42',
      before_data: Prisma.JsonNull,
    });
    expect(first[0].data.after_data).toMatchObject({
      operation: 'READ',
      reason: 'Bạn không phụ trách học viên này',
      roles: ['CS'],
    });
  });

  it('audits a 403 from the scoped write with operation UPDATE and re-throws', async () => {
    const denial = new AppError(403, 'Bạn không phụ trách học viên hoặc ghi danh này');
    mockRepository.findById.mockResolvedValue({ id: 42, phone: null, email: null });
    mockRepository.update.mockRejectedValue(denial);

    await expect(service.updateStudent(42, updateDto, cs)).rejects.toBe(denial);

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate.mock.calls[0][0].data.after_data).toMatchObject({
      operation: 'UPDATE',
      reason: 'Bạn không phụ trách học viên hoặc ghi danh này',
      roles: ['CS'],
    });
    expect(mockAuditLogCreate.mock.calls[0][0].data).toMatchObject({
      action: 'STUDENT_ACCESS_DENIED',
      entity_type: 'Student',
      entity_id: '42',
    });
  });

  it('audits a 403 raised by the scoped pre-read in updateStudent as UPDATE', async () => {
    const denial = new AppError(403, 'Bạn không phụ trách học viên này');
    mockRepository.findById.mockRejectedValue(denial);

    await expect(service.updateStudent(42, updateDto, cs)).rejects.toBe(denial);

    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditLogCreate.mock.calls[0][0].data.after_data.operation).toBe('UPDATE');
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('does not audit a missing student (404) on read', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.getStudentById(42, cs)).rejects.toMatchObject({ status: 404 });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('does not audit a successful read', async () => {
    mockRepository.findById.mockResolvedValue({ id: 42, phone: null, email: null });

    await expect(service.getStudentById(42, cs)).resolves.toMatchObject({ id: 42 });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('does not audit a missing student (404) during update', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.updateStudent(42, updateDto, cs)).rejects.toMatchObject({ status: 404 });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it('still propagates the 403 when the audit write itself fails', async () => {
    const denial = new AppError(403, 'Lớp học có ghi danh ngoài phạm vi phụ trách');
    mockRepository.findById.mockRejectedValue(denial);
    mockAuditLogCreate.mockRejectedValue(new Error('db down'));

    await expect(service.getStudentById(42, cs)).rejects.toBe(denial);
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
  });
});
