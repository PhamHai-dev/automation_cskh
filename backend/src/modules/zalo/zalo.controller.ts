import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ZaloService } from './zalo.service';

const zaloService = new ZaloService();

export class ZaloController {
  // ─── Account CRUD ───────────────────────────────────────────────────────

  async listAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const accounts = await zaloService.getPoolStatus();
      res.json({ data: accounts, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async getAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const account = await zaloService.getAccountById(id);
      res.json({ data: account, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async createAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createAccountSchema.parse(req.body);
      const account = await zaloService.createAccount(body);
      res.status(201).json({ data: account, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async updateAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const body = updateAccountSchema.parse(req.body);
      const account = await zaloService.updateAccount(id, body);
      res.json({ data: account, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async removeAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      // Soft-delete: giữ session data để revive
      const account = await zaloService.removeAccount(id, req.user?.id);
      res.status(204).json();
    } catch (error) {
      next(error);
    }
  }

  // ─── Lifecycle: Restore / Archived / Purge / Reconnect ───────────────

  async restoreAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const account = await zaloService.restoreAccount(id);
      res.json({ data: account, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async listArchivedAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const accounts = await zaloService.getArchivedAccounts(req.user!.id);
      res.json({ data: accounts, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async purgeEmptyAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await zaloService.purgeEmptyAccount(id);
      res.json({ data: result, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async reconnectAccount(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await zaloService.reconnectAccount(id);
      res.json({ data: result, meta: null });
    } catch (error) {
      next(error);
    }
  }

  // ─── QR Login ───────────────────────────────────────────────────────────

  async generateQr(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const qr = await zaloService.generateQr(id, req.user!.id);
      res.json({ data: qr, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async completeQrLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const body = completeQrBodySchema.parse(req.body);
      const result = await zaloService.completeQrLogin(id, body);
      res.json({ data: result, meta: null });
    } catch (error) {
      next(error);
    }
  }

  // ─── Friends / Groups ───────────────────────────────────────────────────

  async listFriends(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const friends = await zaloService.getFriends(id);
      res.json({ data: friends, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async listGroups(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const groups = await zaloService.getGroups(id);
      res.json({ data: groups, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async refreshGroups(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id, 10);
      const result = await zaloService.refreshGroups(id);
      res.json({ data: result, meta: null });
    } catch (error) {
      next(error);
    }
  }
}

const createAccountSchema = z.object({
  cs_id: z.number().int().positive(),
  display_name: z.string().optional(),
  zalo_phone: z.string().optional(),
  proxy_url: z.string().url().optional().or(z.literal('')),
});

const updateAccountSchema = z
  .object({
    display_name: z.string().optional(),
    zalo_phone: z.string().optional(),
    proxy_url: z.string().url().optional().or(z.literal('')),
    status: z.enum(['QR_PENDING', 'CONNECTING', 'ACTIVE', 'EXPIRED', 'BANNED', 'DISABLED']).optional(),
  })
  .strict();

const completeQrBodySchema = z
  .object({
    zalo_uid: z.string().optional(),
    display_name: z.string().optional(),
    session_data: z.string().optional(),
  })
  .strict();
