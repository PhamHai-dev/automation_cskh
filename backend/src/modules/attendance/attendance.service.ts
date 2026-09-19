import { AttendanceRepository } from './attendance.repository';
import { MarkAttendanceDTO, BulkMarkAttendanceDTO, UpdateAttendanceDTO } from './attendance.types';
import { prisma } from '../../prisma/client';

export class AttendanceService {
  private repository: AttendanceRepository;

  constructor() {
    this.repository = new AttendanceRepository();
  }

  async listBySession(classId: number, sessionId: number) {
    return this.repository.findBySession(classId, sessionId);
  }

  async markAttendance(classId: number, sessionId: number, data: MarkAttendanceDTO, userId: number) {
    // Validate enrollment_class belongs to the same class
    const enrollmentClass = await prisma.enrollmentClass.findUnique({ where: { id: data.enrollment_class_id } });
    if (!enrollmentClass) {
      throw new Error('EnrollmentClass not found');
    }
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) {
      throw new Error('ClassSession not found in this class');
    }
    if (enrollmentClass.class_id !== classId) {
      throw new Error('EnrollmentClass does not belong to this class');
    }

    const attendance = await this.repository.findByEnrollmentClassAndSession(data.enrollment_class_id, sessionId);
    if (attendance) {
      throw new Error('Attendance already exists for this enrollment class and session');
    }

    const result = await this.repository.mark(data.enrollment_class_id, sessionId, data.status, 'MANUAL', userId);
    await this.logAudit(userId, 'CREATE', 'Attendance', String(result.id), null, result);
    return result;
  }

  async bulkMarkAttendance(classId: number, sessionId: number, data: BulkMarkAttendanceDTO, userId: number) {
    // Validate session belongs to class
    const session = await prisma.classSession.findFirst({ where: { id: sessionId, class_id: classId } });
    if (!session) {
      throw new Error('ClassSession not found in this class');
    }

    // Validate all enrollment_classes belong to this class
    for (const item of data.items) {
      const ec = await prisma.enrollmentClass.findUnique({ where: { id: item.enrollment_class_id } });
      if (!ec) {
        throw new Error(`EnrollmentClass ${item.enrollment_class_id} not found`);
      }
      if (ec.class_id !== classId) {
        throw new Error(`EnrollmentClass ${item.enrollment_class_id} does not belong to this class`);
      }
    }

    const results = await this.repository.bulkMark(data.items, sessionId, 'MANUAL', userId);
    await this.logAudit(userId, 'BULK_CREATE', 'Attendance', `session:${sessionId}`, null, { count: results.length });
    return results;
  }

  async updateAttendance(attendanceId: number, data: UpdateAttendanceDTO, userId: number) {
    const before = await this.repository.findById(attendanceId);
    const result = await this.repository.update(attendanceId, data);
    await this.logAudit(userId, 'UPDATE', 'Attendance', String(attendanceId), before, result);
    return result;
  }

  private async logAudit(userId: number, action: string, entityType: string, entityId: string, beforeData: any, afterData: any) {
    try {
      await prisma.auditLog.create({
        data: {
          user_id: userId,
          action,
          entity_type: entityType,
          entity_id: entityId,
          before_data: beforeData,
          after_data: afterData,
        },
      });
    } catch (err) {
      console.error('Audit log failed:', err);
    }
  }
}
