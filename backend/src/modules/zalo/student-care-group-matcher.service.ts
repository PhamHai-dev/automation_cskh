/**
 * student-care-group-matcher.service.ts
 *
 * Automatic Student Care Group Sync & Matching Engine for Zalo & LINE.
 *
 * Naming convention for Student Care Groups:
 *   "<CS_NUMBER> - <STUDENT_EXTERNAL_ID> ...text..."
 * Examples:
 *   "01 - 427901798 Nguyễn Văn An - N5"
 *   "CVHT01 - 427901798 - Nguyễn Văn An"
 *   "02 - HV_005 Hoàng Thu Trang"
 */

import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { getIo } from '../../shared/realtime/socket-singleton';
import { zaloPool } from './zalo-pool';
import { zaloRepository } from './zalo-repository';
import {
  type ParsedCareGroupName,
  type LinkedStudentCareGroupItem,
  type UnlinkedStudentCareGroupItem,
  type CareGroupSyncReport,
  type SyncCareGroupsOptions,
  registerCareGroupAutoSyncRunner,
} from './student-care-group.contract';

const log = createLogger('StudentCareGroupMatcher');

const CARE_GROUP_NAME_REGEX =
  /^\s*\[?(?:CVHT[-_\s]*)?0*(\d{1,4})\]?\s*[-–—_:|\s]+\s*([A-Za-z0-9_.-]+)(?:\s+(.*))?$/i;

/**
 * Parse a Zalo or LINE group name according to the student care group naming convention:
 *   "<CS_NUMBER> - <STUDENT_EXTERNAL_ID> ...text..."
 */
export function parseStudentCareGroupName(groupName?: string | null): ParsedCareGroupName | null {
  if (!groupName || typeof groupName !== 'string') return null;
  const trimmed = groupName.trim();
  if (!trimmed) return null;

  const match = trimmed.match(CARE_GROUP_NAME_REGEX);
  if (!match) return null;

  const rawNum = Number(match[1]);
  if (!Number.isFinite(rawNum) || rawNum <= 0) return null;

  const csNumberPadded = String(rawNum).padStart(2, '0');
  const csCode = `CVHT${csNumberPadded}`;
  const studentExternalId = match[2].trim();
  if (!studentExternalId) return null;

  const remainderText = (match[3] || '').trim();

  return {
    rawName: groupName,
    csNumberPadded,
    csCode,
    studentExternalId,
    remainderText,
  };
}

/**
 * Extract the 2-digit CS number from a CS code/ID (e.g., "CVHT01" -> "01", or 1 -> "01")
 * and format the expected group prefix: "01 - 427901798".
 */
export function formatExpectedCareGroupPrefix(
  csCodeOrId?: string | number | null,
  studentExternalId?: string | null,
): string {
  let csNumberPadded = '00';
  if (typeof csCodeOrId === 'number' && Number.isFinite(csCodeOrId) && csCodeOrId > 0) {
    csNumberPadded = String(csCodeOrId).padStart(2, '0');
  } else if (typeof csCodeOrId === 'string' && csCodeOrId.trim()) {
    const m = csCodeOrId.trim().match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) {
        csNumberPadded = String(n).padStart(2, '0');
      }
    }
  }

  const extId = (studentExternalId || '').trim() || '<MÃ_HV>';
  return `${csNumberPadded} - ${extId}`;
}

/**
 * Refresh live Zalo groups from the Zalo SDK for a single connected ZaloAccount.
 */
