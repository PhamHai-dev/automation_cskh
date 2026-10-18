/**
 * line.routes.ts — Express router mounted at `/api/v1/line`.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { lineService } from './line.service';
import { lineWebhookHandler } from './line-webhook.handler';

export const lineRouter = Router();

// ─── Public Webhook Endpoints (authenticated via LINE HMAC-SHA256 signature) ──

lineRouter.post('/webhook/:accountId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accountId = Number(req.params.accountId);
    const signature = req.header('x-line-signature') ?? undefined;
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const result = await lineWebhookHandler.handleWebhook({
      accountId,
      rawBody,
      signature,
      body: req.body ?? {},
    });
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    if (err?.statusCode === 401) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

lineRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.header('x-line-signature') ?? undefined;
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const result = await lineWebhookHandler.handleWebhook({
      rawBody,
      signature,
      body: req.body ?? {},
    });
    res.status(200).json({ status: 'ok', ...result });
  } catch (err: any) {
    if (err?.statusCode === 401) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// ─── Authenticated CSKH / Admin Routes ──────────────────────────────────────

lineRouter.use(authenticate);
lineRouter.use(requireRoles(['ADMIN', 'MANAGE', 'CS']));

// Accounts
lineRouter.get('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csId = req.query.cs_id ? Number(req.query.cs_id) : undefined;
    const accounts = await lineService.listAccounts(csId);
    res.json({ data: accounts, accounts });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await lineService.getAccount(Number(req.params.id));
    res.json({ data: account, account });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id ?? (req as any).user?.userId ?? 1;
    const account = await lineService.createAccount({
      ...req.body,
      cs_id: req.body.cs_id ?? req.body.csId ?? userId,
    });
    res.status(201).json({ data: account, account });
  } catch (err) {
    next(err);
  }
});

lineRouter.delete('/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id ?? (req as any).user?.userId;
    const result = await lineService.deleteAccount(Number(req.params.id), userId);
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.disconnectAccount(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/reconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.reconnectAccount(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/qr-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.startQrLogin(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.patch('/accounts/:id/oa-credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await lineService.updateOaCredentials(Number(req.params.id), req.body);
    res.json({ data: account, account });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/oa-credentials', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account = await lineService.updateOaCredentials(Number(req.params.id), req.body);
    res.json({ data: account, account });
  } catch (err) {
    next(err);
  }
});

// Friends
lineRouter.get('/accounts/:id/friends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listFriends(Number(req.params.id), {
      search: req.query.search as string | undefined,
      kind: req.query.kind as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/friends/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.syncFriends(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/friends/lookup-phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.lookupByPhone(Number(req.params.id), String(req.body.phone ?? ''));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/friends/add', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetMid = String(req.body.targetMid ?? req.body.line_uid ?? req.body.mid ?? '');
    const result = await lineService.sendFriendRequest(Number(req.params.id), targetMid);
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/friends/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetMid = String(req.body.targetMid ?? req.body.line_uid ?? req.body.mid ?? '');
    const result = await lineService.sendFriendRequest(Number(req.params.id), targetMid);
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

// Groups
lineRouter.get('/groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const csId = req.query.cs_id ? Number(req.query.cs_id) : undefined;
    const groups = await lineService.listAllGroups(csId);
    res.json({ data: groups, groups });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/accounts/:id/groups', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await lineService.listAccountGroups(Number(req.params.id));
    res.json({ data: groups, groups });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/accounts/:id/groups/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.syncGroups(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

// Conversations & Messages
lineRouter.get('/accounts/:id/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listConversations(Number(req.params.id), {
      search: req.query.search as string | undefined,
      threadType: req.query.threadType as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get(
  '/accounts/:id/conversations/:threadId/messages',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await lineService.listMessages(
        Number(req.params.id),
        String(req.params.threadId),
        {
          page: req.query.page ? Number(req.query.page) : undefined,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
        },
      );
      res.json({ data: result, ...result });
    } catch (err) {
      next(err);
    }
  },
);

lineRouter.post(
  '/accounts/:id/conversations/:threadId/messages',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await lineService.sendMessage(
        Number(req.params.id),
        String(req.params.threadId),
        String(req.body.content ?? req.body.text ?? ''),
      );
      res.json({ data: result, ...result });
    } catch (err) {
      next(err);
    }
  },
);

lineRouter.post(
  '/accounts/:id/messages/send',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await lineService.sendMessage(
        Number(req.params.id),
        String(req.body.to ?? req.body.threadId ?? ''),
        String(req.body.content ?? req.body.text ?? ''),
      );
      res.json({ data: result, ...result });
    } catch (err) {
      next(err);
    }
  },
);

lineRouter.post(
  '/accounts/:id/conversations/:threadId/mark-read',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await lineService.markRead(
        Number(req.params.id),
        String(req.params.threadId),
      );
      res.json({ data: result, ...result });
    } catch (err) {
      next(err);
    }
  },
);

// Student ↔ LINE Linking (supports both `/line/students/...` and `/line/links/...` paths)
lineRouter.get('/students/unlinked', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listUnlinkedStudents({
      q: req.query.q as string | undefined,
      csId: req.query.cs_id ? Number(req.query.cs_id) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/links/unlinked-students', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listUnlinkedStudents({
      q: req.query.q as string | undefined,
      csId: req.query.cs_id ? Number(req.query.cs_id) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/:accountId/students-linked', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listLinksByAccount(
      Number(req.params.accountId),
      req.query.q as string | undefined,
    );
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/links/by-account/:accountId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listLinksByAccount(
      Number(req.params.accountId),
      req.query.q as string | undefined,
    );
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/students/:studentId/links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listLinksByStudent(Number(req.params.studentId));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.get('/links/by-student/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.listLinksByStudent(Number(req.params.studentId));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.createOrUpdateLink({
      student_id: Number(req.body.student_id ?? req.body.studentId),
      line_account_id: Number(req.body.line_account_id ?? req.body.lineAccountId),
      relation_status: req.body.relation_status ?? req.body.relationStatus ?? 'FRIEND',
      display_name: req.body.display_name ?? req.body.displayName,
      avatar_url: req.body.avatar_url ?? req.body.avatarUrl,
      friend_line_uid: req.body.friend_line_uid ?? req.body.friendLineUid,
    });
    res.status(201).json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.patch('/links/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.updateLinkById(Number(req.params.id), req.body);
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.put('/links/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.updateLinkById(Number(req.params.id), req.body);
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.delete('/links/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.deleteLink(Number(req.params.id));
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/links/deep-link', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.generateStudentDeepLink(
      Number(req.body.student_id ?? req.body.studentId),
      Number(req.body.line_account_id ?? req.body.lineAccountId),
    );
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/links/generate-deep-link', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.generateStudentDeepLink(
      Number(req.body.student_id ?? req.body.studentId),
      Number(req.body.line_account_id ?? req.body.lineAccountId),
    );
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});

lineRouter.post('/auto-suggest-links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await lineService.autoSuggestLinks({
      lineAccountId: req.body?.line_account_id ? Number(req.body.line_account_id) : undefined,
      csId: req.body?.cs_id ? Number(req.body.cs_id) : undefined,
    });
    res.json({ data: result, ...result });
  } catch (err) {
    next(err);
  }
});
