import { Request, Response, NextFunction } from 'express';
import { TeachersService } from './teachers.service';
import { createTeacherSchema, updateTeacherSchema } from './teachers.schema';

const teachersService = new TeachersService();

export class TeachersController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const teachers = await teachersService.getAllTeachers();
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
      const teacher = await teachersService.createTeacher(validated.body, req.user!.id);
      res.status(201).json({ data: teacher, meta: null });
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
      const validated = updateTeacherSchema.parse({ body: req.body });
      const teacher = await teachersService.updateTeacher(id, validated.body);
      res.json({ data: teacher, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }
}
