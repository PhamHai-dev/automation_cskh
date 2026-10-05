import { Router } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { AutoAttendanceController } from './auto-attendance.controller';

const autoAttendanceRouter = Router();
const controller = new AutoAttendanceController();

autoAttendanceRouter.use(authenticate, requireRoles(['ADMIN']));
autoAttendanceRouter.get('/', controller.getSettings.bind(controller));
autoAttendanceRouter.patch('/', controller.updateSettings.bind(controller));
autoAttendanceRouter.post('/run', controller.runCycle.bind(controller));

export { autoAttendanceRouter };
