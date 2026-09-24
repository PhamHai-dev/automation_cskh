/**
 * group-scan-worker.ts — Processor for group-scan BullMQ jobs.
 * Ported from ZaloCRM group-scan-worker.ts (263 lines) → single-org, Int IDs.
 *
 * processGroupScan(scanId): loop groupIds → getGroupInfo → profile enrich → upsert GroupMember.
 * State machine: queued → running → (completed | partial | failed).
 *
 * Adaptations:
 *   - zaloOps.getGroupInfo → zaloPool.getApi(accountId).getGroupInfo()
 *   - zaloOps.getGroupMembersInfo → zaloPool.getApi(accountId).getGroupMembersInfo()
 *   - No orgId → single-org
 *   - String IDs → Int IDs (zaloAccountId)
 *   - groupMember.upsert unique: zalo_account_id + group_id + member_uid
 */
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { zaloPool } from './zalo-pool';

const log = createLogger('GroupScanWorker');

const CHUNK_SIZE = 50;

interface MemberProfile {
  uid: string;
  displayName: string | null;
  zaloName: string | null;
  avatarUrl: string | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function processGroupScan(scanId: number): Promise<void> {
  const scan = await prisma.groupScan.findUnique({ where: { id: scanId } });
  if (!scan) {
    log.warn(`Scan ${scanId} not found — skip`);
    return;
  }
  const { zalo_account_id: zaloAccountId } = scan;
  const groupIds: string[] = Array.isArray(scan.group_ids)
    ? (scan.group_ids as unknown[]).map(String)
    : [];

  // Resume: skip groups already processed (resumeCursor = last done group).
  let startIdx = 0;
  if (scan.resume_cursor) {
    const idx = groupIds.indexOf(scan.resume_cursor);
    if (idx >= 0) startIdx = idx + 1;
  }

  await prisma.groupScan.update({
    where: { id: scanId },
    data: {
      state: 'running',
      started_at: scan.started_at ?? new Date(),
      total_groups: groupIds.length,
    },
  });

  let anyFailed = false;
  let anyTruncated = false;

  for (let i = startIdx; i < groupIds.length; i++) {
    const groupId = groupIds[i];
    try {
      const added = await scanOneGroup(zaloAccountId, groupId);
      if (added.truncated) anyTruncated = true;
      // Update progress + resumeCursor AFTER group done (atomic increment).
      await prisma.groupScan.update({
        where: { id: scanId },
        data: {
          resume_cursor: groupId,
          scanned_groups: { increment: 1 },
          member_count: { increment: added.members },
          friend_count: { increment: added.friends },
        },
      });
    } catch (err) {
      anyFailed = true;
      log.error(`Scan=${scanId} group=${groupId} failed: ${(err as Error).message}`);
      // Still update cursor to resume without repeating failed group
      await prisma.groupScan.update({
        where: { id: scanId },
        data: { resume_cursor: groupId, error: (err as Error).message.slice(0, 500) },
      });
      // NOTE: Don't re-throw — 1 group error doesn't abort entire scan (→ state=partial)
    }
  }

  const finalState = anyFailed || anyTruncated ? 'partial' : 'completed';
  await prisma.groupScan.update({
    where: { id: scanId },
    data: { state: finalState, completed_at: new Date() },
  });
  log.info(`Scan=${scanId} done state=${finalState}`);
}

/**
 * Scan 1 group → upsert all members into GroupMember.
 * Returns { members, friends, truncated }.
 * Throws on API errors (caller handles per-group).
 */
async function scanOneGroup(
  zaloAccountId: number,
  groupId: string,
): Promise<{ members: number; friends: number; truncated: boolean }> {
  const api = zaloPool.getApi(zaloAccountId);
  if (!api) throw new Error(`Account ${zaloAccountId} not connected`);

  // 1. getGroupInfo → memberIds, profiles, adminIds, etc.
  const info = await api.getGroupInfo(groupId);
  const gridInfo = (info as { gridInfoMap?: Record<string, unknown> })?.gridInfoMap?.[groupId] as
    | {
        memberIds?: string[];
        memVerList?: string[];
        adminIds?: string[];
        creatorId?: string;
        currentMems?: Array<{ id: string; dName?: string; zaloName?: string; avatar?: string }>;
        hasMoreMember?: number;
        totalMember?: number;
      }
    | undefined;

  if (!gridInfo) {
    throw new Error(`getGroupInfo returned no gridInfoMap entry for ${groupId}`);
  }

  // FIX: zca-js getGroupInfo returns empty `memberIds`; real roster in `memVerList`
  const memFromVer = (Array.isArray(gridInfo.memVerList) ? gridInfo.memVerList : [])
    .map((e) => String(e).split('_')[0])
    .filter((id) => id.length > 0);
  const memFromCurrent = (Array.isArray(gridInfo.currentMems) ? gridInfo.currentMems : [])
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  let memberIds = [
    ...(Array.isArray(gridInfo.memberIds) ? gridInfo.memberIds : []),
    ...memFromVer,
    ...memFromCurrent,
  ];
  const adminIds = new Set<string>([
    ...(Array.isArray(gridInfo.adminIds) ? gridInfo.adminIds : []),
    ...(gridInfo.creatorId ? [gridInfo.creatorId] : []),
  ]);
  const totalMember = typeof gridInfo.totalMember === 'number' ? gridInfo.totalMember : memberIds.length;
  const hasMore = typeof gridInfo.hasMoreMember === 'number' ? gridInfo.hasMoreMember : 0;

  // Check for truncated roster
  const truncated = hasMore > 0 || (totalMember > 0 && memberIds.length < totalMember);

  memberIds = [...new Set(memberIds)]; // dedup

  // 2. Profile map: prefer inline currentMems, enrich missing via chunk 50
  const profiles = new Map<string, MemberProfile>();
  for (const m of gridInfo.currentMems ?? []) {
    if (!m?.id) continue;
    profiles.set(m.id, {
      uid: m.id,
      displayName: m.dName ?? null,
      zaloName: m.zaloName ?? null,
      avatarUrl: m.avatar ?? null,
    });
  }

  const now = new Date();
  let upserted = 0;
  let friendsFound = 0;

  for (const batch of chunk(memberIds, CHUNK_SIZE)) {
    // Enrich: members without inline profile → getGroupMembersInfo (rate-limited)
    const missing = batch.filter((uid) => !profiles.has(uid));
    if (missing.length > 0) {
      try {
        const res = (await api.getGroupMembersInfo(missing)) as {
          profiles?: Record<string, { id?: string; displayName?: string; zaloName?: string; avatar?: string }>;
        };
        for (const [uid, p] of Object.entries(res?.profiles ?? {})) {
          if (!profiles.has(uid)) {
            profiles.set(uid, {
              uid,
              displayName: p.displayName ?? null,
              zaloName: p.zaloName ?? null,
              avatarUrl: p.avatar ?? null,
            });
          }
        }
      } catch (err) {
        log.warn(`Enrich profiles group=${groupId} failed: ${(err as Error).message}`);
      }
    }

    // 3. Join Friend by batch
    const friendRows = await prisma.friend.findMany({
      where: {
        zalo_account_id: zaloAccountId,
        zalo_uid_in_nick: { in: batch },
        friendship_status: 'accepted',
      },
      select: { zalo_uid_in_nick: true },
    });
    const friendSet = new Set(friendRows.map((r) => r.zalo_uid_in_nick));

    // 4. Upsert each member (unique: zalo_account_id + group_id + member_uid)
    for (const uid of batch) {
      const prof = profiles.get(uid);
      const isFriend = friendSet.has(uid);
      if (isFriend) friendsFound++;
      const data = {
        display_name: prof?.displayName ?? null,
        zalo_name: prof?.zaloName ?? null,
        avatar_url: prof?.avatarUrl ?? null,
        is_admin: adminIds.has(uid),
        is_friend: isFriend,
        friend_checked_at: now,
        last_seen_at: now,
      };
      await prisma.groupMember.upsert({
        where: {
          zalo_account_id_group_id_member_uid: { zalo_account_id: zaloAccountId, group_id: groupId, member_uid: uid },
        },
        create: { zalo_account_id: zaloAccountId, group_id: groupId, member_uid: uid, ...data },
        update: data, // re-scan = update lastSeenAt/isFriend, don't duplicate rows
      });
      upserted++;
    }
  }

  if (truncated) {
    log.warn(`Group ${groupId} roster incomplete: ${upserted}/${totalMember} (hasMoreMember=${hasMore})`);
  }

  return { members: upserted, friends: friendsFound, truncated };
}
