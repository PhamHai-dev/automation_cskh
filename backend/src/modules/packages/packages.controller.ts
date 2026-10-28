import { Request, Response, NextFunction } from 'express';
import { PackagesService } from './packages.service';
import { createPackageSchema, updatePackageSchema } from './packages.schema';
import { parseSearchQuery } from '../../shared/utils/query-validation';
import { AppError } from '../../middlewares/error.middleware';

const packagesService = new PackagesService();

export class PackagesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const search = parseSearchQuery(req.query.search, 100);
      let active: boolean | undefined;
      if (req.query.active !== undefined && req.query.active !== '') {
        const rawActive = String(req.query.active).trim().toLowerCase();
        if (rawActive === 'true' || rawActive === '1') active = true;
        else if (rawActive === 'false' || rawActive === '0') active = false;
        else throw new AppError(400, 'Tham số active không hợp lệ (true/false)');
      }

      const packages = await packagesService.getAllPackages({ search, active });
      res.json({ data: packages, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const pkg = await packagesService.getPackageById(id);
      res.json({ data: pkg, meta: null });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createPackageSchema.parse({ body: req.body });
      const pkg = await packagesService.createPackage(validated.body);
      res.status(201).json({ data: pkg, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseInt(req.params.id);
      const validated = updatePackageSchema.parse({ body: req.body });
      const pkg = await packagesService.updatePackage(id, validated.body);
      res.json({ data: pkg, meta: null });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data', details: error.errors } });
        return;
      }
      next(error);
    }
  }
}
