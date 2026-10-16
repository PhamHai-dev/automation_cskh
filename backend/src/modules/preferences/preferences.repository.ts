import { prisma } from '../../prisma/client';
import { PreferenceScope } from './preferences.schema';

export class PreferencesRepository {
  async findByUserScope(userId: number, scope: PreferenceScope) {
    return prisma.userPreference.findUnique({
      where: { user_id_scope: { user_id: userId, scope } },
      select: { scope: true, value: true, updated_at: true },
    });
  }

  async upsert(userId: number, scope: PreferenceScope, value: Record<string, boolean>) {
    return prisma.userPreference.upsert({
      where: { user_id_scope: { user_id: userId, scope } },
      create: { user_id: userId, scope, value },
      update: { value },
      select: { scope: true, value: true, updated_at: true },
    });
  }
}