export async function refreshLiveZaloGroupsForAccount(accountId: number): Promise<number> {
  const client = zaloPool.getAccountClient(accountId) as any;
  if (!client) return 0;

  const api = client.api ?? client;
  if (typeof api?.getAllGroups !== 'function') return 0;

  // Transient network failures ("TypeError: fetch failed") from the Zalo API are common;
  // retry once after a short backoff so a single blip doesn't skip a whole sync cycle.
  let raw: any;
  try {
    raw = await api.getAllGroups();
  } catch (err) {
    const transient = err instanceof Error && /fetch failed|timeout|ECONN|network/i.test(err.message);
    if (!transient) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    raw = await api.getAllGroups();
  }
  const verMap: Record<string, unknown> = raw?.gridVerMap ?? {};
  const infoMap: Record<string, any> = { ...(raw?.gridInfoMap ?? {}) };
  const groupIds = Object.keys(verMap).length > 0 ? Object.keys(verMap) : Object.keys(infoMap);

  if (groupIds.length === 0) return 0;

  let synced = 0;
  for (const groupId of groupIds) {
    try {
      let info = infoMap[groupId];
      if (!info?.name && !info?.groupName && typeof api.getGroupInfo === 'function') {
        try {
          const infoRes: any = await api.getGroupInfo(groupId);
          info =
            infoRes?.gridInfoMap?.[groupId] ??
            Object.values(infoRes?.gridInfoMap ?? {})[0] ??
            info;
        } catch {
          // non-critical per-group info error
        }
      }

      const name: string | undefined = info?.name || info?.groupName || undefined;
      const avatarUrl: string | undefined = info?.fullAvt || info?.avt || info?.avatar || undefined;
      const membersList = info?.memVerList || info?.memList || info?.members;
      const memberCount: number | undefined =
        typeof info?.totalMember === 'number'
          ? info.totalMember
          : typeof info?.memberCount === 'number'
            ? info.memberCount
            : Array.isArray(membersList)
              ? membersList.length
              : undefined;
      const ownerUid: string | undefined = info?.adminId || info?.creatorId || undefined;

      await zaloRepository.upsertGroup(groupId, accountId, {
        name,
        avatar_url: avatarUrl,
        member_count: memberCount,
        owner_zalo_uid: ownerUid,
      });
      synced++;
    } catch (err) {
      log.warn('Failed to upsert Zalo group during live refresh', {
        accountId,
        groupId,
        error: String(err),
      });
    }
  }

  return synced;
}

/**
 * Ensure all CS users in DB have sequential CVHT01, CVHT02... codes assigned.
 */
async function ensureAllCsUsersHaveCodes(): Promise<void> {
  try {
    const allUsers = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, code: true, roles: true },
    });
    if (!Array.isArray(allUsers)) return;

    let maxNum = 0;
    for (const u of allUsers) {
      if (!u.code) continue;
      const m = u.code.toUpperCase().match(/^CVHT0*(\d+)$/);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > maxNum) maxNum = val;
      }
    }

    for (const u of allUsers) {
      const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
      if (roles.includes('CS') && !u.code) {
        maxNum++;
        const nextCode = `CVHT${String(maxNum).padStart(2, '0')}`;
        await prisma.user.update({
          where: { id: u.id },
          data: { code: nextCode },
        });
      }
    }
  } catch (err) {
    log.warn('ensureAllCsUsersHaveCodes non-critical warning', { error: String(err) });
  }
}

/**
 * Normalize a CS code string (e.g. "CVHT1" or "01" -> "CVHT01").
 */
