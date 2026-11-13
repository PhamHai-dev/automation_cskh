import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { activityRetentionCutoff, ACTIVITY_RETENTION_DAYS, ACTIVITY_TIME_ZONE } from './activity-time';

const log = createLogger('ActivityLogRetention');
const RETENTION_CRON = '30 2 * * *';
const SYSTEM_EMAIL = 'activity-retention@system.invalid';
const SYSTEM_PASSWORD = '!SYSTEM_ACCOUNT_NO_LOGIN!';
let retentionTask: ReturnType<typeof cron.schedule> | null = null;
let isPurging = false;

async function ensureRetentionSystemActor() {
  const actor = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: {
      email: SYSTEM_EMAIL,
      name: 'Hệ thống dọn lịch sử hoạt động',
      password_hash: SYSTEM_PASSWORD,
      roles: [],
      active: false,
    },
  });
  if (actor.active || actor.password_hash !== SYSTEM_PASSWORD || !Array.isArray(actor.roles) || actor.roles.length !== 0) {
    throw new Error('Reserved activity-retention identity is not a valid system account');
  }
  return actor;
}

export async function purgeExpiredActivityHistory(now = new Date()) {
  const cutoff = activityRetentionCutoff(now);
  const actor = await ensureRetentionSystemActor();
  const result = await prisma.$transaction(async (tx) => {
    const [audit, login, sync] = await Promise.all([
      tx.auditLog.deleteMany({ where: { created_at: { lt: cutoff } } }),
      tx.loginAudit.deleteMany({ where: { created_at: { lt: cutoff } } }),
      tx.googleSheetSyncRun.deleteMany({ where: { started_at: { lt: cutoff } } }),
    ]);
    await tx.auditLog.create({
      data: {
        user_id: actor.id,
        action: 'ACTIVITY_LOG_RETENTION_PURGED',
        entity_type: 'ActivityHistoryRetention',
        entity_id: cutoff.toISOString(),
        after_data: {
          retentionDays: ACTIVITY_RETENTION_DAYS,
          cutoff: cutoff.toISOString(),
          auditLogsDeleted: audit.count,
          loginAuditsDeleted: login.count,
          syncRunsDeleted: sync.count,
          physicalBackupFilesDeleted: 0,
          _meta: {
            module: 'SYSTEM',
            summary: `Đã dọn ${audit.count + login.count + sync.count} bản ghi lịch sử quá ${ACTIVITY_RETENTION_DAYS} ngày`,
          },
        },
      },
    });
    return { cutoff, auditLogsDeleted: audit.count, loginAuditsDeleted: login.count, syncRunsDeleted: sync.count };
  });
  log.info('Expired activity history purged', result);
  return result;
}

export function startActivityLogRetentionScheduler(): void {
  if (retentionTask) return;
  retentionTask = cron.schedule(RETENTION_CRON, async () => {
    if (isPurging) return;
    isPurging = true;
    try {
      await purgeExpiredActivityHistory();
    } catch (error) {
      log.error('Activity history retention failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isPurging = false;
    }
  }, { timezone: ACTIVITY_TIME_ZONE });
  log.info('Activity history retention scheduler started', { schedule: RETENTION_CRON, timezone: ACTIVITY_TIME_ZONE });
}

export function stopActivityLogRetentionScheduler(): void {
  retentionTask?.stop();
  retentionTask = null;
}
