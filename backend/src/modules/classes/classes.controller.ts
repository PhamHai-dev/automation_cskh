import { Request, Response, NextFunction } from 'express';
import { ClassesService } from './classes.service';
import {
  createClassSchema,
  updateClassSchema,
  assignTeacherSchema,
  endTeacherAssignmentSchema,
} from './classes.schema';
import {
  parsePaginationQuery,
  parseSearchQuery,
  parseIsoDateParam,
} from '../../shared/utils/query-validation';
import { AppError } from '../../middlewares/error.middleware';

const classesService = new ClassesService();

export class ClassesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, any>;
      const pagination = parsePaginationQuery(q, 50);
      const search = parseSearchQuery(q.search, 100);
      const modelType =
        typeof q.model_type === 'string' && q.model_type.trim()
          ? q.model_type.trim()
          : undefined;

      let active: boolean | undefined;
      if (q.active !== undefined && q.active !== '') {
        const rawActive = String(q.active).trim().toLowerCase();
        if (rawActive === 'true' || rawActive === '1') active = true;
        else if (rawActive === 'false' || rawActive === '0') active = false;
        else throw new AppError(400, 'Tham số active không hợp lệ (true/false)');
      }

      const relevantDate = parseIsoDateParam(q.relevant_date, 'relevant_date')?.dateStr;
      const sessionFrom = parseIsoDateParam(q.session_from, 'session_from')?.dateStr;
      const sessionTo = parseIsoDateParam(q.session_to, 'session_to')?.dateStr;

      let summaryMonth: string | undefined;
      if (typeof q.summary_month === 'string' && q.summary_month.trim()) {
        const sm = q.summary_month.trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(sm)) {
          throw new AppError(400, 'Tham số summary_month không hợp lệ (định dạng chuẩn YYYY-MM)');
        }
        summaryMonth = sm;
      }

      const result = await classesService.getClassesWithMeta(req.user, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        isPaginated: pagination.isPaginated,
        search,
        modelType,
        active,
        relevantDate,
        sessionFrom,
        sessionTo,
        summaryMonth,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const cls = await classesService.getClassById(id, req.user);
      res.json({ data: cls, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createClassSchema.parse({ body: req.body });
      const cls = await classesService.createClass(validated.body);
      res.status(201).json({ data: cls, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = updateClassSchema.parse({ body: req.body });
      const cls = await classesService.updateClass(id, validated.body);
      res.json({ data: cls, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async assignTeacher(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = assignTeacherSchema.parse({ body: req.body });
      const assignment = await classesService.assignTeacher(id, validated.body);
      res.status(201).json({ data: assignment, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async endTeacherAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.id, 10);
      const assignmentId = parseInt(req.params.assignmentId, 10);
      const validated = endTeacherAssignmentSchema.parse({ body: req.body ?? {} });
      const assignment = await classesService.endTeacherAssignment(classId, assignmentId, validated.body, req.user);
      res.json({ data: assignment, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }
}
