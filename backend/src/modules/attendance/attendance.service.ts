import { ReconciliationState } from '@prisma/client';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceSide, MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from './attendance.types';
import { prisma } from '../../prisma/client';
import { runAttendancePostCommit } from './attendance-lifecycle';
import { findEffectiveAssignment } from './teacher-assignment';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';

const log = createLogger('AttendanceService');

interface AttendanceActor {
  id: number;
  roles: string[];
}

export class AttendanceService {
  private repository = new AttendanceRepository();

  private resolveSide(actor: AttendanceActor, requested?: AttendanceSide): AttendanceSide {
    const privileged = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
    if (privileged) {
      if (requested === 'TEACHER' || requested === 'CS') {
        throw new AppError(403, 'Tài khoản Admin/Quản lý chỉ được phép sửa cột Điểm danh, không được sửa cột của CSKH hoặc Giáo viên');
      }
      return 'ADMIN';
    }
    if (requested === 'ADMIN') {
      throw new AppError(403, 'Chỉ Admin hoặc Quản lý mới được sửa cột Điểm danh chốt');
    }
    const available = [
      ...(actor.roles.includes('TEACHER') ? ['TEACHER' as const] : []),
      ...(actor.roles.includes('CS') ? ['CS' as const] : []),
    ];
    if (requested && !available.includes(requested)) {
      throw new AppError(403, 'Bạn không có quyền điểm danh phía đã chọn');
    }
    if (requested) return requested;
    if (available.length !== 1) throw new AppError(400, 'Hãy chọn rõ phía Giáo viên hoặc CSKH');
    return available[0];
  }

