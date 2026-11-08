import { Router } from 'express';
import { StudentsController } from './students.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new StudentsController();

router.use(authenticate);

// CS/MANAGE/ADMIN can view students; TEACHER can view assigned student detail for study report
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.list);
router.get(
  '/jlpt-attendance-report',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  controller.getJlptAttendanceReport,
);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.get);

// CS/MANAGE/ADMIN can create/update students; TEACHER can update study report of assigned students
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.create);
router.patch(
  '/:id/jlpt-attendance-report',
  requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']),
  controller.updateJlptAttendanceReport,
);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.update);
router.put('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.update);

export { router as studentsRouter };
