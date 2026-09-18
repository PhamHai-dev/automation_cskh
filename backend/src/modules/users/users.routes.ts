import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const usersRouter = Router();
const usersController = new UsersController();

// Admin only routes
usersRouter.use(authenticate, requireRoles(['ADMIN']));

usersRouter.get('/', usersController.list);
usersRouter.post('/', usersController.create);
usersRouter.get('/:id', usersController.get);
usersRouter.patch('/:id', usersController.update);
usersRouter.post('/:id/enable', usersController.enable);
usersRouter.post('/:id/disable', usersController.disable);
usersRouter.post('/:id/revoke-sessions', usersController.revokeSessions);

export { usersRouter };
