import ExcelJS from 'exceljs';
import {
  AttendanceSource,
  AttendanceStatus,
  Prisma,
  ProgramType,
  ReconciliationState,
} from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../../prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import type { AuthUser } from '../../middlewares/auth.middleware';
import { getAccessibleClassIds } from '../classes/classes.scope';
import {
  AttendancePostCommitInput,
  deriveAttendanceReconciliationState,
  runAttendancePostCommit,
} from '../attendance/attendance-lifecycle';
import {
  exportAttendanceValue,
  exportNoteValue,
  identityKey,
  normalizeJlptText,
  parseJlptWorkbook,
  ParsedJlptStudentBlock,
} from './jlpt-workbook.parser';

export type JlptConflictAction = 'OVERWRITE' | 'KEEP_DATABASE';
export type JlptAbsenceResolution = 'ABSENT_APPROVED_A' | 'ABSENT_UNAPPROVED_C';
type LearningField = 'preparation_rating' | 'attitude_rating' | 'homework_completed' | 'test_correct_answers';
type SourceField = LearningField | 'teacher_status' | 'teacher_note';

export interface JlptImportPreviewItem {
  item_id: string;
  sheet_name: string;
  row_number: number;
  class_id?: number;
  class_code: string;
  enrollment_class_id?: number;
  external_id?: string | null;
  student_name: string;
  session_number?: number;
  class_session_id?: number;
  field?: SourceField;
  source_value?: unknown;
  database_value?: unknown;
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  error?: string;
}

export interface JlptImportConflict {
  conflict_id: string;
  item_id: string;
  field: SourceField;
  source_value: unknown;
  database_value: unknown;
}

export interface JlptImportIssue {
  issue_id: string;
  issue_type: 'AMBIGUOUS_ABSENCE' | 'SESSION_HEADER_MISMATCH';
  class_id?: number;
  enrollment_class_id?: number;
  class_session_id?: number;
  class_code: string;
  student_name: string;
  session_number: number;
  source_note?: string | null;
  source_header?: string;
  proposed_metadata?: { session_type: 'LESSON' | 'TEST'; session_title: string | null };
  blocking: boolean;
}

interface ResolvedCell {
  block: ParsedJlptStudentBlock;
  classId: number;
  enrollmentClassId: number;
  externalId: string | null;
  sessionId: number;
  sessionNumber: number;
  currentAttendance: any | null;
  currentLearningRecord: any | null;
  value: ParsedJlptStudentBlock['values'][number];
}

interface CachedPreview {
  token: string;
  hash: string;
  createdAt: number;
  targetYear: number;
  items: JlptImportPreviewItem[];
  conflicts: JlptImportConflict[];
  issues: JlptImportIssue[];
  cells: ResolvedCell[];
  errors: string[];
  warnings: string[];
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const previewCache = new Map<string, CachedPreview>();
const jsonValue = (value: unknown): Prisma.InputJsonValue => value as unknown as Prisma.InputJsonValue;
const sameValue = (left: unknown, right: unknown) => (left ?? null) === (right ?? null);

export class JlptWorkbookService {
  private assertAdmin(actor: AuthUser) {
    if (!actor.roles.includes('ADMIN')) throw new AppError(403, 'Chỉ ADMIN được import workbook NKHT JLPT');
  }

  private assertExportRole(actor: AuthUser) {
    if (actor.roles.includes('TEACHER') || !actor.roles.some((role) => ['ADMIN', 'MANAGE', 'CS'].includes(role))) {
      throw new AppError(403, 'Giáo viên không có quyền export; cần quyền ADMIN, MANAGE hoặc CS');
    }
  }

  async preview(buffer: Buffer, targetYear: number, actor: AuthUser) {
    this.assertAdmin(actor);
    if (!Number.isInteger(targetYear) || targetYear < 2020 || targetYear > 2100) {
      throw new AppError(400, 'target_year không hợp lệ');
    }
    const preview = await this.buildPreview(buffer, targetYear);
    previewCache.set(preview.token, preview);
    this.cleanupCache();
    return this.presentPreview(preview);
  }

