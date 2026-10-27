import { AttendanceSource, AttendanceStatus, ClassModelType, EnrollmentClassStatus, EnrollmentStatus, ReconciliationState } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AttendanceDeliveryPolicy, AttendancePostCommitInput, deriveAttendanceReconciliationState, runAttendancePostCommit } from './attendance-lifecycle';
import { prisma } from '../../prisma/client';
import { addMinutes, normalizeClassModel, normalizeDateOnly, parseAttendanceValue, parseTimeSlot, remapDateYear } from './attendance.utils';
import { findEffectiveAssignment } from './teacher-assignment';

export type AttendanceImportSource = 'CSKH' | 'TEACHER';
export type AttendanceImportAction = 'APPLY' | 'KEEP_DATABASE' | 'SKIP';
export type AttendanceImportClassification = 'CREATE' | 'UNCHANGED' | 'CONFLICT' | 'INVALID' | 'OUT_OF_SCOPE';
export interface AttendanceImportActor { id: number; roles: string[]; }
export interface AttendanceImportItem {
  id: string; source: AttendanceImportSource; rowNumber: number; cellAddress: string; externalId: string;
  sourceDate: string; targetDate: string | null; rawValue: string; status: AttendanceStatus | null; sessionCount: number; lessonTopic?: string | null;
  classModel?: ClassModelType | null; startTime?: string; endTime?: string; enrollmentClassId?: number; classId?: number;
  classification: AttendanceImportClassification;
  defaultAction: AttendanceImportAction; messages: string[];
  sessionPlans: Array<{ startTime: string; endTime: string; sessionId?: number; attendanceId?: number; action: 'CREATE_SESSION' | 'CREATE_ATTENDANCE' | 'UPDATE_ATTENDANCE' | 'UNCHANGED' }>;
}