function normalizeCsCodeToStandard(rawCode?: string | null, fallbackCsId?: number | null): string | null {
  if (rawCode && rawCode.trim()) {
    const m = rawCode.trim().match(/(?:CVHT[-_\s]*)?0*(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > 0) {
        return `CVHT${String(num).padStart(2, '0')}`;
      }
    }
    return rawCode.trim().toUpperCase();
  }
  if (typeof fallbackCsId === 'number' && Number.isFinite(fallbackCsId) && fallbackCsId > 0) {
    return `CVHT${String(fallbackCsId).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Check if a group name contains the student external ID as a standalone token.
 */
function groupNameContainsExternalIdToken(groupName: string | null | undefined, externalId: string): boolean {
  if (!groupName || !externalId) return false;
  const escaped = externalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenRegex = new RegExp(`(?:^|[\\s\\-–—_:|\\[\\]()]+)${escaped}(?:$|[\\s\\-–—_:|\\[\\]()]+)`, 'i');
  return tokenRegex.test(groupName);
}

/**
 * Synchronize and automatically match Zalo & LINE care groups to eligible students.
 */
export async function syncAndMatchCareGroups(
  options?: SyncCareGroupsOptions,
): Promise<CareGroupSyncReport> {
  const triggeredBy = options?.triggeredBy ?? 'manual';
  const isSilent = Boolean(options?.silent);
  const startedAtDate = new Date();
  const startedAtMs = startedAtDate.getTime();

  if (!isSilent) {
    getIo()?.emit('omnichannel:sync-progress', {
      status: 'PROCESSING',
      stage: 'SYNCING_GROUPS',
      triggeredBy,
    });
  }

  let refreshedZaloAccounts = 0;
  let refreshedLineAccounts = 0;

  // ── Step 1: Live SDK Group Refresh (when refreshLiveGroups is true) ────────
  if (options?.refreshLiveGroups) {
    try {
      const targetZaloAccountIds = options.zaloAccountId
        ? [options.zaloAccountId]
        : zaloPool.getActiveAccountIds();

      for (const accId of targetZaloAccountIds) {
        try {
          await refreshLiveZaloGroupsForAccount(accId);
          refreshedZaloAccounts++;
        } catch (err) {
          log.warn('Live Zalo group refresh failed for account', {
            accountId: accId,
            error: String(err),
          });
        }
      }
    } catch (err) {
      log.warn('Live Zalo group refresh step error', { error: String(err) });
    }

    try {
      const lineWhere: any = options.lineAccountId
        ? { id: options.lineAccountId, archived_at: null }
        : { status: 'ACTIVE', archived_at: null };

      const activeLineAccounts =
        (await prisma.lineAccount?.findMany?.({
          where: lineWhere,
          select: { id: true },
        })) ?? [];

      if (activeLineAccounts.length > 0) {
        const { lineService } = await import('../line/line.service');
        for (const acc of activeLineAccounts) {
          try {
            await lineService.syncGroups(acc.id);
            refreshedLineAccounts++;
          } catch (err) {
            log.warn('Live LINE group refresh failed for account (best-effort)', {
              accountId: acc.id,
              error: String(err),
            });
          }
        }
      }
    } catch (err) {
      log.warn('Live LINE group refresh step error (best-effort)', { error: String(err) });
    }
  }

  // ── Step 2: Load Eligible Students & Groups from DB ───────────────────────
  await ensureAllCsUsersHaveCodes();

  // ── Non-destructive candidate collection (replaces the former orphan sweep) ─
  // OWNER RULING (2026-10-26): the previous unscoped
  // prisma.zaloContactRelation.deleteMany({ OR: [three-null-metadata rows,
  // archived-account rows] }) here was a CODE-CONFIRMED data-loss hazard (no
  // production loss observed) — any concurrent sync (login / webhook /
  // health-check / import-approval all reach syncAndMatchCareGroups) could
  // silently delete freshly created FRIEND relations whose metadata had not
  // been backfilled yet. Three null metadata fields only prove information is
  // MISSING, not that the relation is invalid, so this path now only COLLECTS
  // and LOGS such rows as candidates and deletes NOTHING.
  //
  // Archived-account relations are likewise kept here; the owner allows their
  // cleanup only with clear evidence + a recorded rule. Deletions of any kind
  // must come from an explicit, separately-reviewed maintenance operation —
  // intentionally NOT built here.
  //
  // Backfill coverage: when the sync matches a care group for a student, the
  // existing zaloContactRelation upsert below (keyed by
  // student_id + zalo_account_id) already fills zalo_group_id,
  // friend_zalo_uid, display_name and avatar_url for that relation — so
  // missing-metadata rows whose account owns a matched group get backfilled
  // automatically. Rows that cannot be backfilled from data this flow already
  // fetches remain logged as candidates.
  //
  // RESIDUAL RISK (flagged for owner): because nothing is deleted anymore,
  // candidate rows accumulate over time and need a future maintenance-operation
  // decision.
  try {
    const candidateRows: unknown[] =
      (await (prisma.zaloContactRelation as any)?.findMany?.({
        where: {
          OR: [
            {
              zalo_group_id: null,
              friend_zalo_uid: null,
              display_name: null,
            },
            {
              zalo_account: {
                archived_at: { not: null },
              },
            },
          ],
        },
        select: {
          id: true,
          student_id: true,
          zalo_account_id: true,
          relation_status: true,
          zalo_group_id: true,
          friend_zalo_uid: true,
          display_name: true,
          zalo_account: { select: { archived_at: true } },
        },
        take: 500,
      })) ?? [];

    if (candidateRows.length > 0) {
      type CandidateRow = {
        id: number;
        student_id: number;
        zalo_account_id: number;
        relation_status: string;
        zalo_group_id: number | null;
        friend_zalo_uid: string | null;
        display_name: string | null;
        zalo_account?: { archived_at: Date | null } | null;
      };
      const rows = candidateRows as CandidateRow[];
      const isMissingAllMetadata = (r: CandidateRow) =>
        r.zalo_group_id == null && r.friend_zalo_uid == null && r.display_name == null;
      const isArchivedAccount = (r: CandidateRow) => r.zalo_account?.archived_at != null;

      const missingMetadataRows = rows.filter(isMissingAllMetadata);
      const archivedAccountRows = rows.filter(isArchivedAccount);

      const DETAIL_CAP = 50;
      const toDetail = (r: CandidateRow) => ({
        relationId: r.id,
        studentId: r.student_id,
        zaloAccountId: r.zalo_account_id,
        relationStatus: r.relation_status,
        missingFields: [
          ...(r.zalo_group_id == null ? ['zalo_group_id'] : []),
          ...(r.friend_zalo_uid == null ? ['friend_zalo_uid'] : []),
          ...(r.display_name == null ? ['display_name'] : []),
        ],
        archivedAccount: isArchivedAccount(r),
      });

      log.warn('Care-group sync kept ZaloContactRelation candidates (no deletions performed)', {
        triggeredBy,
        scannedCount: rows.length,
        scanTruncated: rows.length >= 500,
        missingMetadataBackfill: {
          count: missingMetadataRows.length,
          note: 'Kept; needs metadata backfill (upsert fills these when a care group matches this student+account)',
          relations: missingMetadataRows.slice(0, DETAIL_CAP).map(toDetail),
        },
        archivedAccountMaintenance: {
          count: archivedAccountRows.length,
          note: 'Kept; cleanup only via an explicit, separately-reviewed maintenance operation',
          relations: archivedAccountRows.slice(0, DETAIL_CAP).map(toDetail),
        },
      });
    }
  } catch (err) {
    log.warn('ZaloContactRelation candidate collection (non-destructive) failed', {
      error: String(err),
    });
  }

  const studentWhere: any = {};
  if (options?.studentIds && options.studentIds.length > 0) {
    studentWhere.id = { in: options.studentIds };
  }
  if (options?.csId) {
    studentWhere.enrollments = { some: { cs_id: options.csId } };
  }

  const [students, zaloGroups, lineGroups] = await Promise.all([
    prisma.student.findMany({
      where: studentWhere,
      include: {
        enrollments: {
          ...(options?.csId ? { where: { cs_id: options.csId } } : {}),
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            cs: {
              select: { id: true, code: true, name: true, email: true },
            },
          },
        },
        zalo_contact_relations: {
          include: {
            zalo_account: {
              select: { id: true, display_name: true, status: true, archived_at: true },
            },
            zalo_group: {
              select: {
                id: true,
                zalo_group_id: true,
                name: true,
                avatar_url: true,
                member_count: true,
                zalo_account_id: true,
              },
            },
          },
        },
        line_contact_relations: {
          include: {
            line_account: {
              select: { id: true, display_name: true, status: true, archived_at: true },
            },
            line_group: {
              select: {
                id: true,
                line_group_id: true,
                name: true,
                avatar_url: true,
                member_count: true,
                line_account_id: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.zaloGroup.findMany({
      where: {
        zalo_account: { archived_at: null },
      },
      include: {
        zalo_account: {
          select: { id: true, cs_id: true, status: true, display_name: true },
        },
      },
    }),
    prisma.lineGroup?.findMany
      ? prisma.lineGroup.findMany({
          where: {
            line_account: { archived_at: null },
          },
          include: {
            line_account: {
              select: { id: true, cs_id: true, status: true, display_name: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // ── Step 3: Index Groups & Automatic Matching ─────────────────────────────
  type IndexedZaloGroup = (typeof zaloGroups)[number] & { parsed: ParsedCareGroupName | null };
  type IndexedLineGroup = (typeof lineGroups)[number] & { parsed: ParsedCareGroupName | null };

  const zaloByCodeAndExt = new Map<string, IndexedZaloGroup[]>();
  const zaloByExtOnly = new Map<string, IndexedZaloGroup[]>();
  const allIndexedZaloGroups: IndexedZaloGroup[] = [];

  for (const zg of zaloGroups) {
    const parsed = parseStudentCareGroupName(zg.name);
    const item: IndexedZaloGroup = { ...zg, parsed };
    allIndexedZaloGroups.push(item);

    if (parsed) {
      const codeKey = `${parsed.csCode.toUpperCase()}::${parsed.studentExternalId.toUpperCase()}`;
      const list1 = zaloByCodeAndExt.get(codeKey) ?? [];
      list1.push(item);
      zaloByCodeAndExt.set(codeKey, list1);

      const extKey = parsed.studentExternalId.toUpperCase();
      const list2 = zaloByExtOnly.get(extKey) ?? [];
      list2.push(item);
      zaloByExtOnly.set(extKey, list2);
    }
  }

  const lineByCodeAndExt = new Map<string, IndexedLineGroup[]>();
  const lineByExtOnly = new Map<string, IndexedLineGroup[]>();
  const allIndexedLineGroups: IndexedLineGroup[] = [];

  for (const lg of lineGroups) {
    const parsed = parseStudentCareGroupName(lg.name);
    const item: IndexedLineGroup = { ...lg, parsed };
    allIndexedLineGroups.push(item);

    if (parsed) {
      const codeKey = `${parsed.csCode.toUpperCase()}::${parsed.studentExternalId.toUpperCase()}`;
      const list1 = lineByCodeAndExt.get(codeKey) ?? [];
      list1.push(item);
      lineByCodeAndExt.set(codeKey, list1);

      const extKey = parsed.studentExternalId.toUpperCase();
      const list2 = lineByExtOnly.get(extKey) ?? [];
      list2.push(item);
      lineByExtOnly.set(extKey, list2);
    }
  }

  function pickBestGroup<
    T extends { zalo_account?: { cs_id: number; status: string } | null; line_account?: { cs_id: number; status: string } | null }
  >(candidates: T[], csId: number | null): T | null {
    if (!candidates || candidates.length === 0) return null;
    // 1. Owned by csId & ACTIVE
    if (csId != null) {
      const ownedActive = candidates.find((c) => {
        const acc = c.zalo_account ?? c.line_account;
        return acc?.cs_id === csId && acc?.status === 'ACTIVE';
      });
      if (ownedActive) return ownedActive;

      // 2. Owned by csId (any status)
      const ownedAny = candidates.find((c) => {
        const acc = c.zalo_account ?? c.line_account;
        return acc?.cs_id === csId;
      });
      if (ownedAny) return ownedAny;
    }

    // 3. Any ACTIVE account
    const anyActive = candidates.find((c) => {
      const acc = c.zalo_account ?? c.line_account;
      return acc?.status === 'ACTIVE';
    });
    if (anyActive) return anyActive;

    // 4. First candidate
    return candidates[0];
  }

  let newlyLinkedZaloCount = 0;
  let newlyLinkedLineCount = 0;
  const linkedItems: LinkedStudentCareGroupItem[] = [];
  const unlinkedItems: UnlinkedStudentCareGroupItem[] = [];

  for (const student of students) {
    const latestEnrollment = student.enrollments?.[0] ?? null;
    const cs = latestEnrollment?.cs ?? null;
    const csId = cs?.id ?? null;
    const csName = cs?.name ?? null;
    const csCode = normalizeCsCodeToStandard(cs?.code, csId);
    const extId = student.external_id?.trim() || null;

    let zaloLinked = false;
    let zaloGroupName: string | null = null;
    let zaloGroupId: string | null = null;
    let zaloAccountId: number | null = null;
    let newlyLinkedZaloForStudent = false;

    let lineLinked = false;
    let lineGroupName: string | null = null;
    let lineGroupId: string | null = null;
    let lineAccountId: number | null = null;
    let newlyLinkedLineForStudent = false;

    // Check existing Zalo relations (only valid FRIEND links on non-archived accounts with group, friend UID, or display_name)
    const existingZaloRelations = student.zalo_contact_relations ?? [];
    const isValidZaloRel = (r: (typeof existingZaloRelations)[number]) =>
      r.relation_status === 'FRIEND' &&
      (r as any).zalo_account?.archived_at == null &&
      (r.zalo_group_id != null || Boolean(r.friend_zalo_uid?.trim()) || Boolean(r.display_name?.trim()));

    const existingZaloFriendRel =
      existingZaloRelations.find((r) => isValidZaloRel(r) && (r.target_type === 'GROUP' || r.zalo_group_id != null)) ??
      existingZaloRelations.find(isValidZaloRel);

    if (existingZaloFriendRel) {
      zaloLinked = true;
      const isGroupLink =
        existingZaloFriendRel.target_type === 'GROUP' || existingZaloFriendRel.zalo_group_id != null;
      zaloGroupName =
        existingZaloFriendRel.zalo_group?.name ??
        (existingZaloFriendRel.display_name
          ? isGroupLink
            ? existingZaloFriendRel.display_name
            : `${existingZaloFriendRel.display_name} (Cá nhân)`
          : `UID: ${existingZaloFriendRel.friend_zalo_uid}`);
      zaloGroupId =
        existingZaloFriendRel.zalo_group?.zalo_group_id ??
        existingZaloFriendRel.friend_zalo_uid ??
        null;
      zaloAccountId = existingZaloFriendRel.zalo_account_id;
    }

    // Check existing LINE relations (only valid FRIEND links on non-archived accounts with group, friend UID, or display_name)
    const existingLineRelations = student.line_contact_relations ?? [];
    const isValidLineRel = (r: (typeof existingLineRelations)[number]) =>
      r.relation_status === 'FRIEND' &&
      (r as any).line_account?.archived_at == null &&
      (r.line_group_id != null || Boolean(r.friend_line_uid?.trim()) || Boolean(r.display_name?.trim()));

    const existingLineFriendRel =
      existingLineRelations.find((r) => isValidLineRel(r) && (r.target_type === 'GROUP' || r.line_group_id != null)) ??
      existingLineRelations.find(isValidLineRel);

    if (existingLineFriendRel) {
      lineLinked = true;
      const isGroupLink =
        existingLineFriendRel.target_type === 'GROUP' || existingLineFriendRel.line_group_id != null;
      lineGroupName =
        existingLineFriendRel.line_group?.name ??
        (existingLineFriendRel.display_name
          ? isGroupLink
            ? existingLineFriendRel.display_name
            : `${existingLineFriendRel.display_name} (Cá nhân)`
          : `UID: ${existingLineFriendRel.friend_line_uid}`);
      lineGroupId =
        existingLineFriendRel.line_group?.line_group_id ??
        existingLineFriendRel.friend_line_uid ??
        null;
      lineAccountId = existingLineFriendRel.line_account_id;
    }

    if (extId) {
      const extUpper = extId.toUpperCase();

      // ── Match ZaloGroup ──
      let matchedZaloGroup: IndexedZaloGroup | null = null;
      if (csCode) {
        const exactKey = `${csCode.toUpperCase()}::${extUpper}`;
        matchedZaloGroup = pickBestGroup(zaloByCodeAndExt.get(exactKey) ?? [], csId);
      }
      if (!matchedZaloGroup && csId != null) {
        // Fallback: ZaloGroup on an account owned by csId whose parsed studentExternalId or group name token matches
        const parsedCandidates = (zaloByExtOnly.get(extUpper) ?? []).filter(
          (g) => g.zalo_account?.cs_id === csId,
        );
        if (parsedCandidates.length > 0) {
          matchedZaloGroup = pickBestGroup(parsedCandidates, csId);
        } else {
          const tokenCandidates = allIndexedZaloGroups.filter(
            (g) => g.zalo_account?.cs_id === csId && groupNameContainsExternalIdToken(g.name, extId),
          );
          matchedZaloGroup = pickBestGroup(tokenCandidates, csId);
        }
      }

      if (matchedZaloGroup) {
        const alreadyLinkedSameGroup = existingZaloRelations.some(
          (r) =>
            r.zalo_account_id === matchedZaloGroup!.zalo_account_id &&
            r.relation_status === 'FRIEND' &&
            r.target_type === 'GROUP' &&
            r.zalo_group_id === matchedZaloGroup!.id,
        );

        await prisma.zaloContactRelation.upsert({
          where: {
            student_id_zalo_account_id: {
              student_id: student.id,
              zalo_account_id: matchedZaloGroup.zalo_account_id,
            },
          },
          create: {
            student_id: student.id,
            zalo_account_id: matchedZaloGroup.zalo_account_id,
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            zalo_group_id: matchedZaloGroup.id,
            friend_zalo_uid: matchedZaloGroup.zalo_group_id,
            display_name: matchedZaloGroup.name,
            avatar_url: matchedZaloGroup.avatar_url,
            matched_by: 'AUTO_GROUP_NAME',
            last_checked_at: new Date(),
          },
          update: {
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            zalo_group_id: matchedZaloGroup.id,
            friend_zalo_uid: matchedZaloGroup.zalo_group_id,
            display_name: matchedZaloGroup.name,
            avatar_url: matchedZaloGroup.avatar_url,
            matched_by: 'AUTO_GROUP_NAME',
            last_checked_at: new Date(),
          },
        });

        if (!alreadyLinkedSameGroup) {
          newlyLinkedZaloCount++;
          newlyLinkedZaloForStudent = true;
        }
        zaloLinked = true;
        zaloGroupName = matchedZaloGroup.name;
        zaloGroupId = matchedZaloGroup.zalo_group_id;
        zaloAccountId = matchedZaloGroup.zalo_account_id;
      }

      // ── Match LineGroup ──
      let matchedLineGroup: IndexedLineGroup | null = null;
      if (csCode) {
        const exactKey = `${csCode.toUpperCase()}::${extUpper}`;
        matchedLineGroup = pickBestGroup(lineByCodeAndExt.get(exactKey) ?? [], csId);
      }
      if (!matchedLineGroup && csId != null) {
        const parsedCandidates = (lineByExtOnly.get(extUpper) ?? []).filter(
          (g) => g.line_account?.cs_id === csId,
        );
        if (parsedCandidates.length > 0) {
          matchedLineGroup = pickBestGroup(parsedCandidates, csId);
        } else {
          const tokenCandidates = allIndexedLineGroups.filter(
            (g) => g.line_account?.cs_id === csId && groupNameContainsExternalIdToken(g.name, extId),
          );
          matchedLineGroup = pickBestGroup(tokenCandidates, csId);
        }
      }

      if (matchedLineGroup) {
        const alreadyLinkedSameLineGroup = existingLineRelations.some(
          (r) =>
            r.line_account_id === matchedLineGroup!.line_account_id &&
            r.relation_status === 'FRIEND' &&
            r.target_type === 'GROUP' &&
            r.line_group_id === matchedLineGroup!.id,
        );

        await prisma.lineContactRelation.upsert({
          where: {
            student_id_line_account_id: {
              student_id: student.id,
              line_account_id: matchedLineGroup.line_account_id,
            },
          },
          create: {
            student_id: student.id,
            line_account_id: matchedLineGroup.line_account_id,
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            line_group_id: matchedLineGroup.id,
            friend_line_uid: matchedLineGroup.line_group_id,
            display_name: matchedLineGroup.name,
            avatar_url: matchedLineGroup.avatar_url,
            matched_by: 'AUTO_GROUP_NAME',
            last_checked_at: new Date(),
          },
          update: {
            relation_status: 'FRIEND',
            target_type: 'GROUP',
            line_group_id: matchedLineGroup.id,
            friend_line_uid: matchedLineGroup.line_group_id,
            display_name: matchedLineGroup.name,
            avatar_url: matchedLineGroup.avatar_url,
            matched_by: 'AUTO_GROUP_NAME',
            last_checked_at: new Date(),
          },
        });

        if (!alreadyLinkedSameLineGroup) {
          newlyLinkedLineCount++;
          newlyLinkedLineForStudent = true;
        }
        lineLinked = true;
        lineGroupName = matchedLineGroup.name;
        lineGroupId = matchedLineGroup.line_group_id;
        lineAccountId = matchedLineGroup.line_account_id;
      }
    }

    // ── Step 4: Categorize student into linkedItems vs unlinkedItems ────────
    if (zaloLinked || lineLinked) {
      linkedItems.push({
        studentId: student.id,
        studentExternalId: extId ?? '',
        studentName: student.full_name,
        csId: csId ?? 0,
        csName,
        csCode,
        zaloLinked,
        zaloGroupName,
        zaloGroupId,
        zaloAccountId,
        lineLinked,
        lineGroupName,
        lineGroupId,
        lineAccountId,
        newlyLinked: newlyLinkedZaloForStudent || newlyLinkedLineForStudent,
      });
    } else {
      const expectedGroupPrefix = formatExpectedCareGroupPrefix(csCode ?? csId, extId);
      const suggestedGroupName = `${expectedGroupPrefix} - ${student.full_name}`;

      let reason: string;
      if (!extId) {
        reason = 'Học viên chưa có mã học viên (external_id) trên hệ thống';
      } else if (!csId) {
        reason = `Học viên (${extId}) chưa được phân công CSKH phụ trách`;
      } else {
        reason = `Chưa tìm thấy nhóm Zalo/LINE bắt đầu bằng "${expectedGroupPrefix}" trên tài khoản của ${csName || csCode || `CS #${csId}`}`;
      }

      unlinkedItems.push({
        studentId: student.id,
        studentExternalId: extId,
        studentName: student.full_name,
        csId,
        csName,
        csCode,
        expectedGroupPrefix,
        suggestedGroupName,
        reason,
      });
    }
  }

  const completedAtDate = new Date();
  const report: CareGroupSyncReport = {
    triggeredBy,
    startedAt: startedAtDate.toISOString(),
    completedAt: completedAtDate.toISOString(),
    durationMs: Math.max(0, completedAtDate.getTime() - startedAtMs),
    refreshedZaloAccounts,
    refreshedLineAccounts,
    totalZaloGroupsScanned: zaloGroups.length,
    totalLineGroupsScanned: lineGroups.length,
    totalEligibleStudents: students.length,
    linkedStudentsCount: linkedItems.length,
    unlinkedStudentsCount: unlinkedItems.length,
    newlyLinkedZaloCount,
    newlyLinkedLineCount,
    linkedItems,
    unlinkedItems,
  };

  if (!isSilent) {
    getIo()?.emit('omnichannel:sync-complete', report);
  }

  log.info('Student care group sync & match completed', {
    triggeredBy,
    totalEligibleStudents: report.totalEligibleStudents,
    linkedStudentsCount: report.linkedStudentsCount,
    unlinkedStudentsCount: report.unlinkedStudentsCount,
    newlyLinkedZaloCount: report.newlyLinkedZaloCount,
    newlyLinkedLineCount: report.newlyLinkedLineCount,
    durationMs: report.durationMs,
  });

  return report;
}

registerCareGroupAutoSyncRunner(syncAndMatchCareGroups);