  async confirm(
    buffer: Buffer,
    targetYear: number,
    previewToken: string,
    conflictActions: Record<string, JlptConflictAction>,
    normalizationResolutions: Record<string, JlptAbsenceResolution>,
    actor: AuthUser,
    fileName: string,
  ) {
    this.assertAdmin(actor);
    const cached = previewCache.get(previewToken);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (!cached || cached.hash !== hash || cached.targetYear !== targetYear || Date.now() - cached.createdAt > CACHE_TTL_MS) {
      throw new AppError(409, 'Preview đã hết hạn hoặc workbook/target_year đã thay đổi; vui lòng preview lại');
    }
    if (cached.errors.length > 0) throw new AppError(409, 'Không thể confirm khi preview còn lỗi');
    const unresolvedConflicts = cached.conflicts.filter((item) => !conflictActions[item.conflict_id]);
    const ambiguousIssues = cached.issues.filter((item) => item.issue_type === 'AMBIGUOUS_ABSENCE');
    const unresolvedIssues = ambiguousIssues.filter((item) => !normalizationResolutions[item.issue_id]);
    const headerIssues = cached.issues.filter((item) => item.issue_type === 'SESSION_HEADER_MISMATCH');
    if (unresolvedConflicts.length || unresolvedIssues.length || headerIssues.length) {
      throw new AppError(409, 'Phải xử lý toàn bộ conflict, X có ghi chú và header lệch trước khi confirm');
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      const importBatch = await tx.importBatch.create({
        data: {
          uploaded_by_id: actor.id,
          file_name: fileName,
          import_type: 'WORKBOOK',
          total_rows: cached.cells.length,
          status: 'PROCESSING',
        },
      });
      let updatedFields = 0;
      let unchangedFields = 0;
      const downstream = new Map<number, AttendancePostCommitInput>();
      for (const cell of cached.cells) {
        const issue = ambiguousIssues.find((item) =>
          item.enrollment_class_id === cell.enrollmentClassId && item.class_session_id === cell.sessionId,
        );
        const fields = this.sourceFields(cell, 'MANUAL', issue ? normalizationResolutions[issue.issue_id] : undefined);
        for (const field of fields) {
          const conflictId = this.conflictId(cell, field.field);
          const hasConflict = cached.conflicts.some((conflict) => conflict.conflict_id === conflictId);
          if (hasConflict && conflictActions[conflictId] === 'KEEP_DATABASE') {
            unchangedFields += 1;
            continue;
          }
          if (sameValue(field.before, field.after)) {
            unchangedFields += 1;
            continue;
          }
          const postCommit = await this.applyField(tx, cell, field.field, field.after, actor.id, 'JLPT_NKHT_MANUAL_IMPORT');
          if (postCommit) this.collectPostCommit(downstream, postCommit);
          updatedFields += 1;
        }
      }
      await tx.importBatch.update({
        where: { id: importBatch.id },
        data: { status: 'COMPLETED', success_rows: cached.cells.length, completed_at: new Date() },
      });
      await tx.auditLog.create({
        data: {
          user_id: actor.id,
          action: 'JLPT_NKHT_IMPORT_CONFIRMED',
          entity_type: 'ImportBatch',
          entity_id: String(importBatch.id),
          after_data: jsonValue({ target_year: targetYear, updated_fields: updatedFields, unchanged_fields: unchangedFields }),
        },
      });
      return {
        batch: { ...importBatch, status: 'COMPLETED', updated_fields: updatedFields, unchanged_fields: unchangedFields },
        downstream: [...downstream.values()],
      };
    });
    previewCache.delete(previewToken);
    await this.runPostCommit(transactionResult.downstream);
    return transactionResult.batch;
  }

  private async buildPreview(buffer: Buffer, targetYear: number): Promise<CachedPreview> {
    const parsed = await parseJlptWorkbook(buffer);
    const items: JlptImportPreviewItem[] = [];
    const conflicts: JlptImportConflict[] = [];
    const issues: JlptImportIssue[] = [];
    const cells: ResolvedCell[] = [];
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];
    const classCodes = [...new Set(parsed.blocks.map((item) => item.classCode.trim()))];
    const classes = await prisma.class.findMany({
      where: { OR: [{ class_code: { in: classCodes } }, { class_name: { in: classCodes } }] },
      include: {
        class_sessions: { orderBy: { session_number: 'asc' } },
        enrollment_classes: {
          include: {
            enrollment: { include: { student: true } },
            attendance: true,
            jlpt_learning_records: true,
          },
        },
      },
    });

