import { Request, Response, NextFunction } from 'express';
import { StudentsService } from './students.service';
import {
  createStudentSchema,
  updateStudentSchema,
  updateJlptAttendanceReportSchema,
} from './students.schema';
import {
  parsePaginationQuery,
  parseSearchQuery,
  parseOptionalIntParam,
  parseIsoDateParam,
} from '../../shared/utils/query-validation';
import { AppError } from '../../middlewares/error.middleware';

const studentsService = new StudentsService();

function parseStr(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
}

function parseOp(raw: unknown): 'EXACT' | 'RANGE' | undefined {
  const upper = parseStr(raw)?.toUpperCase();
  if (!upper) return undefined;
  if (upper !== 'EXACT' && upper !== 'RANGE') {
    throw new AppError(400, 'Toán tử lọc phải là EXACT hoặc RANGE');
  }
  return upper;
}

function parseOptionalBoolean(raw: unknown, paramName: string): boolean | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new AppError(400, `Tham số ${paramName} phải là true hoặc false`);
}

function parseNonNegativeInt(raw: unknown, paramName: string): number | undefined {
  const value = parseOptionalIntParam(raw, paramName);
  if (value !== undefined && value < 0) {
    throw new AppError(400, `Tham số ${paramName} phải lớn hơn hoặc bằng 0`);
  }
  return value;
}

function parseAllowedValue(
  raw: unknown,
  paramName: string,
  allowed: readonly string[],
  aliases: Record<string, string> = {},
): string | undefined {
  const parsed = parseStr(raw)?.toUpperCase();
  if (!parsed || parsed === 'ALL') return undefined;
  const normalized = aliases[parsed] || parsed;
  if (!allowed.includes(normalized)) {
    throw new AppError(400, `Tham số ${paramName} không thuộc danh sách giá trị được hỗ trợ`);
  }
  return normalized;
}

function assertAscendingRange<T extends number | string>(
  min: T | undefined,
  max: T | undefined,
  minParamName: string,
  maxParamName: string,
): void {
  if (min !== undefined && max !== undefined && min > max) {
    throw new AppError(400, `Tham số ${minParamName} không được lớn hơn ${maxParamName}`);
  }
}

