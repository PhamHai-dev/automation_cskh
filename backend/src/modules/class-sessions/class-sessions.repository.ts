import { prisma } from '../../prisma/client';
import { CreateClassSessionDTO, UpdateClassSessionDTO, ActualSessionResult } from './class-sessions.types';
import { Prisma, AttendanceSource, ReconciliationState, AttendanceStatus } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';

/**
 * AuditLog-based idempotency marker identity for teacher actual-session creates.
 * The dedupe key is the CLIENT-GENERATED intent key (per click / per network attempt),
 * never the session date: two deliberate same-day sessions carry distinct keys and must
 * both succeed, while a replay of the SAME key must yield exactly one record.
 */
export const IDEMPOTENCY_ENTITY_TYPE = 'ClassSessionIdempotency';
export const buildIdempotencyEntityId = (classId: number, key: string) =>
  `${IDEMPOTENCY_ENTITY_TYPE}:${classId}:${key}`;

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

  /**
   * Create a session guarded by a client-generated idempotency key.
   *
   * Semantics (request-level dedupe, NOT date-level dedupe):
   *  - Retrying the SAME intent key (network failure / double submit) yields exactly one
   *    session: the first commit writes an AuditLog marker; a replay reads the marker and
   *    returns the already-created session instead of inserting another row.
   *  - Two DELIBERATE sessions for one student on the same day carry DIFFERENT keys, so
   *    both succeed. The session date is never used as the exclusion key here.
   *  - The class row is locked FOR UPDATE for the whole operation so concurrent replays of
   *    the same key serialize: only one can insert; the other observes the marker.
   *  - Replay window: the marker is durable in audit_logs (no expiry), so replay is
   *    deduplicated indefinitely. Uniqueness therefore rests entirely on the caller minting
   *    a fresh key per user intent; a reused key intentionally replays rather than re-creates.
   */
  async createIdempotent(
    classId: number,
    data: CreateClassSessionDTO,
    userId: number
  ): Promise<ActualSessionResult> {
    const key = data.idempotency_key!;
    const entityId = buildIdempotencyEntityId(classId, `${userId}:${key}`);
    const request = JSON.stringify({ ...data, idempotency_key: undefined });

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize same-key attempts against the class row.
      await tx.$queryRaw`SELECT id FROM classes WHERE id = ${classId} FOR UPDATE`;

      const marker = await tx.auditLog.findFirst({
        where: { entity_type: IDEMPOTENCY_ENTITY_TYPE, entity_id: entityId },
        orderBy: { created_at: 'desc' },
      });
      if (marker) {
        const saved = marker.after_data as any;
        if (saved.request !== request) throw new AppError(409, 'Khóa yêu cầu đã được dùng với dữ liệu khác');
        const session = await tx.classSession.findFirst({ where: { id: Number(saved.class_session_id), class_id: classId }, include: { attendance: { where: { enrollment_class_id: data.enrollment_class_id } } } });
        // A deleted result must not be silently resurrected by a delayed retry.
        if (!session) throw new AppError(409, 'Buổi học của yêu cầu này đã bị xóa');
        return { session, replayed: true };
      }

      if (data.enrollment_class_id) {
        const enrollment = await tx.enrollmentClass.findFirst({
          where: { id: data.enrollment_class_id, class_id: classId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!enrollment) throw new AppError(400, 'Ghi danh đang học không thuộc lớp này');
      }

      const latest = await tx.classSession.findFirst({
        where: { class_id: classId },
        orderBy: { session_number: 'desc' },
        select: { session_number: true },
      });
      const session = await tx.classSession.create({
        data: {
          class_id: classId,
          session_number: data.session_number ?? (latest?.session_number ?? 0) + 1,
          session_date: new Date(data.session_date),
          start_time: data.start_time,
          end_time: data.end_time,
          teacher_id: data.teacher_id,
          status: data.status || 'SCHEDULED',
          created_by_id: userId,
          ...(data.enrollment_class_id ? { attendance: { create: {
            enrollment_class_id: data.enrollment_class_id,
            // Neutral skeleton on ONE row: the teacher opinion is written by the chained
            // mark on this same screen, and CVHT later adds its own opinion to the SAME
            // record. teacher_status stays null so a failed/retried mark never leaves a
            // false ATTENDED teacher claim. status is a required non-null enum column, so
            // it holds a placeholder until the first mark reconciles it.
            status: AttendanceStatus.ATTENDED,
            teacher_status: null,
            cs_status: null,
            reconciliation_state: ReconciliationState.PENDING_TEACHER,
            source: AttendanceSource.MANUAL,
            created_by_id: userId,
          } } } : {}),
        },
        include: { attendance: true },
      });

      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'CREATE',
          entity_type: IDEMPOTENCY_ENTITY_TYPE,
          entity_id: entityId,
          after_data: { class_session_id: session.id, idempotency_key: key, class_id: classId, request },
        },
      });

      return { session, replayed: false };
    });
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
