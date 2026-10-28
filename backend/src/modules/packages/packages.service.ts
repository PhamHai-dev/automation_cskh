import { PackagesRepository } from './packages.repository';
import { CreatePackageDTO, UpdatePackageDTO, PackageListFilters } from './packages.types';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class PackagesService {
  private repository: PackagesRepository;

  constructor() {
    this.repository = new PackagesRepository();
  }

  async getAllPackages(filters?: PackageListFilters) {
    return this.repository.findAll(filters);
  }

  async getPackageById(id: number) {
    const pkg = await this.repository.findById(id);
    if (!pkg) throw new CustomError('Package not found', 404);
    return pkg;
  }

  async createPackage(data: CreatePackageDTO) {
    const existing = await this.repository.findByCode(data.code);
    if (existing) throw new CustomError('Package code already exists', 409);
    return this.repository.create(data);
  }

  async updatePackage(id: number, data: UpdatePackageDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new CustomError('Package not found', 404);

    if (data.code && data.code !== existing.code) {
      const existingCode = await this.repository.findByCode(data.code);
      if (existingCode) throw new CustomError('Package code already exists', 409);
    }

    return this.repository.update(id, data);
  }
}
