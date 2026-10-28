import { prisma } from '../../prisma/client';
import { CreatePackageDTO, UpdatePackageDTO, PackageListFilters } from './packages.types';

export class PackagesRepository {
  async findAll(filters?: PackageListFilters) {
    const andClauses: any[] = [];
    if (filters?.active !== undefined) {
      andClauses.push({ active: filters.active });
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      andClauses.push({
        OR: [
          { code: { contains: q } },
          { name: { contains: q } },
        ],
      });
    }

    const where =
      andClauses.length === 0
        ? undefined
        : andClauses.length === 1
        ? andClauses[0]
        : { AND: andClauses };

    return prisma.package.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
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
