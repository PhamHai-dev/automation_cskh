import { Request, Response, NextFunction } from 'express';
import { reconciliationService } from './reconciliation.service';
import {
  TeacherMarkSchema,
  CSMarkSchema,
  ResolveConflictSchema,
  BulkApprovePendingSchema,
  ReconciliationQuerySchema,
} from './reconciliation.schema';
import { AppError } from '../../middlewares/error.middleware';

export class ReconciliationController {
  async getConflicts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const actor = req.user as { id: number; roles: string[] };
      const result = await reconciliationService.getConflicts(query, actor);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getPending(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const actor = req.user as { id: number; roles: string[] };
      const result = await reconciliationService.getPending(query, actor);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async resolveConflict(req: Request, res: Response, next: NextFunction) {
    try {
      const attendanceId = Number(req.params.id);
      if (isNaN(attendanceId)) {
        throw new AppError(400, 'ID điểm danh không hợp lệ');
      }
      const data = ResolveConflictSchema.parse(req.body);
      const actor = req.user as { id: number; roles: string[] };
      const result = await reconciliationService.resolveConflict(attendanceId, data, actor);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async bulkApprovePending(req: Request, res: Response, next: NextFunction) {
    try {
      const { attendanceIds } = BulkApprovePendingSchema.parse(req.body);
      const userId = (req.user as any).id;
      const result = await reconciliationService.bulkApprovePending(attendanceIds, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async markByTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const attendanceId = Number(req.params.id);
      if (isNaN(attendanceId)) {
        throw new AppError(400, 'ID điểm danh không hợp lệ');
      }
      const data = TeacherMarkSchema.parse(req.body);
      const userId = (req.user as any).id;
      const result = await reconciliationService.markByTeacher(attendanceId, data, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async markByCS(req: Request, res: Response, next: NextFunction) {
    try {
      const attendanceId = Number(req.params.id);
      if (isNaN(attendanceId)) {
        throw new AppError(400, 'ID điểm danh không hợp lệ');
      }
      const data = CSMarkSchema.parse(req.body);
      const userId = (req.user as any).id;
      const result = await reconciliationService.markByCS(attendanceId, data, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async uploadTeacherExcel(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file || !req.file.buffer) {
        throw new AppError(400, 'Vui lòng tải lên file Excel lịch dạy (giao_vien.xlsx)');
      }
      const userId = (req.user as any).id;
      const result = await reconciliationService.uploadTeacherExcel(req.file.buffer, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async getTeacherSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req.user as any).id;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      const result = await reconciliationService.getTeacherSessions(userId, startDate, endDate);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const reconciliationController = new ReconciliationController();