export class StudentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const pagination = parsePaginationQuery(req.query as Record<string, any>, 25);
      const search = parseSearchQuery(req.query.search, 100);
      const programType = parseAllowedValue(
        req.query.program_type,
        'program_type',
        ['KAIWA', 'JLPT'],
        { JNPT: 'JLPT' },
      );
      const csId = parseOptionalIntParam(req.query.cs_id, 'cs_id');
      const cvht = parseStr(req.query.cvht);
      const gender = parseAllowedValue(req.query.gender, 'gender', ['MALE', 'FEMALE', 'OTHER']);
      const status = parseAllowedValue(req.query.status, 'status', [
        'WAITING_CLASS',
        'STUDYING',
        'PAUSED',
        'FINISHED',
        'UPCOMING',
        'NOT_STARTED',
        'CANCELLED',
      ]);
      const rawModelValue = req.query.model ?? req.query.model_filter;
      const rawModel = parseAllowedValue(rawModelValue, 'model', ['1:1', '1:2', '1:N']);
      const rawPaymentValue = req.query.payment ?? req.query.payment_status;
      const payment = parseAllowedValue(rawPaymentValue, 'payment', ['PAID', 'DEBT', 'UNSET']);
      const sale = parseStr(req.query.sale);
      const packageName = parseStr(req.query.package_name);
      const courseCode = parseStr(req.query.course_code);
      const teacherName = parseStr(req.query.teacher_name);
      const teacherCode = parseStr(req.query.teacher_code);
      const className = parseStr(req.query.class_name);
      const classCode = parseStr(req.query.class_code);
      const schedulePattern = parseStr(req.query.schedule_pattern);
      const startTime = parseStr(req.query.start_time);
      const startDateOp = parseOp(req.query.start_date_op);
      const startDateExact = parseIsoDateParam(req.query.start_date_exact, 'start_date_exact')?.dateStr;
      const startDateFrom = parseIsoDateParam(req.query.start_date_from, 'start_date_from')?.dateStr;
      const startDateTo = parseIsoDateParam(req.query.start_date_to, 'start_date_to')?.dateStr;
      const endDateOp = parseOp(req.query.end_date_op);
      const endDateExact = parseIsoDateParam(req.query.end_date_exact, 'end_date_exact')?.dateStr;
      const endDateFrom = parseIsoDateParam(req.query.end_date_from, 'end_date_from')?.dateStr;
      const endDateTo = parseIsoDateParam(req.query.end_date_to, 'end_date_to')?.dateStr;
      const totalSessionsOp = parseOp(req.query.total_sessions_op);
      const totalSessionsExact = parseNonNegativeInt(req.query.total_sessions_exact, 'total_sessions_exact');
      const totalSessionsMin = parseNonNegativeInt(req.query.total_sessions_min, 'total_sessions_min');
      const totalSessionsMax = parseNonNegativeInt(req.query.total_sessions_max, 'total_sessions_max');
      const remainingSessionsOp = parseOp(req.query.remaining_sessions_op);
      const remainingSessionsExact = parseOptionalIntParam(req.query.remaining_sessions_exact, 'remaining_sessions_exact');
      const remainingSessionsMin = parseOptionalIntParam(req.query.remaining_sessions_min, 'remaining_sessions_min');
      const remainingSessionsMax = parseOptionalIntParam(req.query.remaining_sessions_max, 'remaining_sessions_max');
      const hasClass = parseOptionalBoolean(req.query.has_class, 'has_class');
      const hasTeacher = parseOptionalBoolean(req.query.has_teacher, 'has_teacher');
      const birthYearMin = parseNonNegativeInt(req.query.birth_year_min, 'birth_year_min');
      const birthYearMax = parseNonNegativeInt(req.query.birth_year_max, 'birth_year_max');
      const occupation = parseStr(req.query.occupation);

      assertAscendingRange(startDateFrom, startDateTo, 'start_date_from', 'start_date_to');
      assertAscendingRange(endDateFrom, endDateTo, 'end_date_from', 'end_date_to');
      assertAscendingRange(totalSessionsMin, totalSessionsMax, 'total_sessions_min', 'total_sessions_max');
      assertAscendingRange(
        remainingSessionsMin,
        remainingSessionsMax,
        'remaining_sessions_min',
        'remaining_sessions_max',
      );
      assertAscendingRange(birthYearMin, birthYearMax, 'birth_year_min', 'birth_year_max');

      // B.5/D9: the full actor is passed so the repository derives scope from
      // enrollment.cs_id only; sale/handover fields are not access predicates.
      const result = await studentsService.getStudentsWithMeta({
        actor: user,
        page: pagination.page,
        pageSize: pagination.pageSize,
        isPaginated: pagination.isPaginated,
        search,
        programType,
        csId: csId && csId > 0 ? csId : undefined,
        cvht,
        gender,
        status,
        model: rawModel,
        payment,
        sale,
        packageName,
        courseCode,
        teacherName,
        teacherCode,
        className,
        classCode,
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
        remainingSessionsOp,
        remainingSessionsExact,
        remainingSessionsMin,
        remainingSessionsMax,
        hasClass,
        hasTeacher,
        birthYearMin,
        birthYearMax,
        occupation,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const user = (req as any).user;
      const student = await studentsService.getStudentById(id, user);
      res.json({ data: student, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createStudentSchema.parse({ body: req.body });
      const user = (req as any).user;
      // B.5/D9: pass the full actor; cs_id assignment is authorized against the
      // actor's scope and the CS role in the repository, not guessed from names.
      const student = await studentsService.createStudent(validated.body, user);
      res.status(201).json({ data: student, meta: null });
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
      const validated = updateStudentSchema.parse({ body: req.body });
      const user = (req as any).user;
      const student = await studentsService.updateStudent(id, validated.body, user);
      res.json({ data: student, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async softDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'studentId không hợp lệ',
            details: [],
          },
        });
        return;
      }

      const user = (req as any).user;
      await studentsService.softDeleteStudent(id, user);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  async getJlptAttendanceReport(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const pagination = parsePaginationQuery(req.query as Record<string, any>, 50);
      const search = parseSearchQuery(req.query.search, 100);
      const class_code =
        typeof req.query.class_code === 'string' && req.query.class_code.trim()
          ? req.query.class_code.trim()
          : undefined;
      const course_track =
        typeof req.query.course_track === 'string' && req.query.course_track.trim()
          ? req.query.course_track.trim()
          : undefined;
      const status =
        typeof req.query.status === 'string' && req.query.status.trim()
          ? req.query.status.trim().toUpperCase()
          : undefined;
      const cvht =
        typeof req.query.cvht === 'string' && req.query.cvht.trim()
          ? req.query.cvht.trim()
          : undefined;
      const warning_filter =
        typeof req.query.warning_filter === 'string' && req.query.warning_filter.trim()
          ? req.query.warning_filter.trim().toUpperCase()
          : undefined;
      const student_id = parseOptionalIntParam(req.query.student_id, 'student_id');

      const result = await studentsService.getJlptAttendanceReport({
        actor: user,
        page: pagination.page,
        pageSize: pagination.pageSize,
        search,
        class_code,
        course_track,
        status,
        cvht,
        warning_filter,
        student_id: student_id && student_id > 0 ? student_id : undefined,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateJlptAttendanceReport(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id) || id <= 0) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'student_id không hợp lệ',
            details: [],
          },
        });
        return;
      }
      const validated = updateJlptAttendanceReportSchema.parse({ body: req.body });
      const user = (req as any).user;
      const row = await studentsService.updateJlptAttendanceReport(id, validated.body, user);
      res.json({ data: row, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid data',
            details: error.errors,
          },
        });
        return;
      }
      next(error);
    }
  }
}
