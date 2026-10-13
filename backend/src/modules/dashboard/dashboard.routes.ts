import { Router } from 'express';
import { DashboardController } from './dashboard.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new DashboardController();

router.use(authenticate);

router.get(
  '/summary',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getSummary
);

router.get(
  '/attendance',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getAttendance
);

router.get(
  '/care-pivot',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getCarePivot
);

router.get(
  '/tasks-overview',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getTasksOverview
);

// ---- New tab-composed endpoints ----
router.get(
  '/overview',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getOverview
);

router.get(
  '/care',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getCare
);

router.get(
  '/attendance-tab',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getAttendanceTab
);

router.get(
  '/performance',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getPerformance
);

export { router as dashboardRouter };
