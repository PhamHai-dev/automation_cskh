import { Request, Response, NextFunction } from 'express';
import { ImportsService } from './imports.service';
import { SheetSyncService } from './sheet-sync.service';
import { SheetBackupService } from './sheet-backup.service';
import { ImportType } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';

export class ImportsController {
  private service: ImportsService;
  private sheetSyncService: SheetSyncService;
  private sheetBackupService: SheetBackupService;

  constructor(
    service?: ImportsService,
    sheetSyncService?: SheetSyncService,
    sheetBackupService?: SheetBackupService
  ) {
    this.service = service || new ImportsService();
    this.sheetSyncService = sheetSyncService || new SheetSyncService();
    this.sheetBackupService = sheetBackupService || new SheetBackupService(this.sheetSyncService, this.service);
  }

  upload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'Vui lòng chọn file Excel để upload');
      }

      let importType = req.body.import_type as ImportType | undefined;
      if (!importType) {
        importType = ImportType.WORKBOOK;
      }

      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };

      const assignedCsId = req.body.assigned_cs_id ? parseInt(req.body.assigned_cs_id, 10) : undefined;
      const result = await this.service.uploadFile(actor, req.file, importType, assignedCsId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  preview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const sheetName = req.query.sheetName as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };

      const result = await this.service.getPreview(importId, sheetName, limit, actor);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  saveMapping = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const result = await this.service.saveMapping(importId, req.body, actor);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  validate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };

      const assignedCsId = req.body.assigned_cs_id ? parseInt(req.body.assigned_cs_id, 10) : undefined;
      const report = await this.service.validate(importId, actor, assignedCsId);
      res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const skipErrors = req.body.skipErrors !== false;
      const createMissingStudents = req.body.createMissingStudents !== false;
      const assignedCsId = req.body.assigned_cs_id ? parseInt(req.body.assigned_cs_id, 10) : undefined;

      const summary = await this.service.confirmImport(importId, actor, skipErrors, createMissingStudents, assignedCsId);
      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  };

  getBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const batch = await this.service.getBatch(importId);
      res.status(200).json(batch);
    } catch (err) {
      next(err);
    }
  };

  listBatches = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const result = await this.service.listBatches(limit, offset);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getErrors = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const download = req.query.download === 'true';

      const result = await this.service.getErrors(importId, download);
      if (download) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="import_errors_${importId}.xlsx"`);
        return res.send(result);
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getTemplate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = req.params.type;
      const buffer = await this.service.getTemplate(type);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="template_${type}.xlsx"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  exportStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const buffer = await this.service.exportStudents(actor);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="students_enrollments_export.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  exportAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const buffer = await this.service.exportAttendance(actor);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_export.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  listCreateRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const status = req.query.status as any;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;
      const result = await this.service.listCreateRequests(actor, status, page, pageSize);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getCreateRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const id = parseInt(req.params.id, 10);
      const result = await this.service.getCreateRequest(id, actor);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  approveCreateRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const id = parseInt(req.params.id, 10);
      const dto = {
        version: req.body.version,
        assignedCsId: req.body.assignedCsId,
      };
      const result = await this.service.approveCreateRequest(id, actor, dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  rejectCreateRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
        email: user?.email,
        name: user?.name,
      };
      const id = parseInt(req.params.id, 10);
      const dto = {
        version: req.body.version,
        reason: req.body.reason,
      };
      const result = await this.service.rejectCreateRequest(id, actor, dto);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getSheetSyncConfigs = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.sheetSyncService.getConfigs();
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  saveServiceAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const serviceAccount = await this.sheetSyncService.saveServiceAccountJson(
        req.body?.service_account_json ?? null,
        user?.id
      );
      res.status(200).json({ data: { serviceAccount }, meta: null });
    } catch (err) {
      next(err);
    }
  };

  updateSheetSyncConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.params.code;
      const updated = await this.sheetSyncService.updateConfig(code, req.body || {});
      res.status(200).json({ data: updated, meta: null });
    } catch (err) {
      next(err);
    }
  };

  syncSheetByCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.params.code;
      const user = (req as any).user;
      const forceFullSync = Boolean(req.body?.forceFullSync);
      const limit = req.body?.limit ? Number(req.body.limit) : undefined;
      const data = await this.sheetSyncService.syncConfigByCode(code, {
        forceFullSync,
        limit,
        actorId: user?.id,
      });
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  syncAllSheets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const forceFullSync = Boolean(req.body?.forceFullSync);
      const limit = req.body?.limit ? Number(req.body.limit) : undefined;
      const data = await this.sheetSyncService.syncAll({
        forceFullSync,
        limit,
        actorId: user?.id,
      });
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getSheetBackupConfigs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const actor = {
        id: user?.id || 1,
        roles: (user?.roles as string[]) || ['ADMIN'],
      };
      const data = await this.sheetBackupService.listConfigs(actor);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getSheetBackupColumnConfig = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.sheetBackupService.getColumnConfigWithServiceAccount();
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  updateSheetBackupColumnConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const data = await this.sheetBackupService.saveColumnConfig(req.body || {}, user?.id);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  resetSheetBackupColumnConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const programType = req.body?.programType ? String(req.body.programType) : undefined;
      const data = await this.sheetBackupService.resetColumnConfig(programType, user?.id);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  updateSheetBackupConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        throw new AppError(400, 'id không hợp lệ');
      }
      const data = await this.sheetBackupService.updateConfig(id, req.body || {});
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  runSheetBackupForConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        throw new AppError(400, 'id không hợp lệ');
      }
      const user = (req as any).user;
      const roles: string[] = Array.isArray(user?.roles) ? user.roles : [];
      const year = req.body?.year === undefined || req.body?.year === null ? undefined : Number(req.body.year);

      const data = await this.sheetBackupService.runBackupForConfig(id, {
        forceFullRewrite: Boolean(req.body?.forceFullRewrite),
        year,
        actorId: user?.id,
        actorRoles: roles,
      });
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  runAllSheetBackups = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const forceFullRewrite = Boolean(req.body?.forceFullRewrite);
      const year = req.body?.year === undefined || req.body?.year === null ? undefined : Number(req.body.year);
      const programType = req.body?.programType ? String(req.body.programType) : undefined;
      const data = await this.sheetBackupService.runAllBackups({
        forceFullRewrite,
        year,
        programType,
      });
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  downloadSheetBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        throw new AppError(400, 'id không hợp lệ');
      }
      const user = (req as any).user;
      const roles: string[] = Array.isArray(user?.roles) ? user.roles : [];
      const forceRefresh = req.query.refresh === 'true';

      const { absPath, fileName } = await this.sheetBackupService.getBackupFilePath(id, {
        forceRefresh,
        actorId: user?.id,
        actorRoles: roles,
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.sendFile(absPath, (err) => {
        if (err) next(err);
      });
    } catch (err) {
      next(err);
    }
  };
}
