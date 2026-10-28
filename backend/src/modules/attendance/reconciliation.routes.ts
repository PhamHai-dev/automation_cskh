import { Router } from 'express';
import multer from 'multer';
import { reconciliationController } from './reconciliation.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(authenticate);

// Teacher schedule & sessions
router.get(
  '/teacher-sessions',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.getTeacherSessions
);

// Teacher student info & dynamic session columns (sheet Infoー情報)
router.get(
  '/teacher-student-info',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.getTeacherStudentInfo
);
router.patch(
  '/teacher-student-info/:id/lesson',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.updateTeacherStudentLesson
);
router.post(
  '/teacher-student-info/add-session',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.addTeacherStudentSessionColumn
);

// Attendance workbook preview → explicit confirmation (CSKH Sheet 3 or teacher schedule)
router.post(
  '/import-excel/preview',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  upload.single('file'),
  reconciliationController.previewAttendanceImport
);
router.post(
  '/import-excel/confirm',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  upload.single('file'),
  reconciliationController.confirmAttendanceImport
);

// Teacher Excel upload (legacy endpoint; kept temporarily for compatibility)
router.post(
  '/upload-teacher-excel',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  upload.single('file'),
  reconciliationController.uploadTeacherExcel
);

// Get list of conflicts (accessible by CS, MANAGE, ADMIN)
router.get(
  '/conflicts',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.getConflicts
);

// Teacher tracking endpoints use a privacy-safe contract (no CSKH opinion fields).
router.get(
  '/teacher-tracking/pending',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.getTeacherTrackingPending
);
router.get(
  '/teacher-tracking/count',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.getTeacherTrackingCount
);
router.get(
  '/teacher-tracking/history',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.getTeacherTrackingHistory
);

// Get list of pending attendances awaiting CS or Teacher
router.get(
  '/pending',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.getPending
);

// KPI counts for reconciliation header cards
router.get(
  '/stats',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.getStats
);

// Reconciliation history (changes after the first attendance report)
router.get(
  '/history',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.getHistory
);

// Resolve a conflict — ADMIN only (D2 owner-confirmed authority).
// MANAGE keeps group-management scope but NOT resolution authority;
// CS must not self-resolve its own opinion conflict.
router.post(
  '/:id/resolve-conflict',
  requireRoles(['ADMIN']),
  reconciliationController.resolveConflict
);

// Bulk approve pending attendances
router.post(
  '/bulk-approve',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.bulkApprovePending
);

// Teacher marks attendance
router.post(
  '/:id/teacher-mark',
  requireRoles(['ADMIN', 'MANAGE', 'TEACHER']),
  reconciliationController.markByTeacher
);

// CS marks attendance
router.post(
  '/:id/cs-mark',
  requireRoles(['ADMIN', 'MANAGE', 'CS']),
  reconciliationController.markByCS
);

export { router as reconciliationRouter };
