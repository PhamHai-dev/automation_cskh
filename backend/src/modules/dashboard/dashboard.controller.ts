import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';
import { DashboardFilterParams } from './dashboard.types';

export class DashboardController {
  private service: DashboardService;

  constructor(service?: DashboardService) {
    this.service = service || new DashboardService();
  }

  private extractFilters(req: Request): DashboardFilterParams {
    return {
      package_id: req.query.package_id ? parseInt(req.query.package_id as string, 10) : undefined,
      cs_id: req.query.cs_id ? parseInt(req.query.cs_id as string, 10) : undefined,
      class_id: req.query.class_id ? parseInt(req.query.class_id as string, 10) : undefined,
      date_from: req.query.date_from as string | undefined,
      date_to: req.query.date_to as string | undefined,
      status: req.query.status as string | undefined,
    };
  }

  getSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const summary = await this.service.getSummary(filters, user.id, user.roles);
      res.status(200).json({ data: summary, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const attendance = await this.service.getAttendance(filters, user.id, user.roles);
      res.status(200).json({ data: attendance, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getCarePivot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const pivot = await this.service.getCarePivot(filters, user.id, user.roles);
      res.status(200).json({ data: pivot, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getTasksOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const csId = req.query.cs_id ? parseInt(req.query.cs_id as string, 10) : undefined;
      const tasksOverview = await this.service.getTasksOverview(csId, user.id, user.roles);
      res.status(200).json({ data: tasksOverview, meta: null });
    } catch (err) {
      next(err);
    }
  };

  // ---- New tab-composed endpoints ----

  getOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const data = await this.service.getOverview(filters, user.id, user.roles);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getCare = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const data = await this.service.getCare(filters, user.id, user.roles);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceTab = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const data = await this.service.getAttendanceTab(filters, user.id, user.roles);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };

  getPerformance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const filters = this.extractFilters(req);
      const data = await this.service.getPerformance(filters, user.id, user.roles);
      res.status(200).json({ data, meta: null });
    } catch (err) {
      next(err);
    }
  };
}
