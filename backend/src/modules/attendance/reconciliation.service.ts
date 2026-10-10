import { prisma } from '../../prisma/client';
import { AttendanceStatus, ReconciliationState, AttendanceSource, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { handleAttendanceEvent, cancelPendingDeliveries } from '../automation/automation-trigger.service';
import { createLogger } from '../../shared/logger/logger';
import { AppError } from '../../middlewares/error.middleware';
import { parseAttendanceValue, parseTimeSlot, normalizeDateOnly } from './attendance.utils';

const log = createLogger('ReconciliationService');

export interface TeacherMarkDTO {
  status: AttendanceStatus;
  rawValue?: string;
  lessonTopic?: string;
  note?: string;
}

export interface CSMarkDTO {
  status: AttendanceStatus;
  rawValue?: string;
  note?: string;
}

export interface ResolveConflictDTO {
  finalStatus: AttendanceStatus;
  resolutionNote: string;
}

export interface ReconciliationQuery {
  page?: number;
  pageSize?: number;
  limit?: number;
  classId?: number;
  csId?: number;
  teacherId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

interface Actor {
  id: number;
  roles: string[];
}

interface TeacherSessionsQuery {
  startDate?: string;
  endDate?: string;
  teacherId?: number;
}

export class ReconciliationService {
  private isPrivileged(actor: Actor) {
    return actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE');
  }

  private deriveState(teacherStatus: AttendanceStatus | null, csStatus: AttendanceStatus | null) {
    if (!teacherStatus) return ReconciliationState.PENDING_TEACHER;
    if (!csStatus) return ReconciliationState.PENDING_CS;
    return teacherStatus === csStatus ? ReconciliationState.MATCHED : ReconciliationState.CONFLICT;
  }

  private async assertTeacherScope(actor: Actor, classId: number) {
    if (this.isPrivileged(actor)) return;
    if (!actor.roles.includes('TEACHER')) throw new AppError(403, 'Vai trò không được phép điểm danh phía giáo viên');
    const assignment = await prisma.classTeacher.findFirst({
      where: { class_id: classId, active: true, teacher: { user_id: actor.id, active: true } },
      select: { id: true },
    });
    if (!assignment) throw new AppError(403, 'Bạn không được phân công active cho lớp này');
  }

  private assertCSScope(actor: Actor, assignedCSId: number) {
    if (this.isPrivileged(actor)) return;
    if (!actor.roles.includes('CS') || assignedCSId !== actor.id) {
      throw new AppError(403, 'Bạn không phụ trách học viên này');
    }
  }

  private async runDownstream(attendanceId: number, state: ReconciliationState) {
    try {
      if (state === ReconciliationState.MATCHED || state === ReconciliationState.RESOLVED) {
        await handleAttendanceEvent(attendanceId);
      } else if (state === ReconciliationState.CONFLICT) {
        await cancelPendingDeliveries(attendanceId);
      }
    } catch (err: any) {
      log.error('Attendance downstream action failed', { attendanceId, state, error: err.message });
    }
  }

  async markByTeacher(attendanceId: number, data: TeacherMarkDTO, actor: Actor) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        class_session: { select: { class_id: true } },
        enrollment_class: { include: { enrollment: true } },
      },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    await this.assertTeacherScope(actor, existing.class_session.class_id);

    const state = this.deriveState(data.status, existing.cs_status);
    const updateData: Prisma.AttendanceUpdateInput = {
      teacher_status: data.status,
      teacher_raw_value: data.rawValue || null,
      lesson_topic: data.lessonTopic || null,
      teacher_note: data.note || null,
      teacher_user: { connect: { id: actor.id } },
      teacher_submitted_at: new Date(),
      reconciliation_state: state,
      resolved_by: { disconnect: true },
      resolved_at: null,
      resolution_note: null,
      source: existing.source === AttendanceSource.MANUAL ? AttendanceSource.TEACHER_UPLOAD : existing.source,
      ...(state === ReconciliationState.MATCHED ? { status: data.status } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: updateData });
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action: 'ATTENDANCE_TEACHER_MARK',
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    await this.runDownstream(updated.id, state);
    return updated;
  }

  async markByCS(attendanceId: number, data: CSMarkDTO, actor: Actor) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { enrollment_class: { include: { enrollment: true } } },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    this.assertCSScope(actor, existing.enrollment_class.enrollment.cs_id);

    const state = this.deriveState(existing.teacher_status, data.status);
    const updateData: Prisma.AttendanceUpdateInput = {
      cs_status: data.status,
      cs_raw_value: data.rawValue || null,
      cs_note: data.note || null,
      cs_user: { connect: { id: actor.id } },
      cs_submitted_at: new Date(),
      reconciliation_state: state,
      resolved_by: { disconnect: true },
      resolved_at: null,
      resolution_note: null,
      ...(state === ReconciliationState.MATCHED ? { status: data.status } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: updateData });
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action: 'ATTENDANCE_CS_MARK',
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    await this.runDownstream(updated.id, state);
    return updated;
  }

  async resolveConflict(attendanceId: number, data: ResolveConflictDTO, actor: Actor) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { enrollment_class: { include: { enrollment: true } } },
    });
    if (!existing) throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    if (existing.reconciliation_state !== ReconciliationState.CONFLICT) {
      throw new AppError(409, 'Chỉ có thể phân xử bản ghi đang xung đột');
    }
    this.assertCSScope(actor, existing.enrollment_class.enrollment.cs_id);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.attendance.update({ where: { id: attendanceId }, data: {
        status: data.finalStatus,
        reconciliation_state: ReconciliationState.RESOLVED,
        resolved_by_id: actor.id,
        resolved_at: new Date(),
        resolution_note: data.resolutionNote.trim(),
      } });
      await tx.auditLog.create({ data: {
        user_id: actor.id,
        action: 'ATTENDANCE_CONFLICT_RESOLVED',
        entity_type: 'Attendance',
        entity_id: String(attendanceId),
        before_data: existing as any,
        after_data: result as any,
      } });
      return result;
    });
    await cancelPendingDeliveries(updated.id);
    await this.runDownstream(updated.id, ReconciliationState.RESOLVED);
    return updated;
  }

  async bulkApprovePending(attendanceIds: number[], actor: Actor) {
    const attendances = await prisma.attendance.findMany({
      where: { id: { in: attendanceIds } },
      include: { enrollment_class: { include: { enrollment: true } } },
    });
    if (attendances.length !== attendanceIds.length) {
      throw new AppError(404, 'Có bản ghi điểm danh không tồn tại');
    }
    for (const attendance of attendances) {
      this.assertCSScope(actor, attendance.enrollment_class.enrollment.cs_id);
      if (attendance.reconciliation_state !== ReconciliationState.PENDING_CS || !attendance.teacher_status) {
        throw new AppError(409, `Điểm danh ${attendance.id} không ở trạng thái chờ CSKH`);
      }
    }

    const approvedIds = await prisma.$transaction(async (tx) => {
      const ids: number[] = [];
      for (const attendance of attendances) {
        const result = await tx.attendance.update({ where: { id: attendance.id }, data: {
          cs_status: attendance.teacher_status,
          cs_user_id: actor.id,
          cs_submitted_at: new Date(),
          status: attendance.teacher_status!,
          reconciliation_state: ReconciliationState.MATCHED,
        } });
        await tx.auditLog.create({ data: {
          user_id: actor.id,
          action: 'ATTENDANCE_BULK_APPROVED',
          entity_type: 'Attendance',
          entity_id: String(attendance.id),
          before_data: attendance as any,
          after_data: result as any,
        } });
        ids.push(result.id);
      }
      return ids;
    });
    for (const id of approvedIds) await this.runDownstream(id, ReconciliationState.MATCHED);
    return { approvedCount: approvedIds.length, approvedIds };
  }

  /**
   * List all conflicting attendances.
   */
  async getConflicts(query: ReconciliationQuery, actor?: { id: number; roles: string[] }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {
      reconciliation_state: ReconciliationState.CONFLICT,
    };

    const classSessionWhere: Prisma.ClassSessionWhereInput = {};
    if (query.classId) {
      classSessionWhere.class_id = query.classId;
    }
    if (query.startDate || query.endDate) {
      classSessionWhere.session_date = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    if (Object.keys(classSessionWhere).length > 0) {
      where.class_session = classSessionWhere;
    }

    const enrollmentWhere: Prisma.EnrollmentWhereInput = {};
    // Role-based data scope: CS only sees their own assigned students if not MANAGE/ADMIN
    if (actor && actor.roles.includes('CS') && !actor.roles.includes('ADMIN') && !actor.roles.includes('MANAGE')) {
      enrollmentWhere.cs_id = actor.id;
    } else if (query.csId) {
      enrollmentWhere.cs_id = query.csId;
    }

    if (query.search) {
      enrollmentWhere.student = {
        OR: [
          { full_name: { contains: query.search } },
          { external_id: { contains: query.search } },
          { phone: { contains: query.search } },
        ],
      };
    }

    if (Object.keys(enrollmentWhere).length > 0) {
      where.enrollment_class = {
        enrollment: enrollmentWhere,
      };
    }

    const [total, items] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { class_session: { session_date: 'desc' } },
        include: {
          enrollment_class: {
            include: {
              enrollment: {
                include: {
                  student: true,
                  cs: { select: { id: true, name: true, email: true } },
                  package: { select: { id: true, name: true, code: true } },
                },
              },
              class: { select: { id: true, class_name: true, class_code: true } },
            },
          },
          class_session: {
            include: {
              class: { select: { id: true, class_name: true } },
            },
          },
          teacher_user: { select: { id: true, name: true, email: true } },
          cs_user: { select: { id: true, name: true, email: true } },
          resolved_by: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * List pending reconciliations.
   */
  async getPending(query: ReconciliationQuery, actor?: { id: number; roles: string[] }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {
      reconciliation_state: {
        in: [ReconciliationState.PENDING_CS, ReconciliationState.PENDING_TEACHER],
      },
    };

    const pendingClassSessionWhere: Prisma.ClassSessionWhereInput = {};
    if (query.classId) {
      pendingClassSessionWhere.class_id = query.classId;
    }
    if (query.startDate || query.endDate) {
      pendingClassSessionWhere.session_date = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }
    if (Object.keys(pendingClassSessionWhere).length > 0) {
      where.class_session = pendingClassSessionWhere;
    }

    const pendingEnrollmentWhere: Prisma.EnrollmentWhereInput = {};
    if (actor && actor.roles.includes('CS') && !actor.roles.includes('ADMIN') && !actor.roles.includes('MANAGE')) {
      pendingEnrollmentWhere.cs_id = actor.id;
    } else if (query.csId) {
      pendingEnrollmentWhere.cs_id = query.csId;
    }

    if (query.search) {
      pendingEnrollmentWhere.student = {
        OR: [
          { full_name: { contains: query.search } },
          { external_id: { contains: query.search } },
          { phone: { contains: query.search } },
        ],
      };
    }

    if (Object.keys(pendingEnrollmentWhere).length > 0) {
      where.enrollment_class = {
        enrollment: pendingEnrollmentWhere,
      };
    }

    const [total, items] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { class_session: { session_date: 'desc' } },
        include: {
          enrollment_class: {
            include: {
              enrollment: {
                include: {
                  student: true,
                  cs: { select: { id: true, name: true, email: true } },
                  package: { select: { id: true, name: true, code: true } },
                },
              },
              class: { select: { id: true, class_name: true, class_code: true } },
            },
          },
          class_session: {
            include: {
              class: { select: { id: true, class_name: true } },
            },
          },
          teacher_user: { select: { id: true, name: true, email: true } },
          cs_user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Upload and process teacher schedule/attendance Excel (e.g. giao_vien.xlsx - Sheet "2026 スケジュール")
   */
  async uploadTeacherExcel(fileBuffer: Buffer, actor: Actor) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    // Find schedule sheet: prefer "2026 スケジュール" or name containing "スケジュール" or "Schedule" or sheet 3
    let sheet = workbook.worksheets.find((ws) =>
      /スケジュール|schedule|lịch dạy/i.test(ws.name)
    );
    if (!sheet) {
      sheet = workbook.worksheets[2] || workbook.worksheets[0];
    }
    if (!sheet) {
      throw new AppError(400, 'Không tìm thấy sheet lịch dạy trong file Excel');
    }

    // Find header row that contains dates
    let headerRowIdx = -1;
    let dateCols: Array<{ col: number; date: Date }> = [];
    let studentIdCol = 2; // Default col B
    let studentNameCol = 3; // Default col C
    let timeCol = 6; // Default col F

    for (let r = 1; r <= Math.min(10, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      const dates: Array<{ col: number; date: Date }> = [];
      row.eachCell((cell, colNumber) => {
        const val = cell.value;
        if (val instanceof Date && !isNaN(val.getTime())) {
          dates.push({ col: colNumber, date: val });
        } else if (typeof val === 'string') {
          const d = new Date(val);
          if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            dates.push({ col: colNumber, date: d });
          }
        }
        const text = String(cell.text || cell.value || '').toLowerCase();
        if (text.includes('mã học viên') || text.includes('学籍番号') || text.includes('id')) {
          studentIdCol = colNumber;
        }
        if (text.includes('họ tên') || text.includes('お名前') || text.includes('tên học viên')) {
          studentNameCol = colNumber;
        }
        if (text.includes('thời gian') || text.includes('時間') || text.includes('giờ học')) {
          timeCol = colNumber;
        }
      });

      if (dates.length >= 1) {
        headerRowIdx = r;
        dateCols = dates;
        break;
      }
    }

    if (headerRowIdx === -1 || dateCols.length === 0) {
      throw new AppError(400, 'Không tìm thấy các cột ngày tháng hợp lệ trong file Excel');
    }

    let processedCount = 0;
    let matchedCount = 0;
    let conflictCount = 0;
    let pendingCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let r = headerRowIdx + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const extIdRaw = String(row.getCell(studentIdCol).text || row.getCell(studentIdCol).value || '').trim();
      const fullNameRaw = String(row.getCell(studentNameCol).text || row.getCell(studentNameCol).value || '').trim();
      const timeSlotRaw = String(row.getCell(timeCol).text || row.getCell(timeCol).value || '').trim();
      const { startTime, endTime } = parseTimeSlot(timeSlotRaw);

      for (const dc of dateCols) {
        const cell = row.getCell(dc.col);
        const cellText = String(cell.text || cell.value || '').trim();
        if (!cellText) continue;

        const parsed = parseAttendanceValue(cellText);
        if (!parsed.status) continue;

        const targetExtId = parsed.studentExternalId || (extIdRaw ? extIdRaw.replace(/\.0$/, '') : undefined);

        try {
          // Find student by external_id or full_name
          const student = await prisma.student.findFirst({
            where: {
              OR: [
                ...(targetExtId ? [{ external_id: targetExtId }] : []),
                ...(fullNameRaw ? [{ full_name: fullNameRaw }] : []),
              ],
            },
            include: {
              enrollments: {
                include: {
                  enrollment_classes: {
                    include: { class: true },
                    orderBy: { sequence_no: 'desc' },
                  },
                },
                orderBy: { created_at: 'desc' },
              },
            },
          });

          if (!student || student.enrollments.length === 0) {
            continue;
          }

          const enrollment = student.enrollments[0];
          const ec = enrollment.enrollment_classes[0];
          if (!ec) continue;

          const normalizedDate = normalizeDateOnly(dc.date) || dc.date;
          const session = await prisma.classSession.findFirst({
            where: {
              class_id: ec.class_id,
              session_date: normalizedDate,
              ...(startTime ? { start_time: startTime } : {}),
            },
          });
          if (!session) {
            errors.push({ row: r, error: 'Không tìm thấy buổi học khớp lớp, ngày và giờ' });
            continue;
          }
          await this.assertTeacherScope(actor, ec.class_id);

          // Check existing attendance for reconciliation
          const existingAtt = await prisma.attendance.findUnique({
            where: {
              enrollment_class_id_class_session_id: {
                enrollment_class_id: ec.id,
                class_session_id: session.id,
              },
            },
          });

          let reconciliationState: ReconciliationState;

          if (existingAtt?.cs_status) {
            if (existingAtt.cs_status === parsed.status) {
              reconciliationState = ReconciliationState.MATCHED;
              matchedCount++;
            } else {
              reconciliationState = ReconciliationState.CONFLICT;
              conflictCount++;
            }
          } else {
            reconciliationState = ReconciliationState.PENDING_CS;
            pendingCount++;
          }

          const upserted = await prisma.attendance.upsert({
            where: {
              enrollment_class_id_class_session_id: {
                enrollment_class_id: ec.id,
                class_session_id: session.id,
              },
            },
            update: {
              teacher_status: parsed.status,
              teacher_raw_value: cellText,
              lesson_topic: parsed.lessonTopic || existingAtt?.lesson_topic || null,
              teacher_submitted_at: new Date(),
              teacher_user_id: actor.id,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
              resolved_by_id: null,
              resolved_at: null,
              resolution_note: null,
              ...(reconciliationState === ReconciliationState.MATCHED ? { status: parsed.status } : {}),
            },
            create: {
              enrollment_class_id: ec.id,
              class_session_id: session.id,
              teacher_status: parsed.status,
              teacher_raw_value: cellText,
              lesson_topic: parsed.lessonTopic,
              teacher_submitted_at: new Date(),
              teacher_user_id: actor.id,
              status: parsed.status,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
              created_by_id: actor.id,
            },
          });

          processedCount++;

          if (reconciliationState === ReconciliationState.MATCHED) {
            handleAttendanceEvent(upserted.id).catch((err: any) =>
              log.error('Automation trigger failed (uploadTeacherExcel MATCHED)', { attendanceId: upserted.id, error: err.message })
            );
          } else if (reconciliationState === ReconciliationState.CONFLICT) {
            cancelPendingDeliveries(upserted.id).catch((err: any) =>
              log.error('Cancel deliveries failed (uploadTeacherExcel CONFLICT)', { attendanceId: upserted.id, error: err.message })
            );
          }
        } catch (err: any) {
          errors.push({ row: r, error: err.message || 'Lỗi khi xử lý hàng điểm danh' });
        }
      }
    }

    return {
      sheetName: sheet.name,
      totalDates: dateCols.length,
      processedCount,
      matchedCount,
      conflictCount,
      pendingCount,
      errors,
    };
  }

  /**
   * Get teaching sessions in the selected teacher scope.
   */
  async getTeacherSessions(actor: Actor, query: TeacherSessionsQuery) {
    let targetUserId = actor.id;
    if (query.teacherId !== undefined) {
      if (!this.isPrivileged(actor)) {
        throw new AppError(403, 'Chỉ ADMIN/MANAGE được chọn giáo viên khác');
      }
      targetUserId = query.teacherId;
    } else if (!actor.roles.includes('TEACHER') && this.isPrivileged(actor)) {
      throw new AppError(400, 'Vui lòng chọn giáo viên cần hỗ trợ');
    }

    const teacherUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { teacher: true },
    });
    const teacherId = teacherUser?.teacher?.id;
    if (!teacherId || !teacherUser.teacher?.active) {
      throw new AppError(404, 'Không tìm thấy hồ sơ giáo viên đang hoạt động');
    }

    const classTeachers = await prisma.classTeacher.findMany({
      where: { teacher_id: teacherId, active: true },
      select: { class_id: true },
    });
    const classIds = classTeachers.map((ct) => ct.class_id);
    if (classIds.length === 0) return [];

    const dateFilter: Prisma.DateTimeFilter = {};
    if (query.startDate) dateFilter.gte = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) dateFilter.lte = new Date(`${query.endDate}T00:00:00.000Z`);

    return prisma.classSession.findMany({
      where: {
        class_id: { in: classIds },
        ...(query.startDate || query.endDate ? { session_date: dateFilter } : {}),
      },
      orderBy: [{ session_date: 'desc' }, { start_time: 'asc' }],
      include: {
        class: {
          include: {
            enrollment_classes: {
              where: { status: 'ACTIVE' },
              include: {
                enrollment: {
                  include: {
                    student: true,
                    cs: { select: { id: true, name: true, phone: true } },
                  },
                },
                attendance: true,
              },
            },
          },
        },
      },
    });
  }
}

export const reconciliationService = new ReconciliationService();
