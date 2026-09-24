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
import { studentLinkRouter } from './student-link-routes';
import { zaloChatRouter } from './zalo-chat-routes';
import { zaloReactionRouter } from './zalo-reaction-routes';
import { zaloPollRouter } from './zalo-poll-routes';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

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
