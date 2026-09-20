import { Router } from 'express';
import { CareController } from './care.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new CareController();

router.use(authenticate);

// CareLog endpoints (associated with an enrollment)
router.get(
  '/enrollments/:enrollmentId/care-logs',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getCareLogs
);

router.post(
  '/enrollments/:enrollmentId/care-logs',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.createCareLog
);

// CareTask endpoints
router.get(
  '/care-tasks',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getCareTasks
);

router.post(
  '/care-tasks',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.createCareTask
);

router.get(
  '/care-tasks/:taskId',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getCareTaskById
);

router.patch(
  '/care-tasks/:taskId',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.updateCareTask
);

router.post(
  '/care-tasks/:taskId/complete',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.completeCareTask
);

router.post(
  '/care-tasks/:taskId/cancel',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.cancelCareTask
);

export { router as careRouter };