  private async assertWriteScope(actor: AttendanceActor, side: AttendanceSide, classId: number, enrollmentClassId: number, sessionDate: Date) {
    if (actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE')) return;
    if (side === 'TEACHER') {
      // D8 (approved 2026-10-25): the assignment must be EFFECTIVE AT THE
      // SESSION DATE (null window bounds = unbounded), not merely "active
      // today". Expired/missing evidence is 403; Admin-assisted marking is the
      // separate privileged path above.
      const candidates = await prisma.classTeacher.findMany({
        where: { class_id: classId, teacher: { user_id: actor.id, active: true } },
        select: { active: true, start_date: true, end_date: true },
      });
      const effective = findEffectiveAssignment(candidates, sessionDate);
      if (!effective) throw new AppError(403, 'Bạn không được phân công cho lớp này tại ngày dạy của buổi học');
      return;
    }
    const enrollmentClass = await prisma.enrollmentClass.findFirst({
      where: { id: enrollmentClassId, class_id: classId, enrollment: { cs_id: actor.id } },
      select: { id: true },
    });
    if (!enrollmentClass) throw new AppError(403, 'Bạn không phụ trách học viên này');
  }

  private async runDownstream(attendance: { id: number; reconciliation_state: string }) {
    await runAttendancePostCommit({
      attendanceId: attendance.id,
      reconciliationState: attendance.reconciliation_state as ReconciliationState,
    });
  }

  private async notifyOnAdminMark(attendanceId: number, actor: AttendanceActor) {
    try {
      const [fullRecord, actorUser] = await Promise.all([
        prisma.attendance.findUnique({
          where: { id: attendanceId },
          include: {
            enrollment_class: {
              include: {
                enrollment: {
                  include: {
                    student: true,
                  },
                },
                class: {
                  include: {
                    class_teachers: {
                      where: { active: true },
                      include: {
                        teacher: true,
                      },
                    },
                  },
                },
              },
            },
            class_session: true,
          },
        }),
        prisma.user.findUnique({
          where: { id: actor.id },
          select: { id: true, name: true },
        }),
      ]);

      if (!fullRecord) return;

      const adminStatus = fullRecord.status;
      const enrollment = fullRecord.enrollment_class.enrollment;
      const student = enrollment.student;
      const cls = fullRecord.enrollment_class.class;
      const session = fullRecord.class_session;
      const sessionDateYMD = session.session_date instanceof Date
        ? session.session_date.toISOString().slice(0, 10)
        : String(session.session_date).slice(0, 10);
      const actorName = actorUser?.name || 'Admin/Quản lý';

      // 1. Check CSKH side
      if (fullRecord.cs_status !== adminStatus) {
        const csRecipientId = fullRecord.cs_user_id || enrollment.cs_id;
        if (csRecipientId) {
          await prisma.auditLog.create({
            data: {
              user_id: actor.id,
              action: 'ATTENDANCE_ADMIN_NOTIFICATION',
              entity_type: 'UserNotification',
              entity_id: String(csRecipientId),
              after_data: {
                recipient_user_id: csRecipientId,
                recipient_role: 'CS',
                attendance_id: fullRecord.id,
                student_id: student.id,
                student_name: student.full_name,
                student_code: student.external_id || null,
                class_id: cls.id,
                class_name: cls.class_name,
                session_id: session.id,
                session_number: session.session_number,
                session_date: sessionDateYMD,
                previous_status: fullRecord.cs_status || null,
                admin_status: adminStatus,
                actor_id: actor.id,
                actor_name: actorName,
                is_read: false,
                read_at: null,
              },
            },
          });
        }
      }

      // 2. Check Teacher side
      if (fullRecord.teacher_status !== adminStatus) {
        let teacherRecipientIds: number[] = [];
        if (fullRecord.teacher_user_id) {
          teacherRecipientIds = [fullRecord.teacher_user_id];
        } else {
          teacherRecipientIds = cls.class_teachers
            .filter((ct) => ct.active && ct.teacher?.active && ct.teacher.user_id != null)
            .map((ct) => ct.teacher.user_id as number);
        }
        const uniqueTeacherIds = Array.from(new Set(teacherRecipientIds));

        for (const teacherUserId of uniqueTeacherIds) {
          await prisma.auditLog.create({
            data: {
              user_id: actor.id,
              action: 'ATTENDANCE_ADMIN_NOTIFICATION',
              entity_type: 'UserNotification',
              entity_id: String(teacherUserId),
              after_data: {
                recipient_user_id: teacherUserId,
                recipient_role: 'TEACHER',
                attendance_id: fullRecord.id,
                student_id: student.id,
                student_name: student.full_name,
                student_code: student.external_id || null,
                class_id: cls.id,
                class_name: cls.class_name,
                session_id: session.id,
                session_number: session.session_number,
                session_date: sessionDateYMD,
                previous_status: fullRecord.teacher_status || null,
                admin_status: adminStatus,
                actor_id: actor.id,
                actor_name: actorName,
                is_read: false,
                read_at: null,
              },
            },
          });
        }
      }
    } catch (err) {
      log.error('Admin notification creation failed', {
        attendanceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async listBySession(classId: number, sessionId: number) {
    const session = await prisma.classSession.findFirst({
      where: { id: sessionId, class_id: classId },
      select: { id: true },
    });
    if (!session) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    return this.repository.findBySession(classId, sessionId);
  }

  async markAttendance(classId: number, sessionId: number, data: MarkAttendanceDTO, actor: AttendanceActor) {
    const side = this.resolveSide(actor, data.side);
    const enrollmentClass = await prisma.enrollmentClass.findUnique({ where: { id: data.enrollment_class_id } });
    if (!enrollmentClass) throw new AppError(404, 'Không tìm thấy ghi danh lớp');
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    if (session.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');
    if (enrollmentClass.class_id !== classId) throw new AppError(409, 'Ghi danh không thuộc lớp này');
    await this.assertWriteScope(actor, side, classId, data.enrollment_class_id, session.session_date);

    const before = await this.repository.findByEnrollmentClassAndSession(data.enrollment_class_id, sessionId);
    const result = await this.repository.mark(
      data.enrollment_class_id,
      sessionId,
      data.status,
      'MANUAL',
      actor.id,
      side,
      {
        lesson_topic: side === 'TEACHER' ? data.lesson_topic : undefined,
        teacher_note: side === 'TEACHER' ? data.teacher_note : undefined,
        cs_note: data.cs_note,
      },
    );
    await this.logAudit(actor.id, before ? 'UPDATE' : 'CREATE', 'Attendance', String(result.id), before, result);
    if (side === 'ADMIN' && data.status) {
      await this.notifyOnAdminMark(result.id, actor);
    }
    await this.runDownstream(result);
    return result;
  }

  async bulkMarkAttendance(classId: number, sessionId: number, data: BulkMarkAttendanceDTO, actor: AttendanceActor) {
    const side = this.resolveSide(actor, data.side);
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    if (session.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');
    for (const item of data.items) {
      const ec = await prisma.enrollmentClass.findUnique({ where: { id: item.enrollment_class_id } });
      if (!ec) throw new AppError(404, `Không tìm thấy ghi danh ${item.enrollment_class_id}`);
      if (ec.class_id !== classId) throw new AppError(409, `Ghi danh ${item.enrollment_class_id} không thuộc lớp này`);
      await this.assertWriteScope(actor, side, classId, item.enrollment_class_id, session.session_date);
    }
    const sanitizedItems = data.items.map((item) => ({
      ...item,
      lesson_topic: side === 'TEACHER' ? item.lesson_topic : undefined,
      teacher_note: side === 'TEACHER' ? item.teacher_note : undefined,
    }));
    const results = await this.repository.bulkMark(sanitizedItems, sessionId, 'MANUAL', actor.id, side);
    await this.logAudit(actor.id, 'BULK_UPSERT', 'Attendance', `session:${sessionId}`, null, { side, count: results.length });
    if (side === 'ADMIN') {
      for (const attendance of results) {
        await this.notifyOnAdminMark(attendance.id, actor);
      }
    }
    for (const attendance of results) await this.runDownstream(attendance);
    return results;
  }

  async updateAttendance(attendanceId: number, data: UpdateAttendanceDTO, actor: AttendanceActor, classId?: number, sessionId?: number) {
    const before = await this.repository.findById(attendanceId);
    if (!before) throw new AppError(404, 'Không tìm thấy điểm danh');
    if (before.class_session?.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');
    if (classId && before.class_session.class_id !== classId) throw new AppError(409, 'Điểm danh không thuộc lớp này');
    if (sessionId && before.class_session_id !== sessionId) throw new AppError(409, 'Điểm danh không thuộc buổi này');
    const side = this.resolveSide(actor, data.side);
    await this.assertWriteScope(actor, side, before.class_session.class_id, before.enrollment_class_id, before.class_session.session_date);
    const sanitizedData: UpdateAttendanceDTO = {
      ...data,
      lesson_topic: side === 'TEACHER' ? data.lesson_topic : undefined,
      teacher_note: side === 'TEACHER' ? data.teacher_note : undefined,
    };
    const result = await this.repository.update(attendanceId, sanitizedData, actor.id, side);
    await this.logAudit(actor.id, 'UPDATE', 'Attendance', String(attendanceId), before, result);
    if (side === 'ADMIN' && data.status) {
      await this.notifyOnAdminMark(result.id, actor);
    }
    await this.runDownstream(result);
    return result;
  }

  async resetAttendance(attendanceId: number, actor: AttendanceActor, requestedSide?: AttendanceSide, classId?: number, sessionId?: number) {
    const before = await this.repository.findById(attendanceId);
    if (!before) throw new AppError(404, 'Không tìm thấy điểm danh');
    if (before.class_session?.status === 'CANCELLED') throw new AppError(409, 'Không thể điểm danh cho buổi học đã hủy');
    if (classId && before.class_session.class_id !== classId) throw new AppError(409, 'Điểm danh không thuộc lớp này');
    if (sessionId && before.class_session_id !== sessionId) throw new AppError(409, 'Điểm danh không thuộc buổi này');
    const side = this.resolveSide(actor, requestedSide);
    await this.assertWriteScope(actor, side, before.class_session.class_id, before.enrollment_class_id, before.class_session.session_date);
    const result = await this.repository.reset(attendanceId, actor.id, side);
    await this.logAudit(actor.id, 'RESET_SIDE', 'Attendance', String(attendanceId), before, result);
    return result;
  }

  private async logAudit(userId: number, action: string, entityType: string, entityId: string, beforeData: any, afterData: any) {
    try {
      await prisma.auditLog.create({ data: { user_id: userId, action, entity_type: entityType, entity_id: entityId, before_data: beforeData, after_data: afterData } });
    } catch (err) {
      log.error('Audit log failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
