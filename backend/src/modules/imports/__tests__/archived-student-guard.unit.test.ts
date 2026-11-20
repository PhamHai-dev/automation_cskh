jest.mock('../../../prisma/client', () => ({ prisma: {} }));

import { ImportsRepository } from '../imports.repository';

describe('ImportsRepository archived student guards', () => {
  it('limits fallback matching to active students', async () => {
    const db: any = {
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repo = new ImportsRepository(db);

    await repo.findStudentByExternalIdOrName('HV001', 'Nguyễn Văn A');

    expect(db.student.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        deleted_at: null,
        OR: [{ external_id: 'HV001' }, { full_name: 'Nguyễn Văn A' }],
      }),
    }));
  });

  it('rejects an archived external ID instead of updating or recreating it', async () => {
    const db: any = {
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          external_id: 'HV-ARCHIVED',
          deleted_at: new Date('2026-11-20T00:00:00.000Z'),
        }),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const repo = new ImportsRepository(db);

    await expect(repo.upsertStudent({
      external_id: 'HV-ARCHIVED',
      full_name: 'Học viên lưu trữ',
    })).rejects.toThrow('đã được lưu trữ');

    expect(db.student.update).not.toHaveBeenCalled();
    expect(db.student.create).not.toHaveBeenCalled();
  });
});
