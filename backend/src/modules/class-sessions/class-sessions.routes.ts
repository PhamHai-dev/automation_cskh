import { Router } from 'express';
import { ClassSessionsController } from './class-sessions.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { requireClassAccess } from '../classes/classes.scope';

const router = Router({ mergeParams: true });
const controller = new ClassSessionsController();

router.use(authenticate);

// List sessions for a class
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xem danh sách buổi học'), controller.list);

// Get single session
router.get('/:sessionId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xem chi tiết buổi học'), controller.get);

// Create session (Admin/Manage/CS/Teacher if assigned)
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('tạo buổi học cho lớp này'), controller.create);

// Update session
router.patch('/:sessionId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('cập nhật buổi học của lớp này'), controller.update);

// Cancel session
router.post('/:sessionId/cancel', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('hủy buổi học của lớp này'), controller.cancel);

// Delete session and, only after explicit confirmation, its attendance records
router.delete('/:sessionId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xóa buổi học của lớp này'), controller.remove);

export { router as classSessionsRouter };
