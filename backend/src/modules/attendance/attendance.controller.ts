import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';
import { markAttendanceSchema, bulkMarkAttendanceSchema, updateAttendanceSchema, listAttendanceSchema } from './attendance.schema';

const attendanceService = new AttendanceService();

export class AttendanceController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const attendances = await attendanceService.listBySession(classId, sessionId);
      res.json({ data: attendances, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async mark(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const actor = { id: req.user!.id, roles: req.user!.roles };
      const validated = markAttendanceSchema.parse({ body: req.body });
      const attendance = await attendanceService.markAttendance(classId, sessionId, validated.body, actor);
      res.status(201).json({ data: attendance, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async bulkMark(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const actor = { id: req.user!.id, roles: req.user!.roles };
      const validated = bulkMarkAttendanceSchema.parse({ body: req.body });
      const attendances = await attendanceService.bulkMarkAttendance(classId, sessionId, validated.body, actor);
      res.status(201).json({ data: attendances, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const attendanceId = parseInt(req.params.attendanceId);
      const actor = { id: req.user!.id, roles: req.user!.roles };
      const validated = updateAttendanceSchema.parse({ body: req.body });
      const attendance = await attendanceService.updateAttendance(attendanceId, validated.body, actor, classId, sessionId);
      res.json({ data: attendance, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async reset(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const attendanceId = parseInt(req.params.attendanceId);
      const actor = { id: req.user!.id, roles: req.user!.roles };
      const side = req.query.side === 'TEACHER' || req.query.side === 'CS' ? req.query.side : undefined;
      await attendanceService.resetAttendance(attendanceId, actor, side, classId, sessionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
