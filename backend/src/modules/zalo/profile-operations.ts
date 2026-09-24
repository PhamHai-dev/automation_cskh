/**
 * profile-operations.ts — Profile management service wrapping zca-js API calls.
 * Ported from ZaloCRM profile-operations.ts (116 lines) → single-org, Int IDs.
 *
 * Adaptations:
 *   - zaloOps.exec() wrapper → direct zaloPool.getApi(accountId) calls
 *   - ZaloOpError from zalo-route-helpers (same module)
 *   - accountId is Int (not String)
 */
import { zaloPool } from './zalo-pool';
import { createLogger } from '../../shared/logger/logger';
import { ZaloOpError } from './zalo-route-helpers';

const log = createLogger('ProfileOperations');

export type Gender = 0 | 1; // 0 = Male, 1 = Female

export interface UpdateProfileParams {
  name?: string;
  gender?: Gender;
  dob?: string; // ISO date YYYY-MM-DD
}

export interface ProfileOpsResult {
  success: boolean;
  data?: unknown;
}

/**
 * Update Zalo account profile (name, gender, birthday).
 * If partial fields are provided, fetches current info to fill defaults.
 */
export async function updateProfile(
  accountId: number,
  params: UpdateProfileParams,
): Promise<ProfileOpsResult> {
  if (!params.name && params.gender === undefined && !params.dob) {
    throw new ZaloOpError('Provide at least one of name, gender, dob', 'INVALID_PARAMS', 400);
  }

  const api = zaloPool.getApi(accountId);
  if (!api) throw new ZaloOpError('Nick chưa kết nối Zalo', 'NOT_CONNECTED', 503);

  // Fetch current profile to fill defaults for fields not being updated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentInfo: any = await api.getAccountInfo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = currentInfo?.profile ?? currentInfo ?? {};

  // Resolve name
  const name = params.name ?? String(
    profile.displayName ?? profile.zaloName ?? profile.username ?? '',
  );

  // Resolve gender (0=male, 1=female)
  let gender: Gender = Number(profile.gender) === 1 ? 1 : 0;
  if (params.gender !== undefined) {
    gender = params.gender;
  }

  // Resolve dob — must be YYYY-MM-DD for zca-js
  let resolvedDob: string;
  if (params.dob) {
    resolvedDob = params.dob;
  } else {
    const sdob = String(profile.sdob ?? '');
    const dobTs = Number(profile.dob ?? 0);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sdob)) {
      resolvedDob = sdob;
    } else if (dobTs && Number.isFinite(dobTs)) {
      const ms = dobTs > 10_000_000_000 ? dobTs : dobTs * 1000;
      resolvedDob = new Date(ms).toISOString().split('T')[0] ?? '1970-01-01';
    } else {
      resolvedDob = '1970-01-01';
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolvedDob)) {
    throw new ZaloOpError('dob must be in YYYY-MM-DD format', 'INVALID_PARAMS', 400);
  }

  const result = await api.updateProfile({
    profile: {
      name,
      dob: resolvedDob as `${string}-${string}-${string}`,
      gender,
    },
  });

  log.info(`[profile-ops:${accountId}] updateProfile done`);
  return { success: true, data: result };
}

/** List all avatars for this Zalo account */
export async function listAvatars(accountId: number): Promise<unknown[]> {
  const api = zaloPool.getApi(accountId);
  if (!api) throw new ZaloOpError('Nick chưa kết nối Zalo', 'NOT_CONNECTED', 503);
  const result = await api.getAvatarList();
  return Array.isArray(result) ? result : [];
}

/** Delete an avatar by its ID */
export async function deleteAvatar(accountId: number, avatarId: string): Promise<ProfileOpsResult> {
  if (!avatarId) throw new ZaloOpError('avatarId is required', 'INVALID_PARAMS', 400);
  const api = zaloPool.getApi(accountId);
  if (!api) throw new ZaloOpError('Nick chưa kết nối Zalo', 'NOT_CONNECTED', 503);
  const result = await api.deleteAvatar(avatarId);
  return { success: true, data: result };
}

/** Reuse a previous avatar by its ID */
export async function reuseAvatar(accountId: number, avatarId: string): Promise<ProfileOpsResult> {
  if (!avatarId) throw new ZaloOpError('avatarId is required', 'INVALID_PARAMS', 400);
  const api = zaloPool.getApi(accountId);
  if (!api) throw new ZaloOpError('Nick chưa kết nối Zalo', 'NOT_CONNECTED', 503);
  const result = await api.reuseAvatar(avatarId);
  return { success: true, data: result };
}
