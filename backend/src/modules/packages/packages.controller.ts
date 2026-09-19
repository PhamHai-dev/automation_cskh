import { Request, Response, NextFunction } from 'express';
import { PackagesService } from './packages.service';
import { createPackageSchema, updatePackageSchema } from './packages.schema';

const packagesService = new PackagesService();

export class PackagesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const packages = await packagesService.getAllPackages();
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
