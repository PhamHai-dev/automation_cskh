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

      // B.5/D9: the full actor is passed so the repository derives scope from
      // enrollment.cs_id only; sale/handover fields are not access predicates.
      const students = await studentsService.getAllStudents({
        actor: user,
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
