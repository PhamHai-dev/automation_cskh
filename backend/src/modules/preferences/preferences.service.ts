import { PreferencesRepository } from './preferences.repository';
import { PreferenceScope, PREFERENCE_SCOPES } from './preferences.schema';

const repo = new PreferencesRepository();

export class PreferencesService {
  /**
   * Get stored preference value for (userId, scope).
   * Returns {} (empty object) if nothing was saved yet — frontend merges with defaults.
   */
  async get(userId: number, scope: PreferenceScope): Promise<{
    scope: PreferenceScope;
    value: Record<string, boolean>;
    updated_at?: Date;
  }> {
    this.assertScope(scope);
    const row = await repo.findByUserScope(userId, scope);
    return {
      scope,
      value: (row?.value as Record<string, boolean>) ?? {},
      updated_at: row?.updated_at,
    };
  }

  /**
   * Upsert preference value for (userId, scope).
   * Only delta from default should be stored (enforced by client convention, not server).
   */
  async save(userId: number, scope: PreferenceScope, value: Record<string, boolean>) {
    this.assertScope(scope);
    const row = await repo.upsert(userId, scope, value);
    return {
      scope: row.scope as PreferenceScope,
      value: row.value as Record<string, boolean>,
      updated_at: row.updated_at,
    };
  }

  private assertScope(scope: string): asserts scope is PreferenceScope {
    if (!(PREFERENCE_SCOPES as readonly string[]).includes(scope)) {
      const err = new Error(`Invalid preference scope: "${scope}"`);
      (err as any).status = 400;
      throw err;
    }
  }
}
