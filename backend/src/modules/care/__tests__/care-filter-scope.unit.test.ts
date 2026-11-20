// CareTask filter scope and shared list/count predicate. Pure mock tests — no DB.
jest.mock('../../../prisma/client', () => ({
  prisma: {
    careTask: { findMany: jest.fn(), count: jest.fn() },
  },
}));

import { prisma } from '../../../prisma/client';
import { CareRepository } from '../care.repository';
import { CareService } from '../care.service';

const mock = prisma as any;

describe('CareTask scoped server filtering', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps an empty assignee scope restrictive and reuses the same predicates for list and count', async () => {
    mock.careTask.findMany.mockResolvedValue([]);
    mock.careTask.count.mockResolvedValue(0);
    const repository = new CareRepository(prisma);
    const service = new CareService(repository);
    jest.spyOn(service, 'getAccessibleCSIds').mockResolvedValue([]);

    await service.getCareTasks(
      {
        search: 'Nguyen',
        program_type: 'JLPT',
        status: 'PENDING' as any,
        priority: 'HIGH' as any,
        type: 'CALLBACK' as any,
        due_from: '2026-01-01',
        due_to: '2026-01-31',
        created_from: '2025-12-01',
        created_to: '2025-12-31',
        page: 2,
        pageSize: 25,
        limit: 25,
        offset: 25,
      },
      7,
      ['CS'],
    );

    const listArgs = mock.careTask.findMany.mock.calls[0][0];
    const countArgs = mock.careTask.count.mock.calls[0][0];
    expect(listArgs.skip).toBe(25);
    expect(listArgs.take).toBe(25);
    expect(listArgs.orderBy).toEqual([
      { priority: 'desc' }, { due_at: 'asc' }, { created_at: 'desc' }, { id: 'asc' },
    ]);
    expect(listArgs.where).toEqual(countArgs.where);
    expect(listArgs.where.AND).toEqual(expect.arrayContaining([
      { enrollment: { student: { deleted_at: null } } },
      { assigned_to_id: { in: [] } },
      { enrollment: { program_type: 'JLPT' } },
      { status: 'PENDING' },
      { priority: 'HIGH' },
      { type: 'CALLBACK' },
      { due_at: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') } },
      { created_at: { gte: new Date('2025-12-01T00:00:00.000Z'), lte: new Date('2025-12-31T23:59:59.999Z') } },
    ]));
    const search = listArgs.where.AND.find((item: any) => Array.isArray(item.OR));
    expect(search.OR).toEqual(expect.arrayContaining([
      { title: { contains: 'Nguyen' } },
      { enrollment: { student: { full_name: { contains: 'Nguyen' } } } },
    ]));
  });

  it('never lets an out-of-scope assignee filter widen a MANAGE/CS result', async () => {
    const repository = { findCareTasks: jest.fn(), countCareTasks: jest.fn() } as any;
    repository.findCareTasks.mockResolvedValue([]);
    repository.countCareTasks.mockResolvedValue(0);
    const service = new CareService(repository);
    jest.spyOn(service, 'getAccessibleCSIds').mockResolvedValue([7, 8]);

    await expect(
      service.getCareTasks({ assigned_to_id: 99 }, 7, ['MANAGE']),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.findCareTasks).not.toHaveBeenCalled();
    expect(repository.countCareTasks).not.toHaveBeenCalled();
  });
});
