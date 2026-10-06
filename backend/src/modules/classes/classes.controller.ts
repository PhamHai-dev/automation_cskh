import { Request, Response, NextFunction } from 'express';
import { ClassesService } from './classes.service';
import { createClassSchema, updateClassSchema, assignTeacherSchema } from './classes.schema';

const classesService = new ClassesService();

export class ClassesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const classes = await classesService.getAllClasses(req.user);
      res.json({ data: classes, meta: null });
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
}
