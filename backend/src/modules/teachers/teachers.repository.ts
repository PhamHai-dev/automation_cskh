import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { CreateTeacherDTO, UpdateTeacherDTO } from './teachers.types';

export class TeachersRepository {
  async findAll() {
    return prisma.user.findMany({
      where: {
        roles: {
          array_contains: 'TEACHER'
        }
      },
      include: {
        teacher_profile: true
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findById(id: number) {
    return prisma.user.findUnique({
      where: { id },
      include: { teacher_profile: true }
    });
  }

  async create(data: CreateTeacherDTO, creatorId: number, passwordHash: string) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          phone: data.phone,
          password_hash: passwordHash,
          roles: ['TEACHER'],
          created_by_id: creatorId
        }
      });

      const profile = await tx.teacherProfile.create({
        data: {
          user_id: user.id,
          teacher_code: data.teacher_code,
          teacher_type: data.teacher_type
        }
      });

      return { ...user, teacher_profile: profile };
    });
  }

  async update(id: number, data: UpdateTeacherDTO) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          name: data.name,
          phone: data.phone,
          active: data.active
        }
      });

      const profileData: any = {};
      if (data.teacher_code !== undefined) profileData.teacher_code = data.teacher_code;
      if (data.teacher_type !== undefined) profileData.teacher_type = data.teacher_type;
      if (data.active !== undefined) profileData.active = data.active;

      let profile = null;
      if (Object.keys(profileData).length > 0) {
        profile = await tx.teacherProfile.upsert({
          where: { user_id: id },
          update: profileData,
          create: {
            user_id: id,
            ...profileData
          }
        });
      } else {
        profile = await tx.teacherProfile.findUnique({ where: { user_id: id } });
      }

      return { ...user, teacher_profile: profile };
    });
  }
}
