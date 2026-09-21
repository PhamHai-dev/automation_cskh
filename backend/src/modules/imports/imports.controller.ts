import { Request, Response, NextFunction } from 'express';
import { ImportsService } from './imports.service';
import { ImportType } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';

export class ImportsController {
  private service: ImportsService;

  constructor(service?: ImportsService) {
    this.service = service || new ImportsService();
  }

  upload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError(400, 'Vui lòng chọn file Excel để upload');
      }

      const importType = req.body.import_type as ImportType;
      if (!importType || !['STUDENT_ENROLLMENT', 'ATTENDANCE', 'TEACHER_ATTENDANCE'].includes(importType)) {
        throw new AppError(400, 'import_type không hợp lệ. Cho phép: STUDENT_ENROLLMENT, ATTENDANCE');
      }

      const userId = (req as any).user?.id || 1;
      const result = await this.service.uploadFile(userId, req.file, importType);
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

      const result = await this.service.getPreview(importId, sheetName, limit);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  saveMapping = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const result = await this.service.saveMapping(importId, req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  validate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const report = await this.service.validate(importId);
      res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const importId = parseInt(req.params.importId, 10);
      const userId = (req as any).user?.id || 1;
      const skipErrors = req.body.skipErrors !== false;
      const createMissingStudents = req.body.createMissingStudents === true;

      const summary = await this.service.confirmImport(importId, userId, skipErrors, createMissingStudents);
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
      const buffer = await this.service.exportStudents();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="students_enrollments_export.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };

  exportAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = await this.service.exportAttendance();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_export.xlsx"');
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  };
}
