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
} from '../../shared/utils/query-validation';

const studentsService = new StudentsService();

export class StudentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const pagination = parsePaginationQuery(req.query as Record<string, any>, 25);
      const search = parseSearchQuery(req.query.search, 100);
      const programType =
        typeof req.query.program_type === 'string' && req.query.program_type.trim()
          ? req.query.program_type.trim().toUpperCase()
          : undefined;
      const csId = parseOptionalIntParam(req.query.cs_id, 'cs_id');
      const cvht =
        typeof req.query.cvht === 'string' && req.query.cvht.trim()
          ? req.query.cvht.trim()
          : undefined;
      const gender =
        typeof req.query.gender === 'string' && req.query.gender.trim()
          ? req.query.gender.trim().toUpperCase()
          : undefined;
      const status =
        typeof req.query.status === 'string' && req.query.status.trim()
          ? req.query.status.trim().toUpperCase()
          : undefined;
      const rawModel =
        typeof req.query.model === 'string' && req.query.model.trim()
          ? req.query.model.trim()
          : typeof req.query.model_filter === 'string' && req.query.model_filter.trim()
          ? req.query.model_filter.trim()
          : undefined;
      const payment =
        typeof req.query.payment === 'string' && req.query.payment.trim()
          ? req.query.payment.trim().toUpperCase()
          : typeof req.query.payment_status === 'string' && req.query.payment_status.trim()
          ? req.query.payment_status.trim().toUpperCase()
          : undefined;
      const sale =
        typeof req.query.sale === 'string' && req.query.sale.trim()
          ? req.query.sale.trim()
          : undefined;

      // B.5/D9: the full actor is passed so the repository derives scope from
      // enrollment.cs_id only; sale/handover fields are not access predicates.
      const result = await studentsService.getStudentsWithMeta({
        actor: user,
        page: pagination.page,
        pageSize: pagination.pageSize,
        isPaginated: pagination.isPaginated,
        search,
        programType: programType && programType !== 'ALL' ? programType : undefined,
        csId: csId && csId > 0 ? csId : undefined,
        cvht,
        gender,
        status,
        model: rawModel,
        payment,
        sale,
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
