/**
 * Broadcast & Scheduled Campaign Routes — mounted under /api/v1/automation/broadcasts
 */

import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import imageSize from 'image-size';
import { z } from 'zod';
import { authenticate } from '../../middlewares/auth.middleware';
import type { RichAttachmentItem } from '../line/line-dispatcher.contract';
import { broadcastService } from './broadcast.service';

const router = Router();

router.use(authenticate);

const broadcastUploadDir = path.resolve(process.cwd(), 'uploads/broadcasts');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(broadcastUploadDir, { recursive: true });
      cb(null, broadcastUploadDir);
    } catch (err) {
      cb(err as Error, broadcastUploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const safeBase = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60);
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${uniqueSuffix}-${safeBase || 'file'}${ext}`);
  },
});

const uploadMiddleware = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 25 * 1024 * 1024, // 25MB max per file
  },
});

async function handleBroadcastUpload(req: Request, res: Response) {
  try {
    const rawFiles = (req.files as Express.Multer.File[]) ?? (req.file ? [req.file] : []);
    const files: RichAttachmentItem[] = rawFiles.map((file) => {
      let width: number | undefined;
      let height: number | undefined;

      if (file.mimetype?.toLowerCase().startsWith('image/') && fs.existsSync(file.path)) {
        try {
          const buf = fs.readFileSync(file.path);
          const dimensions = imageSize(buf);
          if (typeof dimensions?.width === 'number') width = dimensions.width;
          if (typeof dimensions?.height === 'number') height = dimensions.height;
        } catch {
          // Ignore dimension extraction failure for unsupported image sub-formats
        }
      }

      return {
        url: `/uploads/broadcasts/${file.filename}`,
        filePath: file.path,
        filename: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      };
    });

    res.json({
      success: true,
      files,
      data: { files },
    });
  } catch (err: any) {
    handleError(res, err);
  }
}

function getRole(req: Request): string {
  const roles: string[] = (req.user?.roles as string[]) ?? [];
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('MANAGE')) return 'MANAGE';
  return 'CS';
}

function handleError(res: Response, err: any) {
  const status = err?.status ?? 500;
  res.status(status).json({
    success: false,
    message: err?.message ?? 'Internal server error',
  });
}

// GET /api/v1/automation/broadcasts
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await broadcastService.listCampaigns(req.user!.id, getRole(req), {
      status: req.query.status as string | undefined,
      search: (req.query.search as string) || (req.query.q as string) || undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/v1/automation/broadcasts/upload (and alias /uploads)
router.post('/upload', uploadMiddleware.any(), handleBroadcastUpload);
router.post('/uploads', uploadMiddleware.any(), handleBroadcastUpload);

// GET /api/v1/automation/broadcasts/targets-catalog
router.get('/targets-catalog', async (req: Request, res: Response) => {
  try {
    const catalog = await broadcastService.getTargetsCatalog(req.user!.id, getRole(req));
    res.json({
      success: true,
      data: catalog,
      ...catalog,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// GET /api/v1/automation/broadcasts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
    }
    const campaign = await broadcastService.getCampaignDetail(campaignId);
    res.json({
      success: true,
      data: campaign,
      campaign,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/v1/automation/broadcasts
router.post('/', async (req: Request, res: Response) => {
  try {
    const directTargetSchema = z.object({
      platform: z.enum(['ZALO', 'LINE']),
      account_id: z.number().int().positive(),
      external_target_id: z.string().min(1),
      target_type: z.enum(['GROUP', 'USER']).optional(),
      display_name: z.string().optional(),
    });

    const richAttachmentSchema = z.object({
      url: z.string(),
      filePath: z.string().optional(),
      filename: z.string(),
      mimeType: z.string().default('application/octet-stream'),
      size: z.number().default(0),
      width: z.number().optional(),
      height: z.number().optional(),
    });

    const richLinkSchema = z.object({
      url: z.string().min(1),
      title: z.string().optional(),
      description: z.string().optional(),
      thumbnailUrl: z.string().optional(),
      buttonLabel: z.string().optional(),
    });

    const richStyleSpanSchema = z.object({
      start: z.number().int().nonnegative(),
      len: z.number().int().positive(),
      st: z.string().min(1),
    });

    const messageMetadataSchema = z.object({
      urgency: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      styles: z.array(richStyleSpanSchema).optional(),
      attachments: z.array(richAttachmentSchema).optional(),
      links: z.array(richLinkSchema).optional(),
      flexMessages: z.array(z.any()).optional(),
    });

    const schema = z.object({
      name: z.string().min(1, 'Tên chiến dịch không được để trống').max(255),
      description: z.string().max(2000).optional().nullable(),
      message_content: z.string().min(1, 'Nội dung tin nhắn không được để trống').max(5000),
      message_metadata: messageMetadataSchema.optional().nullable(),
      channel_mode: z.enum(['AUTO', 'ZALO_ONLY', 'LINE_ONLY', 'BOTH']).default('AUTO'),
      schedule_type: z.enum(['IMMEDIATE', 'SCHEDULED']).default('IMMEDIATE'),
      scheduled_at: z.string().optional().nullable(),
      student_ids: z.array(z.number().int()).optional().default([]),
      zalo_group_ids: z.array(z.number().int()).optional().default([]),
      line_group_ids: z.array(z.number().int()).optional().default([]),
      direct_targets: z.array(directTargetSchema).optional().default([]),
      awaitExecution: z.boolean().optional(),
    });

    const dto = schema.parse(req.body);
    const campaign = await broadcastService.createCampaign(dto, req.user!.id);
    res.status(201).json({
      success: true,
      data: campaign,
      campaign,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({
        success: false,
        message: err.issues[0]?.message ?? 'Dữ liệu không hợp lệ',
        errors: err.issues,
      });
    }
    handleError(res, err);
  }
});

// POST /api/v1/automation/broadcasts/:id/send-now
router.post('/:id/send-now', async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
    }
    const campaign = await broadcastService.sendNowCampaign(campaignId, {
      awaitExecution: Boolean(req.body?.awaitExecution),
    });
    res.json({
      success: true,
      data: campaign,
      campaign,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/v1/automation/broadcasts/:id/cancel
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
    }
    const campaign = await broadcastService.cancelCampaign(campaignId);
    res.json({
      success: true,
      data: campaign,
      campaign,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// POST /api/v1/automation/broadcasts/:id/retry-failed
router.post('/:id/retry-failed', async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
    }
    const campaign = await broadcastService.retryFailedRecipients(campaignId, {
      awaitExecution: Boolean(req.body?.awaitExecution),
    });
    res.json({
      success: true,
      data: campaign,
      campaign,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

// DELETE /api/v1/automation/broadcasts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const campaignId = Number(req.params.id);
    if (isNaN(campaignId) || campaignId < 1) {
      return res.status(400).json({ success: false, message: 'ID chiến dịch không hợp lệ' });
    }
    const result = await broadcastService.deleteCampaign(campaignId);
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err: any) {
    handleError(res, err);
  }
});

export { router as broadcastRouter };