function cellText(cell: ExcelJS.Cell): string {
  const value: any = cell.value;
  if (value && typeof value === 'object' && 'result' in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
  return String(cell.text || value || '').trim();
}
function parseHeaderDate(cell: ExcelJS.Cell): Date | null {
  const value: any = cell.value && typeof cell.value === 'object' && 'result' in cell.value ? cell.value.result : cell.value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return normalizeDateOnly(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return normalizeDateOnly(value);
  return null;
}

export class AttendanceImportService {
  async preview(fileBuffer: Buffer, source: AttendanceImportSource, targetYear: number, actor: AttendanceImportActor) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const sheet = source === 'CSKH'
      ? workbook.worksheets.find((item) => /chấm\s*buổi|điểm\s*danh/i.test(item.name))
      : workbook.worksheets.find((item) => /スケジュール|schedule|lịch dạy/i.test(item.name));
    if (!sheet) throw new Error(source === 'CSKH' ? 'Không tìm thấy Sheet 3 chấm buổi' : 'Không tìm thấy sheet lịch dạy giáo viên');
    const header = this.findDateColumns(sheet, source);
    if (!header.dateColumns.length) throw new Error('Không tìm thấy cột ngày hợp lệ trong file');
    const items: AttendanceImportItem[] = [];
    for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const identity = this.readIdentity(sheet, rowNumber, source);
      if (!identity.externalId) continue;
      for (const dateColumn of header.dateColumns) {
        const cell = sheet.getRow(rowNumber).getCell(dateColumn.column);
        const rawValue = cellText(cell);
        if (!rawValue || rawValue === '0') continue;
        const parsed = parseAttendanceValue(rawValue);
        items.push(await this.planItem({ source, rowNumber, cellAddress: cell.address, externalId: parsed.studentExternalId || identity.externalId, rawValue, parsed, sourceDate: dateColumn.date, targetDate: remapDateYear(dateColumn.date, targetYear), classModel: identity.classModel, classReference: identity.classReference, startTime: identity.startTime, endTime: identity.endTime, actor }));
      }
    }
    const summary = items.reduce((acc, item) => ({ ...acc, [item.classification]: acc[item.classification] + 1 }), { CREATE: 0, UNCHANGED: 0, CONFLICT: 0, INVALID: 0, OUT_OF_SCOPE: 0 });
    return { source, targetYear, sheetName: sheet.name, headerRow: header.rowNumber, totalItems: items.length, summary, items };
  }

  private findDateColumns(sheet: ExcelJS.Worksheet, source: AttendanceImportSource) {
    const rows = source === 'CSKH' ? [2] : Array.from({ length: Math.min(10, sheet.rowCount) }, (_, index) => index + 1);
    for (const rowNumber of rows) {
      const dateColumns: Array<{ column: number; date: Date }> = [];
      sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, column) => { const date = parseHeaderDate(cell); if (date) dateColumns.push({ column, date }); });
      if (dateColumns.length) return { rowNumber, dateColumns };
    }
    return { rowNumber: 0, dateColumns: [] as Array<{ column: number; date: Date }> };
  }

  private readIdentity(sheet: ExcelJS.Worksheet, rowNumber: number, source: AttendanceImportSource) {
    const row = sheet.getRow(rowNumber);
    if (source === 'CSKH') {
      const value = cellText(row.getCell(13)).replace(/\s+/g, '').replace(/^(\d{1,2})h(\d{2})$/i, '$1:$2');
      const startTime = /^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : undefined;
      const classReference = cellText(row.getCell(23)) || undefined;
      return { externalId: cellText(row.getCell(1)).replace(/\.0$/, ''), startTime, endTime: startTime ? addMinutes(startTime, 30) || undefined : undefined, classModel: null, classReference };
    }
    const time = parseTimeSlot(cellText(row.getCell(6)));
    return { externalId: cellText(row.getCell(2)).replace(/\.0$/, ''), startTime: time.startTime, endTime: time.endTime, classModel: normalizeClassModel(cellText(row.getCell(1))), classReference: undefined };
  }

  private async planItem(input: { source: AttendanceImportSource; rowNumber: number; cellAddress: string; externalId: string; rawValue: string; parsed: ReturnType<typeof parseAttendanceValue>; sourceDate: Date; targetDate: Date | null; classModel: ClassModelType | null; classReference?: string; startTime?: string; endTime?: string; actor: AttendanceImportActor }): Promise<AttendanceImportItem> {
    const messages: string[] = [];
    const base: Omit<AttendanceImportItem, 'classification' | 'defaultAction'> = { id: `${input.source}:${input.cellAddress}`, source: input.source, rowNumber: input.rowNumber, cellAddress: input.cellAddress, externalId: input.externalId, sourceDate: input.sourceDate.toISOString().slice(0, 10), targetDate: input.targetDate?.toISOString().slice(0, 10) || null, rawValue: input.rawValue, status: input.parsed.status, sessionCount: input.parsed.sessionCount, lessonTopic: input.parsed.lessonTopic, classModel: input.classModel, startTime: input.startTime, endTime: input.endTime, messages, sessionPlans: [] };
    if (input.parsed.error || !input.parsed.status || !input.targetDate) { messages.push(input.parsed.error || 'Không thể remap ngày sang năm đích'); return { ...base, classification: 'INVALID', defaultAction: 'SKIP' }; }
    if (!input.startTime || !input.endTime) { messages.push('Thiếu hoặc sai giờ học/thời lượng để tạo hoặc match buổi'); return { ...base, classification: 'INVALID', defaultAction: 'SKIP' }; }
    
    let enrollmentClasses = await prisma.enrollmentClass.findMany({
      where: {
        status: EnrollmentClassStatus.ACTIVE,
        enrollment: {
          student: { external_id: input.externalId },
          status: { notIn: [EnrollmentStatus.FINISHED, EnrollmentStatus.CANCELLED] },
        },
        ...(input.classModel ? { class: { model_type: input.classModel } } : {}),
      },
      include: { enrollment: true, class: true },
    });

    if (enrollmentClasses.length > 1 && input.classReference) {
      const refNorm = input.classReference.trim().toLowerCase();
      const filtered = enrollmentClasses.filter((ec) =>
        ec.class.class_name.trim().toLowerCase() === refNorm ||
        (ec.class.class_code && ec.class.class_code.trim().toLowerCase() === refNorm)
      );
      if (filtered.length > 0) {
        enrollmentClasses = filtered;
      }
    }

    if (enrollmentClasses.length !== 1) { messages.push(enrollmentClasses.length ? 'Match nhiều lớp/ghi danh active; không thể tự chọn' : 'Không tìm thấy học viên hoặc lớp/ghi danh active phù hợp'); return { ...base, classification: 'INVALID', defaultAction: 'SKIP' }; }
    const enrollmentClass = enrollmentClasses[0];
    base.enrollmentClassId = enrollmentClass.id;
    base.classId = enrollmentClass.class_id;
    if (!(await this.inScope(enrollmentClass, input.actor, input.source, input.targetDate))) { messages.push('Lớp hoặc học viên nằm ngoài data scope của tài khoản upload'); return { ...base, classification: 'OUT_OF_SCOPE', defaultAction: 'SKIP' }; }
    const duration = this.durationMinutes(input.startTime, input.endTime);
    if (duration <= 0) { messages.push('Khung giờ không hợp lệ'); return { ...base, classification: 'INVALID', defaultAction: 'SKIP' }; }
    for (let index = 0; index < input.parsed.sessionCount; index += 1) {
      const startTime = addMinutes(input.startTime, index * duration)!;
      const endTime = addMinutes(input.endTime, index * duration)!;
      let sessions = await prisma.classSession.findMany({ where: { class_id: enrollmentClass.class_id, session_date: input.targetDate, start_time: startTime, end_time: endTime } });
      // Older attendance records may have a session date but no time. CSKH Sheet 3
      // is date-based in the source, so a unique date-only session is the same
      // business session and must not be duplicated. Teacher workbooks remain
      // strict because their time slot is part of the identity.
      if (!sessions.length && input.source === 'CSKH') {
        sessions = await prisma.classSession.findMany({
          where: { class_id: enrollmentClass.class_id, session_date: input.targetDate, start_time: null, end_time: null },
        });
      }
      if (sessions.length > 1) { messages.push(`Có nhiều buổi học trùng khung ${startTime}-${endTime}`); return { ...base, classification: 'CONFLICT', defaultAction: 'SKIP' }; }
      if (!sessions.length) { base.sessionPlans.push({ startTime, endTime, action: 'CREATE_SESSION' }); continue; }
      const attendance = await prisma.attendance.findUnique({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: enrollmentClass.id, class_session_id: sessions[0].id } } });
      const existingStatus = input.source === 'TEACHER' ? attendance?.teacher_status : attendance?.cs_status;
      if (!attendance) { messages.push(`Buổi ${startTime}-${endTime} đã có nhưng thiếu điểm danh`); base.sessionPlans.push({ startTime, endTime, sessionId: sessions[0].id, action: 'CREATE_ATTENDANCE' }); }
      else if (existingStatus === input.parsed.status) base.sessionPlans.push({ startTime, endTime, sessionId: sessions[0].id, attendanceId: attendance.id, action: 'UNCHANGED' });
      else { messages.push(`Điểm danh ${startTime}-${endTime} khác dữ liệu hệ thống`); base.sessionPlans.push({ startTime, endTime, sessionId: sessions[0].id, attendanceId: attendance.id, action: 'UPDATE_ATTENDANCE' }); }
    }
    const hasConflict = base.sessionPlans.some((plan) => plan.action === 'UPDATE_ATTENDANCE' || plan.action === 'CREATE_ATTENDANCE');
    const allUnchanged = base.sessionPlans.every((plan) => plan.action === 'UNCHANGED');
    return { ...base, classification: allUnchanged ? 'UNCHANGED' : hasConflict ? 'CONFLICT' : 'CREATE', defaultAction: allUnchanged ? 'KEEP_DATABASE' : hasConflict ? 'SKIP' : 'APPLY' };
  }

  async commit(
    preview: { items: AttendanceImportItem[] },
    actor: AttendanceImportActor,
    actions: Record<string, AttendanceImportAction> = {},
    options: {
      deliveryPolicy?: AttendanceDeliveryPolicy;
      deliveryPolicies?: Record<string, AttendanceDeliveryPolicy>;
    } = {},
  ) {
    // Importer requests that omit policy remain NO_SEND: this path historically
    // wrote the read model without triggering outbound delivery. An explicit
    // SEND opt-in is accepted only through this request/batch context. Per-item
    // overrides allow mixed batches. Never infer policy from dates, source or
    // reconciliation state, or persist it on Attendance.
    const deliveryPolicy = options.deliveryPolicy ?? 'NO_SEND';
    let createdSessions = 0;
    let createdAttendances = 0;
    let updatedAttendances = 0;
    let skipped = 0;
    const items: Array<{ id: string; externalId: string; cellAddress: string; targetDate: string | null; rawValue: string; action: AttendanceImportAction; createdSessions: number; createdAttendances: number; updatedAttendances: number; skipped: boolean }> = [];
    for (const item of preview.items) {
      const action = actions[item.id] || item.defaultAction;
      const status = item.status;
      if (
        action !== 'APPLY' ||
        item.classification === 'OUT_OF_SCOPE' ||
        item.classification === 'INVALID' ||
        !status ||
        !item.targetDate ||
        !item.enrollmentClassId ||
        !item.classId
      ) {
        skipped += 1;
        items.push({ id: item.id, externalId: item.externalId, cellAddress: item.cellAddress, targetDate: item.targetDate, rawValue: item.rawValue, action, createdSessions: 0, createdAttendances: 0, updatedAttendances: 0, skipped: true });
        continue;
      }
      const itemResult = { id: item.id, externalId: item.externalId, cellAddress: item.cellAddress, targetDate: item.targetDate, rawValue: item.rawValue, action, createdSessions: 0, createdAttendances: 0, updatedAttendances: 0, skipped: false };
      const itemDownstream: AttendancePostCommitInput[] = [];
      const itemDeliveryPolicy = options.deliveryPolicies?.[item.id] ?? deliveryPolicy;
      await prisma.$transaction(async (tx) => {
        for (const plan of item.sessionPlans) {
          let sessionId = plan.sessionId;
          if (!sessionId) {
            const existingSession = await tx.classSession.findFirst({
              where: {
                class_id: item.classId!,
                session_date: new Date(`${item.targetDate}T00:00:00.000Z`),
                start_time: plan.startTime,
                end_time: plan.endTime,
              },
            });
            if (existingSession) {
              sessionId = existingSession.id;
            } else {
              const lastSession = await tx.classSession.findFirst({ where: { class_id: item.classId! }, orderBy: { session_number: 'desc' }, select: { session_number: true } });
              const session = await tx.classSession.create({ data: {
                class_id: item.classId!, session_number: (lastSession?.session_number || 0) + 1,
                session_date: new Date(`${item.targetDate}T00:00:00.000Z`), start_time: plan.startTime, end_time: plan.endTime,
                status: 'COMPLETED', created_by_id: actor.id,
              } });
              sessionId = session.id;
              createdSessions += 1;
              itemResult.createdSessions += 1;
              await tx.auditLog.create({
                data: {
                  user_id: actor.id,
                  action: 'ATTENDANCE_IMPORT_SESSION_CREATED',
                  entity_type: 'ClassSession',
                  entity_id: String(sessionId),
                  after_data: { class_id: item.classId!, session_date: item.targetDate, start_time: plan.startTime, end_time: plan.endTime, source: item.source } as any,
                },
              });
            }
          }
          const existing = await tx.attendance.findUnique({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: item.enrollmentClassId!, class_session_id: sessionId } } });
          const isTeacher = item.source === 'TEACHER';
          const otherStatus = isTeacher ? existing?.cs_status : existing?.teacher_status;
          const reconciliationState = deriveAttendanceReconciliationState(
            isTeacher ? status : otherStatus,
            isTeacher ? otherStatus : status,
          );
          const invalidatePendingDeliveries = Boolean(existing && (
            existing.teacher_status !== (isTeacher ? status : existing.teacher_status) ||
            existing.cs_status !== (isTeacher ? existing.cs_status : status)
          ));
          const sideData: any = isTeacher
            ? { teacher_status: status, teacher_raw_value: item.rawValue, teacher_user_id: actor.id, teacher_submitted_at: new Date(), ...(item.lessonTopic ? { lesson_topic: item.lessonTopic } : {}) }
            : { cs_status: status, cs_raw_value: item.rawValue, cs_user_id: actor.id, cs_submitted_at: new Date() };
          const updateData: any = { ...sideData, reconciliation_state: reconciliationState, source: isTeacher ? AttendanceSource.TEACHER_UPLOAD : AttendanceSource.EXCEL_IMPORT, ...(reconciliationState === ReconciliationState.MATCHED ? { status } : {}), resolved_by_id: null, resolved_at: null, resolution_note: null };
          if (existing) {
            const beforeData = {
              status: existing.status,
              teacher_status: existing.teacher_status,
              cs_status: existing.cs_status,
              reconciliation_state: existing.reconciliation_state,
            };
            await tx.attendance.update({ where: { id: existing.id }, data: updateData });
            itemDownstream.push({ attendanceId: existing.id, reconciliationState, deliveryPolicy: itemDeliveryPolicy, invalidatePendingDeliveries });
            updatedAttendances += 1;
            itemResult.updatedAttendances += 1;
            await tx.auditLog.create({
              data: {
                user_id: actor.id,
                action: 'ATTENDANCE_IMPORT_UPDATED',
                entity_type: 'Attendance',
                entity_id: String(existing.id),
                before_data: beforeData as any,
                after_data: { ...updateData, cellAddress: item.cellAddress } as any,
              },
            });
          } else {
            const created = await tx.attendance.create({ data: { enrollment_class_id: item.enrollmentClassId!, class_session_id: sessionId, status, source: isTeacher ? AttendanceSource.TEACHER_UPLOAD : AttendanceSource.EXCEL_IMPORT, reconciliation_state: reconciliationState, created_by_id: actor.id, ...sideData } });
            itemDownstream.push({ attendanceId: created.id, reconciliationState, deliveryPolicy: itemDeliveryPolicy });
            createdAttendances += 1;
            itemResult.createdAttendances += 1;
            await tx.auditLog.create({
              data: {
                user_id: actor.id,
                action: 'ATTENDANCE_IMPORT_CREATED',
                entity_type: 'Attendance',
                entity_id: String(created.id),
                after_data: { enrollment_class_id: item.enrollmentClassId!, class_session_id: sessionId, status, ...sideData, cellAddress: item.cellAddress } as any,
              },
            });
          }
        }
      });
      // Drain this item's downstream immediately after its transaction commits,
      // before processing the next item, so a later item throwing/rolling back
      // never strands already-durable cancellation or trigger work. NO_SEND (the
      // default here) still allows cancellation for invalidated pending deliveries.
      for (const entry of itemDownstream) {
        await runAttendancePostCommit(entry);
      }
      items.push(itemResult);
    }
    return { createdSessions, createdAttendances, updatedAttendances, skipped, items };
  }

  private durationMinutes(startTime: string, endTime: string) { const value = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)); return value(endTime) - value(startTime); }
  private async inScope(enrollmentClass: { class_id: number; enrollment: { cs_id: number | null } }, actor: AttendanceImportActor, source: AttendanceImportSource, sessionDate: Date): Promise<boolean> {
    if (actor.roles.includes('ADMIN') || actor.roles.includes('MANAGE')) return true;
    if (source === 'CSKH') return actor.roles.includes('CS') && enrollmentClass.enrollment.cs_id === actor.id;
    if (!actor.roles.includes('TEACHER')) return false;
    // D8 (owner ruling 2026-10-26): teacher upload scope is evaluated per
    // SESSION DATE, mirroring attendance.service.assertWriteScope. Fetch ALL of
    // the teacher's assignment rows for the class regardless of the current
    // `active` flag — `active` records today's state, not history — and let
    // findEffectiveAssignment decide. Consequences: an `active:false` row whose
    // explicit [start_date, end_date] window covers the session date authorizes
    // the historical import (a teacher may import sessions they actually
    // taught), while `active:false` WITHOUT an explicit end_date is the
    // ambiguous-removal boundary and never authorizes (Admin verification
    // path); an `active:true` row does NOT authorize dates outside its
    // [start_date, end_date] window. Never default or infer an end date here.
    const candidates = await prisma.classTeacher.findMany({
      where: {
        class_id: enrollmentClass.class_id,
        teacher: { user_id: actor.id, active: true },
      },
      select: { active: true, start_date: true, end_date: true },
    });
    return Boolean(findEffectiveAssignment(candidates, sessionDate));
  }
}
