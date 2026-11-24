import { Router } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { JlptController } from './jlpt.controller';

const router = Router();
const controller = new JlptController();

router.use(authenticate);
router.get('/templates', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.listTemplates);
router.post('/templates', requireRoles(['ADMIN']), controller.createTemplate);
router.get('/templates/:templateId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.getTemplate);
router.patch('/templates/:templateId', requireRoles(['ADMIN', 'MANAGE']), controller.updateTemplate);
router.delete('/templates/:templateId', requireRoles(['ADMIN']), controller.deleteTemplate);
router.post('/templates/:templateId/apply-preview', requireRoles(['ADMIN', 'MANAGE']), controller.previewApply);
router.post('/templates/:templateId/change-requests', requireRoles(['TEACHER']), controller.submitChangeRequest);
router.post('/template-change-requests/:requestId/approve', requireRoles(['ADMIN', 'MANAGE']), controller.approveChangeRequest);
router.post('/template-change-requests/:requestId/reject', requireRoles(['ADMIN', 'MANAGE']), controller.rejectChangeRequest);

export { router as jlptRouter };
