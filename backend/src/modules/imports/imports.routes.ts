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

// 1. Templates & Exports (ADMIN, MANAGE, CS)
router.get('/template/:type', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getTemplate);
router.get('/export/students', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.exportStudents);
router.get('/export/attendance', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.exportAttendance);

// 2. Batches list & batch status
router.get('/batches', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.listBatches);
router.get('/:importId', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getBatch);
router.get('/:importId/errors', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getErrors);

// 3. Import Workflow Execution (ADMIN, MANAGE only according to Q-004)
router.post('/upload', requireRoles(['ADMIN', 'MANAGE']), upload.single('file'), controller.upload);
router.get('/:importId/preview', requireRoles(['ADMIN', 'MANAGE']), controller.preview);
router.post('/:importId/mapping', requireRoles(['ADMIN', 'MANAGE']), controller.saveMapping);
router.post('/:importId/validate', requireRoles(['ADMIN', 'MANAGE']), controller.validate);
router.post('/:importId/confirm', requireRoles(['ADMIN', 'MANAGE']), controller.confirm);

export { router as importsRouter };
