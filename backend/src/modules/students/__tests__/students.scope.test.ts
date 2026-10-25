jest.mock('../../../prisma/client', () => ({
  prisma: {
    manageAssignment: { findMany: jest.fn() },
    student: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../zalo/student-care-group.contract', () => ({
  runStudentCareGroupAutoSync: jest.fn().mockResolvedValue(null),
}));

import { prisma } from '../../../prisma/client';
import { StudentsRepository, getStudentCsScope } from '../students.repository';
import { StudentsService } from '../students.service';
import { AuthUser } from '../../../middlewares/auth.middleware';

const admin: AuthUser = { id: 1, roles: ['ADMIN'] };
const csA: AuthUser = { id: 10, roles: ['CS'] };
const manage: AuthUser = { id: 20, roles: ['MANAGE'] };

const mockPrisma = prisma as any;

describe('student actor scope', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps CS scope on the actor and MANAGE scope on assigned group members', async () => {
    expect(await getStudentCsScope(csA)).toEqual([10]);
    expect(await getStudentCsScope(admin)).toBeUndefined();

    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      { cs_group: { members: [{ user_id: 10 }, { user_id: 11 }] } },
      { cs_group: { members: [{ user_id: 11 }, { user_id: 12 }] } },
    ]);
    expect(await getStudentCsScope(manage)).toEqual([20, 10, 11, 12]);
    expect(mockPrisma.manageAssignment.findMany).toHaveBeenCalledWith({
      where: { manage_user_id: 20 },
      include: { cs_group: { include: { members: true } } },
    });
  });

  it('scopes student detail enrollments instead of returning another CS enrollment', async () => {
    mockPrisma.student.findUnique.mockResolvedValue({ id: 42, enrollments: [{ id: 100, cs_id: 10 }] });
    const repository = new StudentsRepository();
    await repository.findById(42, csA);

    expect(mockPrisma.student.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42 },
      include: expect.objectContaining({
        enrollments: expect.objectContaining({ where: { cs_id: 10 } }),
      }),
    }));
  });

  it('targets the explicit in-scope enrollment and rejects CS reassignment escape', async () => {
    const repository = new StudentsRepository();
    const tx = {
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ id: 100, enrollment_classes: [] }),
        update: jest.fn(),
      },
      student: { update: jest.fn().mockResolvedValue({ id: 42 }) },
    };
    mockPrisma.$transaction.mockImplementation(async (callback: Function) => callback(tx));

    await repository.update(42, { enrollment_id: 100, full_name: 'Updated' }, csA);
    expect(tx.enrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { student_id: 42, id: 100, cs_id: 10 },
      orderBy: { id: 'desc' },
    }));
    expect(tx.student.update).toHaveBeenCalled();

    await expect(repository.update(42, { enrollment_id: 100, cs_id: 11 }, csA))
      .rejects.toMatchObject({ status: 403 });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('passes actor through the service for both detail and update', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ id: 42, phone: null, email: null }),
      update: jest.fn().mockResolvedValue({ id: 42 }),
      findByPhone: jest.fn(),
      findByEmail: jest.fn(),
    } as any;
    const service = new StudentsService();
    (service as any).repository = repository;

    await service.getStudentById(42, csA);
    await service.updateStudent(42, { enrollment_id: 100, full_name: 'Updated' }, csA);

    expect(repository.findById).toHaveBeenNthCalledWith(1, 42, csA);
    expect(repository.findById).toHaveBeenNthCalledWith(2, 42, csA);
    expect(repository.update).toHaveBeenCalledWith(42, { enrollment_id: 100, full_name: 'Updated' }, csA);
  });
});
