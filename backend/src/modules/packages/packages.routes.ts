import { Router } from 'express';
import { PackagesController } from './packages.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new PackagesController();

router.use(authenticate);

// CS can view, MANAGE/ADMIN can view
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.list);
router.get('/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.get);

// Only MANAGE/ADMIN can create/update
router.post('/', requireRoles(['ADMIN', 'MANAGE']), controller.create);
router.patch('/:id', requireRoles(['ADMIN', 'MANAGE']), controller.update);

export { router as packagesRouter };
