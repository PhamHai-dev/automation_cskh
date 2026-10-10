import { Request, Response, NextFunction } from 'express';
import { reconciliationService } from './reconciliation.service';
import {
  TeacherMarkSchema,
  CSMarkSchema,
  ResolveConflictSchema,
  BulkApprovePendingSchema,
  ReconciliationQuerySchema,
  TeacherSessionsQuerySchema,
} from './reconciliation.schema';
import { AppError } from '../../middlewares/error.middleware';

type Actor = { id: number; roles: string[] };

function attendanceIdFrom(req: Request): number {
  const attendanceId = Number(req.params.id);
  if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
    throw new AppError(400, 'ID điểm danh không hợp lệ');
  }
  return attendanceId;
}

export class ReconciliationController {
  async getConflicts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const result = await reconciliationService.getConflicts(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getPending(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const result = await reconciliationService.getPending(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async resolveConflict(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reconciliationService.resolveConflict(
        attendanceIdFrom(req),
        ResolveConflictSchema.parse(req.body),
        req.user as Actor,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async bulkApprovePending(req: Request, res: Response, next: NextFunction) {
    try {
      const { attendanceIds } = BulkApprovePendingSchema.parse(req.body);
      const result = await reconciliationService.bulkApprovePending(attendanceIds, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async markByTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reconciliationService.markByTeacher(
        attendanceIdFrom(req),
        TeacherMarkSchema.parse(req.body),
        req.user as Actor,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async markByCS(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await reconciliationService.markByCS(
        attendanceIdFrom(req),
        CSMarkSchema.parse(req.body),
        req.user as Actor,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async uploadTeacherExcel(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file?.buffer) {
        throw new AppError(400, 'Vui lòng tải lên file Excel lịch dạy (giao_vien.xlsx)');
      }
      const result = await reconciliationService.uploadTeacherExcel(req.file.buffer, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getTeacherSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = TeacherSessionsQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherSessions(req.user as Actor, query);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}

export const reconciliationController = new ReconciliationController();
