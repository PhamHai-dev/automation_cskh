import { prisma } from '../../prisma/client';
import { CreatePackageDTO, UpdatePackageDTO } from './packages.types';

export class PackagesRepository {
  async findAll() {
    return prisma.package.findMany({
      orderBy: { created_at: 'desc' }
    });
  }

  async findById(id: number) {
    return prisma.package.findUnique({
      where: { id }
    });
  }

  async findByCode(code: string) {
    return prisma.package.findUnique({
      where: { code }
    });
  }

  async create(data: CreatePackageDTO) {
    return prisma.package.create({ data });
  }

  async update(id: number, data: UpdatePackageDTO) {
    return prisma.package.update({
      where: { id },
      data
    });
  }
}
