import { Router } from 'express';
import { ClassSessionsController } from './class-sessions.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router({ mergeParams: true });
const controller = new ClassSessionsController();

router.use(authenticate);

// List sessions for a class
router.get('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.list);

// Get single session
router.get('/:sessionId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.get);

// Create session (Admin/Manage/CS/Teacher if assigned)
router.post('/', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.create);

// Update session
router.patch('/:sessionId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.update);

// Cancel session
router.post('/:sessionId/cancel', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.cancel);

export { router as classSessionsRouter };
