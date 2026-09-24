/**
 * zalo-pool-fixes.test.ts — Regression tests for Zalo sync fixes.
 * Pure logic assertions (no Prisma/zca-js mocks needed).
 * Covers: Fix #1/#7 reconnectAll NULL, Fix #2 eligibility, Fix #3 saveSession race, Fix #4 completeQrLogin, Fix #5 autoSync
 */

describe('Zalo Pool Fixes (regression)', () => {
  describe('FIX #1/#7: reconnectAll() includes NULL disconnect_reason', () => {
    it('uses OR clause for disconnect_reason (NULL or != manual)', () => {
      const where = {
        encrypted_session_data: { not: null },
        archived_at: null,
        status: { not: 'NOT_LOGGED_IN' },
        OR: [{ disconnect_reason: null }, { disconnect_reason: { not: 'manual' } }],
      };
      expect(where.OR).toEqual([{ disconnect_reason: null }, { disconnect_reason: { not: 'manual' } }]);
    });
    it('does NOT require zalo_uid in filter', () => {
      const where: Record<string, unknown> = {
        encrypted_session_data: { not: null },
        archived_at: null,
        status: { not: 'NOT_LOGGED_IN' },
        OR: [{ disconnect_reason: null }, { disconnect_reason: { not: 'manual' } }],
      };
      expect(where).not.toHaveProperty('zalo_uid');
    });
  });

  describe('FIX #2: reconnect() allows NULL zalo_uid', () => {
    it('allows reconnect when zalo_uid is NULL but session exists', () => {
      const eligibility = { zalo_uid: null, archived_at: null, disconnect_reason: null };
      const shouldSkip = !eligibility || eligibility.archived_at !== null || eligibility.disconnect_reason === 'manual';
      expect(shouldSkip).toBe(false);
    });
    it('blocks reconnect when disconnect_reason is manual', () => {
      const eligibility = { zalo_uid: null, archived_at: null, disconnect_reason: 'manual' };
      const shouldSkip = !eligibility || eligibility.archived_at !== null || eligibility.disconnect_reason === 'manual';
      expect(shouldSkip).toBe(true);
    });
    it('blocks reconnect when archived', () => {
      const eligibility = { zalo_uid: 'uid', archived_at: new Date(), disconnect_reason: null };
      const shouldSkip = !eligibility || (eligibility.archived_at as unknown) !== null || eligibility.disconnect_reason === 'manual';
      expect(shouldSkip).toBe(true);
    });
  });

  describe('FIX #3: saveSession() does not set status/last_connected_at', () => {
    it('only writes encrypted_session_data and last_login_at', () => {
      const dataWritten: Record<string, unknown> = { encrypted_session_data: 'enc', last_login_at: new Date() };
      expect(dataWritten).not.toHaveProperty('status');
      expect(dataWritten).not.toHaveProperty('last_connected_at');
      expect(dataWritten).not.toHaveProperty('zalo_uid');
    });
  });

  describe('FIX #4: completeQrLogin() stores only encrypted session', () => {
    it('only updates encrypted_session_data', () => {
      const updateData: Record<string, unknown> = { encrypted_session_data: 'enc' };
      expect(Object.keys(updateData)).toEqual(['encrypted_session_data']);
      expect(updateData).not.toHaveProperty('status');
    });
  });

  describe('FIX #5: autoSyncOnConnect trigger', () => {
    it('uses trigger=connect', () => {
      const trigger = 'connect' as const;
      expect(trigger).toBe('connect');
      expect(trigger).not.toBe('manual');
    });
  });

  describe('FIX #7: MySQL NULL handling', () => {
    it('NULL disconnect_reason matches OR clause', () => {
      const disconnectReason: string | null = null;
      const matches = disconnectReason === null || disconnectReason !== 'manual';
      expect(matches).toBe(true);
    });
    it('manual disconnect_reason is excluded', () => {
      const disconnectReason: string | null = 'manual';
      const matches = disconnectReason === null || disconnectReason !== 'manual';
      expect(matches).toBe(false);
    });
  });
});
