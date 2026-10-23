import { Router } from 'express';
import { EnrollmentsController } from './enrollments.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new EnrollmentsController();

router.use(authenticate);

// Standard CRUD
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.list);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.get);
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.create);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.update);
router.put('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.update);

// Specific Actions
router.post('/:id/assign', requireRoles(['ADMIN', 'MANAGE']), controller.reassign);
router.post('/:id/transfer-class', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.transferClass);

export { router as enrollmentsRouter };
