/**
 * line-health-check.ts — Background Health & Quota Monitor for Hybrid LINE accounts.
 *
 * Runs:
 *   - Every 5 minutes:
 *       1. Checks active `PERSONAL` accounts that disconnected (and not `manual_disconnect` or `circuit_breaker`)
 *          -> attempts `linePool.ensureAccountReady(acc.id)` (staggered by 3s to prevent rate limit spikes).
 *       2. Refreshes `OA` monthly quota & consumption (`verifyAndFetchBotInfo()`) and persists to `LineAccount`.
 *   - Hourly:
 *       Cleans up stale `QR_PENDING` / `PIN_REQUIRED` ghost accounts older than 24h.
 */

import cron from 'node-cron';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';
import { linePool } from './line-pool';
import { lineRepository } from './line-repository';
import { emitLineStatus } from './line-socket';

const log = createLogger('LineHealthCheck');

export async function runLineHealthAndQuotaCheck(): Promise<{
  reconnectedPersonal: number;
  refreshedOa: number;
}> {
  let reconnectedPersonal = 0;
  let refreshedOa = 0;

  try {
    const accounts = await prisma.lineAccount.findMany({
      where: {
        archived_at: null,
        encrypted_session_data: { not: null },
        status: { notIn: ['DISABLED', 'BANNED'] },
      },
      select: {
        id: true,
        account_type: true,
        display_name: true,
        status: true,
        disconnect_reason: true,
      },
    });

    for (const acc of accounts) {
      if (acc.account_type === 'PERSONAL') {
        if (
          acc.disconnect_reason === 'manual_disconnect' ||
          acc.disconnect_reason === 'circuit_breaker'
        ) {
          continue;
        }
        const liveAdapter = linePool.getPersonalAdapter(acc.id);
        if (!liveAdapter?.client) {
          const ok = await linePool.ensureAccountReady(acc.id).catch(() => false);
          if (ok) {
            reconnectedPersonal++;
          }
        }
      } else if (acc.account_type === 'OA') {
        await linePool.ensureAccountReady(acc.id).catch(() => false);
        const oaAdapter = linePool.getOaAdapter(acc.id);
        if (oaAdapter) {
          try {
            const info = await oaAdapter.verifyAndFetchBotInfo();
            const updated = await lineRepository.updateAccount(acc.id, {
              monthly_quota: info.monthlyQuota,
              monthly_consumption: info.monthlyConsumption,
              ...(info.basicId ? { basic_id: info.basicId } : {}),
              ...(info.displayName ? { display_name: info.displayName } : {}),
              ...(info.pictureUrl ? { avatar_url: info.pictureUrl } : {}),
              last_active_at: new Date(),
            });
            emitLineStatus({
              accountId: acc.id,
              accountType: 'OA',
              status: updated.status,
              displayName: updated.display_name,
              lineMid: updated.line_mid,
              basicId: updated.basic_id,
              avatarUrl: updated.avatar_url,
              monthlyQuota: updated.monthly_quota,
              monthlyConsumption: updated.monthly_consumption,
              timestamp: new Date().toISOString(),
            });
            refreshedOa++;
          } catch (err) {
            log.warn(`[LineHealthCheck] Failed to refresh OA quota for account ${acc.id}`, {
              error: String(err),
            });
          }
        }
      }
    }
  } catch (err) {
    log.error('[LineHealthCheck] Health check sweep failed', { error: String(err) });
  }

  return { reconnectedPersonal, refreshedOa };
}

export async function cleanupStaleLineGhosts(maxAgeHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  try {
    const stale = await prisma.lineAccount.findMany({
      where: {
        archived_at: null,
        status: { in: ['QR_PENDING', 'PIN_REQUIRED'] },
        encrypted_session_data: null,
        created_at: { lt: cutoff },
      },
      select: { id: true },
    });

    for (const acc of stale) {
      await linePool.disconnectAccount(acc.id, 'stale_qr_timeout').catch(() => undefined);
      await prisma.lineAccount
        .update({
          where: { id: acc.id },
          data: {
            status: 'NOT_LOGGED_IN',
            qr_code: null,
            pin_code: null,
            disconnect_reason: 'stale_qr_timeout',
          },
        })
        .catch(() => undefined);
    }

    return stale.length;
  } catch (err) {
    log.warn('[LineHealthCheck] Stale ghost cleanup error', { error: String(err) });
    return 0;
  }
}

export function startLineHealthCheck(): void {
  // Every 5 minutes: check disconnected PERSONAL accounts & refresh OA monthly quota
  cron.schedule('*/5 * * * *', async () => {
    await runLineHealthAndQuotaCheck();
  });

  // Hourly: clean up stale QR_PENDING / PIN_REQUIRED ghost accounts older than 24h
  cron.schedule('0 * * * *', async () => {
    const cleaned = await cleanupStaleLineGhosts(24);
    if (cleaned > 0) {
      log.info(`[LineHealthCheck] Cleaned up ${cleaned} stale LINE QR/PIN ghost account(s)`);
    }
  });

  log.info('LINE health check started (every 5min reconnect/OA quota + hourly ghost cleanup)');
}
