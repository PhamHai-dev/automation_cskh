import { prisma } from '../../prisma/client';
import { CreateTeacherDTO, UpdateTeacherDTO, TeacherListFilters } from './teachers.types';

export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  active: true,
  last_login_at: true,
} as const;

export class TeachersRepository {
  async findAll(filters?: TeacherListFilters) {
    const andClauses: any[] = [];
    if (filters?.active !== undefined) {
      andClauses.push({ active: filters.active });
    }
    if (filters?.teacherType && filters.teacherType.trim()) {
      andClauses.push({ teacher_type: filters.teacherType.trim().toUpperCase() as any });
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      andClauses.push({
        OR: [
          { name: { contains: q } },
          { code: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      });
    }

    const where =
      andClauses.length === 0
        ? undefined
        : andClauses.length === 1
        ? andClauses[0]
        : { AND: andClauses };

    return prisma.teacher.findMany({
      where,
      include: {
        user: {
          select: SAFE_USER_SELECT,
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
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
