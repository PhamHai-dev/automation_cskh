import { Request, Response, NextFunction } from 'express';
import { activityLogsService } from './activity-logs.service';
import {
  activityExportQuerySchema,
  auditLogQuerySchema,
  loginAuditQuerySchema,
} from './activity-logs.schema';

function normalizedQuery(query: Request['query']): Record<string, unknown> {
  return {
    ...query,
    actorId: query.actorId ?? query.actor_id,
    fromDate: query.fromDate ?? query.from_date,
    toDate: query.toDate ?? query.to_date,
    pageSize: query.pageSize ?? query.page_size ?? query.limit,
  };
}

function csvFilename(view: string): string {
  const names: Record<string, string> = {
    audit: 'lich-su-thao-tac-web',
    sync: 'lich-su-dong-bo',
    backup: 'lich-su-sao-luu',
    login: 'lich-su-dang-nhap',
  };
  return `${names[view] || 'lich-su-hoat-dong'}.csv`;
}

export class ActivityLogsController {
  async listAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const query = auditLogQuerySchema.parse(normalizedQuery(req.query));
      const result = await activityLogsService.listAuditLogs(req.user!, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listLoginAudits(req: Request, res: Response, next: NextFunction) {
    try {
      const query = loginAuditQuerySchema.parse(normalizedQuery(req.query));
      const result = await activityLogsService.listLoginAudits(req.user!, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async listActors(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await activityLogsService.listActors(req.user!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const query = activityExportQuerySchema.parse(normalizedQuery(req.query));
      const csv = await activityLogsService.exportCsv(req.user!, query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${csvFilename(query.view)}"`,
      );
      res.status(200).send(`\uFEFF${csv}`);
    } catch (err) {
      next(err);
    }
  }
}

export const activityLogsController = new ActivityLogsController();
