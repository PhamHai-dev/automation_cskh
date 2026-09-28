import { Router } from 'express';
import { AttendanceController } from './attendance.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router({ mergeParams: true });
const controller = new AttendanceController();

router.use(authenticate);

// List attendance for a session
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.list);

// Mark single attendance
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.mark);

// Bulk mark attendance
router.post('/bulk', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.bulkMark);

// Update attendance
router.patch('/:attendanceId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.update);

// Reset (Soft-delete) attendance
router.delete('/:attendanceId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.reset);

export { router as attendanceRouter };
