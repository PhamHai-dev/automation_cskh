import { prisma } from '../../prisma/client';
import { MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from './attendance.types';
import { Prisma, AttendanceStatus, ReconciliationState } from '@prisma/client';

export class AttendanceRepository {
  async findBySession(classId: number, sessionId: number) {
    return prisma.attendance.findMany({
      where: { class_session_id: sessionId, deleted_at: null },
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
    return prisma.attendance.findFirst({
      where: { id: attendanceId, deleted_at: null },
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
        deleted_at: null,
      },
    });
  }

  private async isTeacherActor(userId: number): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
    const roles = (user?.roles as string[]) || [];
    return roles.includes('TEACHER') && !roles.includes('ADMIN') && !roles.includes('MANAGE') && !roles.includes('CS');
  }

  async mark(enrollmentClassId: number, classSessionId: number, status: string, source: string, userId: number, sessionCount: number = 1) {
    const isTeacher = await this.isTeacherActor(userId);
    const parsedStatus = status as AttendanceStatus;

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendance.findUnique({
        where: {
          enrollment_class_id_class_session_id: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: classSessionId,
          },
        },
      });

      let recState: ReconciliationState;
      if (isTeacher) {
        if (existing?.cs_status) {
          recState = existing.cs_status === parsedStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
        } else {
          recState = ReconciliationState.PENDING_CS;
        }
      } else {
        if (existing?.teacher_status) {
          recState = existing.teacher_status === parsedStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
        } else {
          recState = ReconciliationState.PENDING_TEACHER;
        }
      }

      const updateData: any = {
        status: parsedStatus,
        session_count: sessionCount,
        source: source as any,
        reconciliation_state: recState,
        deleted_at: null,
        deleted_by_id: null,
      };

      const createData: any = {
        enrollment_class_id: enrollmentClassId,
        class_session_id: classSessionId,
        status: parsedStatus,
        session_count: sessionCount,
        source: source as any,
        reconciliation_state: recState,
        created_by_id: userId,
      };

      if (isTeacher) {
        updateData.teacher_status = parsedStatus;
        updateData.teacher_user_id = userId;
        updateData.teacher_submitted_at = new Date();
        createData.teacher_status = parsedStatus;
        createData.teacher_user_id = userId;
        createData.teacher_submitted_at = new Date();
      } else {
        updateData.cs_status = parsedStatus;
        updateData.cs_user_id = userId;
        updateData.cs_submitted_at = new Date();
        createData.cs_status = parsedStatus;
        createData.cs_user_id = userId;
        createData.cs_submitted_at = new Date();
      }

      const attendance = await tx.attendance.upsert({
        where: {
          enrollment_class_id_class_session_id: {
            enrollment_class_id: enrollmentClassId,
            class_session_id: classSessionId,
          },
        },
        update: updateData,
        create: createData,
      });
      return attendance;
    });
  }

  async bulkMark(items: Array<{ enrollment_class_id: number; status: string; session_count?: number }>, classSessionId: number, source: string, userId: number) {
    const isTeacher = await this.isTeacherActor(userId);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const results = [];
      for (const item of items) {
        const parsedStatus = item.status as AttendanceStatus;
        const count = item.session_count ?? 1;

        const existing = await tx.attendance.findUnique({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: item.enrollment_class_id,
              class_session_id: classSessionId,
            },
          },
        });

        let recState: ReconciliationState;
        if (isTeacher) {
          if (existing?.cs_status) {
            recState = existing.cs_status === parsedStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
          } else {
            recState = ReconciliationState.PENDING_CS;
          }
        } else {
          if (existing?.teacher_status) {
            recState = existing.teacher_status === parsedStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
          } else {
            recState = ReconciliationState.PENDING_TEACHER;
          }
        }

        const updateData: any = {
          status: parsedStatus,
          session_count: count,
          source: source as any,
          reconciliation_state: recState,
          deleted_at: null,
          deleted_by_id: null,
        };

        const createData: any = {
          enrollment_class_id: item.enrollment_class_id,
          class_session_id: classSessionId,
          status: parsedStatus,
          session_count: count,
          source: source as any,
          reconciliation_state: recState,
          created_by_id: userId,
        };

        if (isTeacher) {
          updateData.teacher_status = parsedStatus;
          updateData.teacher_user_id = userId;
          updateData.teacher_submitted_at = new Date();
          createData.teacher_status = parsedStatus;
          createData.teacher_user_id = userId;
          createData.teacher_submitted_at = new Date();
        } else {
          updateData.cs_status = parsedStatus;
          updateData.cs_user_id = userId;
          updateData.cs_submitted_at = new Date();
          createData.cs_status = parsedStatus;
          createData.cs_user_id = userId;
          createData.cs_submitted_at = new Date();
        }

        const attendance = await tx.attendance.upsert({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: item.enrollment_class_id,
              class_session_id: classSessionId,
            },
          },
          update: updateData,
          create: createData,
        });
        results.push(attendance);
      }
      return results;
    });
  }

  async update(attendanceId: number, data: UpdateAttendanceDTO) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendance.findUnique({ where: { id: attendanceId } });
      const parsedStatus = data.status ? (data.status as AttendanceStatus) : existing?.status;

      let recState = existing?.reconciliation_state;
      if (existing && parsedStatus) {
        if (existing.teacher_status && existing.cs_status) {
          recState = existing.teacher_status === existing.cs_status ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
        }
      }

      const attendance = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          status: data.status as any,
          ...(data.session_count !== undefined ? { session_count: data.session_count } : {}),
          ...(recState ? { reconciliation_state: recState } : {}),
        },
      });
      return attendance;
    });
  }

  async reset(attendanceId: number, userId: number) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const attendance = await tx.attendance.update({
        where: { id: attendanceId },
        data: { deleted_at: new Date(), deleted_by_id: userId },
      });
      await tx.messageDelivery.updateMany({
        where: {
          attendance_id: attendanceId,
          status: { in: ['SCHEDULED', 'QUEUED'] },
        },
        data: { status: 'CANCELLED' },
      });
      return attendance;
    });
  }

  async countByStatus(classId: number) {
    return prisma.attendance.groupBy({
      by: ['status'],
      where: { class_session: { class_id: classId }, deleted_at: null },
      _count: true,
    });
  }
}
