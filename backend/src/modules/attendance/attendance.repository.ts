import { prisma } from '../../prisma/client';
import { AttendanceSide, UpdateAttendanceDTO } from './attendance.types';
import { Prisma, AttendanceStatus, ReconciliationState } from '@prisma/client';

export class AttendanceRepository {
  async findBySession(classId: number, sessionId: number) {
    return prisma.attendance.findMany({
      where: {
        class_session: { id: sessionId, class_id: classId },
        deleted_at: null,
      },
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

  async mark(
    enrollmentClassId: number,
    classSessionId: number,
    status: string,
    source: string,
    userId: number,
    side: AttendanceSide,
    options?: {
      lesson_topic?: string | null;
      teacher_note?: string | null;
      cs_note?: string | null;
    },
  ) {
    const isTeacher = side === 'TEACHER';
    const isAdmin = side === 'ADMIN';
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
      if (isAdmin) {
        recState = ReconciliationState.RESOLVED;
      } else if (isTeacher) {
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

      const now = new Date();

      const updateData: any = {
        source: source as any,
        reconciliation_state: recState,
        ...(recState === ReconciliationState.MATCHED || isAdmin ? { status: parsedStatus } : {}),
        deleted_at: null,
        deleted_by_id: null,
      };

      const createData: any = {
        enrollment_class_id: enrollmentClassId,
        class_session_id: classSessionId,
        status: parsedStatus,
        source: source as any,
        reconciliation_state: recState,
        created_by_id: userId,
      };

      if (isTeacher) {
        if (options?.lesson_topic !== undefined) {
          updateData.lesson_topic = options.lesson_topic;
          createData.lesson_topic = options.lesson_topic;
        }
        if (options?.teacher_note !== undefined) {
          updateData.teacher_note = options.teacher_note;
          createData.teacher_note = options.teacher_note;
        }
      }
      if (options?.cs_note !== undefined) {
        updateData.cs_note = options.cs_note;
        createData.cs_note = options.cs_note;
      }

      if (isAdmin) {
        updateData.resolved_by_id = userId;
        updateData.resolved_at = now;
        createData.resolved_by_id = userId;
        createData.resolved_at = now;
        createData.teacher_status = null;
        createData.cs_status = null;
      } else if (isTeacher) {
        updateData.teacher_status = parsedStatus;
        updateData.teacher_user_id = userId;
        updateData.teacher_submitted_at = now;
        createData.teacher_status = parsedStatus;
        createData.teacher_user_id = userId;
        createData.teacher_submitted_at = now;
      } else {
        updateData.cs_status = parsedStatus;
        updateData.cs_user_id = userId;
        updateData.cs_submitted_at = now;
        createData.cs_status = parsedStatus;
        createData.cs_user_id = userId;
        createData.cs_submitted_at = now;
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

  async bulkMark(
    items: Array<{
      enrollment_class_id: number;
      status: string;
      lesson_topic?: string | null;
      teacher_note?: string | null;
      cs_note?: string | null;
    }>,
    classSessionId: number,
    source: string,
    userId: number,
    side: AttendanceSide,
  ) {
    const isTeacher = side === 'TEACHER';
    const isAdmin = side === 'ADMIN';

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const results = [];
      for (const item of items) {
        const parsedStatus = item.status as AttendanceStatus;

        const existing = await tx.attendance.findUnique({
          where: {
            enrollment_class_id_class_session_id: {
              enrollment_class_id: item.enrollment_class_id,
              class_session_id: classSessionId,
            },
          },
        });

        let recState: ReconciliationState;
        if (isAdmin) {
          recState = ReconciliationState.RESOLVED;
        } else if (isTeacher) {
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

        const now = new Date();

        const updateData: any = {
          source: source as any,
          reconciliation_state: recState,
          ...(recState === ReconciliationState.MATCHED || isAdmin ? { status: parsedStatus } : {}),
          deleted_at: null,
          deleted_by_id: null,
        };

        const createData: any = {
          enrollment_class_id: item.enrollment_class_id,
          class_session_id: classSessionId,
          status: parsedStatus,
          source: source as any,
          reconciliation_state: recState,
          created_by_id: userId,
        };

        if (isTeacher) {
          if (item.lesson_topic !== undefined) {
            updateData.lesson_topic = item.lesson_topic;
            createData.lesson_topic = item.lesson_topic;
          }
          if (item.teacher_note !== undefined) {
            updateData.teacher_note = item.teacher_note;
            createData.teacher_note = item.teacher_note;
          }
        }
        if (item.cs_note !== undefined) {
          updateData.cs_note = item.cs_note;
          createData.cs_note = item.cs_note;
        }

        if (isAdmin) {
          updateData.resolved_by_id = userId;
          updateData.resolved_at = now;
          createData.resolved_by_id = userId;
          createData.resolved_at = now;
          createData.teacher_status = null;
          createData.cs_status = null;
        } else if (isTeacher) {
          updateData.teacher_status = parsedStatus;
          updateData.teacher_user_id = userId;
          updateData.teacher_submitted_at = now;
          createData.teacher_status = parsedStatus;
          createData.teacher_user_id = userId;
          createData.teacher_submitted_at = now;
        } else {
          updateData.cs_status = parsedStatus;
          updateData.cs_user_id = userId;
          updateData.cs_submitted_at = now;
          createData.cs_status = parsedStatus;
          createData.cs_user_id = userId;
          createData.cs_submitted_at = now;
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

  async update(attendanceId: number, data: UpdateAttendanceDTO, userId: number, side: AttendanceSide) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendance.findUnique({ where: { id: attendanceId } });
      if (!existing) throw new Error('Attendance not found');

      const updateData: any = {};

      if (data.status !== undefined) {
        const parsedStatus = data.status as AttendanceStatus;
        if (side === 'ADMIN') {
          updateData.status = parsedStatus;
          updateData.reconciliation_state = ReconciliationState.RESOLVED;
          updateData.resolved_by_id = userId;
          updateData.resolved_at = new Date();
        } else {
          const teacherStatus = side === 'TEACHER' ? parsedStatus : existing.teacher_status;
          const csStatus = side === 'CS' ? parsedStatus : existing.cs_status;
          const recState = teacherStatus && csStatus
            ? (teacherStatus === csStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT)
            : (teacherStatus ? ReconciliationState.PENDING_CS : ReconciliationState.PENDING_TEACHER);

          if (side === 'TEACHER') {
            updateData.teacher_status = parsedStatus;
            updateData.teacher_user_id = userId;
            updateData.teacher_submitted_at = new Date();
          } else {
            updateData.cs_status = parsedStatus;
            updateData.cs_user_id = userId;
            updateData.cs_submitted_at = new Date();
          }
          updateData.reconciliation_state = recState;
          if (recState === ReconciliationState.MATCHED) {
            updateData.status = parsedStatus;
          }
          updateData.resolved_by_id = null;
          updateData.resolved_at = null;
          updateData.resolution_note = null;
        }
      }

      if (side === 'TEACHER') {
        if (data.lesson_topic !== undefined) {
          updateData.lesson_topic = data.lesson_topic;
        }
        if (data.teacher_note !== undefined) {
          updateData.teacher_note = data.teacher_note;
        }
      }
      if (data.cs_note !== undefined) {
        updateData.cs_note = data.cs_note;
      }

      return tx.attendance.update({
        where: { id: attendanceId },
        data: updateData,
      });
    });
  }

  async reset(attendanceId: number, userId: number, side: AttendanceSide) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.attendance.findUnique({ where: { id: attendanceId } });
      if (!existing) throw new Error('Attendance not found');

      if (side === 'ADMIN') {
        const teacherStatus = existing.teacher_status;
        const csStatus = existing.cs_status;
        const hasAnyOpinion = Boolean(teacherStatus || csStatus);

        let reconciliationState: ReconciliationState = existing.reconciliation_state;
        if (hasAnyOpinion) {
          if (teacherStatus && csStatus) {
            reconciliationState = teacherStatus === csStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
          } else if (teacherStatus) {
            reconciliationState = ReconciliationState.PENDING_CS;
          } else {
            reconciliationState = ReconciliationState.PENDING_TEACHER;
          }
        }

        const attendance = await tx.attendance.update({
          where: { id: attendanceId },
          data: {
            ...(hasAnyOpinion
              ? {
                  status: teacherStatus || csStatus || existing.status,
                  reconciliation_state: reconciliationState,
                  resolved_by_id: null,
                  resolved_at: null,
                  resolution_note: null,
                  deleted_at: null,
                  deleted_by_id: null,
                }
              : {
                  resolved_by_id: null,
                  resolved_at: null,
                  resolution_note: null,
                  deleted_at: new Date(),
                  deleted_by_id: userId,
                }),
          },
        });

        await tx.messageDelivery.updateMany({
          where: {
            attendance_id: attendanceId,
            status: { in: ['SCHEDULED', 'QUEUED'] },
          },
          data: { status: 'CANCELLED' },
        });
        return attendance;
      }

      const teacherStatus = side === 'TEACHER' ? null : existing.teacher_status;
      const csStatus = side === 'CS' ? null : existing.cs_status;
      const hasAnyOpinion = Boolean(teacherStatus || csStatus);
      const reconciliationState = teacherStatus
        ? ReconciliationState.PENDING_CS
        : ReconciliationState.PENDING_TEACHER;
      const attendance = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          ...(side === 'TEACHER' ? {
            teacher_status: null,
            teacher_user_id: null,
            teacher_submitted_at: null,
            teacher_raw_value: null,
            lesson_topic: null,
            teacher_note: null,
          } : {
            cs_status: null,
            cs_user_id: null,
            cs_submitted_at: null,
            cs_raw_value: null,
            cs_note: null,
          }),
          reconciliation_state: reconciliationState,
          resolved_by_id: null,
          resolved_at: null,
          resolution_note: null,
          deleted_at: hasAnyOpinion ? null : new Date(),
          deleted_by_id: hasAnyOpinion ? null : userId,
        },
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
