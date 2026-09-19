import { prisma } from '../../prisma/client';
import { CreateClassSessionDTO, UpdateClassSessionDTO } from './class-sessions.types';
import { Prisma } from '@prisma/client';

export class ClassSessionsRepository {
  async findByClassId(classId: number) {
    return prisma.classSession.findMany({
      where: { class_id: classId },
      include: {
        created_by: { select: { id: true, name: true, email: true } },
      },
      orderBy: { session_number: 'asc' },
    });
  }

  async findById(classId: number, sessionId: number) {
    return prisma.classSession.findFirst({
      where: { id: sessionId, class_id: classId },
      include: {
        created_by: { select: { id: true, name: true, email: true } },
        attendance: { include: { enrollment_class: { include: { enrollment: true } } } },
      },
    });
  }

  async findByClassAndNumber(classId: number, sessionNumber: number) {
    return prisma.classSession.findFirst({
      where: { class_id: classId, session_number: sessionNumber },
    });
  }

  async create(classId: number, data: CreateClassSessionDTO, userId: number) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await tx.classSession.create({
        data: {
          class_id: classId,
          session_number: data.session_number,
          session_date: new Date(data.session_date),
          start_time: data.start_time,
          end_time: data.end_time,
          teacher_id: data.teacher_id,
          status: data.status || 'SCHEDULED',
          created_by_id: userId,
        },
      });
      return session;
    });
  }

  async update(classId: number, sessionId: number, data: UpdateClassSessionDTO) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const session = await tx.classSession.updateMany({
        where: { id: sessionId, class_id: classId },
        data: {
          session_number: data.session_number,
          session_date: data.session_date ? new Date(data.session_date) : undefined,
          start_time: data.start_time,
          end_time: data.end_time,
          teacher_id: data.teacher_id,
          status: data.status,
        },
      });

      return tx.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    });
  }

  async cancel(classId: number, sessionId: number) {
    return prisma.classSession.updateMany({
      where: { id: sessionId, class_id: classId },
      data: { status: 'CANCELLED' },
    });
  }
}
