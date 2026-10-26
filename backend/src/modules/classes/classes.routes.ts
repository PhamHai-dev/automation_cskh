import { Router } from 'express';
import { ClassesController } from './classes.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { requireClassAccess } from './classes.scope';

const router = Router();
const controller = new ClassesController();

router.use(authenticate);

// List/Get
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.list);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xem thông tin lớp học'), controller.get);

// Admin/Manage create/update
router.post('/', requireRoles(['ADMIN', 'MANAGE']), controller.create);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE']), controller.update);

// Assign teacher
router.post('/:id/teachers', requireRoles(['ADMIN', 'MANAGE']), controller.assignTeacher);

// End teacher assignment (Admin-only, D8 2026-10-26)
router.patch('/:id/teachers/:assignmentId/end', requireRoles(['ADMIN']), controller.endTeacherAssignment);
router.patch('/:id/teachers/:assignmentId', requireRoles(['ADMIN']), controller.endTeacherAssignment);

export { router as classesRouter };
