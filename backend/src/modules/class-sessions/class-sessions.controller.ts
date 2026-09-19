import { Request, Response, NextFunction } from 'express';
import { ClassSessionsService } from './class-sessions.service';
import { createClassSessionSchema, updateClassSessionSchema } from './class-sessions.schema';

const classSessionsService = new ClassSessionsService();

export class ClassSessionsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessions = await classSessionsService.listByClass(classId);
      res.json({ data: sessions, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const session = await classSessionsService.getSession(classId, sessionId);
      res.json({ data: session, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const userId = req.user?.id || 0;
      const validated = createClassSessionSchema.parse({ body: req.body });
      const session = await classSessionsService.createSession(classId, validated.body, userId);
      res.status(201).json({ data: session, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const validated = updateClassSessionSchema.parse({ body: req.body });
      const session = await classSessionsService.updateSession(classId, sessionId, validated.body);
      res.json({ data: session, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      await classSessionsService.cancelSession(classId, sessionId);
      res.json({ message: 'Session cancelled' });
    } catch (error) {
      next(error);
    }
  }
}
