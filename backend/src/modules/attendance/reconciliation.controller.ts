import { Request, Response, NextFunction } from 'express';
import { reconciliationService } from './reconciliation.service';
import {
  TeacherMarkSchema,
  CSMarkSchema,
  ResolveConflictSchema,
  BulkApprovePendingSchema,
  ReconciliationQuerySchema,
  TeacherSessionsQuerySchema,
  HistoryQuerySchema,
  AttendanceImportPreviewSchema,
  AttendanceImportConfirmSchema,
  TeacherStudentInfoQuerySchema,
  UpdateTeacherLessonSchema,
  AddTeacherSessionColumnSchema,
} from './reconciliation.schema';
import { AttendanceImportService } from './attendance-import.service';
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

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const result = await reconciliationService.getStats(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const query = HistoryQuerySchema.parse(req.query);
      const result = await reconciliationService.getHistory(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getTeacherTrackingPending(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherTrackingPending(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getTeacherTrackingCount(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ReconciliationQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherTrackingCount(query, req.user as Actor);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getTeacherTrackingHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const query = HistoryQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherTrackingHistory(query, req.user as Actor);
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

  async previewAttendanceImport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file?.buffer) throw new AppError(400, 'Vui lòng tải lên file Excel điểm danh');
      const { source, targetYear } = AttendanceImportPreviewSchema.parse(req.body);
      const data = await new AttendanceImportService().preview(req.file.buffer, source, targetYear, req.user as Actor);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async confirmAttendanceImport(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file?.buffer) throw new AppError(400, 'Vui lòng tải lại file Excel để xác nhận nhập điểm danh');
      const { source, targetYear, actions, deliveryPolicy } = AttendanceImportConfirmSchema.parse(req.body);
      const service = new AttendanceImportService();
      const preview = await service.preview(req.file.buffer, source, targetYear, req.user as Actor);
      const data = await service.commit(preview, req.user as Actor, actions, { deliveryPolicy });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  async uploadTeacherExcel(_req: Request, _res: Response, next: NextFunction) {
    next(new AppError(410, 'Luồng upload giáo viên cũ đã ngừng. Hãy dùng /attendance-reconciliation/import-excel/preview rồi /confirm.'));
  }

  async getTeacherSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = TeacherSessionsQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherSessions(req.user as Actor, query);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async getTeacherStudentInfo(req: Request, res: Response, next: NextFunction) {
    try {
      const query = TeacherStudentInfoQuerySchema.parse(req.query);
      const result = await reconciliationService.getTeacherStudentInfo(req.user as Actor, query);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async updateTeacherStudentLesson(req: Request, res: Response, next: NextFunction) {
    try {
      const attendanceId = attendanceIdFrom(req);
      const body = UpdateTeacherLessonSchema.parse(req.body);
      const result = await reconciliationService.updateTeacherStudentLesson(
        attendanceId,
        body,
        req.user as Actor,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }

  async addTeacherStudentSessionColumn(req: Request, res: Response, next: NextFunction) {
    try {
      const body = AddTeacherSessionColumnSchema.parse(req.body);
      const result = await reconciliationService.addTeacherStudentSessionColumn(
        body,
        req.user as Actor,
      );
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
}

export const reconciliationController = new ReconciliationController();
