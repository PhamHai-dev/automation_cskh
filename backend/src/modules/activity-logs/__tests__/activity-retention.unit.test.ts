jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: jest.fn() },
}));

jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import cron from 'node-cron';
import { prisma } from '../../../prisma/client';
import {
  purgeExpiredActivityHistory,
  startActivityLogRetentionScheduler,
  stopActivityLogRetentionScheduler,
} from '../activity-log-retention';
import {
  activityRetentionCutoff,
  resolveActivityDateRange,
  vietnamDateTime,
  vietnamTodayBounds,
} from '../activity-time';
import {
  activityExportQuerySchema,
  auditLogQuerySchema,
  loginAuditQuerySchema,
} from '../activity-logs.schema';

const mockPrisma = prisma as any;
const mockCron = cron as any;

describe('activity history schema, timezone and retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopActivityLogRetentionScheduler();
  });

  it('validates pagination and rejects invalid or over-30-day ranges', () => {
    expect(auditLogQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25, module: 'ALL' });
    expect(loginAuditQuerySchema.parse({ pageSize: '100' }).pageSize).toBe(100);
    expect(() => auditLogQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => auditLogQuerySchema.parse({ fromDate: '2026-11-10', toDate: '2026-11-01' })).toThrow();
    expect(() => activityExportQuerySchema.parse({ view: 'audit', fromDate: '2026-10-01', toDate: '2026-11-01' })).toThrow();
  });

  it('uses Vietnam boundaries, default seven-day window and UTC+7 CSV labels', () => {
    const now = new Date('2026-11-13T05:00:00.000Z');
    const range = resolveActivityDateRange(undefined, undefined, now);
    expect(range.fromDate).toBe('2026-11-07');
    expect(range.toDate).toBe('2026-11-13');
    const today = vietnamTodayBounds(now);
    expect(today.from.toISOString()).toBe('2026-11-12T17:00:00.000Z');
    expect(today.to.toISOString()).toBe('2026-11-13T16:59:59.999Z');
    expect(vietnamDateTime('2026-11-13T05:34:56.000Z')).toBe('13/11/2026 12:34:56 UTC+7');
    expect(activityRetentionCutoff(now).toISOString()).toBe('2026-10-13T17:00:00.000Z');
  });

  it('physically deletes expired history and creates one aggregate audit without deleting backup files', async () => {
    const actor = { id: 9001, email: 'activity-retention@system.invalid', active: false, roles: [], password_hash: '!SYSTEM_ACCOUNT_NO_LOGIN!' };
    mockPrisma.user.upsert.mockResolvedValue(actor);
    const tx = {
      auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }), create: jest.fn().mockResolvedValue({ id: 1 }) },
      loginAudit: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      googleSheetSyncRun: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
    };
    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const result = await purgeExpiredActivityHistory(new Date('2026-11-13T05:00:00.000Z'));

    expect(result).toMatchObject({ auditLogsDeleted: 3, loginAuditsDeleted: 2, syncRunsDeleted: 4 });
    expect(tx.auditLog.deleteMany).toHaveBeenCalledWith({ where: { created_at: { lt: new Date('2026-10-13T17:00:00.000Z') } } });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const created = tx.auditLog.create.mock.calls[0][0].data;
    expect(created.user_id).toBe(actor.id);
    expect(created.action).toBe('ACTIVITY_LOG_RETENTION_PURGED');
    expect(created.after_data).toMatchObject({ retentionDays: 30, physicalBackupFilesDeleted: 0 });
  });

  it('schedules daily retention at 02:30 Asia/Ho_Chi_Minh', () => {
    const stop = jest.fn();
    mockCron.schedule.mockReturnValue({ stop });
    startActivityLogRetentionScheduler();
    expect(mockCron.schedule).toHaveBeenCalledWith('30 2 * * *', expect.any(Function), { timezone: 'Asia/Ho_Chi_Minh' });
    stopActivityLogRetentionScheduler();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
