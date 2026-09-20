import { Request, Response, NextFunction } from 'express';
import { CareService } from './care.service';
import { CareTaskFilterParams } from './care.types';

export class CareController {
  private service: CareService;

  constructor(service?: CareService) {
    this.service = service || new CareService();
  }

  // --- CareLog Endpoints ---

  getCareLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollmentId = parseInt(req.params.enrollmentId, 10);
      const user = (req as any).user;
      const logs = await this.service.getCareLogs(enrollmentId, user.id, user.roles);
      res.status(200).json({ data: logs, meta: null });
    } catch (err) {
      next(err);
    }
  };

  createCareLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollmentId = parseInt(req.params.enrollmentId, 10);
      const user = (req as any).user;
      const log = await this.service.createCareLog(enrollmentId, req.body, user.id, user.roles);
      res.status(201).json({ data: log, meta: null });
    } catch (err) {
      next(err);
    }
  };

  // --- CareTask Endpoints ---

  getCareTasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filter: CareTaskFilterParams = {
        status: req.query.status as any,
        priority: req.query.priority as any,
        type: req.query.type as any,
        assigned_to_id: req.query.assigned_to_id ? parseInt(req.query.assigned_to_id as string, 10) : undefined,
        enrollment_id: req.query.enrollment_id ? parseInt(req.query.enrollment_id as string, 10) : undefined,
        due_filter: req.query.due_filter as any,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const result = await this.service.getCareTasks(filter, user.id, user.roles);
      res.status(200).json({ data: result.items, meta: { total: result.total } });
    } catch (err) {
      next(err);
    }
  };

  getCareTaskById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const user = (req as any).user;
      const task = await this.service.getCareTaskById(taskId, user.id, user.roles);
      res.status(200).json({ data: task, meta: null });
    } catch (err) {
      next(err);
    }
  };

  createCareTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const task = await this.service.createCareTask(req.body, user.id, user.roles);
      res.status(201).json({ data: task, meta: null });
    } catch (err) {
      next(err);
    }
  };

  updateCareTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const user = (req as any).user;
      const task = await this.service.updateCareTask(taskId, req.body, user.id, user.roles);
      res.status(200).json({ data: task, meta: null });
    } catch (err) {
      next(err);
    }
  };

  completeCareTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const user = (req as any).user;
      const task = await this.service.completeCareTask(taskId, user.id, user.roles);
      res.status(200).json({ data: task, meta: null });
    } catch (err) {
      next(err);
    }
  };

  cancelCareTask = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const user = (req as any).user;
      const task = await this.service.cancelCareTask(taskId, user.id, user.roles);
      res.status(200).json({ data: task, meta: null });
    } catch (err) {
      next(err);
    }
  };
}