    for (const block of parsed.blocks) {
      const matches = classes.filter((cls) => normalizeJlptText(cls.class_code || cls.class_name) === normalizeJlptText(block.classCode));
      if (matches.length !== 1) {
        const error = matches.length ? 'Mã lớp không duy nhất trong DB' : 'Không tìm thấy lớp; import không tự tạo lớp';
        errors.push(`${block.sheetName} dòng ${block.rowNumber}: ${error} (${block.classCode}).`);
        items.push({ item_id: `row:${block.sheetName}:${block.rowNumber}`, sheet_name: block.sheetName, row_number: block.rowNumber, class_code: block.classCode, student_name: block.studentName, action: 'ERROR', error });
        continue;
      }
      const cls = matches[0];
      if (cls.program_type !== ProgramType.JLPT) {
        errors.push(`Lớp ${block.classCode} chưa được phân loại JLPT.`);
        continue;
      }
      const enrollments = cls.enrollment_classes.filter((ec) => normalizeJlptText(ec.enrollment.student.full_name) === normalizeJlptText(block.studentName));
      const infoExternalId = parsed.externalIds.get(identityKey(block.classCode, block.studentName));
      const uniqueByExternalId = infoExternalId ? enrollments.filter((ec) => ec.enrollment.student.external_id === infoExternalId) : enrollments;
      if (uniqueByExternalId.length !== 1) {
        const error = uniqueByExternalId.length ? 'Tên học viên không duy nhất' : 'Không tìm thấy học viên trong lớp';
        errors.push(`${block.sheetName} dòng ${block.rowNumber}: ${error} (${block.studentName}).`);
        items.push({ item_id: `row:${block.sheetName}:${block.rowNumber}`, sheet_name: block.sheetName, row_number: block.rowNumber, class_id: cls.id, class_code: block.classCode, student_name: block.studentName, action: 'ERROR', error });
        continue;
      }
      const ec = uniqueByExternalId[0];
      const sessions = new Map(cls.class_sessions.map((item) => [item.session_number, item]));
      const attendance = new Map(ec.attendance.map((item) => [item.class_session_id, item]));
      const records = new Map(ec.jlpt_learning_records.map((item) => [item.class_session_id, item]));
      for (const value of block.values) {
        const session = sessions.get(value.session.sessionNumber);
        if (!session || session.session_date.getUTCFullYear() !== targetYear) {
          const error = !session ? 'Thiếu ClassSession; import không tự tạo buổi' : `ClassSession không thuộc năm ${targetYear}`;
          errors.push(`${block.classCode}/${block.studentName}/buổi ${value.session.sessionNumber}: ${error}.`);
          items.push({ item_id: `session:${cls.id}:${ec.id}:${value.session.sessionNumber}`, sheet_name: block.sheetName, row_number: block.rowNumber, class_id: cls.id, class_code: block.classCode, enrollment_class_id: ec.id, student_name: block.studentName, session_number: value.session.sessionNumber, action: 'ERROR', error });
          continue;
        }
        const expectedType = value.session.proposedType;
        const expectedTitle = value.session.proposedTitle;
        if (session.session_type !== expectedType || (expectedType === 'TEST' && (session.session_title || null) !== expectedTitle)) {
          issues.push({ issue_id: `header:${cls.id}:${session.id}`, issue_type: 'SESSION_HEADER_MISMATCH', class_id: cls.id, class_session_id: session.id, class_code: block.classCode, student_name: block.studentName, session_number: session.session_number, source_header: value.session.sourceHeader, proposed_metadata: { session_type: expectedType, session_title: expectedTitle }, blocking: true });
        }
        const cell: ResolvedCell = { block, classId: cls.id, enrollmentClassId: ec.id, externalId: ec.enrollment.student.external_id, sessionId: session.id, sessionNumber: session.session_number, currentAttendance: attendance.get(session.id) || null, currentLearningRecord: records.get(session.id) || null, value };
        cells.push(cell);
        if (value.ambiguousAbsence) issues.push({ issue_id: `absence:${cls.id}:${ec.id}:${session.id}`, issue_type: 'AMBIGUOUS_ABSENCE', class_id: cls.id, enrollment_class_id: ec.id, class_session_id: session.id, class_code: block.classCode, student_name: block.studentName, session_number: session.session_number, source_note: value.sourceNote, blocking: true });
        for (const field of this.sourceFields(cell, 'MANUAL')) {
          if (!field.populated || (field.field === 'teacher_status' && value.ambiguousAbsence)) continue;
          const itemId = `${cls.id}:${ec.id}:${session.id}:${field.field}`;
          const action = sameValue(field.before, field.after) ? 'UNCHANGED' : field.before === null || field.before === undefined ? 'CREATE' : 'UPDATE';
          items.push({ item_id: itemId, sheet_name: block.sheetName, row_number: block.rowNumber, class_id: cls.id, class_code: block.classCode, enrollment_class_id: ec.id, external_id: ec.enrollment.student.external_id, student_name: block.studentName, session_number: session.session_number, class_session_id: session.id, field: field.field, source_value: field.after, database_value: field.before, action });
          if (!sameValue(field.before, field.after) && field.before !== null && field.before !== undefined) conflicts.push({ conflict_id: this.conflictId(cell, field.field), item_id: itemId, field: field.field, source_value: field.after, database_value: field.before });
        }
      }
    }
    const dedupedIssues = [...new Map(issues.map((item) => [item.issue_id, item])).values()];
    return { token: crypto.randomBytes(18).toString('hex'), hash: crypto.createHash('sha256').update(buffer).digest('hex'), createdAt: Date.now(), targetYear, items, conflicts, issues: dedupedIssues, cells, errors, warnings };
  }

  private presentPreview(preview: CachedPreview) {
    return {
      preview_token: preview.token,
      summary: { total_cells: preview.cells.length, create_or_update: preview.items.filter((item) => item.action === 'CREATE' || item.action === 'UPDATE').length, conflicts: preview.conflicts.length, normalization_issues: preview.issues.length, errors: preview.errors.length },
      items: preview.items,
      conflicts: preview.conflicts,
      normalization_issues: preview.issues,
      errors: preview.errors,
      warnings: preview.warnings,
      can_confirm: preview.errors.length === 0 && preview.conflicts.length === 0 && preview.issues.length === 0,
    };
  }

  private sourceFields(cell: ResolvedCell, mode: 'MANUAL' | 'ABSOLUTE_SYNC', resolvedStatus?: JlptAbsenceResolution) {
    const value = cell.value;
    const attendance = cell.currentAttendance;
    const record = cell.currentLearningRecord;
    const includeBlank = mode === 'ABSOLUTE_SYNC';
    return [
      { field: 'teacher_status' as const, before: attendance?.teacher_status ?? null, after: resolvedStatus ?? value.teacherStatus, populated: includeBlank || value.attendancePopulated },
      { field: 'teacher_note' as const, before: attendance?.teacher_note ?? null, after: value.sourceNote, populated: includeBlank || value.notePopulated },
      { field: 'preparation_rating' as const, before: record?.preparation_rating ?? null, after: value.preparationRating, populated: includeBlank || value.preparationPopulated },
      { field: 'attitude_rating' as const, before: record?.attitude_rating ?? null, after: value.attitudeRating, populated: includeBlank || value.attitudePopulated },
      { field: 'homework_completed' as const, before: record?.homework_completed ?? null, after: value.homeworkCompleted, populated: includeBlank || value.homeworkPopulated },
      { field: 'test_correct_answers' as const, before: record?.test_correct_answers ?? null, after: value.testCorrectAnswers, populated: includeBlank || value.testPopulated },
    ].filter((field) => field.populated);
  }

  private async applyField(
    tx: Prisma.TransactionClient,
    cell: ResolvedCell,
    field: SourceField,
    value: unknown,
    actorId: number,
    action: string,
  ): Promise<AttendancePostCommitInput | null> {
    if (field === 'teacher_status' || field === 'teacher_note') {
      const before = await tx.attendance.findUnique({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId } } });
      if (!before && value === null) return null;
      const teacherStatus = field === 'teacher_status' ? value as AttendanceStatus | null : before?.teacher_status ?? null;
      const teacherNote = field === 'teacher_note' ? value as string | null : before?.teacher_note ?? null;
      const csStatus = before?.cs_status ?? null;
      const state = deriveAttendanceReconciliationState(teacherStatus, csStatus);
      const finalStatus = state === ReconciliationState.MATCHED ? teacherStatus! : before?.status ?? teacherStatus ?? csStatus ?? AttendanceStatus.ATTENDED;
      const saved = await tx.attendance.upsert({
        where: { enrollment_class_id_class_session_id: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId } },
        create: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId, teacher_status: teacherStatus, teacher_note: teacherNote, teacher_raw_value: teacherStatus, teacher_user_id: actorId, teacher_submitted_at: new Date(), reconciliation_state: state, status: finalStatus, source: AttendanceSource.EXCEL_IMPORT, created_by_id: actorId },
        update: { teacher_status: teacherStatus, teacher_note: teacherNote, teacher_raw_value: teacherStatus, teacher_user_id: actorId, teacher_submitted_at: new Date(), reconciliation_state: state, status: finalStatus, resolved_by_id: null, resolved_at: null, resolution_note: null, deleted_at: null },
      });
      await this.audit(tx, actorId, action, 'Attendance', String(saved.id), before, saved);
      return {
        attendanceId: saved.id,
        reconciliationState: state,
        deliveryPolicy: 'NO_SEND',
        invalidatePendingDeliveries: field === 'teacher_status' && Boolean(before && before.teacher_status !== teacherStatus),
      };
    }
    const before = await tx.jlptLearningRecord.findUnique({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId } } });
    const data = { [field]: value, updated_by_id: actorId } as Prisma.JlptLearningRecordUncheckedUpdateInput;
    const saved = await tx.jlptLearningRecord.upsert({
      where: { enrollment_class_id_class_session_id: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId } },
      create: { enrollment_class_id: cell.enrollmentClassId, class_session_id: cell.sessionId, [field]: value, created_by_id: actorId, updated_by_id: actorId } as Prisma.JlptLearningRecordUncheckedCreateInput,
      update: data,
    });
    await this.audit(tx, actorId, action, 'JlptLearningRecord', String(saved.id), before, saved);
    return null;
  }

  async exportWorkbook(year: number, teacherIds: number[], classIds: number[], actor: AuthUser) {
    this.assertExportRole(actor);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new AppError(400, 'year không hợp lệ');
    if (teacherIds.length === 0 && classIds.length === 0) throw new AppError(400, 'Cần chọn ít nhất một giáo viên hoặc lớp');
    const accessible = await getAccessibleClassIds(actor);
    const scopedClassIds = accessible === null ? classIds : classIds.length ? classIds.filter((id) => accessible.includes(id)) : accessible;
    if (classIds.length && scopedClassIds.length !== classIds.length) throw new AppError(403, 'Một hoặc nhiều lớp nằm ngoài phạm vi export');
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const classes = await prisma.class.findMany({
      where: {
        program_type: ProgramType.JLPT,
        ...(accessible === null ? (scopedClassIds.length ? { id: { in: scopedClassIds } } : {}) : { id: { in: scopedClassIds } }),
        ...(teacherIds.length ? { class_teachers: { some: { teacher_id: { in: teacherIds } } } } : {}),
        class_sessions: { some: { session_date: { gte: start, lt: end } } },
      },
      include: {
        class_teachers: { include: { teacher: true } },
        class_sessions: { where: { session_date: { gte: start, lt: end } }, orderBy: { session_number: 'asc' } },
        enrollment_classes: { include: { enrollment: { include: { student: true } }, attendance: true, jlpt_learning_records: true } },
      },
      orderBy: { class_code: 'asc' },
    });
    const warnings: string[] = [];
    const validClasses = classes.filter((cls) => {
      const level = String(cls.level || '').toUpperCase();
      if (['N2', 'N3', 'N4', 'N5'].includes(level)) return true;
      warnings.push(`Bỏ qua lớp ${cls.class_code || cls.class_name}: level không thuộc N2–N5.`);
      return false;
    });
    if (!validClasses.length) throw new AppError(400, 'Không có lớp JLPT level N2–N5 phù hợp để export');

    const workbook = new ExcelJS.Workbook();
    const info = workbook.addWorksheet('Info');
    info.addRow(['Mã học viên', 'Họ và tên', 'Mã lớp', 'Giáo viên', 'Level']);
    const schedule = workbook.addWorksheet('Lịch');
    schedule.addRow(['Mã lớp', 'Buổi', 'Ngày', 'Giờ bắt đầu', 'Loại', 'Tên buổi']);
    const setting = workbook.addWorksheet('Setting');
    setting.addRow(['Template', 'Export year', 'Generated at']);
    setting.addRow(['GLOBAL', year, new Date()]);
    for (const cls of validClasses) {
      for (const ec of cls.enrollment_classes) info.addRow([ec.enrollment.student.external_id, ec.enrollment.student.full_name, cls.class_code || cls.class_name, cls.class_teachers[0]?.teacher.name || null, cls.level]);
      for (const session of cls.class_sessions) schedule.addRow([cls.class_code || cls.class_name, session.session_number, session.session_date, session.start_time, session.session_type, session.session_title]);
    }
    for (const level of ['N2', 'N3', 'N4', 'N5']) {
      const levelClasses = validClasses.filter((cls) => String(cls.level).toUpperCase() === level);
      if (!levelClasses.length) continue;
      const maxSessions = Math.max(...levelClasses.map((cls) => Math.max(0, ...cls.class_sessions.map((item) => item.session_number))));
      const headers: unknown[] = ['Index', 'Mã giáo viên', 'Mã lớp', 'Họ và tên', 'Tiêu chí'];
      for (let number = 1; number <= maxSessions; number += 1) {
        const metadata = levelClasses.flatMap((cls) => cls.class_sessions).find((item) => item.session_number === number);
        headers.push(metadata?.session_type === 'TEST' ? metadata.session_title || `KT${number}` : `Buổi ${number}`);
      }
      const sheet = workbook.addWorksheet(`NKHT ${level}`);
      sheet.addRow(headers);
      for (const cls of levelClasses) {
        const sessions = new Map(cls.class_sessions.map((item) => [item.session_number, item]));
        for (const ec of cls.enrollment_classes) {
          const attendance = new Map(ec.attendance.map((item) => [item.class_session_id, item]));
          const records = new Map(ec.jlpt_learning_records.map((item) => [item.class_session_id, item]));
          const criteria: Array<[string, (sessionId: number) => unknown]> = [
            ['Chuyên cần', (id) => exportAttendanceValue(attendance.get(id)?.teacher_status)],
            ['Chuẩn bị bài ở nhà', (id) => records.get(id)?.preparation_rating ?? null],
            ['Thái độ học tập trong lớp', (id) => records.get(id)?.attitude_rating ?? null],
            ['Điểm bài tập về nhà', (id) => { const value = records.get(id)?.homework_completed; return value === null || value === undefined ? null : value ? 'Có' : 'Không'; }],
            ['Điểm kiểm tra', (id) => records.get(id)?.test_correct_answers ?? null],
            ['Ghi chú', (id) => exportNoteValue(attendance.get(id)?.teacher_status, attendance.get(id)?.teacher_note)],
          ];
          criteria.forEach(([label, read], index) => {
            const row: unknown[] = [null, index === 0 ? cls.class_teachers[0]?.teacher.code || null : null, index === 0 ? cls.class_code || cls.class_name : null, index === 0 ? ec.enrollment.student.full_name : null, label];
            for (let number = 1; number <= maxSessions; number += 1) row.push(sessions.get(number) ? read(sessions.get(number)!.id) : null);
            sheet.addRow(row);
          });
        }
      }
      sheet.views = [{ state: 'frozen', xSplit: 5, ySplit: 1 }];
    }
    return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), warnings };
  }

  async listTasks(actor: AuthUser, filters: { page?: number; pageSize?: number; status?: string; issueType?: string; runId?: number; classId?: number }) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE')) throw new AppError(403, 'Cần quyền ADMIN hoặc MANAGE');
    const statuses = ['PENDING', 'RESOLVED', 'REJECTED'];
    const issueTypes = ['AMBIGUOUS_ABSENCE', 'SESSION_HEADER_MISMATCH'];
    if (filters.status && !statuses.includes(filters.status)) throw new AppError(400, 'status hàng chờ không hợp lệ');
    if (filters.issueType && !issueTypes.includes(filters.issueType)) throw new AppError(400, 'issue_type hàng chờ không hợp lệ');
    const accessible = await getAccessibleClassIds(actor);
    if (filters.classId && accessible !== null && !accessible.includes(filters.classId)) {
      throw new AppError(403, 'Lớp nằm ngoài phạm vi quản lý');
    }
    const page = Math.max(1, filters.page || 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25));
    const classScope = filters.classId
      ? { class_id: filters.classId }
      : accessible === null
        ? {}
        : { class_id: { in: accessible } };
    const where: Prisma.JlptNormalizationTaskWhereInput = {
      ...(filters.status ? { status: filters.status as any } : {}),
      ...(filters.issueType ? { issue_type: filters.issueType as any } : {}),
      ...(filters.runId ? { sync_run_item: { run_id: filters.runId } } : {}),
      ...classScope,
    };
    const [items, total] = await prisma.$transaction([
      prisma.jlptNormalizationTask.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.jlptNormalizationTask.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async resolveTask(taskId: number, input: { resolution_status?: JlptAbsenceResolution; session_type?: 'LESSON' | 'TEST'; session_title?: string | null; note?: string | null }, actor: AuthUser) {
    await this.assertTaskScope(taskId, actor);
    if (input.resolution_status && !['ABSENT_APPROVED_A', 'ABSENT_UNAPPROVED_C'].includes(input.resolution_status)) {
      throw new AppError(400, 'Trạng thái nghỉ không hợp lệ');
    }
    const transactionResult = await prisma.$transaction(async (tx) => {
      const task = await tx.jlptNormalizationTask.findUnique({ where: { id: taskId } });
      if (!task) throw new AppError(404, 'Không tìm thấy hàng chờ chuẩn hóa');
      if (task.status !== 'PENDING') throw new AppError(409, 'Hàng chờ không còn ở trạng thái PENDING');
      const downstream = new Map<number, AttendancePostCommitInput>();
      if (task.issue_type === 'AMBIGUOUS_ABSENCE') {
        if (!input.resolution_status || !task.enrollment_class_id || !task.class_session_id) throw new AppError(400, 'Cần chọn trạng thái nghỉ hợp lệ');
        const attendance = await tx.attendance.findUnique({ where: { enrollment_class_id_class_session_id: { enrollment_class_id: task.enrollment_class_id, class_session_id: task.class_session_id } } });
        const cell = { enrollmentClassId: task.enrollment_class_id, sessionId: task.class_session_id, currentAttendance: attendance } as ResolvedCell;
        const statusPostCommit = await this.applyField(tx, cell, 'teacher_status', input.resolution_status, actor.id, 'JLPT_NORMALIZATION_RESOLVED');
        if (statusPostCommit) this.collectPostCommit(downstream, statusPostCommit);
        const notePostCommit = await this.applyField(tx, cell, 'teacher_note', input.note ?? task.source_note ?? null, actor.id, 'JLPT_NORMALIZATION_RESOLVED');
        if (notePostCommit) this.collectPostCommit(downstream, notePostCommit);
      } else {
        if (!input.session_type || !task.class_session_id) throw new AppError(400, 'Cần loại buổi để xử lý header lệch');
        const before = await tx.classSession.findUnique({ where: { id: task.class_session_id } });
        if (!before) throw new AppError(409, 'ClassSession đích không còn tồn tại');
        const title = input.session_type === 'TEST' ? input.session_title?.trim() || null : null;
        if (input.session_type === 'TEST' && !title) throw new AppError(400, 'Buổi TEST bắt buộc có tên');
        if (title) {
          const duplicate = await tx.classSession.findFirst({
            where: { class_id: before.class_id, session_type: 'TEST', session_title: title, id: { not: before.id } },
            select: { id: true },
          });
          if (duplicate) throw new AppError(409, 'Tên buổi TEST không được trùng trong lớp');
        }
        const after = await tx.classSession.update({ where: { id: before.id }, data: { session_type: input.session_type, session_title: title } });
        await this.audit(tx, actor.id, 'JLPT_SESSION_HEADER_NORMALIZED', 'ClassSession', String(before.id), before, after);
      }
      const updated = await tx.jlptNormalizationTask.update({ where: { id: taskId }, data: { status: 'RESOLVED', pending_key: null, resolution: jsonValue(input), resolved_by_id: actor.id, resolved_at: new Date() } });
      await this.audit(tx, actor.id, 'JLPT_NORMALIZATION_TASK_RESOLVED', 'JlptNormalizationTask', String(taskId), task, updated);
      return { updated, downstream: [...downstream.values()] };
    });
    await this.runPostCommit(transactionResult.downstream);
    return transactionResult.updated;
  }

  async rejectTask(taskId: number, reason: string, actor: AuthUser) {
    await this.assertTaskScope(taskId, actor);
    if (!reason.trim()) throw new AppError(400, 'Lý do từ chối là bắt buộc');
    return prisma.$transaction(async (tx) => {
      const task = await tx.jlptNormalizationTask.findUnique({ where: { id: taskId } });
      if (!task) throw new AppError(404, 'Không tìm thấy hàng chờ chuẩn hóa');
      if (task.status !== 'PENDING') throw new AppError(409, 'Hàng chờ không còn ở trạng thái PENDING');
      const updated = await tx.jlptNormalizationTask.update({ where: { id: taskId }, data: { status: 'REJECTED', pending_key: null, resolution: jsonValue({ reason: reason.trim() }), resolved_by_id: actor.id, resolved_at: new Date() } });
      await this.audit(tx, actor.id, 'JLPT_NORMALIZATION_TASK_REJECTED', 'JlptNormalizationTask', String(taskId), task, updated);
      return updated;
    });
  }

  async syncAbsolute(buffer: Buffer, targetYear: number, actorId: number, syncRunItemId?: number) {
    const preview = await this.buildPreview(buffer, targetYear);
    if (preview.errors.length) throw new AppError(409, preview.errors.join('; '));
    const transactionResult = await prisma.$transaction(async (tx) => {
      let updatedFields = 0;
      let taskCount = 0;
      const downstream = new Map<number, AttendancePostCommitInput>();
      for (const cell of preview.cells) {
        const ambiguous = preview.issues.find((item) => item.issue_type === 'AMBIGUOUS_ABSENCE' && item.enrollment_class_id === cell.enrollmentClassId && item.class_session_id === cell.sessionId);
        for (const field of this.sourceFields(cell, 'ABSOLUTE_SYNC')) {
          if (field.field === 'teacher_status' && ambiguous) continue;
          if (sameValue(field.before, field.after)) continue;
          const postCommit = await this.applyField(tx, cell, field.field, field.after, actorId, 'JLPT_GOOGLE_SHEET_SYNC');
          if (postCommit) this.collectPostCommit(downstream, postCommit);
          updatedFields += 1;
        }
        if (ambiguous) {
          const taskCreated = await this.upsertPendingTask(tx, {
            issueType: 'AMBIGUOUS_ABSENCE',
            syncRunItemId,
            classId: cell.classId,
            enrollmentClassId: cell.enrollmentClassId,
            classSessionId: cell.sessionId,
            rawPayload: { raw_attendance: cell.value.rawAttendance, sheet: cell.block.sheetName, row: cell.block.rowNumber },
            sourceNote: cell.value.sourceNote,
          });
          if (taskCreated) taskCount += 1;
        }
      }
      for (const issue of preview.issues.filter((item) => item.issue_type === 'SESSION_HEADER_MISMATCH')) {
        const taskCreated = await this.upsertPendingTask(tx, {
          issueType: 'SESSION_HEADER_MISMATCH',
          syncRunItemId,
          classId: issue.class_id,
          classSessionId: issue.class_session_id,
          rawPayload: { source_header: issue.source_header, session_number: issue.session_number },
          proposedMetadata: issue.proposed_metadata,
        });
        if (taskCreated) taskCount += 1;
      }
      return { result: { updatedFields, taskCount, totalCells: preview.cells.length }, downstream: [...downstream.values()] };
    });
    await this.runPostCommit(transactionResult.downstream);
    return transactionResult.result;
  }

  private async upsertPendingTask(
    tx: Prisma.TransactionClient,
    input: {
      issueType: 'AMBIGUOUS_ABSENCE' | 'SESSION_HEADER_MISMATCH';
      syncRunItemId?: number;
      classId?: number;
      enrollmentClassId?: number;
      classSessionId?: number;
      rawPayload: unknown;
      sourceNote?: string | null;
      proposedMetadata?: unknown;
    },
  ) {
    const pendingKey = [
      'GOOGLE_SHEET_SYNC',
      input.issueType,
      input.classId ?? 0,
      input.enrollmentClassId ?? 0,
      input.classSessionId ?? 0,
    ].join(':');
    const identity = {
      source_type: 'GOOGLE_SHEET_SYNC' as const,
      issue_type: input.issueType,
      status: 'PENDING' as const,
      pending_key: pendingKey,
      class_id: input.classId ?? null,
      enrollment_class_id: input.enrollmentClassId ?? null,
      class_session_id: input.classSessionId ?? null,
    };
    const existing = await tx.jlptNormalizationTask.findUnique({ where: { pending_key: pendingKey }, select: { id: true } });
    const data = {
      sync_run_item_id: input.syncRunItemId,
      raw_payload: jsonValue(input.rawPayload),
      source_note: input.sourceNote ?? null,
      proposed_metadata: input.proposedMetadata === undefined ? Prisma.DbNull : jsonValue(input.proposedMetadata),
    };
    if (existing) {
      await tx.jlptNormalizationTask.update({ where: { id: existing.id }, data });
      return false;
    }
    try {
      await tx.jlptNormalizationTask.create({ data: { ...identity, ...data } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await tx.jlptNormalizationTask.findUnique({ where: { pending_key: pendingKey }, select: { id: true } });
        if (concurrent) {
          await tx.jlptNormalizationTask.update({ where: { id: concurrent.id }, data });
          return false;
        }
      }
      throw error;
    }
  }

  private collectPostCommit(entries: Map<number, AttendancePostCommitInput>, entry: AttendancePostCommitInput) {
    const existing = entries.get(entry.attendanceId);
    entries.set(entry.attendanceId, {
      ...existing,
      ...entry,
      invalidatePendingDeliveries: existing?.invalidatePendingDeliveries === true || entry.invalidatePendingDeliveries === true,
    });
  }

  private async runPostCommit(entries: AttendancePostCommitInput[]) {
    for (const entry of entries) await runAttendancePostCommit(entry);
  }

  private async assertTaskScope(taskId: number, actor: AuthUser) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE')) throw new AppError(403, 'Cần quyền ADMIN hoặc MANAGE');
    const task = await prisma.jlptNormalizationTask.findUnique({ where: { id: taskId }, select: { class_id: true } });
    if (!task) throw new AppError(404, 'Không tìm thấy hàng chờ chuẩn hóa');
    if (actor.roles.includes('ADMIN')) return;
    const accessible = await getAccessibleClassIds(actor);
    if (task.class_id === null || accessible === null || !accessible.includes(task.class_id)) throw new AppError(403, 'Hàng chờ nằm ngoài phạm vi quản lý');
  }

  private conflictId(cell: ResolvedCell, field: SourceField) { return `conflict:${cell.classId}:${cell.enrollmentClassId}:${cell.sessionId}:${field}`; }
  private cleanupCache() { const now = Date.now(); for (const [key, value] of previewCache) if (now - value.createdAt > CACHE_TTL_MS) previewCache.delete(key); }
  private audit(tx: Prisma.TransactionClient, actorId: number, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
    return tx.auditLog.create({ data: { user_id: actorId, action, entity_type: entityType, entity_id: entityId, before_data: before === null ? Prisma.DbNull : jsonValue(before), after_data: after === null ? Prisma.DbNull : jsonValue(after) } });
  }
}
