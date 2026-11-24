import { NextFunction, Request, Response } from 'express';
import { ProgramType } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { JlptService } from './jlpt.service';
import {
  jlptApplyPreviewSchema,
  jlptLearningRecordBulkSchema,
  jlptLearningRecordPatchSchema,
  jlptTemplateActiveQuerySchema,
  jlptTemplateChangeRequestSchema,
  jlptTemplateInputSchema,
  jlptTemplateRejectSchema,
  jlptTemplateReviewSchema,
} from './jlpt.schema';

const service = new JlptService();

function actor(req: Request) {
  if (!req.user) throw new AppError(401, 'Chưa đăng nhập');
  return req.user;
}

function id(raw: string, name: string) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new AppError(400, `${name} không hợp lệ`);
  return value;
}

function forward(error: any, res: Response, next: NextFunction) {
  if (error?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu không hợp lệ',
        details: error.errors,
      },
    });
  }
  return next(error);
}

export class JlptController {
  async listTemplates(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateActiveQuerySchema.parse({ query: req.query });
      const active = validated.query.active === undefined ? undefined : validated.query.active === 'true';
      res.json({ data: await service.listTemplates(active), meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async getTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ data: await service.getTemplate(id(req.params.templateId, 'templateId')), meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async createTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateInputSchema.parse({ body: req.body });
      const result = await service.createTemplate(validated.body, actor(req));
      res.status(201).json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async updateTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateInputSchema.parse({ body: req.body });
      const result = await service.updateTemplate(id(req.params.templateId, 'templateId'), validated.body, actor(req));
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async deleteTemplate(req: Request, res: Response, next: NextFunction) {
    try {
      await service.deleteTemplate(id(req.params.templateId, 'templateId'), actor(req));
      res.status(204).send();
    } catch (error) { forward(error, res, next); }
  }

  async previewApply(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptApplyPreviewSchema.parse({ body: req.body });
      const result = await service.previewTemplate(id(req.params.templateId, 'templateId'), validated.body.class_ids, actor(req));
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async classTemplateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.getClassTemplateStatus(id(req.params.classId, 'classId'), actor(req));
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async applyToClass(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.applyTemplateToClass(id(req.params.classId, 'classId'), actor(req));
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async changeClassProgram(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as { program_type?: unknown };
      if (body.program_type !== ProgramType.KAIWA && body.program_type !== ProgramType.JLPT) {
        throw new AppError(400, 'program_type chỉ nhận KAIWA hoặc JLPT');
      }
      if (Object.keys(body).some((key) => key !== 'program_type')) {
        throw new AppError(400, 'Request đổi chương trình có field không được hỗ trợ');
      }
      const result = await service.changeClassProgram(id(req.params.classId, 'classId'), body.program_type, actor(req));
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async submitChangeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateChangeRequestSchema.parse({ body: req.body });
      const result = await service.submitChangeRequest(id(req.params.templateId, 'templateId'), validated.body, actor(req));
      res.status(201).json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async approveChangeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateReviewSchema.parse({ body: req.body ?? {} });
      const result = await service.approveChangeRequest(
        id(req.params.requestId, 'requestId'),
        validated.body.review_reason?.trim() || null,
        actor(req),
      );
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async rejectChangeRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptTemplateRejectSchema.parse({ body: req.body });
      const result = await service.rejectChangeRequest(
        id(req.params.requestId, 'requestId'),
        validated.body.review_reason,
        actor(req),
      );
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }
  async listLearningRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await service.listLearningRecords(
        id(req.params.classId, 'classId'),
        id(req.params.sessionId, 'sessionId'),
        actor(req),
      );
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async updateLearningRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptLearningRecordPatchSchema.parse({ body: req.body });
      const result = await service.updateLearningRecord(
        id(req.params.classId, 'classId'),
        id(req.params.sessionId, 'sessionId'),
        id(req.params.enrollmentClassId, 'enrollmentClassId'),
        validated.body,
        actor(req),
      );
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }

  async updateLearningRecordsBulk(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = jlptLearningRecordBulkSchema.parse({ body: req.body });
      const result = await service.updateLearningRecordsBulk(
        id(req.params.classId, 'classId'),
        id(req.params.sessionId, 'sessionId'),
        validated.body,
        actor(req),
      );
      res.json({ data: result, meta: null });
    } catch (error) { forward(error, res, next); }
  }
}
