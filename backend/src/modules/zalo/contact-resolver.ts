/**
 * contact-resolver.ts - Unified Contact identity resolver.
 * Bridges Friend per-nick to Contact global identity for multi-nick resolution.
 * Single-org, Int IDs.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { extractZaloProfile } from './zalo-profile-utils';

const log = createLogger('ContactResolver');

export interface UpsertContactAccessInput {
  isFriend?: boolean;
  friendshipStatus?: string;
  aliasInNick?: string | null;
  hasConversation?: boolean;
}

export async function upsertContact(
  zaloUid: string,
  data: { displayName?: string; avatarUrl?: string; phone?: string },
): Promise<void> {
  if (!zaloUid) return;
  try {
    await prisma.contact.upsert({
      where: { zalo_uid: zaloUid },
      update: {
        display_name: data.displayName ?? undefined,
        avatar_url: data.avatarUrl ?? undefined,
        phone: data.phone ?? undefined,
        last_verified: new Date(),
      },
      create: {
        zalo_uid: zaloUid,
        display_name: data.displayName ?? null,
        avatar_url: data.avatarUrl ?? null,
        phone: data.phone ?? null,
        last_verified: new Date(),
      },
    });
  } catch (err) {
    log.warn('upsertContact failed', { zaloUid, error: String(err) });
  }
}

export async function upsertContactAccess(
  zaloAccountId: number,
  zaloUid: string,
  input: UpsertContactAccessInput,
): Promise<void> {
  if (!zaloAccountId || !zaloUid) return;
  try {
    await prisma.contact.upsert({ where: { zalo_uid: zaloUid }, update: {}, create: { zalo_uid: zaloUid } });
  } catch (_ignored) { /* Contact may already exist */ }
  try {
    await prisma.contactAccess.upsert({
      where: { zalo_uid_zalo_account_id: { zalo_uid: zaloUid, zalo_account_id: zaloAccountId } },
      update: {
        is_friend: input.isFriend ?? undefined,
        friendship_status: input.friendshipStatus ?? undefined,
        alias_in_nick: input.aliasInNick !== undefined ? input.aliasInNick : undefined,
        has_conversation: input.hasConversation ?? undefined,
        last_seen_at: new Date(),
      },
      create: {
        zalo_uid: zaloUid,
        zalo_account_id: zaloAccountId,
        is_friend: input.isFriend ?? false,
        friendship_status: input.friendshipStatus ?? 'none',
        alias_in_nick: input.aliasInNick ?? null,
        has_conversation: input.hasConversation ?? false,
        last_seen_at: new Date(),
      },
    });
  } catch (err) {
    log.warn('upsertContactAccess failed', { zaloAccountId, zaloUid, error: String(err) });
  }
}

export async function resolveOrCreateContact(api: any, zaloUid: string): Promise<any | null> {
  if (!zaloUid || !api?.getUserInfo) return null;
  try {
    const result = await api.getUserInfo(zaloUid);
    const profile = extractZaloProfile(result, zaloUid);
    if (profile) {
      await upsertContact(zaloUid, {
        displayName: profile.displayName ?? undefined,
        avatarUrl: profile.avatarUrl ?? undefined,
        phone: profile.phone ?? undefined,
      });
      return await prisma.contact.findUnique({ where: { zalo_uid: zaloUid } });
    }
  } catch (err) {
    log.warn('resolveOrCreateContact getUserInfo failed', { zaloUid, error: String(err) });
  }
  await upsertContact(zaloUid, {});
  try { return await prisma.contact.findUnique({ where: { zalo_uid: zaloUid } }); } catch { return null; }
}
