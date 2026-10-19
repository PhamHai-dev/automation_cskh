import { Router, Request, Response } from 'express';
import { ZaloController } from './zalo.controller';
import { zaloFriendRouter } from './zalo-friend-routes';
import { zaloGroupRouter } from './group-routes';
import { zaloGroupModerationRouter } from './group-moderation-routes';
import { zaloSyncRouter } from './zalo-sync-routes';
import { zaloBackfillRouter } from './zalo-backfill-routes';
import { zaloDashboardRouter } from './zalo-dashboard-routes';
import { profileRoutes } from './profile-routes';
import { credentialRoutes } from './credential-routes';
import { zaloAccessRouter } from './zalo-access-routes';
import { groupScanRouter } from './group-scan-routes';
import { zaloLabelsRouter } from './zalo-labels-routes';
import { studentLinkRouter } from './student-link-routes';
import './student-care-group-matcher.service';
import { zaloChatRouter } from './zalo-chat-routes';
import { zaloReactionRouter } from './zalo-reaction-routes';
import { zaloPollRouter } from './zalo-poll-routes';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { prisma } from '../../prisma/client';
import { zaloPool } from './zalo-pool';
import { zaloRateLimiter } from './zalo-rate-limiter';
import { ALL_CATEGORIES, invalidateLimitCache, upsertAccountLimit } from './sdk-limit.service';
import type { OpCategory } from './zalo-operations';
import { checkAccess, handleError, resolveAccount } from './zalo-route-helpers';
import { maskProxyUrl, validateProxyUrl } from '../../shared/network/proxy-dispatcher';

const router = Router();
const controller = new ZaloController();

// All Zalo endpoints require login; CS + MANAGE + ADMIN can access
router.use(authenticate);
router.use(requireRoles(['ADMIN', 'MANAGE', 'CS']));

// ─── Account management (mounted under /accounts to match frontend) ──────
router.get('/accounts', controller.listAccounts);
router.get('/accounts/archived', controller.listArchivedAccounts);
router.get('/accounts/:id', controller.getAccount);
router.post('/accounts', controller.createAccount);
router.patch('/accounts/:id', controller.updateAccount);
router.delete('/accounts/:id', controller.removeAccount);

// ─── Account lifecycle: restore / archived / purge / reconnect ──────────
router.post('/accounts/:id/restore', controller.restoreAccount);
router.delete('/accounts/:id/purge-empty', controller.purgeEmptyAccount);
router.post('/accounts/:id/reconnect', controller.reconnectAccount);

// ─── QR login flow ────────────────────────────────────────────────────────
router.post('/accounts/:id/qr', controller.generateQr);
router.post('/accounts/:id/qr/complete', controller.completeQrLogin);
// Frontend uses /qr-login — alias routes
router.post('/accounts/:id/qr-login', controller.generateQr);
router.post('/accounts/:id/qr-login/complete', controller.completeQrLogin);

// ─── Friends & Groups (spike: minimal) ────────────────────────────────────
router.get('/accounts/:id/friends', controller.listFriends);
router.get('/accounts/:id/groups', controller.listGroups);
router.post('/accounts/:id/groups/refresh', controller.refreshGroups);

// ─── Status & Disconnect (frontend ZaloAccountsPage) ─────────────────────
router.get('/accounts/:id/status', controller.getStatus);
router.post('/accounts/:id/disconnect', controller.disconnect);

// ─── Omnichannel Security & Rate-Limit Management ────────────────────────
router.get('/accounts/:accountId/limits', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const account = await resolveAccount(accountId, user.id, isAdmin);
    const limits = await zaloRateLimiter.getAccountRateLimitSummary(accountId);
    const liveStatus = zaloPool.getStatus(accountId) ?? account.status;
    return res.json({
      data: {
        accountId,
        displayName: account.display_name,
        status: account.status,
        liveStatus,
        hasProxy: Boolean(account.proxy_url),
        proxyUrlMasked: maskProxyUrl(account.proxy_url) || null,
        limits,
      },
      meta: null,
    });
  } catch (err) {
    return handleError(res, err, 'get-account-limits');
  }
});

