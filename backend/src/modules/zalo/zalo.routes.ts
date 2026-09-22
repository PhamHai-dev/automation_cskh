import { Router } from 'express';
import { ZaloController } from './zalo.controller';
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

// ─── QR login flow ────────────────────────────────────────────────────────
router.post('/:id/qr', controller.generateQr);
router.post('/:id/qr/complete', controller.completeQrLogin);

// ─── Friends & Groups (spike: minimal) ────────────────────────────────────
router.get('/:id/friends', controller.listFriends);
router.get('/:id/groups', controller.listGroups);
router.post('/:id/groups/refresh', controller.refreshGroups);

export { router as zaloRouter };
