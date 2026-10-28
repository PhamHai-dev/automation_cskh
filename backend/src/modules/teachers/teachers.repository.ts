import { prisma } from '../../prisma/client';
import {
  CreateTeacherDTO,
  UpdateTeacherDTO,
  TeacherListFilters,
  TeacherListMeta,
} from './teachers.types';

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
} as const;

export class TeachersRepository {
  buildWhereClause(filters?: TeacherListFilters): any {
    const andClauses: any[] = [];
    if (filters?.active !== undefined) {
      andClauses.push({ active: filters.active });
    }
    if (filters?.teacherType && filters.teacherType.trim()) {
      andClauses.push({ teacher_type: filters.teacherType.trim().toUpperCase() as any });
    }
    if (filters?.accountStatus && filters.accountStatus.trim()) {
      const acc = filters.accountStatus.trim().toUpperCase();
      if (acc === 'HAS_ACCOUNT' || acc === 'PROVISIONED') {
        andClauses.push({ user_id: { not: null } });
      } else if (acc === 'NO_ACCOUNT' || acc === 'UNPROVISIONED') {
        andClauses.push({ user_id: null });
      } else if (acc === 'ACTIVE_ACCOUNT') {
        andClauses.push({ user: { is: { active: true } } });
      } else if (acc === 'LOCKED_ACCOUNT') {
        andClauses.push({ user: { is: { active: false } } });
      }
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      andClauses.push({
        OR: [
          { name: { contains: q } },
          { code: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
          { user: { is: { email: { contains: q } } } },
        ],
      });
    }

    if (andClauses.length === 0) return undefined;
    if (andClauses.length === 1) return andClauses[0];
    return { AND: andClauses };
  }

  async findAll(filters?: TeacherListFilters) {
    const where = this.buildWhereClause(filters);
    const isPaginated = Boolean(filters?.isPaginated);
    const page = filters?.page && filters.page >= 1 ? filters.page : 1;
    const pageSize =
      filters?.pageSize && filters.pageSize >= 1 ? Math.min(filters.pageSize, 100) : 20;

    return prisma.teacher.findMany({
      where,
      ...(isPaginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  async computeMeta(filters: TeacherListFilters | undefined, currentData: any[]): Promise<TeacherListMeta> {
    const isPaginated = Boolean(filters?.isPaginated);
    const page = filters?.page && filters.page >= 1 ? filters.page : 1;
    let total = currentData.length;

    if (isPaginated && typeof (prisma.teacher as any)?.count === 'function') {
      try {
        const where = this.buildWhereClause(filters);
        total = await prisma.teacher.count({ where });
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
    return prisma.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
    });
  }

  async findByCode(code: string) {
    return prisma.teacher.findUnique({
      where: { code },
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
    });
  }

  async findByName(name: string) {
    return prisma.teacher.findFirst({
      where: { name: { contains: name } },
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
    });
  }

  async create(data: CreateTeacherDTO) {
    let code = data.code?.trim();
    if (!code) {
      code = 'GV_' + data.name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 15) + '_' + Math.floor(Math.random() * 1000);
    }
    return prisma.teacher.create({
      data: {
        code,
        name: data.name.trim(),
        phone: data.phone || null,
        email: data.email || null,
        teacher_type: data.teacher_type || 'OTHER',
        active: data.active ?? true,
      },
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
    });
  }

  async update(id: number, data: UpdateTeacherDTO) {
    return prisma.teacher.update({
      where: { id },
      data: {
        ...(data.code ? { code: data.code.trim() } : {}),
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.teacher_type ? { teacher_type: data.teacher_type } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
    });
  }

  async provisionAccount(teacherId: number, email: string, passwordHash: string, creatorId?: number) {
    return prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher) throw new Error('Không tìm thấy giáo viên');
      if (teacher.user_id) throw new Error('Giáo viên này đã có tài khoản đăng nhập');

      const existingUser = await tx.user.findUnique({ where: { email } });
      if (existingUser) throw new Error('Email này đã được sử dụng cho một tài khoản khác');

      const user = await tx.user.create({
        data: {
          email,
          name: teacher.name,
          phone: teacher.phone,
          password_hash: passwordHash,
          roles: ['TEACHER'],
          created_by_id: creatorId,
          active: true,
        },
      });

      return tx.teacher.update({
        where: { id: teacherId },
        data: { user_id: user.id },
        include: {
          user: {
            select: SAFE_USER_SELECT,
          },
        },
      });
    });
  }
}
