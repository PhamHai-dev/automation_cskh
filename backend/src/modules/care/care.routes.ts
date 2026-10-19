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

// Milestone Configuration endpoints
router.get(
  '/milestones',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.getMilestones
);

router.post(
  '/milestones',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.addMilestone
);

// Update enrollment care fields (study_report_url, exchange_info, callback_note, hot_issue_note, post_course_care)
router.put(
  '/enrollments/:enrollmentId/care',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.updateEnrollmentCare
);

// Upsert care log for a specific session number
router.put(
  '/enrollments/:enrollmentId/sessions/:sessionNumber/care-log',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  controller.saveSessionCareLog
);

// Attendance Notification endpoints
router.get(
  '/care-notifications',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  controller.getNotifications
);

router.post(
  '/care-notifications/read-all',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  controller.markAllNotificationsRead
);

router.post(
  '/care-notifications/:notificationId/read',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  controller.markNotificationRead
);

export { router as careRouter };
