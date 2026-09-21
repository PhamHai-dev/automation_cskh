import { Router } from 'express';
import multer from 'multer';
import { ImportsController } from './imports.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';

const router = Router();
const controller = new ImportsController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

router.use(authenticate);

// 1. Templates & Exports (ADMIN, MANAGE, CS, TEACHER)
router.get('/template/:type', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.getTemplate);
router.get('/export/students', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.exportStudents);
router.get('/export/attendance', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.exportAttendance);

// 2. Batches list & batch status
router.get('/batches', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.listBatches);

// 3. Create / Transfer Requests approval queue
router.get('/create-requests', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.listCreateRequests);
router.get('/create-requests/:id', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getCreateRequest);
router.post('/create-requests/:id/approve', requireRoles(['ADMIN', 'MANAGE']), controller.approveCreateRequest);
router.post('/create-requests/:id/reject', requireRoles(['ADMIN', 'MANAGE']), controller.rejectCreateRequest);

// 4. Batch details & errors
router.get('/:importId', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.getBatch);
router.get('/:importId/errors', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.getErrors);

// 5. Import Workflow Execution (ADMIN, MANAGE, CS, TEACHER per Q-013)
router.post('/upload', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), upload.single('file'), controller.upload);
router.get('/:importId/preview', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.preview);
router.post('/:importId/mapping', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.saveMapping);
router.post('/:importId/validate', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.validate);
router.post('/:importId/confirm', requireRoles(['ADMIN', 'MANAGE', 'CS', 'TEACHER']), controller.confirm);

export { router as importsRouter };
