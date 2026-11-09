import { Request, Response, NextFunction } from 'express';
import { activityLogsService } from './activity-logs.service';
import type { ActivityModuleType, LoginAuditFilterStatus } from './activity-logs.types';

function parseOptionalInt(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : undefined;
}

function parseOptionalStr(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ActivityLogsController {
  async listAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const rawModule = parseOptionalStr(req.query.module)?.toUpperCase() as
        | ActivityModuleType
        | undefined;
      const action = parseOptionalStr(req.query.action);
      const actorId = parseOptionalInt(req.query.actorId ?? req.query.actor_id);
      const search = parseOptionalStr(req.query.search);
      const fromDate = parseOptionalStr(req.query.fromDate ?? req.query.from_date);
      const toDate = parseOptionalStr(req.query.toDate ?? req.query.to_date);
      const page = parseOptionalInt(req.query.page) ?? 1;
      const limit = Math.min(200, parseOptionalInt(req.query.limit) ?? 50);

      const result = await activityLogsService.listAuditLogs(user, {
        module: rawModule || 'ALL',
        action,
        actorId,
        search,
        fromDate,
        toDate,
        page,
        limit,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listLoginAudits(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const rawStatus = parseOptionalStr(req.query.status)?.toUpperCase() as
        | LoginAuditFilterStatus
        | undefined;
      const actorId = parseOptionalInt(req.query.actorId ?? req.query.actor_id);
      const search = parseOptionalStr(req.query.search);
      const fromDate = parseOptionalStr(req.query.fromDate ?? req.query.from_date);
      const toDate = parseOptionalStr(req.query.toDate ?? req.query.to_date);
      const page = parseOptionalInt(req.query.page) ?? 1;
      const limit = Math.min(200, parseOptionalInt(req.query.limit) ?? 50);

      const result = await activityLogsService.listLoginAudits(user, {
        status: rawStatus || 'ALL',
        actorId,
        search,
        fromDate,
        toDate,
        page,
        limit,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listActors(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user!;
      const result = await activityLogsService.listActors(user);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

export const activityLogsController = new ActivityLogsController();
