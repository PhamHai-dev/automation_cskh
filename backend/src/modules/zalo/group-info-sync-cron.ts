/**
 * group-info-sync-cron.ts — Lam tuoi avatar/ten/si so nhom Zalo dinh ky (6h).
 *
 * Ported from ZaloCRM group-info-sync-cron.ts (178 lines) -> single-org, Int IDs.
 *
 * Van de: avatar nhom la URL Zalo CDN — HET HAN theo thoi gian. Cron nay CHU DONG
 * refresh dinh ky cho nhom im lang (passive path chi update khi co tin nhan moi).
 *
 * Moi 6h:
 *   - Query connected ZaloAccount (status='connected')
 *   - Voi moi nick: lay cac ZaloGroup thuoc nick -> goi getGroupInfo
 *   - Diff-then-update: chi ghi name/avatar_url/member_count khi DOI, KHONG ghi de
 *     bang rong/null (giu gia tri cu neu SDK tra trong)
 *   - Mutex chong overlap; sequential + stagger 300ms tranh burst Zalo rate-limit
 *   - Cap MAX_GROUPS_PER_TICK=800 chan tick qua nang (log phan bi bo)
 *
 * Adaptations from ZaloCRM:
 *   - CRM doc Conversation (groupName/groupAvatarUrl/groupMembersCount). Schema ta
 *     group info nam tren ZaloGroup (name/avatar_url/member_count) — query doi tuong.
 *   - No runSystemQuery/withTenant/orgId -> single-org direct prisma
 *   - No mirrorRemoteMediaUrl (S3) -> buildGroupUpdates da stub mirror (giu URL goc)
 *   - Int IDs, createLogger
 */
import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { buildGroupUpdates } from './group-info-refresh';

const log = createLogger('GroupInfoSyncCron');

// 6h: avatar/ten nhom doi cham. URL CDN thuong song nhieu gio -> 6h du tuoi.
const CRON_SCHEDULE = '0 */6 * * *';

// Stagger giua moi getGroupInfo (group read nang hon friend) -> tranh burst rate-limit.
const STAGGER_MS = 300;

// Tran so group xu ly moi tick — chan tick qua nang khi co rat nhieu nhom.
const MAX_GROUPS_PER_TICK = 800;

let cronRunning = false;
let cronTask: ReturnType<typeof cron.schedule> | null = null;

/** Start cron lam tuoi group info. Idempotent — da start thi no-op. */
export function startGroupInfoSyncCron(): void {
  if (cronTask) {
    log.info('[group-info-sync-cron] Already started, skipping');
    return;
  }
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    if (cronRunning) {
      log.warn('[group-info-sync-cron] Previous cycle still running, skipping this tick');
      return;
    }
    cronRunning = true;
    const startedAt = Date.now();
    try {
      await runCronCycle();
    } catch (err) {
      log.error('[group-info-sync-cron] Unexpected cycle error', { error: String(err) });
    } finally {
      cronRunning = false;
      log.info(`[group-info-sync-cron] Cycle completed in ${Date.now() - startedAt}ms`);
    }
  });
  log.info(`[group-info-sync-cron] Started, schedule="${CRON_SCHEDULE}"`);
}

/** Stop cron (test cleanup / graceful shutdown). */
export function stopGroupInfoSyncCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    log.info('[group-info-sync-cron] Stopped');
  }
}

/** Single cycle: iterate connected accounts sequential voi stagger. */
async function runCronCycle(): Promise<void> {
  const accounts = await prisma.zaloAccount.findMany({
    where: { status: 'connected' as any },
    select: { id: true, display_name: true },
  });

  if (accounts.length === 0) {
    log.info('[group-info-sync-cron] No connected accounts, nothing to sync');
    return;
  }

  log.info(`[group-info-sync-cron] Starting cycle: ${accounts.length} connected account(s)`);

  let totalGroups = 0;
  let totalRefreshed = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const acc of accounts) {
    if (totalGroups >= MAX_GROUPS_PER_TICK) {
      totalSkipped++; // con nick chua xu ly -> dem de log
      continue;
    }
    try {
      const stat = await refreshAccountGroups(acc.id, MAX_GROUPS_PER_TICK - totalGroups);
      totalGroups += stat.processed;
      totalRefreshed += stat.refreshed;
      totalErrors += stat.errors;
      totalSkipped += stat.skipped;
    } catch (err) {
      totalErrors++;
      log.error(`[group-info-sync-cron] Account ${acc.id} (${acc.display_name}) failed`, { error: String(err) });
    }
  }

  log.info(
    `[group-info-sync-cron] Cycle stats: accounts=${accounts.length} groups=${totalGroups} ` +
      `refreshed=${totalRefreshed} errors=${totalErrors} skipped=${totalSkipped} (cap=${MAX_GROUPS_PER_TICK})`,
  );
}

/**
 * Refresh group info cho 1 nick. `budget` = so group toi da con duoc xu ly tick nay.
 * Tra thong ke de cycle tong hop. Moi loi per-group nuot tai day.
 */
async function refreshAccountGroups(
  accountId: number,
  budget: number,
): Promise<{ processed: number; refreshed: number; errors: number; skipped: number }> {
  const stat = { processed: 0, refreshed: 0, errors: 0, skipped: 0 };

  const groups = await prisma.zaloGroup.findMany({
    where: { zalo_account_id: accountId },
    select: {
      id: true,
      zalo_group_id: true,
      name: true,
      avatar_url: true,
      member_count: true,
    },
  });

  for (const g of groups) {
    if (stat.processed >= budget) {
      stat.skipped++;
      continue;
    }
    stat.processed++;
    const groupId = g.zalo_group_id;
    try {
      // Core dung chung voi path tuc thi (group-info-refresh.ts): getGroupInfo + diff.
      const updates = await buildGroupUpdates(accountId, groupId, g);
      if (updates) {
        await prisma.zaloGroup.update({ where: { id: g.id }, data: updates });
        stat.refreshed++;
      }
    } catch (err) {
      stat.errors++;
      log.warn(`[group-info-sync-cron] Group ${groupId} (acc ${accountId}) refresh failed`, { error: String(err) });
    }
    // Stagger giua cac group -> tranh burst Zalo rate-limit.
    if (STAGGER_MS > 0) await new Promise((r) => setTimeout(r, STAGGER_MS));
  }

  return stat;
}

/** Export cho test injection — chay 1 cycle truc tiep, khong scheduling. */
export async function runGroupInfoSyncCycleNow(): Promise<void> {
  return runCronCycle();
}
