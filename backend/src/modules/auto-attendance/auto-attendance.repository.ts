import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { AUTO_ATTENDANCE_DELAY_KEY } from './auto-attendance.types';

export class AutoAttendanceRepository {
  findDelaySetting() {
    return prisma.appSetting.findUnique({
      where: { key: AUTO_ATTENDANCE_DELAY_KEY },
    });
  }

  upsertDelaySetting(delayMinutes: number, updatedById: number) {
    const value = delayMinutes as unknown as Prisma.InputJsonValue;

    return prisma.appSetting.upsert({
      where: { key: AUTO_ATTENDANCE_DELAY_KEY },
      create: {
        key: AUTO_ATTENDANCE_DELAY_KEY,
        value,
        updated_by_id: updatedById,
      },
      update: {
        value,
        updated_by_id: updatedById,
      },
    });
  }

  findActiveSchedules() {
    return prisma.classSchedule.findMany({
      where: {
        active: true,
      },
      include: {
        class: {
          include: {
            enrollment_classes: {
              where: {
                status: 'ACTIVE',
                enrollment: { status: 'STUDYING' },
              },
              include: {
                enrollment: true,
              },
            },
          },
        },
      },
    });
  }

  findExecution(classScheduleId: number, sessionDate: Date) {
    return prisma.autoAttendanceExecution.findUnique({
      where: {
        class_schedule_id_session_date: {
          class_schedule_id: classScheduleId,
          session_date: sessionDate,
        },
      },
    });
  }

  createExecution(data: {
    class_schedule_id: number;
    session_date: Date;
    scheduled_run_at: Date;
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
    attendance_count?: number;
    error_message?: string | null;
  }) {
    return prisma.autoAttendanceExecution.create({
      data: {
        class_schedule_id: data.class_schedule_id,
        session_date: data.session_date,
        scheduled_run_at: data.scheduled_run_at,
        status: data.status,
        attendance_count: data.attendance_count ?? 0,
        error_message: data.error_message,
      },
    });
  }

  updateExecution(
    id: number,
    data: {
      status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
      attendance_count?: number;
      error_message?: string | null;
      completed_at?: Date;
    },
  ) {
    return prisma.autoAttendanceExecution.update({
      where: { id },
      data,
    });
  }

  async findOrCreateClassSession(
    classId: number,
    classScheduleId: number,
    sessionDate: Date,
    createdById: number,
  ) {
    let session = await prisma.classSession.findFirst({
      where: {
        class_id: classId,
        session_date: sessionDate,
      },
    });

    if (!session) {
      const lastSession = await prisma.classSession.findFirst({
        where: { class_id: classId },
        orderBy: { session_number: 'desc' },
      });
      const nextNumber = (lastSession?.session_number || 0) + 1;

      session = await prisma.classSession.create({
        data: {
          class_id: classId,
          class_schedule_id: classScheduleId,
          session_number: nextNumber,
          session_date: sessionDate,
          created_by_id: createdById,
        },
      });
    } else if (!session.class_schedule_id) {
      session = await prisma.classSession.update({
        where: { id: session.id },
        data: { class_schedule_id: classScheduleId },
      });
    }

    return session;
  }

  findExistingAttendance(enrollmentClassId: number, classSessionId: number) {
    return prisma.attendance.findFirst({
      where: {
        enrollment_class_id: enrollmentClassId,
        class_session_id: classSessionId,
        deleted_at: null,
      },
    });
  }

  createAttendance(data: {
    enrollment_class_id: number;
    class_session_id: number;
    status: 'ATTENDED';
    session_count?: number;
    source: 'AUTO_SCHEDULE';
    created_by_id: number;
  }) {
    return prisma.attendance.create({
      data: {
        enrollment_class_id: data.enrollment_class_id,
        class_session_id: data.class_session_id,
        status: data.status,
        session_count: data.session_count ?? 1,
        source: data.source,
        created_by_id: data.created_by_id,
      },
    });
  }

  upsertScheduleIssueTask(data: {
    enrollment_id: number;
    assigned_to_id: number;
    title: string;
    note: string;
    idempotency_key: string;
  }) {
    return prisma.careTask.upsert({
      where: { idempotency_key: data.idempotency_key },
      create: {
        enrollment_id: data.enrollment_id,
        assigned_to_id: data.assigned_to_id,
        type: 'SCHEDULE_DATA_ISSUE',
        title: data.title,
        note: data.note,
        priority: 'HIGH',
        status: 'PENDING',
        idempotency_key: data.idempotency_key,
      },
      update: {},
    });
  }
}

