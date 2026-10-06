import { prisma } from '../../prisma/client';
import { CreateTeacherDTO, UpdateTeacherDTO } from './teachers.types';

export class TeachersRepository {
  async findAll() {
    return prisma.teacher.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            active: true,
            last_login_at: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: number) {
    return prisma.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            active: true,
            last_login_at: true,
          },
        },
      },
    });
  }

  async findByCode(code: string) {
    return prisma.teacher.findUnique({
      where: { code },
      include: { user: true },
    });
  }

  async findByName(name: string) {
    return prisma.teacher.findFirst({
      where: { name: { contains: name } },
      include: { user: true },
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
          select: {
            id: true,
            email: true,
            active: true,
            last_login_at: true,
          },
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
          select: {
            id: true,
            email: true,
            active: true,
            last_login_at: true,
          },
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
            select: {
              id: true,
              email: true,
              active: true,
              last_login_at: true,
            },
          },
        },
      });
    });
  }
}
