import { Router } from 'express';
import { StudentsController } from './students.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new StudentsController();

router.use(authenticate);

// CS/MANAGE/ADMIN can view students
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.list);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.get);

// CS/MANAGE/ADMIN can create/update students
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.create);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.update);
router.put('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.update);

export { router as studentsRouter };
