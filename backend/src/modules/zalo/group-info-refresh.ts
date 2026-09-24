/**
 * group-info-refresh.ts — Core refresh thong tin 1 nhom Zalo (dung chung).
 *
 * Ported from ZaloCRM group-info-refresh.ts (92 lines) -> single-org, Int IDs.
 *
 * Tach khoi cron de TAI DUNG cho 2 duong:
 *  1. Cron 6h (group-info-sync-cron) — luoi an toan cho nhom im lang / nick offline.
 *  2. Tuc thi (group_event 'update_avatar'/'update') — avatar doi la refresh ngay.
 *
 * Adaptations from ZaloCRM:
 *   - CRM luu group info tren Conversation (groupName/groupAvatarUrl/groupMembersCount).
 *     Schema ta Conversation KHONG co cac field nay — group info nam tren ZaloGroup
 *     (name/avatar_url/member_count). buildGroupUpdates diff tren ZaloGroup.
 *   - mirrorRemoteMediaUrl (CDN -> S3) -> STUB: giu URL goc (chua co S3). URL CDN
 *     het han se duoc cron refresh lai dinh ky nen van on dinh du.
 *   - zaloOps.getGroupInfo -> zaloPool.getApi(accountId).getGroupInfo (pattern A6).
 *   - No withTenant/orgId/socket.io -> Int IDs, SyncIo emit interface.
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';

const log = createLogger('GroupInfoRefresh');

/** Minimal emit surface — thay the socket.io Server (chua co dep). */
export interface GroupIo {
  emit(event: string, payload: unknown): void;
}

/** Gia tri group hien tai trong DB de diff. */
export interface GroupRowFields {
  name: string | null;
  avatar_url: string | null;
  member_count: number | null;
}
export type GroupUpdates = {
  name?: string;
  avatar_url?: string;
  member_count?: number;
};

/** Mirror stub — chua co S3, tra ve URL goc. */
async function mirrorRemoteMediaUrl(url: string): Promise<string> {
  return url;
}

/**
 * Goi getGroupInfo -> mirror avatar -> diff vs `existing`. Tra updates (chi field DOI)
 * hoac null neu khong co gi doi / SDK khong tra info. KHONG ghi DB.
 */
export async function buildGroupUpdates(
  accountId: number,
  groupId: string,
  existing: GroupRowFields,
): Promise<GroupUpdates | null> {
  const api = zaloPool.getApi(accountId);
  if (!api) return null;

  const raw: any = await api.getGroupInfo(groupId);
  // getGroupInfo -> { gridInfoMap: { [groupId]: { name, avt, fullAvt, totalMember } } }
  const info = raw?.gridInfoMap?.[groupId] ?? Object.values(raw?.gridInfoMap || {})[0];
  if (!info) return null;

  const newName: string | undefined = info.name || undefined;
  const rawAvatar: string | undefined = info.fullAvt || info.avt || undefined;
  const newAvatar = rawAvatar ? await mirrorRemoteMediaUrl(rawAvatar) : undefined;
  const newCount: number | undefined =
    typeof info.totalMember === 'number' ? info.totalMember : undefined;

  // Diff + guard: KHONG ghi de bang rong/null (giu gia tri cu neu SDK tra trong).
  const updates: GroupUpdates = {};
  if (newName && newName !== existing.name) updates.name = newName;
  if (newAvatar && newAvatar !== existing.avatar_url) updates.avatar_url = newAvatar;
  if (newCount != null && newCount !== existing.member_count) updates.member_count = newCount;

  return Object.keys(updates).length ? updates : null;
}

/**
 * Refresh TUC THI 1 nhom (goi tu group_event 'update_avatar'/'update'). Fetch ZaloGroup,
 * build updates, ghi DB, emit socket cho client dang mo thay avatar/ten moi ngay.
 * Tra true neu co cap nhat. Moi loi nuot tai caller.
 */
export async function refreshGroupInfoNow(
  accountId: number,
  groupId: string,
  io: GroupIo | null,
): Promise<boolean> {
  try {
    const grp = await prisma.zaloGroup.findUnique({
      where: { zalo_group_id: groupId },
      select: { id: true, zalo_account_id: true, name: true, avatar_url: true, member_count: true },
    });
    // Nhom khong thuoc nick nay -> bo qua
    if (!grp || grp.zalo_account_id !== accountId) return false;

    const updates = await buildGroupUpdates(accountId, groupId, grp);
    if (!updates) return false;

    await prisma.zaloGroup.update({ where: { id: grp.id }, data: updates });
    // Mirror to Conversation — so group avatar/name displays reflect immediately.
    try {
      const convData: Record<string, unknown> = {};
      if (updates.name) { convData.group_name = updates.name; convData.display_name = updates.name; }
      if (updates.avatar_url) convData.group_avatar_url = updates.avatar_url;
      if (updates.member_count != null) convData.group_members_count = updates.member_count;
      if (Object.keys(convData).length) {
        await prisma.conversation.updateMany({
          where: { zalo_account_id: accountId, external_thread_id: groupId, thread_type: 'group' },
          data: convData,
        });
      }
    } catch { /* Conversation may not exist yet — non-critical */ }
    io?.emit('zalo:group-info-updated', { groupId, zaloGroupId: grp.id, ...updates });
    log.info(`[group-info-refresh] Group ${groupId} (acc ${accountId}) refreshed: ${Object.keys(updates).join(',')}`);
    return true;
  } catch (err) {
    log.warn(`[group-info-refresh] Group ${groupId} refresh failed`, { error: String(err) });
    return false;
  }
}
