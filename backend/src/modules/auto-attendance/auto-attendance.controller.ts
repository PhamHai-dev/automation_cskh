import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { updateAutoAttendanceSettingsSchema } from './auto-attendance.schema';
import { AutoAttendanceService } from './auto-attendance.service';

const service = new AutoAttendanceService();

export class AutoAttendanceController {
  async getSettings(_req: Request, res: Response) {
    const settings = await service.getSettings();
    return res.json({ data: settings, meta: null });
  }

  async updateSettings(req: Request, res: Response) {
    try {
      const { body } = updateAutoAttendanceSettingsSchema.parse({ body: req.body });
      const settings = await service.updateSettings(body, req.user!.id);
      return res.json({ data: settings, meta: null });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Thời gian chờ phải là số nguyên từ 0 đến 1440 phút',
            details: error.flatten(),
          },
        });
      }
    }
  }

  async runCycle(_req: Request, res: Response) {
    const result = await service.processAutoAttendance();
    return res.json({ data: result, meta: null });
  }
}
