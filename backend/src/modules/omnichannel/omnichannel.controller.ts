import type { Request, Response, NextFunction } from 'express';
import { groupListSchema } from './omnichannel.schema';
import { omnichannelService } from './omnichannel.service';
import { careGroupSettingsService } from './care-group-settings.service';

export const omnichannelController = {
  async readCareGroupRules(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await careGroupSettingsService.read() }); } catch (error) { next(error); }
  },
  async saveCareGroupRules(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: await careGroupSettingsService.save(req.body, req.user!.id) }); } catch (error) { next(error); }
  },
  previewCareGroupRules(req: Request, res: Response, next: NextFunction) {
    try { res.json({ data: careGroupSettingsService.preview(req.body) }); } catch (error) { next(error); }
  },
  async listGroups(req: Request, res: Response, next: NextFunction) {
    const result = groupListSchema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Bộ lọc nhóm không hợp lệ', details: result.error.flatten() } });
    try { res.json(await omnichannelService.listGroups(req.user!, result.data)); }
    catch (error) { next(error); }
  },
};
