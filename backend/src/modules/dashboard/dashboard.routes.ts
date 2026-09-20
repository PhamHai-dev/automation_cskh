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

export { router as dashboardRouter };
