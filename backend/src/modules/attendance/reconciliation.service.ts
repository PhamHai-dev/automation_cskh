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
  sessionCount?: number;
}

export interface CSMarkDTO {
  status: AttendanceStatus;
  rawValue?: string;
  note?: string;
  sessionCount?: number;
}

export interface ResolveConflictDTO {
  finalStatus: AttendanceStatus;
  resolutionNote: string;
  sessionCount?: number;
}

export interface ReconciliationQuery {
  page?: number;
  limit?: number;
  classId?: number;
  csId?: number;
  teacherId?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export class ReconciliationService {
  /**
   * Apply attendance input from Teacher.
   */
  async markByTeacher(attendanceId: number, data: TeacherMarkDTO, teacherUserId: number) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        enrollment_class: { include: { enrollment: true } },
      },
    });

    if (!existing) {
      throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    }

    const csStatus = existing.cs_status;
    let reconciliationState: ReconciliationState;
    let finalStatus: AttendanceStatus = data.status;

    if (!csStatus) {
      reconciliationState = ReconciliationState.PENDING_CS;
    } else if (csStatus === data.status) {
      reconciliationState = ReconciliationState.MATCHED;
      finalStatus = data.status;
    } else {
      reconciliationState = ReconciliationState.CONFLICT;
      finalStatus = data.status; // default to teacher status temporarily while in conflict
    }

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        teacher_status: data.status,
        teacher_raw_value: data.rawValue || null,
        lesson_topic: data.lessonTopic || null,
        teacher_note: data.note || null,
        teacher_user_id: teacherUserId,
        teacher_submitted_at: new Date(),
        session_count: data.sessionCount !== undefined ? data.sessionCount : existing.session_count,
        status: finalStatus,
        reconciliation_state: reconciliationState,
        source: existing.source === AttendanceSource.MANUAL ? AttendanceSource.TEACHER_UPLOAD : existing.source,
      },
    });

    if (reconciliationState === ReconciliationState.MATCHED) {
      handleAttendanceEvent(updated.id).catch((err: any) =>
        log.error('Automation trigger failed (markByTeacher MATCHED)', { attendanceId: updated.id, error: err.message })
      );
    } else if (reconciliationState === ReconciliationState.CONFLICT) {
      cancelPendingDeliveries(updated.id).catch((err: any) =>
        log.error('Cancel deliveries failed (markByTeacher CONFLICT)', { attendanceId: updated.id, error: err.message })
      );
    }

    return updated;
  }

  /**
   * Apply attendance input from CSKH.
   */
  async markByCS(attendanceId: number, data: CSMarkDTO, csUserId: number) {
    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        enrollment_class: { include: { enrollment: true } },
      },
    });

    if (!existing) {
      throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    }

    const teacherStatus = existing.teacher_status;
    let reconciliationState: ReconciliationState;
    let finalStatus: AttendanceStatus = data.status;

    if (!teacherStatus) {
      reconciliationState = ReconciliationState.PENDING_TEACHER;
    } else if (teacherStatus === data.status) {
      reconciliationState = ReconciliationState.MATCHED;
      finalStatus = data.status;
    } else {
      reconciliationState = ReconciliationState.CONFLICT;
      finalStatus = data.status;
    }

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        cs_status: data.status,
        cs_raw_value: data.rawValue || null,
        cs_note: data.note || null,
        cs_user_id: csUserId,
        cs_submitted_at: new Date(),
        session_count: data.sessionCount !== undefined ? data.sessionCount : existing.session_count,
        status: finalStatus,
        reconciliation_state: reconciliationState,
      },
    });

    if (reconciliationState === ReconciliationState.MATCHED) {
      handleAttendanceEvent(updated.id).catch((err: any) =>
        log.error('Automation trigger failed (markByCS MATCHED)', { attendanceId: updated.id, error: err.message })
      );
    } else if (reconciliationState === ReconciliationState.CONFLICT) {
      cancelPendingDeliveries(updated.id).catch((err: any) =>
        log.error('Cancel deliveries failed (markByCS CONFLICT)', { attendanceId: updated.id, error: err.message })
      );
    }

    return updated;
  }

  /**
   * Resolve a conflicting attendance record.
   */
  async resolveConflict(attendanceId: number, data: ResolveConflictDTO, actor: { id: number; roles: string[] }) {
    if (!data.resolutionNote || !data.resolutionNote.trim()) {
      throw new AppError(400, 'Lý do giải trình phân xử là bắt buộc');
    }

    const existing = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        enrollment_class: {
          include: {
            enrollment: true,
          },
        },
      },
    });

    if (!existing) {
      throw new AppError(404, 'Không tìm thấy bản ghi điểm danh');
    }

    // Permission check: CS assigned to this enrollment OR MANAGE / ADMIN
    const isManageOrAdmin = actor.roles.includes('MANAGE') || actor.roles.includes('ADMIN');
    const isAssignedCS = actor.roles.includes('CS') && existing.enrollment_class.enrollment.cs_id === actor.id;

    if (!isManageOrAdmin && !isAssignedCS) {
      throw new AppError(403, 'Bạn không có quyền phân xử điểm danh cho học viên này');
    }

    const updated = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: data.finalStatus,
        reconciliation_state: ReconciliationState.RESOLVED,
        resolved_by_id: actor.id,
        resolved_at: new Date(),
        resolution_note: data.resolutionNote.trim(),
        session_count: data.sessionCount !== undefined ? data.sessionCount : existing.session_count,
      },
    });

    // Re-trigger automation after resolution
    cancelPendingDeliveries(updated.id)
      .then(() => handleAttendanceEvent(updated.id))
      .catch((err: any) =>
        log.error('Automation re-trigger failed (resolveConflict)', { attendanceId: updated.id, error: err.message })
      );

    return updated;
  }

  /**
   * Bulk approve pending attendances (e.g. approve all teacher-reported ATTENDED sessions).
   */
  async bulkApprovePending(attendanceIds: number[], csUserId: number) {
    const attendances = await prisma.attendance.findMany({
      where: {
        id: { in: attendanceIds },
        reconciliation_state: ReconciliationState.PENDING_CS,
        teacher_status: { not: null },
      },
    });

    const approvedIds: number[] = [];

    for (const att of attendances) {
      const teacherStatus = att.teacher_status!;
      const updated = await prisma.attendance.update({
        where: { id: att.id },
        data: {
          cs_status: teacherStatus,
          cs_user_id: csUserId,
          cs_submitted_at: new Date(),
          status: teacherStatus,
          reconciliation_state: ReconciliationState.MATCHED,
        },
      });

      approvedIds.push(updated.id);
      handleAttendanceEvent(updated.id).catch((err: any) =>
        log.error('Automation trigger failed (bulkApprovePending)', { attendanceId: updated.id, error: err.message })
      );
    }

    return { approvedCount: approvedIds.length, approvedIds };
  }

  /**
   * List all conflicting attendances.
   */
  async getConflicts(query: ReconciliationQuery, actor?: { id: number; roles: string[] }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
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
    const limit = Math.min(100, Math.max(1, query.limit || 20));
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
  async uploadTeacherExcel(fileBuffer: Buffer, teacherUserId: number) {
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

          // Find or create ClassSession for date
          const normalizedDate = normalizeDateOnly(dc.date) || dc.date;
          let session = await prisma.classSession.findFirst({
            where: { class_id: ec.class_id, session_date: normalizedDate },
          });

          if (!session) {
            const lastSession = await prisma.classSession.findFirst({
              where: { class_id: ec.class_id },
              orderBy: { session_number: 'desc' },
            });
            session = await prisma.classSession.create({
              data: {
                class_id: ec.class_id,
                session_number: (lastSession?.session_number || 0) + 1,
                session_date: normalizedDate,
                start_time: startTime || null,
                end_time: endTime || null,
                created_by_id: teacherUserId,
              },
            });
          }

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
          let finalStatus = parsed.status;

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
              teacher_user_id: teacherUserId,
              session_count: parsed.sessionCount,
              status: finalStatus,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
            },
            create: {
              enrollment_class_id: ec.id,
              class_session_id: session.id,
              teacher_status: parsed.status,
              teacher_raw_value: cellText,
              lesson_topic: parsed.lessonTopic,
              teacher_submitted_at: new Date(),
              teacher_user_id: teacherUserId,
              session_count: parsed.sessionCount,
              status: finalStatus,
              reconciliation_state: reconciliationState,
              source: AttendanceSource.TEACHER_UPLOAD,
              created_by_id: teacherUserId,
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
   * Get teacher's own teaching sessions for today / week / date range.
   */
  async getTeacherSessions(teacherUserId: number, startDate?: string, endDate?: string) {
    const teacherUser = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: { teacher: true },
    });

    const teacherId = teacherUser?.teacher?.id;

    const classTeachers = teacherId ? await prisma.classTeacher.findMany({
      where: { teacher_id: teacherId, active: true },
      select: { class_id: true },
    }) : [];
    const classIds = classTeachers.map((ct) => ct.class_id);

    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const sessions = await prisma.classSession.findMany({
      where: {
        OR: [
          ...(classIds.length > 0 ? [{ class_id: { in: classIds } }] : []),
          { created_by_id: teacherUserId },
        ],
        ...(startDate || endDate ? { session_date: dateFilter } : {}),
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

    return sessions;
  }
}

export const reconciliationService = new ReconciliationService();
