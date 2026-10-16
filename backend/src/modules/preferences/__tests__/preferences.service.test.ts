import { PreferencesService } from '../preferences.service';
import { PreferenceScope } from '../preferences.schema';

// The repository uses prisma directly — mock prisma.userPreference instead of
// the repository class, so the module-level singleton in the service works.
jest.mock('../../../prisma/client', () => ({
  prisma: {
    userPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

// Import prisma AFTER the mock is registered
import { prisma } from '../../../prisma/client';

describe('PreferencesService', () => {
  let service: PreferencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PreferencesService();
  });

  describe('assertScope', () => {
    it('throws 400 when scope is not in whitelist', async () => {
      await expect(service.get(1, 'invalid.scope' as any)).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid preference scope'),
      });

      await expect(service.save(1, 'hack.scope' as any, {})).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Invalid preference scope'),
      });
    });

    it('accepts all 5 valid scopes', async () => {
      const validScopes: PreferenceScope[] = [
        'enrollments.quick',
        'enrollments.detailed',
        'enrollments.stats',
        'students.tab1',
        'students.tab2',
      ];

      for (const scope of validScopes) {
        (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
        const res = await service.get(1, scope);
        expect(res.scope).toBe(scope);
        expect(res.value).toEqual({});
      }
    });
  });

  describe('get', () => {
    it('returns empty object when no row exists', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await service.get(42, 'enrollments.quick');
      expect(res).toEqual({
        scope: 'enrollments.quick',
        value: {},
        updated_at: undefined,
      });
      expect(prisma.userPreference.findUnique).toHaveBeenCalledWith({
        where: { user_id_scope: { user_id: 42, scope: 'enrollments.quick' } },
        select: { scope: true, value: true, updated_at: true },
      });
    });

    it('returns stored value when row exists', async () => {
      const updatedAt = new Date('2026-10-16T00:00:00Z');
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({
        scope: 'enrollments.quick',
        value: { email: false, package_name: true },
        updated_at: updatedAt,
      });

      const res = await service.get(42, 'enrollments.quick');
      expect(res).toEqual({
        scope: 'enrollments.quick',
        value: { email: false, package_name: true },
        updated_at: updatedAt,
      });
    });

    it('queries by userId (user isolation enforced by unique key)', async () => {
      (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
      await service.get(99, 'students.tab2');
      expect(prisma.userPreference.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id_scope: { user_id: 99, scope: 'students.tab2' } },
        }),
      );
    });
  });

  describe('save', () => {
    it('delegates to upsert and returns saved payload', async () => {
      const updatedAt = new Date('2026-10-16T01:00:00Z');
      (prisma.userPreference.upsert as jest.Mock).mockResolvedValue({
        scope: 'students.tab1',
        value: { phone: false },
        updated_at: updatedAt,
      });

      const res = await service.save(42, 'students.tab1', { phone: false });
      expect(prisma.userPreference.upsert).toHaveBeenCalledWith({
        where: { user_id_scope: { user_id: 42, scope: 'students.tab1' } },
        create: { user_id: 42, scope: 'students.tab1', value: { phone: false } },
        update: { value: { phone: false } },
        select: { scope: true, value: true, updated_at: true },
      });
      expect(res).toEqual({
        scope: 'students.tab1',
        value: { phone: false },
        updated_at: updatedAt,
      });
    });
  });
});
