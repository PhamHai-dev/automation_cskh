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

// 2b. Google Sheet Sync Configs & Execution (ADMIN, MANAGE)
router.get('/sheet-sync/configs', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getSheetSyncConfigs);
// Service Account JSON configuration is restricted to ADMIN only (configured in Admin Settings page)
router.put('/sheet-sync/service-account', requireRoles(['ADMIN']), controller.saveServiceAccount);
router.put('/sheet-sync/configs/:code', requireRoles(['ADMIN', 'MANAGE']), controller.updateSheetSyncConfig);
router.post('/sheet-sync/configs/:code/sync', requireRoles(['ADMIN', 'MANAGE']), controller.syncSheetByCode);
router.post('/sheet-sync/sync-all', requireRoles(['ADMIN', 'MANAGE']), controller.syncAllSheets);

// 2c. Program Sheet Backup Configs (JLPT / KAIWA per CS), Column Config, Execution & Download
router.get('/sheet-backup/column-config', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getSheetBackupColumnConfig);
router.put('/sheet-backup/column-config', requireRoles(['ADMIN']), controller.updateSheetBackupColumnConfig);
router.post('/sheet-backup/column-config/reset', requireRoles(['ADMIN']), controller.resetSheetBackupColumnConfig);
router.get('/sheet-backup/configs', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.getSheetBackupConfigs);
router.put('/sheet-backup/configs/:id', requireRoles(['ADMIN', 'MANAGE']), controller.updateSheetBackupConfig);
router.post('/sheet-backup/configs/:id/run', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.runSheetBackupForConfig);
router.post('/sheet-backup/run-all', requireRoles(['ADMIN', 'MANAGE']), controller.runAllSheetBackups);
router.get('/sheet-backup/configs/:id/download', requireRoles(['ADMIN', 'MANAGE', 'CS']), controller.downloadSheetBackup);

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
