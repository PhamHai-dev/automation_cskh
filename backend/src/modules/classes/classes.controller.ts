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
  parseOptionalIntParam,
} from '../../shared/utils/query-validation';
import { AppError } from '../../middlewares/error.middleware';

const classesService = new ClassesService();

function parseStr(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOp(raw: unknown): 'EXACT' | 'RANGE' | undefined {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.trim().toUpperCase();
  if (upper === 'EXACT' || upper === 'RANGE') return upper;
  return undefined;
}

export class ClassesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, any>;
      const pagination = parsePaginationQuery(q, 25);
      const search = parseSearchQuery(q.search, 100);
      const modelFilter = parseStr(q.model_filter);
      const modelType = parseStr(q.model_type) || modelFilter;

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

      const programTypeRaw = parseStr(q.program_type)?.toUpperCase();
      const programType =
        programTypeRaw && programTypeRaw !== 'ALL' ? programTypeRaw : undefined;
      const status = parseStr(q.status)?.toUpperCase();
      const packageName = parseStr(q.package_name);
      const courseCategoryRaw = parseStr(q.course_category)?.toUpperCase();
      const courseCategory =
        courseCategoryRaw === 'KAIWA' || courseCategoryRaw === 'JNPT'
          ? courseCategoryRaw
          : undefined;
      const courseLevel = parseStr(q.course_level) || parseStr(q.level);
      const teacherName = parseStr(q.teacher_name);
      const teacherCode = parseStr(q.teacher_code);
      const className = parseStr(q.class_name);
      const schedulePattern = parseStr(q.schedule_pattern);
      const startTime = parseStr(q.start_time);
      const sale = parseStr(q.sale);

      const startDateOp = parseOp(q.start_date_op);
      const startDateExact = parseIsoDateParam(q.start_date_exact, 'start_date_exact')?.dateStr;
      const startDateFrom = parseIsoDateParam(q.start_date_from, 'start_date_from')?.dateStr;
      const startDateTo = parseIsoDateParam(q.start_date_to, 'start_date_to')?.dateStr;

      const endDateOp = parseOp(q.end_date_op);
      const endDateExact = parseIsoDateParam(q.end_date_exact, 'end_date_exact')?.dateStr;
      const endDateFrom = parseIsoDateParam(q.end_date_from, 'end_date_from')?.dateStr;
      const endDateTo = parseIsoDateParam(q.end_date_to, 'end_date_to')?.dateStr;

      const totalSessionsOp = parseOp(q.total_sessions_op);
      const totalSessionsExact = parseOptionalIntParam(q.total_sessions_exact, 'total_sessions_exact');
      const totalSessionsMin = parseOptionalIntParam(q.total_sessions_min, 'total_sessions_min');
      const totalSessionsMax = parseOptionalIntParam(q.total_sessions_max, 'total_sessions_max');

      const remainingSessionsOp = parseOp(q.remaining_sessions_op);
      const remainingSessionsExact = parseOptionalIntParam(q.remaining_sessions_exact, 'remaining_sessions_exact');
      const remainingSessionsMin = parseOptionalIntParam(q.remaining_sessions_min, 'remaining_sessions_min');
      const remainingSessionsMax = parseOptionalIntParam(q.remaining_sessions_max, 'remaining_sessions_max');

      const result = await classesService.getClassesWithMeta(req.user, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        isPaginated: pagination.isPaginated,
        search,
        modelType,
        modelFilter,
        active,
        relevantDate,
        sessionFrom,
        sessionTo,
        summaryMonth,
        programType,
        status,
        packageName,
        courseCategory,
        courseLevel,
        teacherName,
        teacherCode,
        className,
        schedulePattern,
        startTime,
        sale,
        startDateOp,
        startDateExact,
        startDateFrom,
        startDateTo,
        endDateOp,
        endDateExact,
        endDateFrom,
        endDateTo,
        totalSessionsOp,
        totalSessionsExact,
        totalSessionsMin,
        totalSessionsMax,
        remainingSessionsOp,
        remainingSessionsExact,
        remainingSessionsMin,
        remainingSessionsMax,
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
