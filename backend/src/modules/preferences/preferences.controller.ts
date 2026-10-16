import { Request, Response } from 'express';
import { PreferencesService } from './preferences.service';
import { preferenceParamsSchema, preferenceBodySchema, PreferenceScope } from './preferences.schema';

const service = new PreferencesService();

export class PreferencesController {
  /**
   * GET /api/v1/me/preferences/:scope
   * Returns saved column visibility delta for the current user + scope.
   */
  async get(req: Request, res: Response) {
    try {
      const parsed = preferenceParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid scope', errors: parsed.error.flatten() });
      }
      const result = await service.get(req.user!.id, parsed.data.scope);
      return res.json(result);
    } catch (err: any) {
      if (err.status === 400) return res.status(400).json({ message: err.message });
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  /**
   * PUT /api/v1/me/preferences/:scope
   * Upsert column visibility delta for the current user + scope.
   */
  async save(req: Request, res: Response) {
    try {
      const paramsParsed = preferenceParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) {
        return res.status(400).json({ message: 'Invalid scope', errors: paramsParsed.error.flatten() });
      }

      const bodyParsed = preferenceBodySchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ message: 'Invalid body', errors: bodyParsed.error.flatten() });
      }

      const result = await service.save(req.user!.id, paramsParsed.data.scope, bodyParsed.data.value);
      return res.json(result);
    } catch (err: any) {
      if (err.status === 400) return res.status(400).json({ message: err.message });
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
}
