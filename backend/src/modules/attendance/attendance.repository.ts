import { prisma } from '../../prisma/client';
import { MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from './attendance.types';
import { Prisma } from '@prisma/client';

export class AttendanceRepository {
  async findBySession(classId: number, sessionId: number) {
    return prisma.attendance.findMany({
      where: { class_session_id: sessionId },
      include: {
        enrollment_class: {
          include: {
            enrollment: {
              include: {
                student: true,
                cs: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        created_by: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findById(attendanceId: number) {
    return prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        enrollment_class: { include: { enrollment: true } },
        class_session: true,
        created_by: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findByEnrollmentClassAndSession(enrollmentClassId: number, classSessionId: number) {
    return prisma.attendance.findFirst({
      where: {
        enrollment_class_id: enrollmentClassId,
        class_session_id: classSessionId,
      },
    });
  }

  async mark(enrollmentClassId: number, classSessionId: number, status: string, source: string, userId: number, sessionCount: number = 1) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const attendance = await tx.attendance.upsert({
        where: {
          enrollment_class_id_class_session_id: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: classSessionId,
          },
        },
        update: {
          status: status as any,
          session_count: sessionCount,
          source: source as any,
        },
        create: {
          enrollment_class_id: enrollmentClassId,
          class_session_id: classSessionId,
          status: status as any,
          session_count: sessionCount,
          source: source as any,
          created_by_id: userId,
        },
      });
      return attendance;
    });
  }

  async bulkMark(items: Array<{ enrollment_class_id: number; status: string; session_count?: number }>, classSessionId: number, source: string, userId: number) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const results = [];
      for (const item of items) {
        const attendance = await tx.attendance.upsert({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: item.enrollment_class_id,
              class_session_id: classSessionId,
            },
          },
          update: {
            status: item.status as any,
            session_count: item.session_count ?? 1,
            source: source as any,
          },
          create: {
            enrollment_class_id: item.enrollment_class_id,
            class_session_id: classSessionId,
            status: item.status as any,
            session_count: item.session_count ?? 1,
            source: source as any,
            created_by_id: userId,
          },
        });
        results.push(attendance);
      }
      return results;
    });
  }

  async update(attendanceId: number, data: UpdateAttendanceDTO) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const attendance = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          status: data.status as any,
          ...(data.session_count !== undefined ? { session_count: data.session_count } : {}),
        },
      });
      return attendance;
    });
  }

  async countByStatus(classId: number) {
    return prisma.attendance.groupBy({
      by: ['status'],
      where: { class_session: { class_id: classId } },
      _count: true,
    });
  }
}
