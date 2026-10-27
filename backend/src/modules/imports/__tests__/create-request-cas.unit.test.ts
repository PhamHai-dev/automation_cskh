// E.5 CAS regression: approval lane must predicate the write on the expected
// version+status. A stale reviewer (version changed under it) claims 0 rows and
// throws BEFORE any student/enrollment/audit write; a fresh reviewer's claim
// succeeds. Pure mock tests — no DB, no app, no filesystem writes.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('../../../prisma/client', () => ({
  prisma: {
    importCreateRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    package: { findUnique: jest.fn() },
    student: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: 900 }) },
    enrollment: { create: jest.fn().mockResolvedValue({ id: 910 }), update: jest.fn() },
    cSGroupMember: { findMany: jest.fn() },
    $transaction: jest.fn(),
    auditLog: { create: jest.fn() },
    enrollmentClass: { create: jest.fn() },
    class: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../../zalo/student-care-group.contract', () => ({
  runStudentCareGroupAutoSync: jest.fn().mockResolvedValue(null),
}));

import { prisma } from '../../../prisma/client';
import { ImportsService } from '../imports.service';

const mockPrisma = prisma as any;
const actor = { id: 1, roles: ['ADMIN'] };

const pendingRequest = {
  id: 50,
  status: 'PENDING',
  version: 3,
  external_id: 'HV001',
  package_code: 'KAIWA-A2',
  assigned_cs_id: 7,
  snapshot: { full_name: 'Nguyễn Văn A', total_sessions: 20 },
};

let service: ImportsService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new ImportsService({ createAuditLog: jest.fn().mockResolvedValue({}) } as any);
  mockPrisma.importCreateRequest.findFirst.mockResolvedValue({ ...pendingRequest });
  mockPrisma.package.findUnique.mockResolvedValue({ id: 3, code: 'KAIWA-A2', default_total_sessions: 20 });
  mockPrisma.student.findUnique.mockResolvedValue(null);
});

describe('approveCreateRequest is a real CAS (E.5)', () => {
  it('matching version+status claims the request and completes the approval', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED', version: 4 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    const result = await service.approveCreateRequest(50, actor, { version: 3 });

    expect(result).toBeTruthy();
    expect(mockPrisma.importCreateRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 50, status: 'PENDING', version: 3 },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('stale version loses the claim (count 0) => 409 BEFORE any student/enrollment/audit write', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    await expect(
      service.approveCreateRequest(50, actor, { version: 3 }),
    ).rejects.toMatchObject({ status: 409, message: 'Yêu cầu đã thay đổi, vui lòng tải lại' });
    expect(mockPrisma.student.create).not.toHaveBeenCalled();
    expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
    expect(mockPrisma.enrollment.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('claims CAS BEFORE materializing student and enrollment (call order check)', async () => {
    const order: string[] = [];
    mockPrisma.importCreateRequest.updateMany.mockImplementation(async () => {
      order.push('cas_claim');
      return { count: 1 };
    });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED', version: 4 });
    mockPrisma.student.create.mockImplementation(async () => {
      order.push('student_create');
      return { id: 900 };
    });
    mockPrisma.enrollment.create.mockImplementation(async () => {
      order.push('enrollment_create');
      return { id: 910 };
    });
    mockPrisma.auditLog.create.mockImplementation(async () => {
      order.push('audit_create');
      return {};
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    await service.approveCreateRequest(50, actor, { version: 3 });
    expect(order).toEqual(['cas_claim', 'student_create', 'enrollment_create', 'audit_create']);
  });

  it('cross-request race on students.external_id unique (P2002 on external_id) maps to 409', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED', version: 4 });
    const p2002ExternalId = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: 'students_external_id_key' },
    });
    mockPrisma.student.create.mockRejectedValueOnce(p2002ExternalId);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    await expect(
      service.approveCreateRequest(50, actor, { version: 3 }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Học viên với mã này vừa được tạo bởi yêu cầu khác, vui lòng tải lại',
    });
    expect(mockPrisma.enrollment.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('unrelated P2002 unique violations are NOT blanket-mapped to 409 (remain unmapped for 500)', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'APPROVED', version: 4 });
    const unrelatedP2002 = Object.assign(new Error('Unique constraint failed on external_sync_key'), {
      code: 'P2002',
      meta: { target: 'enrollments_external_sync_key_key' },
    });
    mockPrisma.enrollment.create.mockRejectedValueOnce(unrelatedP2002);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    await expect(
      service.approveCreateRequest(50, actor, { version: 3 }),
    ).rejects.toBe(unrelatedP2002);
  });
});

describe('reject/update review lanes are CAS too', () => {
  it('reject with matching version claims via updateMany; stale claim => 409', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, status: 'REJECTED', version: 4 });

    await service.rejectCreateRequest(50, actor, { version: 3, reason: 'trùng hồ sơ' });
    expect(mockPrisma.importCreateRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50, status: 'PENDING', version: 3 } }),
    );
    expect(mockPrisma.importCreateRequest.update).not.toHaveBeenCalled();

    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.rejectCreateRequest(50, actor, { version: 3, reason: 'trùng hồ sơ' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('updateCreateRequest no longer writes with an unguarded where:{id}', async () => {
    mockPrisma.importCreateRequest.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.importCreateRequest.findUnique.mockResolvedValue({ ...pendingRequest, version: 4 });

    await service.updateCreateRequest(50, actor, { version: 3, assignedCsId: 8 });
    expect(mockPrisma.importCreateRequest.update).not.toHaveBeenCalled();
    expect(mockPrisma.importCreateRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50, status: 'PENDING', version: 3 } }),
    );
  });
});
