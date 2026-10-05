import { Router } from 'express';
import { AttendanceController } from './attendance.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { requireClassAccess } from '../classes/classes.scope';

const router = Router({ mergeParams: true });
const controller = new AttendanceController();

router.use(authenticate);

// List attendance for a session
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xem điểm danh'), controller.list);

// Mark single attendance
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('điểm danh'), controller.mark);

// Bulk mark attendance
router.post('/bulk', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('điểm danh hàng loạt'), controller.bulkMark);

// Update attendance
router.patch('/:attendanceId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('cập nhật điểm danh'), controller.update);

// Reset (Soft-delete) attendance
router.delete('/:attendanceId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xóa điểm danh'), controller.reset);

export { router as attendanceRouter };
