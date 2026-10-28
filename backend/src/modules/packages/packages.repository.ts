import { prisma } from '../../prisma/client';
import {
  CreatePackageDTO,
  UpdatePackageDTO,
  PackageListFilters,
  PackageListMeta,
} from './packages.types';

export class PackagesRepository {
  buildWhereClause(filters?: PackageListFilters): any {
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

    if (andClauses.length === 0) return undefined;
    if (andClauses.length === 1) return andClauses[0];
    return { AND: andClauses };
  }

  async findAll(filters?: PackageListFilters) {
    const where = this.buildWhereClause(filters);
    const isPaginated = Boolean(filters?.isPaginated);
    const page = filters?.page && filters.page >= 1 ? filters.page : 1;
    const pageSize =
      filters?.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 20;

    return prisma.package.findMany({
      where,
      ...(isPaginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  async computeMeta(filters: PackageListFilters | undefined, currentData: any[]): Promise<PackageListMeta> {
    const isPaginated = Boolean(filters?.isPaginated);
    const page = filters?.page && filters.page >= 1 ? filters.page : 1;
    let total = currentData.length;

    if (isPaginated && typeof (prisma.package as any)?.count === 'function') {
      try {
        const where = this.buildWhereClause(filters);
        total = await prisma.package.count({ where });
      } catch {
        total = currentData.length;
      }
    }

    const effectivePageSize = isPaginated
      ? (filters?.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 20)
      : Math.max(1, currentData.length);
    const totalPages = Math.max(1, Math.ceil(total / effectivePageSize));

    return {
      page: isPaginated ? page : 1,
      pageSize: effectivePageSize,
      total,
      totalPages,
    };
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
