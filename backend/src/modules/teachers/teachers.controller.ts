import { Request, Response, NextFunction } from 'express';
import { TeachersService } from './teachers.service';
import { createTeacherSchema, updateTeacherSchema, provisionAccountSchema } from './teachers.schema';
import { parseSearchQuery } from '../../shared/utils/query-validation';
import { AppError } from '../../middlewares/error.middleware';

const teachersService = new TeachersService();

export class TeachersController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const search = parseSearchQuery(req.query.search, 100);
      let active: boolean | undefined;
      if (req.query.active !== undefined && req.query.active !== '') {
        const rawActive = String(req.query.active).trim().toLowerCase();
        if (rawActive === 'true' || rawActive === '1') active = true;
        else if (rawActive === 'false' || rawActive === '0') active = false;
        else throw new AppError(400, 'Tham số active không hợp lệ (true/false)');
      }

      const teacherType =
        typeof req.query.teacher_type === 'string' && req.query.teacher_type.trim()
          ? req.query.teacher_type.trim().toUpperCase()
          : undefined;

      const teachers = await teachersService.getAllTeachers({
        search,
        active,
        teacherType,
      });
      res.json({ data: teachers, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const teacher = await teachersService.getTeacherById(id);
      res.json({ data: teacher, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createTeacherSchema.parse({ body: req.body });
      const teacher = await teachersService.createTeacher(validated.body);
      res.status(201).json({ data: teacher, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = updateTeacherSchema.parse({ body: req.body });
      const teacher = await teachersService.updateTeacher(id, validated.body);
      res.json({ data: teacher, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async provisionAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = provisionAccountSchema.parse({ body: req.body });
      const teacher = await teachersService.provisionAccount(id, validated.body, req.user?.id);
      res.json({ data: teacher, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu không hợp lệ', details: error.errors } });
        return;
      }
      next(error);
    }
  }
}
