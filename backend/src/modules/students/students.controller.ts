import { Request, Response, NextFunction } from 'express';
import { StudentsService } from './students.service';
import { createStudentSchema, updateStudentSchema } from './students.schema';

const studentsService = new StudentsService();

export class StudentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;
      const programType = typeof req.query.program_type === 'string' && req.query.program_type.trim()
        ? req.query.program_type.trim().toUpperCase()
        : undefined;
      const csId = req.query.cs_id !== undefined && req.query.cs_id !== ''
        ? parseInt(String(req.query.cs_id), 10)
        : undefined;

      const students = await studentsService.getAllStudents({
        userId: user?.id,
        roles: user?.roles,
        programType,
        csId: csId && !Number.isNaN(csId) ? csId : undefined,
      });
      res.json({ data: students, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const student = await studentsService.getStudentById(id);
      res.json({ data: student, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createStudentSchema.parse({ body: req.body });
      const currentUserId = (req as any).user?.id;
      const student = await studentsService.createStudent(validated.body, currentUserId);
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
      const student = await studentsService.updateStudent(id, validated.body);
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
