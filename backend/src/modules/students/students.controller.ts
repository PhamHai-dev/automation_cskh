import { Request, Response, NextFunction } from 'express';
import { StudentsService } from './students.service';
import { createStudentSchema, updateStudentSchema } from './students.schema';
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
      const pagination = parsePaginationQuery(req.query as Record<string, any>, 50);
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
}
