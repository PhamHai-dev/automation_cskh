import { Request, Response, NextFunction } from 'express';
import { ClassSessionsService } from './class-sessions.service';
import { createClassSessionSchema, createActualClassSessionSchema, updateClassSessionSchema, cancelClassSessionSchema } from './class-sessions.schema';

const classSessionsService = new ClassSessionsService();

const unwrapSession = (result: any) => (result && Object.prototype.hasOwnProperty.call(result, 'session') ? result.session : result);

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
      res.status(201).json({ data: unwrapSession(session), meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async createActual(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const userId = req.user?.id || 0;
      const validated = createActualClassSessionSchema.parse({ body: req.body });
      const result = await classSessionsService.createActualSession(classId, validated.body, userId);
      res.status(result.replayed ? 200 : 201).json({ data: result.session, meta: { replayed: result.replayed } });
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
      const userId = req.user?.id || 0;
      const validated = cancelClassSessionSchema.parse({ body: req.body ?? {} });
      await classSessionsService.cancelSession(classId, sessionId, validated.body.reason, userId);
      res.json({ message: 'Session cancelled' });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
      }
      next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const classId = parseInt(req.params.classId);
      const sessionId = parseInt(req.params.sessionId);
      const userId = req.user?.id || 0;
      const confirmed = req.query.confirm === 'true';
      const result = await classSessionsService.deleteSession(classId, sessionId, userId, confirmed);
      res.json({ data: result, meta: null });
    } catch (error) {
      next(error);
    }
  }
}
