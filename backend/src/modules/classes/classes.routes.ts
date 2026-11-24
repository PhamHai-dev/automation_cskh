import { Router } from 'express';
import { ClassesController } from './classes.controller';
import { JlptController } from '../jlpt/jlpt.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { requireClassAccess } from './classes.scope';

const router = Router();
const controller = new ClassesController();
const jlptController = new JlptController();

router.use(authenticate);

// JLPT program and global-template operations. These must stay before /:id.
router.patch('/:classId/program', requireRoles(['ADMIN', 'MANAGE']), requireClassAccess('đổi chương trình lớp học'), jlptController.changeClassProgram);
router.get('/:classId/jlpt-template-status', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), requireClassAccess('xem trạng thái template JLPT'), jlptController.classTemplateStatus);
router.post('/:classId/jlpt-template/apply', requireRoles(['ADMIN', 'MANAGE']), requireClassAccess('áp template JLPT'), jlptController.applyToClass);

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
