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

import { careGroupLinksRepository } from '../omnichannel/care-group-links.repository';
import { careGroupSettingsRepository } from '../omnichannel/care-group-settings.repository';
import { classifyCareGroupName, parseCareGroupIdentity, suggestCareGroupName, type CareProgram } from '../omnichannel/care-group-rules';

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

      const upsertedGroup = await zaloRepository.upsertGroup(groupId, accountId, {
        name,
        avatar_url: avatarUrl,
        member_count: memberCount,
        owner_zalo_uid: ownerUid,
      });

      if (info && upsertedGroup?.id) {
        try {
          const memberMap = new Map<string, { display_name?: string; avatar_url?: string }>();
          if (Array.isArray(info.currentMems)) {
            for (const m of info.currentMems) {
              const uid = String(m?.id ?? m?.uid ?? '').split('_')[0].trim();
              if (!uid) continue;
              memberMap.set(uid, {
                display_name: m?.dName || m?.zaloName || m?.displayName || undefined,
                avatar_url: m?.avatar || m?.avt || undefined,
              });
            }
          }
          const rawIds = [
            ...(Array.isArray(info.memVerList) ? info.memVerList : []),
            ...(Array.isArray(info.memberIds) ? info.memberIds : []),
          ];
          for (const rawUid of rawIds) {
            const uid = String(rawUid ?? '').split('_')[0].trim();
            if (!uid || memberMap.has(uid)) continue;
            memberMap.set(uid, {});
          }
          const entries = Array.from(memberMap.entries()).slice(0, 200);
          for (const [uid, meta] of entries) {
            try {
              await zaloRepository.upsertGroupMember(upsertedGroup.id, uid, meta);
            } catch {
              // ignore individual member upsert failure
            }
          }
        } catch {
          // ignore member extraction errors
        }
      }
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
    const m = rawCode.trim().match(/^(?:CVHT[-_\s]*)?0*(\d+)$/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (Number.isFinite(num) && num > 0) {
        return `CVHT${String(num).padStart(2, '0')}`;
      }
    }
    return null;
  }
  if (typeof fallbackCsId === 'number' && Number.isFinite(fallbackCsId) && fallbackCsId > 0) {
    return `CVHT${String(fallbackCsId).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Synchronize and automatically match Zalo & LINE care groups to eligible students.
 */
export async function syncAndMatchCareGroups(
  options?: SyncCareGroupsOptions,
): Promise<CareGroupSyncReport> {
  const triggeredBy = options?.triggeredBy ?? 'manual';
  const applyMatches = options?.applyMatches !== false;
  const rules = await careGroupSettingsRepository.read();
  const isSilent = Boolean(options?.silent);
  const startedAtDate = new Date();
  const startedAtMs = startedAtDate.getTime();

  if (!isSilent && options?.csId) {
    getIo()?.to(`user:${options.csId}`).emit('omnichannel:sync-progress', {
      status: 'PROCESSING',
      stage: 'SYNCING_GROUPS',
      triggeredBy,
    });
  }

  let refreshedZaloAccounts = 0;
  let refreshedLineAccounts = 0;

  // ── Step 1: Live SDK Group Refresh (when refreshLiveGroups is true) ────────
  if (applyMatches && options?.refreshLiveGroups) {
    try {
      const allowed = await prisma.zaloAccount.findMany({ where: { archived_at: null, ...(options.csId ? { cs_id: options.csId } : {}), ...(options.zaloAccountId ? { id: options.zaloAccountId } : {}) }, select: { id: true } });
      const targetZaloAccountIds = allowed.map(a => a.id).filter(id => zaloPool.getActiveAccountIds().includes(id));

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
          where: { ...lineWhere, ...(options.csId ? { cs_id: options.csId } : {}) },
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
  if (applyMatches) await ensureAllCsUsersHaveCodes();

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
          include: {
            cs: {
              select: { id: true, code: true, name: true, email: true },
            },
          },
        },
        zalo_contact_relations: {
          include: {
            zalo_account: {
              select: { id: true, cs_id: true, display_name: true, status: true, archived_at: true },
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
              select: { id: true, cs_id: true, display_name: true, status: true, archived_at: true },
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
        zalo_account: { archived_at: null, ...(options?.csId ? { cs_id: options.csId } : {}) },
        ...(options?.zaloAccountId ? { zalo_account_id: options.zaloAccountId } : {}),
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
            line_account: { archived_at: null, ...(options?.csId ? { cs_id: options.csId } : {}) },
            ...(options?.lineAccountId ? { line_account_id: options.lineAccountId } : {}),
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

  const indexedZalo = zaloGroups.map(group => ({ ...group, parsed: parseCareGroupIdentity(group.name, rules) }));
  const indexedLine = lineGroups.map(group => ({ ...group, parsed: parseCareGroupIdentity(group.name, rules) }));
  let newlyLinkedZaloCount = 0;
  let newlyLinkedLineCount = 0;
  const linkedItems: LinkedStudentCareGroupItem[] = [];
  const unlinkedItems: UnlinkedStudentCareGroupItem[] = [];

  for (const student of students) {
    // One coverage unit per program + CS, regardless of repeated enrollments.
    const cohorts = new Map<string, (typeof student.enrollments)[number]>();
    for (const enrollment of student.enrollments) {
      if (!['KAIWA', 'JLPT'].includes(enrollment.program_type)) continue;
      const key = enrollment.program_type + ':' + enrollment.cs_id;
      if (!cohorts.has(key)) cohorts.set(key, enrollment);
    }
    for (const enrollment of cohorts.values()) {
      const programType = enrollment.program_type as CareProgram;
      const csId = enrollment.cs_id;
      const csName = enrollment.cs?.name || null;
      const csCode = normalizeCsCodeToStandard(enrollment.cs?.code); // Never invent CS sequence from user ID.
      const extId = student.external_id?.trim() || null;
      const suggestedGroupName = csCode && extId ? suggestCareGroupName(rules, programType, {
        csNumber: csCode.replace(/\D/g, ''), studentId: extId, studentName: student.full_name,
        // Do not copy Enrollment.level into a group name. The provider suffix is
        // free-form and is only a JLPT marker, never a student matching key.
      }) : '';
      const warnings: string[] = [];
      let newlyLinked = false;

      async function resolve(platform: 'ZALO' | 'LINE') {
        const isZalo = platform === 'ZALO';
        const accountField = isZalo ? 'zalo_account_id' : 'line_account_id';
        const groupField = isZalo ? 'zalo_group_id' : 'line_group_id';
        const accountKey = isZalo ? 'zalo_account' : 'line_account';
        const groupKey = isZalo ? 'zalo_group' : 'line_group';
        const uidField = isZalo ? 'friend_zalo_uid' : 'friend_line_uid';
        const restrictedAccountId = isZalo ? options?.zaloAccountId : options?.lineAccountId;
        const allRelations: any[] = isZalo ? student.zalo_contact_relations : student.line_contact_relations;
        const ownedRelations = allRelations.filter(r => r[accountKey]?.cs_id === csId && r[accountKey]?.archived_at == null && (!restrictedAccountId || r[accountField] === restrictedAccountId));
        const exactRelations = ownedRelations.filter(r => r.program_type === programType);
        const autoProgramMismatch = (r: any) => r.matched_by === 'AUTO_GROUP_NAME' && r[groupField] != null &&
          classifyCareGroupName(r[groupKey]?.name || r.display_name, rules, student.full_name)?.programType !== programType;
        const valid = (r: any) => !autoProgramMismatch(r) && r.relation_status === 'FRIEND' && (r[groupField] != null || Boolean(r[uidField]));
        const mismatched = exactRelations.filter(autoProgramMismatch);
        if (mismatched.length) {
          warnings.push(platform + ': liên kết tự động cũ sai chương trình; cần đối chiếu lại');
          if (applyMatches && rules.enabled) for (const rel of mismatched) await careGroupLinksRepository.suspendAutomatic(platform, rel.id);
        }
        const manual = exactRelations.filter(r => valid(r) && r.matched_by === 'MANUAL');
        if (manual.length > 1) { warnings.push(platform + ': có nhiều liên kết thủ công, cần kiểm tra'); return null; }
        if (manual.length === 1) return manual[0];
        if (ownedRelations.some(r => r.program_type === 'ALL' && (r.target_type === 'GROUP' || r[groupField] != null))) warnings.push(platform + ': liên kết nhóm cũ chưa xác định chương trình; cần chọn lại nhóm');
        const candidates: any[] = (isZalo ? indexedZalo : indexedLine).filter((g: any) =>
          !['DISABLED', 'BANNED'].includes(g[accountKey]?.status) && g[accountKey]?.cs_id === csId && g.parsed?.csCode === csCode &&
          g.parsed?.studentId.toUpperCase() === extId?.toUpperCase() && classifyCareGroupName(g.name, rules, student.full_name)?.programType === programType);
        const sharedUser = ownedRelations.find(r => valid(r) && r.program_type === 'ALL' && r.target_type === 'USER' && r[groupField] == null && (isZalo || !/^[cC]/.test(r.friend_line_uid || '')));
        if (candidates.length > 1) {
          warnings.push(platform + ': trùng ' + candidates.length + ' nhóm ' + programType + ', cần chọn thủ công');
          // Retain records and metadata, but stop automatic delivery to an ambiguous group.
          if (applyMatches && rules.enabled) for (const rel of exactRelations.filter(r => r.matched_by === 'AUTO_GROUP_NAME')) {
            await careGroupLinksRepository.suspendAutomatic(platform, rel.id);
          }
          return null;
        }
        // A read-only report reports only persisted links. It never fabricates a new link.
        if (!applyMatches || !rules.enabled) return exactRelations.find(valid) || sharedUser || null;
        if (!candidates.length || !extId || !csCode) return exactRelations.find(valid) || sharedUser || null;
        const group = candidates[0];
        const existing = exactRelations.find(r => r[accountField] === group[accountField]);
        // Respect every explicit manual decision, including blocked/non-friend links.
        if (existing?.matched_by === 'MANUAL') return valid(existing) ? existing : null;
        const relation: any = isZalo ? await careGroupLinksRepository.matchZalo(student.id, programType, group) : await careGroupLinksRepository.matchLine(student.id, programType, group);
        if (!relation || !valid(relation)) return null;
        if ((!existing || !valid(existing) || existing[groupField] !== relation[groupField]) && relation.matched_by === 'AUTO_GROUP_NAME') {
          newlyLinked = true;
          if (isZalo) newlyLinkedZaloCount++; else newlyLinkedLineCount++;
        }
        return relation;
      }
      const zalo = await resolve('ZALO');
      const line = await resolve('LINE');
      const base = { studentId: student.id, studentExternalId: extId, studentName: student.full_name, studentPhone: student.phone, studentEmail: student.email, csId, csName, csCode, programType };
      if (zalo || line) linkedItems.push({ ...base, studentExternalId: extId || '', csId: csId || 0, suggestedGroupName, warnings,
        zaloLinked: Boolean(zalo), zaloGroupName: zalo?.zalo_group?.name || zalo?.display_name, zaloGroupId: zalo?.zalo_group?.zalo_group_id || zalo?.friend_zalo_uid, zaloAccountId: zalo?.zalo_account_id,
        lineLinked: Boolean(line), lineGroupName: line?.line_group?.name || line?.display_name, lineGroupId: line?.line_group?.line_group_id || line?.friend_line_uid, lineAccountId: line?.line_account_id, newlyLinked });
      else unlinkedItems.push({ ...base, expectedGroupPrefix: suggestedGroupName, suggestedGroupName,
        reason: warnings.join('; ') || (!extId ? 'Thiếu mã học viên' : !csCode ? 'Thiếu mã CVHT hợp lệ' : 'Chưa liên kết nhóm ' + programType + ' theo cấu hình; cần đồng bộ hoặc chọn thủ công') });
    }
  }
  const completedAtDate = new Date();
  const report: CareGroupSyncReport = {
    triggeredBy, startedAt: startedAtDate.toISOString(), completedAt: completedAtDate.toISOString(),
    durationMs: Math.max(0, completedAtDate.getTime() - startedAtMs), refreshedZaloAccounts, refreshedLineAccounts,
    totalZaloGroupsScanned: zaloGroups.length, totalLineGroupsScanned: lineGroups.length,
    totalEligibleStudents: linkedItems.length + unlinkedItems.length, linkedStudentsCount: linkedItems.length, unlinkedStudentsCount: unlinkedItems.length,
    newlyLinkedZaloCount, newlyLinkedLineCount, linkedItems, unlinkedItems,
  };
  if (!isSilent) {
    const owners = options?.csId ? [options.csId] : [...new Set([...linkedItems, ...unlinkedItems].map(item => item.csId).filter((id): id is number => id != null))];
    for (const owner of owners) {
      const ownerLinked = linkedItems.filter(item => item.csId === owner);
      const ownerUnlinked = unlinkedItems.filter(item => item.csId === owner);
      getIo()?.to(`user:${owner}`).emit('omnichannel:sync-complete', { ...report,
        linkedItems: ownerLinked, unlinkedItems: ownerUnlinked, totalEligibleStudents: ownerLinked.length + ownerUnlinked.length,
        linkedStudentsCount: ownerLinked.length, unlinkedStudentsCount: ownerUnlinked.length,
      });
    }
  }
  return report;
}
registerCareGroupAutoSyncRunner(syncAndMatchCareGroups);