const updateZaloLimitsHandler = async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const body = req.body as {
      category?: string;
      daily_limit?: number;
      burst_limit?: number;
      burst_window_ms?: number;
      burst_window_minutes?: number;
      limits?: Array<{
        category: string;
        daily_limit: number;
        burst_limit: number;
        burst_window_ms?: number;
        burst_window_minutes?: number;
      }>;
      categories?: Array<{
        category: string;
        daily_limit: number;
        burst_limit: number;
        burst_window_ms?: number;
        burst_window_minutes?: number;
      }>;
    };

    const rawList = Array.isArray(body.limits)
      ? body.limits
      : Array.isArray(body.categories)
        ? body.categories
        : body.category
          ? [body]
          : [];

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'Cần truyền category hoặc mảng limits[]/categories[] để cập nhật' });
    }

    for (const item of rawList) {
      if (!ALL_CATEGORIES.includes(item.category as OpCategory)) {
        return res.status(400).json({ error: `Category không hợp lệ: ${item.category}` });
      }
      const windowMs =
        item.burst_window_ms ??
        (item.burst_window_minutes ? Number(item.burst_window_minutes) * 60_000 : 30_000);
      await upsertAccountLimit(accountId, item.category as OpCategory, {
        daily_limit: Number(item.daily_limit),
        burst_limit: Number(item.burst_limit),
        burst_window_ms: Number(windowMs),
      });
    }

    invalidateLimitCache(accountId);
    const updatedLimits = await zaloRateLimiter.getAccountRateLimitSummary(accountId);
    return res.json({ data: { accountId, limits: updatedLimits, categories: updatedLimits }, meta: null });
  } catch (err) {
    return handleError(res, err, 'update-account-limits');
  }
};

router.put('/accounts/:accountId/limits', updateZaloLimitsHandler);
router.patch('/accounts/:accountId/limits', updateZaloLimitsHandler);

router.get('/accounts/:accountId/proxy', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'read'))) return;
    const account = await resolveAccount(accountId, user.id, isAdmin);
    return res.json({
      data: {
        accountId: account.id,
        proxyUrl: maskProxyUrl(account.proxy_url) || null,
        proxy_url: maskProxyUrl(account.proxy_url) || null,
        proxyPinned: Boolean(account.proxy_url),
        hasProxy: Boolean(account.proxy_url),
      },
      meta: null,
    });
  } catch (err) {
    return handleError(res, err, 'get-account-proxy');
  }
});

router.patch('/accounts/:accountId/proxy', async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId, 10);
  const user = req.user!;
  const isAdmin = user.roles.includes('ADMIN') || user.roles.includes('MANAGE');
  try {
    if (!(await checkAccess(req, res, accountId, 'admin'))) return;
    await resolveAccount(accountId, user.id, isAdmin);

    const rawProxy = (req.body as any)?.proxy_url ?? (req.body as any)?.proxyUrl ?? null;
    const validation = validateProxyUrl(rawProxy);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error, code: 'INVALID_PROXY_URL' });
    }

    const normalized = validation.normalized || null;
    const updated = await prisma.zaloAccount.update({
      where: { id: accountId },
      data: { proxy_url: normalized },
      select: { id: true, display_name: true, status: true, proxy_url: true },
    });

    return res.json({
      data: {
        id: updated.id,
        displayName: updated.display_name,
        status: updated.status,
        hasProxy: Boolean(updated.proxy_url),
        proxyUrlMasked: maskProxyUrl(updated.proxy_url) || null,
      },
      meta: null,
    });
  } catch (err) {
    return handleError(res, err, 'update-account-proxy');
  }
});

// ─── Full Friend Management API (ported from ZaloCRM) ─────────────────────
router.use('/accounts', zaloFriendRouter);

// ─── Full Group Management API (ported from ZaloCRM) ──────────────────────
router.use('/accounts', zaloGroupRouter);
router.use('/accounts', zaloGroupModerationRouter);

// ─── Sync routes (B5) ─────────────────────────────────────────────────────
router.use('/accounts', zaloSyncRouter);

// ─── Backfill routes (B6) ──────────────────────────────────────────────────
router.use('/accounts', zaloBackfillRouter);

// ─── Dashboard routes (B8) ────────────────────────────────────────────────
router.use('/', zaloDashboardRouter);

// ─── Profile operations (C2) ─────────────────────────────────────────────────
router.use('/accounts', profileRoutes);

// ─── Credential export/import (C4) ───────────────────────────────────────────
router.use('/accounts', credentialRoutes);

// ─── Access control (C5) ─────────────────────────────────────────────────────
router.use('/accounts', zaloAccessRouter);

// ─── Group scan (C6) ─────────────────────────────────────────────────────────
router.use('/accounts', groupScanRouter);

// ─── Zalo Labels (G1) ────────────────────────────────────────────────────────
router.use('/accounts', zaloLabelsRouter);

// ─── Student ↔ Zalo linking (Q1-Q4) ───────────────────────────────────────────
router.use('/', studentLinkRouter);

// ─── Chat & Conversations ────────────────────────────────────────────────────
router.use('/', zaloChatRouter);

// ─── Reactions & Read Receipts ───────────────────────────────────────────────
router.use('/', zaloReactionRouter);

// ─── Group Polls ─────────────────────────────────────────────────────────────
router.use('/', zaloPollRouter);

export { router as zaloRouter };
