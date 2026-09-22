/**
 * zalo-health-check.ts — Cron-based health monitor for Zalo connections.
 *
 * Ported from ZaloCRM zalo-health-check.ts → single-org, Int IDs.
 * Adaptation notes:
 *   - No `runSystemQuery` (no multi-tenant cross-org sweep) — direct prisma queries.
 *   - prisma import: `../../prisma/client` (our project path).
 *   - logger import: `../../shared/logger/logger` (our project path).
 *   - Uses archivedAt/disconnectReason/zaloUid fields (added to schema in this migration).
 *
 * Runs:
 *   - Every 5 min: detect disconnected accounts → auto-reconnect
 *   - Daily 04:00 UTC (11:00 AM VN): force disconnect → reconnect to refresh cookies
 *   - Hourly: clean up stale ghost accounts (qr_pending > 24h)
 */
import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { zaloPool } from './zalo-pool';
import { prisma } from '../../prisma/client';
import { createLogger } from '../../shared/logger/logger';

const log = createLogger('ZaloHealthCheck');

export function startZaloHealthCheck(): void {
  // ── Every 5 minutes: auto-reconnect disconnected accounts ──────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: {
          // Must have a saved session (not null/empty JSON), not archived,
          // must have a real zaloUid (not ghost/qr_pending placeholder),
          // skip manually disconnected nicks.
          encrypted_session_data: { not: null },
          archived_at: null,
          zalo_uid: { not: null },
          NOT: { disconnect_reason: 'manual' },
        },
        select: { id: true, display_name: true, encrypted_session_data: true },
      });

      for (const acc of accounts) {
        const status = zaloPool.getStatus(acc.id);
        if (status !== 'connected' && status !== 'connecting' && status !== 'qr_pending') {
          // Has a saved session → attempt reconnect
          if (acc.encrypted_session_data) {
            log.info('Reconnecting account', { accountId: acc.id, displayName: acc.display_name });
            zaloPool.reconnect(acc.id, acc.encrypted_session_data).catch((err) => {
              log.warn('Reconnect failed', { accountId: acc.id, error: String(err) });
            });
          }
        }
      }
    } catch (err) {
      log.error('Health check error', { error: String(err) });
    }
  });

  // ── Daily 04:00 UTC (11:00 AM VN): refresh all sessions to keep cookies alive ──
  cron.schedule('0 4 * * *', async () => {
    log.info('Daily session refresh starting');
    try {
      const accounts = await prisma.zaloAccount.findMany({
        where: {
          encrypted_session_data: { not: null },
          archived_at: null,
          zalo_uid: { not: null },
          NOT: { disconnect_reason: 'manual' },
        },
        select: { id: true, encrypted_session_data: true },
      });

      for (const acc of accounts) {
        if (acc.encrypted_session_data) {
          // Disconnect then reconnect to force cookie refresh
          zaloPool.disconnect(acc.id);
          await new Promise((r) => setTimeout(r, 5000));
          zaloPool.reconnect(acc.id, acc.encrypted_session_data).catch((err) => {
            log.warn('Daily refresh failed', { accountId: acc.id, error: String(err) });
          });
        }
        // Stagger reconnects by 10s to avoid rate limits
        await new Promise((r) => setTimeout(r, 10_000));
      }
    } catch (err) {
      log.error('Daily refresh error', { error: String(err) });
    }
  });

  // ── Hourly: clean up stale ghost accounts (qr_pending > 24h) ──────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const n = await zaloPool.cleanupStaleGhosts(24 * 60);
      if (n > 0) log.info('Cleaned up stale ghosts', { count: n });
    } catch (err) {
      log.error('Ghost cleanup error', { error: String(err) });
    }
  });

  log.info('Health check started (every 5min + daily refresh 04:00 UTC + hourly ghost cleanup)');
}
