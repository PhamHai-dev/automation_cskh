import { Router } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { activityLogsController } from './activity-logs.controller';

const router = Router();

router.use(authenticate);

// A. GET /api/v1/activity-logs/audit — ADMIN, MANAGE, CS
router.get(
  '/audit',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  (req, res, next) => activityLogsController.listAuditLogs(req, res, next),
);

// C. GET /api/v1/activity-logs/logins — ADMIN, MANAGE
router.get(
  '/logins',
  requireRoles(['ADMIN', 'MANAGE']),
  (req, res, next) => activityLogsController.listLoginAudits(req, res, next),
);

// D. GET /api/v1/activity-logs/actors — ADMIN, MANAGE, CS
router.get(
  '/actors',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  (req, res, next) => activityLogsController.listActors(req, res, next),
);

export const activityLogsRouter = router;
