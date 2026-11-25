import { getAccessibleClassIds } from '../classes.scope';
import { prisma } from '../../../prisma/client';
import { AuthUser } from '../../../middlewares/auth.middleware';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    manageAssignment: { findMany: jest.fn() },
    enrollmentClass: { findMany: jest.fn() },
    teacher: { findFirst: jest.fn() },
    classTeacher: { findMany: jest.fn() },
    classSession: { findMany: jest.fn() },
  },
}));

describe('class actor scope', () => {
  const mockPrisma = prisma as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.manageAssignment.findMany.mockResolvedValue([]);
    mockPrisma.enrollmentClass.findMany.mockResolvedValue([]);
    mockPrisma.teacher.findFirst.mockResolvedValue(null);
    mockPrisma.classTeacher.findMany.mockResolvedValue([]);
    mockPrisma.classSession.findMany.mockResolvedValue([]);
  });

  it('returns full scope for ADMIN without querying assignments', async () => {
    const admin: AuthUser = { id: 1, roles: ['ADMIN'] };

    await expect(getAccessibleClassIds(admin)).resolves.toBeNull();
    expect(mockPrisma.enrollmentClass.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.classTeacher.findMany).not.toHaveBeenCalled();
  });

  it('limits CS and MANAGE class scope to enrollments owned by their allowed CS users', async () => {
    const manage: AuthUser = { id: 20, roles: ['MANAGE'] };
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      { cs_group: { members: [{ user_id: 10 }, { user_id: 11 }] } },
    ]);
    mockPrisma.enrollmentClass.findMany.mockResolvedValue([{ class_id: 101 }, { class_id: 102 }]);

    await expect(getAccessibleClassIds(manage)).resolves.toEqual([101, 102]);
    expect(mockPrisma.enrollmentClass.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        enrollment: expect.objectContaining({
          OR: [
            { cs_id: { in: [20, 10, 11] } },
            { cs_viewers: { some: { cs_id: { in: [20, 10, 11] } } } },
          ],
        }),
      }),
    }));
  });

  it('limits a teacher to active class and session assignments', async () => {
    const teacher: AuthUser = { id: 30, email: 'teacher@example.com', roles: ['TEACHER'] };
    mockPrisma.teacher.findFirst.mockResolvedValue({ id: 300 });
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ class_id: 201 }]);
    mockPrisma.classSession.findMany.mockResolvedValue([{ class_id: 202 }]);

    await expect(getAccessibleClassIds(teacher)).resolves.toEqual([201, 202]);
    expect(mockPrisma.classTeacher.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true }),
    }));
  });

  it('unions CS/MANAGE and TEACHER scopes for a multi-role user', async () => {
    const user: AuthUser = { id: 20, email: 'teacher@example.com', roles: ['MANAGE', 'TEACHER'] };
    mockPrisma.manageAssignment.findMany.mockResolvedValue([
      { cs_group: { members: [{ user_id: 10 }] } },
    ]);
    mockPrisma.enrollmentClass.findMany.mockResolvedValue([{ class_id: 301 }]);
    mockPrisma.teacher.findFirst.mockResolvedValue({ id: 300 });
    mockPrisma.classTeacher.findMany.mockResolvedValue([{ class_id: 302 }, { class_id: 301 }]);
    mockPrisma.classSession.findMany.mockResolvedValue([{ class_id: 303 }]);

    await expect(getAccessibleClassIds(user)).resolves.toEqual([301, 302, 303]);
  });

  it('returns an empty scope when a non-admin has no assignment', async () => {
    const user: AuthUser = { id: 99, roles: ['TEACHER'] };

    await expect(getAccessibleClassIds(user)).resolves.toEqual([]);
  });
});
