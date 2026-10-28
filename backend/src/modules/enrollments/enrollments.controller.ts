import { Request, Response, NextFunction } from 'express';
import { EnrollmentsService } from './enrollments.service';
import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
  reassignCSSchema,
  transferClassSchema,
} from './enrollments.schema';
import {
  parsePaginationQuery,
  parseSearchQuery,
  parseIsoDateParam,
  parseOptionalIntParam,
} from '../../shared/utils/query-validation';

const enrollmentsService = new EnrollmentsService();

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

export class EnrollmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, any>;
      const pagination = parsePaginationQuery(q, 50);
      const search = parseSearchQuery(q.search, 100);
      const sale = parseStr(q.sale);
      const programTypeRaw = parseStr(q.program_type)?.toUpperCase();
      const programType =
        programTypeRaw && programTypeRaw !== 'ALL' ? programTypeRaw : undefined;
      const csId = parseOptionalIntParam(q.cs_id, 'cs_id');
      const status = parseStr(q.status)?.toUpperCase();
      const packageName = parseStr(q.package_name);
      const courseCategoryRaw = parseStr(q.course_category)?.toUpperCase();
      const courseCategory =
        courseCategoryRaw === 'KAIWA' || courseCategoryRaw === 'JNPT'
          ? courseCategoryRaw
          : undefined;
      const courseLevel = parseStr(q.course_level);
      const teacherName = parseStr(q.teacher_name);
      const teacherCode = parseStr(q.teacher_code);
      const className = parseStr(q.class_name);
      const modelFilter = parseStr(q.model_filter);
      const schedulePattern = parseStr(q.schedule_pattern);
      const startTime = parseStr(q.start_time);

      // Date params validation (YYYY-MM-DD)
      const startDateOp = parseOp(q.start_date_op);
      const startDateExact = parseIsoDateParam(q.start_date_exact, 'start_date_exact')?.dateStr;
      const startDateFrom = parseIsoDateParam(q.start_date_from, 'start_date_from')?.dateStr;
      const startDateTo = parseIsoDateParam(q.start_date_to, 'start_date_to')?.dateStr;

      const endDateOp = parseOp(q.end_date_op);
      const endDateExact = parseIsoDateParam(q.end_date_exact, 'end_date_exact')?.dateStr;
      const endDateFrom = parseIsoDateParam(q.end_date_from, 'end_date_from')?.dateStr;
      const endDateTo = parseIsoDateParam(q.end_date_to, 'end_date_to')?.dateStr;

      const sessionFrom = parseIsoDateParam(q.session_from, 'session_from')?.dateStr;
      const sessionTo = parseIsoDateParam(q.session_to, 'session_to')?.dateStr;

      // Numeric session filters
      const totalSessionsOp = parseOp(q.total_sessions_op);
      const totalSessionsExact = parseOptionalIntParam(q.total_sessions_exact, 'total_sessions_exact');
      const totalSessionsMin = parseOptionalIntParam(q.total_sessions_min, 'total_sessions_min');
      const totalSessionsMax = parseOptionalIntParam(q.total_sessions_max, 'total_sessions_max');

      const attendedSessionsOp = parseOp(q.attended_sessions_op);
      const attendedSessionsExact = parseOptionalIntParam(q.attended_sessions_exact, 'attended_sessions_exact');
      const attendedSessionsMin = parseOptionalIntParam(q.attended_sessions_min, 'attended_sessions_min');
      const attendedSessionsMax = parseOptionalIntParam(q.attended_sessions_max, 'attended_sessions_max');

      const remainingSessionsOp = parseOp(q.remaining_sessions_op);
      const remainingSessionsExact = parseOptionalIntParam(q.remaining_sessions_exact, 'remaining_sessions_exact');
      const remainingSessionsMin = parseOptionalIntParam(q.remaining_sessions_min, 'remaining_sessions_min');
      const remainingSessionsMax = parseOptionalIntParam(q.remaining_sessions_max, 'remaining_sessions_max');

      const result = await enrollmentsService.getEnrollmentsWithMeta(
        req.user!.id,
        req.user!.roles,
        sale,
        {
          page: pagination.page,
          pageSize: pagination.pageSize,
          isPaginated: pagination.isPaginated,
          search,
          programType,
          csId: csId && csId > 0 ? csId : undefined,
          sale,
          status,
          packageName,
          courseCategory,
          courseLevel,
          teacherName,
          teacherCode,
          className,
          modelFilter,
          schedulePattern,
          startTime,
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
          attendedSessionsOp,
          attendedSessionsExact,
          attendedSessionsMin,
          attendedSessionsMax,
          remainingSessionsOp,
          remainingSessionsExact,
          remainingSessionsMin,
          remainingSessionsMax,
          sessionFrom,
          sessionTo,
        },
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const enrollment = await enrollmentsService.getEnrollmentById(id, req.user!.id, req.user!.roles);
      res.json({ data: enrollment, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createEnrollmentSchema.parse({ body: req.body });
      const enrollment = await enrollmentsService.createEnrollment(validated.body, req.user!.id, req.user!.roles);
      res.status(201).json({ data: enrollment, meta: null });
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
      const validated = updateEnrollmentSchema.parse({ body: req.body });
      const enrollment = await enrollmentsService.updateEnrollment(id, validated.body, req.user!.id, req.user!.roles);
      res.json({ data: enrollment, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async reassign(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = reassignCSSchema.parse({ body: req.body });
      const enrollment = await enrollmentsService.reassignCS(id, validated.body.cs_id, req.user!.id, req.user!.roles);
      res.json({ data: enrollment, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async transferClass(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = transferClassSchema.parse({ body: req.body });
      const ec = await enrollmentsService.transferClass(id, validated.body, req.user!.id, req.user!.roles);
      res.status(201).json({ data: ec, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }
}
