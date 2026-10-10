import { AttendanceRepository } from './attendance.repository';
import { MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from './attendance.types';
import { prisma } from '../../prisma/client';
import { handleAttendanceEvent, cancelPendingDeliveries } from '../automation/automation-trigger.service';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';

const log = createLogger('AttendanceService');

interface AttendanceActor {
  id: number;
  roles: string[];
}

export class AttendanceService {
  private repository = new AttendanceRepository();

  private resolveSide(actor: AttendanceActor, requested?: 'TEACHER' | 'CS'): 'TEACHER' | 'CS' {
    const privileged = actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
    if (privileged) {
      if (!requested) throw new AppError(400, 'ADMIN/MANAGE phải chọn phía điểm danh');
      return requested;
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

  private async assertWriteScope(actor: AttendanceActor, side: 'TEACHER' | 'CS', classId: number, enrollmentClassId: number) {
    if (actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE')) return;
    if (side === 'TEACHER') {
      const assigned = await prisma.classTeacher.findFirst({
        where: { class_id: classId, active: true, teacher: { user_id: actor.id, active: true } },
        select: { id: true },
      });
      if (!assigned) throw new AppError(403, 'Bạn không được phân công active cho lớp này');
      return;
    }
    const enrollmentClass = await prisma.enrollmentClass.findFirst({
      where: { id: enrollmentClassId, class_id: classId, enrollment: { cs_id: actor.id } },
      select: { id: true },
    });
    if (!enrollmentClass) throw new AppError(403, 'Bạn không phụ trách học viên này');
  }

  private async runDownstream(attendance: { id: number; reconciliation_state: string }) {
    if (attendance.reconciliation_state === 'MATCHED' || attendance.reconciliation_state === 'RESOLVED') {
      await handleAttendanceEvent(attendance.id).catch((err: any) =>
        log.error('Automation trigger failed', { attendanceId: attendance.id, error: err.message }),
      );
    } else if (attendance.reconciliation_state === 'CONFLICT') {
      await cancelPendingDeliveries(attendance.id).catch((err: any) =>
        log.error('Cancel pending deliveries failed', { attendanceId: attendance.id, error: err.message }),
      );
    }
  }

  async listBySession(classId: number, sessionId: number) {
    return this.repository.findBySession(classId, sessionId);
  }

  async markAttendance(classId: number, sessionId: number, data: MarkAttendanceDTO, actor: AttendanceActor) {
    const side = this.resolveSide(actor, data.side);
    const enrollmentClass = await prisma.enrollmentClass.findUnique({ where: { id: data.enrollment_class_id } });
    if (!enrollmentClass) throw new AppError(404, 'Không tìm thấy ghi danh lớp');
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    if (enrollmentClass.class_id !== classId) throw new AppError(409, 'Ghi danh không thuộc lớp này');
    await this.assertWriteScope(actor, side, classId, data.enrollment_class_id);

    const before = await this.repository.findByEnrollmentClassAndSession(data.enrollment_class_id, sessionId);
    const result = await this.repository.mark(data.enrollment_class_id, sessionId, data.status, 'MANUAL', actor.id, side);
    await this.logAudit(actor.id, before ? 'UPDATE' : 'CREATE', 'Attendance', String(result.id), before, result);
    await this.runDownstream(result);
    return result;
  }

  async bulkMarkAttendance(classId: number, sessionId: number, data: BulkMarkAttendanceDTO, actor: AttendanceActor) {
    const side = this.resolveSide(actor, data.side);
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    for (const item of data.items) {
      const ec = await prisma.enrollmentClass.findUnique({ where: { id: item.enrollment_class_id } });
      if (!ec) throw new AppError(404, `Không tìm thấy ghi danh ${item.enrollment_class_id}`);
      if (ec.class_id !== classId) throw new AppError(409, `Ghi danh ${item.enrollment_class_id} không thuộc lớp này`);
      await this.assertWriteScope(actor, side, classId, item.enrollment_class_id);
    }
    const results = await this.repository.bulkMark(data.items, sessionId, 'MANUAL', actor.id, side);
    await this.logAudit(actor.id, 'BULK_UPSERT', 'Attendance', `session:${sessionId}`, null, { side, count: results.length });
    for (const attendance of results) await this.runDownstream(attendance);
    return results;
  }

  async updateAttendance(attendanceId: number, data: UpdateAttendanceDTO, actor: AttendanceActor, classId?: number, sessionId?: number) {
    const before = await this.repository.findById(attendanceId);
    if (!before) throw new AppError(404, 'Không tìm thấy điểm danh');
    if (classId && before.class_session.class_id !== classId) throw new AppError(409, 'Điểm danh không thuộc lớp này');
    if (sessionId && before.class_session_id !== sessionId) throw new AppError(409, 'Điểm danh không thuộc buổi này');
    const side = this.resolveSide(actor, data.side);
    await this.assertWriteScope(actor, side, before.class_session.class_id, before.enrollment_class_id);
    const result = await this.repository.update(attendanceId, data, actor.id, side);
    await this.logAudit(actor.id, 'UPDATE', 'Attendance', String(attendanceId), before, result);
    await this.runDownstream(result);
    return result;
  }

  async resetAttendance(attendanceId: number, actor: AttendanceActor, requestedSide?: 'TEACHER' | 'CS', classId?: number, sessionId?: number) {
    const before = await this.repository.findById(attendanceId);
    if (!before) throw new AppError(404, 'Không tìm thấy điểm danh');
    if (classId && before.class_session.class_id !== classId) throw new AppError(409, 'Điểm danh không thuộc lớp này');
    if (sessionId && before.class_session_id !== sessionId) throw new AppError(409, 'Điểm danh không thuộc buổi này');
    const side = this.resolveSide(actor, requestedSide);
    await this.assertWriteScope(actor, side, before.class_session.class_id, before.enrollment_class_id);
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
