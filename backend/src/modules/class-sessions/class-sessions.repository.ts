import { prisma } from '../../prisma/client';
import { CreateClassSessionDTO, UpdateClassSessionDTO } from './class-sessions.types';
import { Prisma } from '@prisma/client';

export class ClassSessionsRepository {
  async findByClassId(classId: number) {
    return prisma.classSession.findMany({
      where: { class_id: classId },
      include: { created_by: { select: { id: true, name: true, email: true } } },
      orderBy: [{ session_date: 'asc' }, { start_time: 'asc' }, { session_number: 'asc' }],
    });
  }

  async findById(classId: number, sessionId: number) {
    return prisma.classSession.findFirst({
      where: { id: sessionId, class_id: classId },
      include: {
        created_by: { select: { id: true, name: true, email: true } },
        attendance: { where: { deleted_at: null }, include: { enrollment_class: { include: { enrollment: true } } } },
      },
    });
  }

  async findByClassAndNumber(classId: number, sessionNumber: number) {
    return prisma.classSession.findFirst({ where: { class_id: classId, session_number: sessionNumber } });
  }

  async create(classId: number, data: CreateClassSessionDTO, userId: number) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const latest = await tx.classSession.findFirst({
        where: { class_id: classId },
        orderBy: { session_number: 'desc' },
        select: { session_number: true },
      });
      return tx.classSession.create({
        data: {
          class_id: classId,
          session_number: data.session_number ?? (latest?.session_number ?? 0) + 1,
          session_date: new Date(data.session_date),
          start_time: data.start_time,
          end_time: data.end_time,
          teacher_id: data.teacher_id,
          status: data.status || 'SCHEDULED',
          created_by_id: userId,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async update(classId: number, sessionId: number, data: UpdateClassSessionDTO) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.classSession.updateMany({
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

  async delete(classId: number, sessionId: number, userId: number) {
    return prisma.$transaction(async (tx) => {
      const session = await tx.classSession.findFirst({
        where: { id: sessionId, class_id: classId },
        include: { attendance: true },
      });
      if (!session) return null;
      const attendanceCount = session.attendance.filter((item) => !item.deleted_at).length;
      await tx.attendance.deleteMany({ where: { class_session_id: sessionId } });
      await tx.classSession.delete({ where: { id: sessionId } });
      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'DELETE',
          entity_type: 'ClassSession',
          entity_id: String(sessionId),
          before_data: session as any,
          after_data: { deleted: true, attendance_count: attendanceCount },
        },
      });
      return { attendanceCount };
    });
  }
}
