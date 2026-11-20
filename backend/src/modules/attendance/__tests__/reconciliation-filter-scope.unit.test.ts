jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    manageAssignment: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../automation/automation-trigger.service', () => ({
  handleAttendanceEvent: jest.fn(),
  cancelPendingDeliveries: jest.fn(),
}));

import { prisma } from '../../../prisma/client';
import { AppError } from '../../../middlewares/error.middleware';
import { ReconciliationQuerySchema } from '../reconciliation.schema';
import { ReconciliationService } from '../reconciliation.service';

const mockPrisma = prisma as unknown as {
  attendance: { count: jest.Mock; findMany: jest.Mock };
  manageAssignment: { findMany: jest.Mock };
};

const groupWithMembers = (...userIds: number[]) => ({
  cs_group: { members: userIds.map((user_id) => ({ user_id })) },
});

describe('ReconciliationQuerySchema filter validation', () => {
  it('normalizes legacy JNPT input to canonical JLPT', () => {
    expect(ReconciliationQuerySchema.parse({ programType: 'JNPT' }).programType).toBe('JLPT');
  });

  it.each(['N5', 'OTHER', 'jlpt'])('rejects invalid programType %s', (programType) => {
    expect(() => ReconciliationQuerySchema.parse({ programType })).toThrow();
  });

  it('rejects invalid and reversed date ranges', () => {
    expect(() => ReconciliationQuerySchema.parse({ startDate: '20-01-01' })).toThrow();
    expect(() =>
      ReconciliationQuerySchema.parse({ startDate: '2026-03-02', endDate: '2026-03-01' })
    ).toThrow('startDate phải nhỏ hơn hoặc bằng endDate');
  });
});

describe('reconciliation list filter and data scope', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReconciliationService();
    mockPrisma.attendance.count.mockResolvedValue(0);
    mockPrisma.attendance.findMany.mockResolvedValue([]);
  });

  it('combines plain CS ownership, program and expanded search before count/pagination', async () => {
    await service.getConflicts(
      { search: 'Tokyo', programType: 'JLPT', page: 2, pageSize: 25 },
      { id: 17, roles: ['CS'] }
    );

    const countWhere = mockPrisma.attendance.count.mock.calls[0][0].where;
    const listArgs = mockPrisma.attendance.findMany.mock.calls[0][0];

    expect(listArgs.where).toBe(countWhere);
    expect(countWhere.enrollment_class).toEqual({
      enrollment: { cs_id: 17, program_type: 'JLPT' },
    });
    expect(countWhere.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { enrollment_class: { enrollment: { course_code: { contains: 'Tokyo' } } } },
            {
              enrollment_class: {
                class: {
                  OR: [
                    { class_name: { contains: 'Tokyo' } },
                    { class_code: { contains: 'Tokyo' } },
                  ],
                },
              },
            },
          ]),
        }),
      ])
    );
    expect(listArgs.skip).toBe(25);
    expect(listArgs.take).toBe(25);
    expect(listArgs.orderBy).toEqual([
      { class_session: { session_date: 'desc' } },
      { id: 'desc' },
    ]);
  });

  it('scopes MANAGE to self plus assigned group members', async () => {
    mockPrisma.manageAssignment.findMany.mockResolvedValue([groupWithMembers(21, 22)]);

    await service.getConflicts({ programType: 'KAIWA' }, { id: 20, roles: ['MANAGE'] });

    const where = mockPrisma.attendance.count.mock.calls[0][0].where;
    expect(where.enrollment_class).toEqual({
      enrollment: { cs_id: { in: [20, 21, 22] }, program_type: 'KAIWA' },
    });
  });

  it('rejects a MANAGE csId filter outside its assigned groups without querying attendance', async () => {
    mockPrisma.manageAssignment.findMany.mockResolvedValue([groupWithMembers(21)]);

    const error = await service
      .getConflicts({ csId: 999 }, { id: 20, roles: ['MANAGE'] })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(403);
    expect(mockPrisma.attendance.count).not.toHaveBeenCalled();
    expect(mockPrisma.attendance.findMany).not.toHaveBeenCalled();
  });
});
