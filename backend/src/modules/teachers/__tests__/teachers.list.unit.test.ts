jest.mock('../../../prisma/client', () => ({
  prisma: {
    teacher: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import { prisma } from '../../../prisma/client';
import { TeachersRepository } from '../teachers.repository';

const mockPrisma = prisma as any;

describe('TeachersRepository list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('applies search and filters in SQL before pagination and counts the same filtered set', async () => {
    mockPrisma.teacher.findMany.mockResolvedValue([{ id: 7, name: 'Sato' }]);
    mockPrisma.teacher.count.mockResolvedValue(1);

    const repository = new TeachersRepository();
    const filters = {
      page: 2,
      pageSize: 10,
      isPaginated: true,
      search: 'Sato',
      active: true,
      teacherType: 'JAPANESE',
      accountStatus: 'HAS_ACCOUNT',
    } as const;

    const data = await repository.findAll(filters);
    const meta = await repository.computeMeta(filters, data);
    const expectedWhere = {
      AND: [
        { active: true },
        { teacher_type: 'JAPANESE' },
        { user_id: { not: null } },
        {
          OR: [
            { name: { contains: 'Sato' } },
            { code: { contains: 'Sato' } },
            { phone: { contains: 'Sato' } },
            { email: { contains: 'Sato' } },
            { user: { is: { email: { contains: 'Sato' } } } },
          ],
        },
      ],
    };

    expect(mockPrisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere, skip: 10, take: 10 }),
    );
    expect(mockPrisma.teacher.count).toHaveBeenCalledWith({ where: expectedWhere });
    expect(meta).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
  });

  it('uses a bounded first page when no pagination query is supplied by the caller', async () => {
    mockPrisma.teacher.findMany.mockResolvedValue([]);
    const repository = new TeachersRepository();

    await repository.findAll({ page: 1, pageSize: 20, isPaginated: true });

    expect(mockPrisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });
});
