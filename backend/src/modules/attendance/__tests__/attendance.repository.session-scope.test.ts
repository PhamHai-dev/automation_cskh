// AttendanceRepository uses the singleton prisma client; mock it so we can
// assert that findBySession validates the (classId, sessionId) pair instead of
// filtering only on the session id (which would let a valid session id from
// another class leak that class's attendance rows).
jest.mock('../../../prisma/client', () => ({
  prisma: {
    attendance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../../../prisma/client';
import { AttendanceRepository } from '../attendance.repository';

describe('attendance class/session pair validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scopes findBySession by the class_session relation (classId + sessionId pair)', async () => {
    const repository = new AttendanceRepository();
    await repository.findBySession(7, 99);

    expect(prisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        class_session: { id: 99, class_id: 7 },
        deleted_at: null,
      },
    }));
  });
});
