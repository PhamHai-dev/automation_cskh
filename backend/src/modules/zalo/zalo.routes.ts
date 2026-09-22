import { Router } from 'express';
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
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new ZaloController();

// All Zalo endpoints require login; CS + MANAGE + ADMIN can access
router.use(authenticate);
router.use(requireRoles(['ADMIN', 'MANAGE', 'CS']));

// ─── Account management ───────────────────────────────────────────────────
router.get('/', controller.listAccounts);
router.get('/:id', controller.getAccount);
router.post('/', controller.createAccount);
router.patch('/:id', controller.updateAccount);
router.delete('/:id', controller.removeAccount);

// ─── Account lifecycle: restore / archived / purge / reconnect ──────────
router.get('/archived', controller.listArchivedAccounts);
router.post('/:id/restore', controller.restoreAccount);
router.delete('/:id/purge-empty', controller.purgeEmptyAccount);
router.post('/:id/reconnect', controller.reconnectAccount);

// ─── QR login flow ────────────────────────────────────────────────────────
router.post('/:id/qr', controller.generateQr);
router.post('/:id/qr/complete', controller.completeQrLogin);

// ─── Friends & Groups (spike: minimal) ────────────────────────────────────
router.get('/:id/friends', controller.listFriends);
router.get('/:id/groups', controller.listGroups);
router.post('/:id/groups/refresh', controller.refreshGroups);

// ─── Full Friend Management API (ported from ZaloCRM) ─────────────────────
router.use('/', zaloFriendRouter);

// ─── Full Group Management API (ported from ZaloCRM) ──────────────────────
router.use('/', zaloGroupRouter);
router.use('/', zaloGroupModerationRouter);

// ─── Sync routes (B5) ─────────────────────────────────────────────────────
router.use('/', zaloSyncRouter);

// ─── Backfill routes (B6) ──────────────────────────────────────────────────
router.use('/', zaloBackfillRouter);

// ─── Dashboard routes (B8) ────────────────────────────────────────────────
router.use('/', zaloDashboardRouter);

// ─── Profile operations (C2) ─────────────────────────────────────────────────
router.use('/', profileRoutes);

// ─── Credential export/import (C4) ───────────────────────────────────────────
router.use('/', credentialRoutes);

// ─── Access control (C5) ─────────────────────────────────────────────────────
router.use('/', zaloAccessRouter);

// ─── Group scan (C6) ─────────────────────────────────────────────────────────
router.use('/', groupScanRouter);

// ─── Zalo Labels (G1) ────────────────────────────────────────────────────────
router.use('/', zaloLabelsRouter);

export { router as zaloRouter };
