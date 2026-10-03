import { Router } from 'express';
import { TeachersController } from './teachers.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new TeachersController();

router.use(authenticate);

// Everyone with these roles can view teachers to assign them to classes
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.list);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.get);

// Only Admin/Manage can create/update teachers
router.post('/', requireRoles(['ADMIN', 'MANAGE']), controller.create);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE']), controller.update);
router.post('/:id/account', requireRoles(['ADMIN', 'MANAGE']), controller.provisionAccount);

export { router as teachersRouter };
