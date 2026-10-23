import { Request, Response, NextFunction } from 'express';
import { EnrollmentsService } from './enrollments.service';
import { createEnrollmentSchema, updateEnrollmentSchema, reassignCSSchema, transferClassSchema } from './enrollments.schema';

const enrollmentsService = new EnrollmentsService();

export class EnrollmentsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const sale = (req.query.sale as string) || undefined;
      const programType = typeof req.query.program_type === 'string' && req.query.program_type.trim()
        ? req.query.program_type.trim().toUpperCase()
        : undefined;
      const csId = req.query.cs_id !== undefined && req.query.cs_id !== ''
        ? parseInt(String(req.query.cs_id), 10)
        : undefined;
      const enrollments = await enrollmentsService.getEnrollmentsForUser(
        req.user!.id,
        req.user!.roles,
        sale,
        {
          programType,
          csId: csId && !Number.isNaN(csId) ? csId : undefined,
        }
      );
      res.json({ data: enrollments, meta: null });
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
