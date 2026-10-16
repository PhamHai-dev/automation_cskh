import { Router } from 'express';
import { PreferencesController } from './preferences.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const preferencesRouter = Router();
const ctrl = new PreferencesController();

// All authenticated users can manage their own preferences — no requireRoles
preferencesRouter.get('/:scope', authenticate, ctrl.get.bind(ctrl));
preferencesRouter.put('/:scope', authenticate, ctrl.save.bind(ctrl));

export { preferencesRouter };
