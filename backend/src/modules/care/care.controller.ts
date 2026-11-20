import { Request, Response, NextFunction } from 'express';
import { CareService } from './care.service';
import { CareTaskFilterParams, AttendanceNotificationFilterParams } from './care.types';
import { CareTaskPriority, CareTaskStatus, CareTaskType } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import {
  parseIsoDateParam,
  parseOptionalIntParam,
  parsePaginationQuery,
  parseSearchQuery,
} from '../../shared/utils/query-validation';

function parseCareTaskEnum<T extends string>(
  raw: unknown,
  paramName: string,
  allowed: readonly T[],
): T | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const normalized = String(raw).trim().toUpperCase();
  if (!allowed.includes(normalized as T)) {
    throw new AppError(400, `Tham số ${paramName} không thuộc danh sách giá trị được hỗ trợ`);
  }
  return normalized as T;
}

function parsePositiveCareTaskId(raw: unknown, paramName: string): number | undefined {
  const value = parseOptionalIntParam(raw, paramName);
  if (value !== undefined && value <= 0) {
    throw new AppError(400, `Tham số ${paramName} phải là số nguyên dương`);
  }
  return value;
}

function assertCareTaskDateRange(
  from: string | undefined,
  to: string | undefined,
  fromParam: string,
  toParam: string,
): void {
  if (from && to && from > to) {
    throw new AppError(400, `Tham số ${fromParam} không được lớn hơn ${toParam}`);
  }
}

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
      const pagination = parsePaginationQuery(req.query as Record<string, any>, 25);
      const rawProgram = parseCareTaskEnum(
        req.query.program_type,
        'program_type',
        ['KAIWA', 'JLPT', 'JNPT'] as const,
      );
      const dueFrom = parseIsoDateParam(req.query.due_from, 'due_from')?.dateStr;
      const dueTo = parseIsoDateParam(req.query.due_to, 'due_to')?.dateStr;
      const createdFrom = parseIsoDateParam(req.query.created_from, 'created_from')?.dateStr;
      const createdTo = parseIsoDateParam(req.query.created_to, 'created_to')?.dateStr;
      assertCareTaskDateRange(dueFrom, dueTo, 'due_from', 'due_to');
      assertCareTaskDateRange(createdFrom, createdTo, 'created_from', 'created_to');

      const filter: CareTaskFilterParams = {
        search: parseSearchQuery(req.query.search, 100),
        program_type: rawProgram === 'JNPT' ? 'JLPT' : rawProgram,
        status: parseCareTaskEnum(req.query.status, 'status', Object.values(CareTaskStatus)),
        priority: parseCareTaskEnum(req.query.priority, 'priority', Object.values(CareTaskPriority)),
        type: parseCareTaskEnum(req.query.type, 'type', Object.values(CareTaskType)),
        assigned_to_id: parsePositiveCareTaskId(req.query.assigned_to_id, 'assigned_to_id'),
        enrollment_id: parsePositiveCareTaskId(req.query.enrollment_id, 'enrollment_id'),
        due_filter: parseCareTaskEnum(
          req.query.due_filter,
          'due_filter',
          ['OVERDUE', 'TODAY', 'THIS_WEEK', 'ALL'] as const,
        )?.toLowerCase() as CareTaskFilterParams['due_filter'],
        due_from: dueFrom,
        due_to: dueTo,
        created_from: createdFrom,
        created_to: createdTo,
        page: pagination.page,
        pageSize: pagination.pageSize,
        limit: pagination.pageSize,
        offset: pagination.isPaginated ? pagination.skip : 0,
      };

      const result = await this.service.getCareTasks(filter, user.id, user.roles);
      res.status(200).json({
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          totalPages: result.totalPages,
        },
      });
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

  // --- CareMilestoneConfig Endpoints ---

  getMilestones = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getMilestones();
      res.status(200).json({ data: list, meta: null });
    } catch (err) {
      next(err);
    }
  };

  addMilestone = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const sessionNumber = parseInt(req.body.session_number, 10);
      const item = await this.service.addMilestone(sessionNumber, user.id);
      res.status(201).json({ data: item, meta: null });
    } catch (err) {
      next(err);
    }
  };

  // --- Session CareLog Endpoint ---

  saveSessionCareLog = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollmentId = parseInt(req.params.enrollmentId, 10);
      const sessionNumber = parseInt(req.params.sessionNumber, 10);
      const user = (req as any).user;
      const result = await this.service.saveSessionCareLog(
        enrollmentId,
        sessionNumber,
        req.body,
        user.id,
        user.roles
      );
      res.status(200).json({ data: result, meta: null });
    } catch (err) {
      next(err);
    }
  };

  // --- Update Enrollment Care Fields ---

  updateEnrollmentCare = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollmentId = parseInt(req.params.enrollmentId, 10);
      const user = (req as any).user;
      const result = await this.service.updateEnrollmentCare(
        enrollmentId,
        req.body,
        user.id,
        user.roles
      );
      res.status(200).json({ data: result, meta: null });
    } catch (err) {
      next(err);
    }
  };

  // --- Attendance Notification Endpoints ---

  getNotifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const statusParam = req.query.status as string | undefined;
      const status: 'all' | 'unread' | 'read' =
        statusParam === 'unread' || statusParam === 'read' ? statusParam : 'all';
      const filter: AttendanceNotificationFilterParams = {
        status,
        recipient_user_id: req.query.recipient_user_id
          ? parseInt(req.query.recipient_user_id as string, 10)
          : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };
      const result = await this.service.getNotifications(filter, user.id, user.roles);
      res.status(200).json({
        data: result.items,
        meta: { total: result.total, unreadCount: result.unreadCount },
      });
    } catch (err) {
      next(err);
    }
  };

  markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = parseInt(req.params.notificationId, 10);
      const user = (req as any).user;
      const result = await this.service.markNotificationRead(notificationId, user.id, user.roles);
      res.status(200).json({ data: result, meta: null });
    } catch (err) {
      next(err);
    }
  };

  markAllNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      const recipientUserId = req.query.recipient_user_id
        ? parseInt(req.query.recipient_user_id as string, 10)
        : req.body?.recipient_user_id
        ? parseInt(String(req.body.recipient_user_id), 10)
        : undefined;
      const result = await this.service.markAllNotificationsRead(user.id, user.roles, recipientUserId);
      res.status(200).json({ data: result, meta: null });
    } catch (err) {
      next(err);
    }
  };
}
