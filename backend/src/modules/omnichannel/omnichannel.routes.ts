import { Router } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { omnichannelController } from './omnichannel.controller';

export const omnichannelRouter = Router();
omnichannelRouter.use(authenticate, requireRoles(['ADMIN', 'MANAGE', 'CS']));
omnichannelRouter.get('/groups', omnichannelController.listGroups);
omnichannelRouter.get('/care-group-rules', omnichannelController.readCareGroupRules);
omnichannelRouter.put('/care-group-rules', requireRoles(['ADMIN', 'MANAGE']), omnichannelController.saveCareGroupRules);
omnichannelRouter.post('/care-group-rules/preview', requireRoles(['ADMIN', 'MANAGE']), omnichannelController.previewCareGroupRules);
