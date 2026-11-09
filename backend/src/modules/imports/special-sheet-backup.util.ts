/**
 * special-sheet-backup.util.ts
 * -----------------------------------------------------------------------------
 * Xây dựng các Sheet chuyên biệt cho hệ thống Backup:
 *  1. Sheet `Báo cáo học tập Kaiwa` (61 cột phẳng hóa - Lưu hàng nghìn HV)
 *  2. Sheet `Chuyên cần HV` (24 cột A..X cho JLPT) + `Nhật ký nhận xét buổi học`
 *  3. Sheet `Tổng hợp Đối soát` & `Thống kê Lệch & Chờ duyệt` (32 cột)
 * -----------------------------------------------------------------------------
 */

import ExcelJS from 'exceljs';
import { AttendanceStatus, ReconciliationState } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { isConsumedAttendance } from '../enrollments/enrollment-entitlement';
import {
  colNumberToLetter,
  dateKeyUtc,
  GoogleSafeValue,
  normalizeCellComparable,
  toGoogleSafeValue,
} from './attendance-sheet.util';
import {
  KAIWA_STUDY_REPORT_GROUPS,
  KAIWA_STUDY_REPORT_HEADERS,
  JLPT_CHUYEN_CAN_HEADERS,
  JLPT_DAILY_REPORT_HEADERS,
  RECONCILIATION_HEADERS,
} from '../../scripts/generate-backup-templates';
import {
  cleanJlptClassCode,
  deriveJlptCourseTrack,
  JLPT_EXAM_SCHEDULE_CONFIG,
  JlptCourseTrack,
} from '../students/jlpt-attendance-report.util';

export interface SpecialSheetStats {
  sheetName: string;
  totalEnrollments: number;
  unchangedRows: number;
  updatedRows: number;
  appendedRows: number;
  updatedCellsCount: number;
}

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  STUDYING: 'Đang học',
  WAITING_CLASS: 'Chờ lớp',
  PAUSED: 'Bảo lưu',
  FINISHED: 'Kết thúc',
  UPCOMING: 'Sắp học',
  NOT_STARTED: 'Chưa học',
  CANCELLED: 'Đã hủy',
};

function fmtDate(val: unknown): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDateTime(val: unknown): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function statusToCode(status?: AttendanceStatus | null): string {
  switch (status) {
    case AttendanceStatus.ATTENDED:
      return '1';
    case AttendanceStatus.ABSENT_APPROVED_A:
      return 'A';
    case AttendanceStatus.LEAVE_B:
      return 'B';
    case AttendanceStatus.ABSENT_UNAPPROVED_C:
      return 'C';
    case AttendanceStatus.TEACHER_ABSENT_D:
      return 'D';
    case AttendanceStatus.TECH_ERROR_E:
      return 'E';
    default:
      return '';
  }
}

function statusToVietnameseLabel(status?: AttendanceStatus | null): string {
  switch (status) {
    case AttendanceStatus.ATTENDED:
      return '1 · Có mặt';
    case AttendanceStatus.ABSENT_APPROVED_A:
      return 'A · Nghỉ phép';
    case AttendanceStatus.LEAVE_B:
      return 'B · Bảo lưu';
    case AttendanceStatus.ABSENT_UNAPPROVED_C:
      return 'C · Nghỉ sai QĐ';
    case AttendanceStatus.TEACHER_ABSENT_D:
      return 'D · GV nghỉ';
    case AttendanceStatus.TECH_ERROR_E:
      return 'E · Lỗi kỹ thuật';
    default:
      return 'Chưa chấm';
  }
}

function reconciliationStateLabel(state?: ReconciliationState | null): string {
  switch (state) {
    case ReconciliationState.MATCHED:
      return 'MATCHED (Khớp)';
    case ReconciliationState.RESOLVED:
      return 'RESOLVED (Đã phân xử)';
    case ReconciliationState.CONFLICT:
      return 'CONFLICT (Đang lệch)';
    case ReconciliationState.PENDING_CS:
      return 'PENDING_CS (Chờ CSKH)';
    case ReconciliationState.PENDING_TEACHER:
      return 'PENDING_TEACHER (Chờ GV)';
    default:
      return String(state || '');
  }
}

function ensureSheetWithHeaders(
  wb: ExcelJS.Workbook,
  sheetName: string,
  headers: string[],
  headerRow = 2,
  groupHeaders?: Array<{ title: string; span: number }>,
  bannerTitle?: string
): ExcelJS.Worksheet {
  let ws = wb.getWorksheet(sheetName);
  if (!ws) {
    ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 2, ySplit: headerRow }],
    });
  }

  if (groupHeaders && headerRow >= 2) {
    const gRow = ws.getRow(headerRow - 1);
    let col = 1;
    for (const g of groupHeaders) {
      gRow.getCell(col).value = g.title;
      col += g.span;
    }
    gRow.font = { bold: true, size: 10 };
  } else if (bannerTitle && headerRow >= 2) {
    const bRow = ws.getRow(1);
    bRow.getCell(1).value = bannerTitle;
    bRow.font = { bold: true, size: 11 };
  }

  const hRow = ws.getRow(headerRow);
  headers.forEach((h, i) => {
    const c = i + 1;
    hRow.getCell(c).value = h;
    if (!ws!.getColumn(c).width) {
      ws!.getColumn(c).width = Math.max(14, Math.min(32, h.length + 4));
    }
  });
  hRow.font = { bold: true, size: 10 };

  return ws;
}

function writeRowsAndCollectDelta(
  ws: ExcelJS.Worksheet,
  headerRow: number,
  maxCol: number,
  keyColIndex: number,
  desiredRows: Array<{ key: string; values: Array<string | number> }>,
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
  headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>
): SpecialSheetStats {
  // Capture header range
  const hRows: GoogleSafeValue[][] = [];
  for (let r = 1; r <= headerRow; r++) {
    const vals: GoogleSafeValue[] = [];
    const row = ws.getRow(r);
    for (let c = 1; c <= maxCol; c++) vals.push(toGoogleSafeValue(row.getCell(c).value));
    hRows.push(vals);
  }
  headerRangesBySheet.set(ws.name, [
    {
      range: `'${ws.name}'!A1:${colNumberToLetter(maxCol)}${headerRow}`,
      values: hRows,
    },
  ]);

  // Index existing rows
  const existingByKey = new Map<string, number>();
  let lastRow = headerRow;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const keyVal = normalizeCellComparable(ws.getRow(r).getCell(keyColIndex).value).toUpperCase();
    if (!keyVal) continue;
    lastRow = r;
    if (!existingByKey.has(keyVal)) existingByKey.set(keyVal, r);
  }

  let unchangedRows = 0;
  let updatedRows = 0;
  let appendedRows = 0;
  let updatedCellsCount = 0;

  for (const item of desiredRows) {
    const normKey = item.key.trim().toUpperCase();
    let targetRow = existingByKey.get(normKey);
    let isNew = false;
    if (targetRow === undefined) {
      targetRow = ++lastRow;
      isNew = true;
      existingByKey.set(normKey, targetRow);
    }

    const row = ws.getRow(targetRow);
    let rowChanged = 0;

    for (let c = 1; c <= maxCol; c++) {
      const desiredVal = item.values[c - 1] ?? '';
      const desiredStr = normalizeCellComparable(desiredVal);
      const cell = row.getCell(c);
      const currentStr = normalizeCellComparable(cell.value);
      if (currentStr === desiredStr) continue;
      cell.value = desiredVal as any;
      rowChanged++;
    }

    if (isNew) appendedRows++;
    else if (rowChanged > 0) updatedRows++;
    else unchangedRows++;

    updatedCellsCount += rowChanged;

    if (rowChanged > 0) {
      const safeRow: GoogleSafeValue[] = [];
      for (let c = 1; c <= maxCol; c++) safeRow.push(toGoogleSafeValue(row.getCell(c).value));
      batchRanges.push({
        range: `'${ws.name}'!A${targetRow}:${colNumberToLetter(maxCol)}${targetRow}`,
        values: [safeRow],
      });
    }
  }

  return {
    sheetName: ws.name,
    totalEnrollments: desiredRows.length,
    unchangedRows,
    updatedRows,
    appendedRows,
    updatedCellsCount,
  };
}

/* ============================================================================
 * 1. BÁO CÁO HỌC TẬP KAIWA (61 CỘT PHẲNG HÓA)
 * ============================================================================ */

export function writeKaiwaStudyReportSheet(
  wb: ExcelJS.Workbook,
  enrollments: any[],
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
  headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>,
  sheetName = 'Báo cáo học tập Kaiwa'
): SpecialSheetStats {
  const ws = ensureSheetWithHeaders(
    wb,
    sheetName,
    KAIWA_STUDY_REPORT_HEADERS,
    2,
    KAIWA_STUDY_REPORT_GROUPS
  );

  const desiredRows: Array<{ key: string; values: Array<string | number> }> = [];

  for (const enr of enrollments) {
    const student = enr.student || {};
    const externalId = String(student.external_id || enr.external_id || `HV_${student.id || enr.id}`).trim();
    const activeEc =
      (enr.enrollment_classes || []).find((ec: any) => ec.status === 'ACTIVE') ||
      (enr.enrollment_classes || [])[(enr.enrollment_classes || []).length - 1] ||
      null;
    const cls = activeEc?.class || null;
    const mainCt =
      cls?.class_teachers?.find((ct: any) => ct.role === 'MAIN' && ct.active) ||
      cls?.class_teachers?.[0] ||
      null;
    const teacher = mainCt?.teacher || null;
    const csStaffCode = enr.cs?.staff_code || '';

    const meta = (enr.program_metadata && typeof enr.program_metadata === 'object' ? enr.program_metadata : {}) as Record<string, any>;
    const sr = (meta.study_report && typeof meta.study_report === 'object' ? meta.study_report : {}) as Record<string, any>;

    const s1 = sr.session_1 || {};
    const s3 = sr.session_3 || {};
    const b1 = sr.sessions_1_10 || {};
    const b2 = sr.sessions_11_20 || {};
    const b3 = sr.sessions_21_30 || {};
    const mid = sr.midterm || {};
    const fin = sr.final_exam || {};

    const stageCols = (b: any): Array<string | number> => [
      b.date_range || '',
      b.absent_excused || '',
      b.absent_unexcused || '',
      b.teacher_absent || '',
      b.preparation || '',
      b.homework_completed ?? b.homework_completion ?? '',
      b.interaction || '',
      b.comprehension || '',
      b.strengths ?? b.strengths_progress ?? '',
      b.weaknesses || '',
      b.additional_notes ?? b.additional_comments ?? '',
    ];

    const examCols = (ex: any): Array<string | number> => [
      ex.vocabulary || '',
      ex.grammar || '',
      ex.intonation ?? ex.pronunciation ?? '',
      ex.fluency || '',
      ex.score ?? ex.total_score ?? '',
      ex.additional_notes ?? ex.additional_comments ?? '',
    ];

    const values: Array<string | number> = [
      externalId,
      student.full_name || '',
      cls?.class_code || cls?.class_name || '',
      enr.package?.code || '',
      enr.level || '',
      teacher?.code || '',
      teacher?.name || '',
      csStaffCode,
      ENROLLMENT_STATUS_LABELS[String(enr.status || '').toUpperCase()] || 'Đang học',
      sr.exchange_with_student || enr.exchange_info || '',
      // Buổi 1
      s1.preparation || '',
      s1.interaction || '',
      s1.comprehension || '',
      // Buổi 3
      s3.preparation || '',
      s3.interaction || '',
      s3.comprehension || '',
      // Chặng 1-10, 11-20, 21-30
      ...stageCols(b1),
      ...stageCols(b2),
      ...stageCols(b3),
      // Giữa kỳ & Cuối kỳ
      ...examCols(mid),
      ...examCols(fin),
    ];

    desiredRows.push({
      key: `${externalId}::${cls?.class_code || enr.package?.code || enr.id}`,
      values,
    });
  }

  return writeRowsAndCollectDelta(
    ws,
    2,
    KAIWA_STUDY_REPORT_HEADERS.length,
    1,
    desiredRows,
    batchRanges,
    headerRangesBySheet
  );
}

/* ============================================================================
 * 2. BÁO CÁO CHUYÊN CẦN HỌC VIÊN JLPT (24 CỘT A..X) + NHẬT KÝ NHẬN XÉT
 * ============================================================================ */

export function writeJlptChuyenCanSheet(
  wb: ExcelJS.Workbook,
  enrollments: any[],
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
  headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>,
  sheetName = 'Chuyên cần HV'
): SpecialSheetStats {
  const ws = ensureSheetWithHeaders(
    wb,
    sheetName,
    JLPT_CHUYEN_CAN_HEADERS,
    2,
    undefined,
    'BÁO CÁO HỌC TẬP & CHUYÊN CẦN HỌC VIÊN JLPT (CHUẨN A -> X)'
  );

  const desiredRows: Array<{ key: string; values: Array<string | number> }> = [];

  for (const enr of enrollments) {
    const student = enr.student || {};
    const externalId = String(student.external_id || enr.external_id || `HV_${student.id || enr.id}`).trim();
    const activeEc =
      (enr.enrollment_classes || []).find((ec: any) => ec.status === 'ACTIVE') ||
      (enr.enrollment_classes || [])[(enr.enrollment_classes || []).length - 1] ||
      null;
    const cls = activeEc?.class || null;
    const mainCt =
      cls?.class_teachers?.find((ct: any) => ct.role === 'MAIN' && ct.active) ||
      cls?.class_teachers?.[0] ||
      null;
    const teacher = mainCt?.teacher || null;
    const csStaffCode = enr.cs?.staff_code || '';

    const meta = (enr.program_metadata && typeof enr.program_metadata === 'object' ? enr.program_metadata : {}) as Record<string, any>;
    const overrides = (meta.jlpt_chuyen_can_overrides && typeof meta.jlpt_chuyen_can_overrides === 'object'
      ? meta.jlpt_chuyen_can_overrides
      : {}) as Record<string, any>;

    // Đếm chuyên cần từ attendance
    let attendedCount = 0;
    let totalMarked = 0;
    let maxConsecAbsent = 0;
    let curConsecAbsent = 0;

    const allAtts: any[] = [];
    for (const ec of enr.enrollment_classes || []) {
      for (const att of ec.attendance || []) {
        if (!att.deleted_at) allAtts.push(att);
      }
    }
    allAtts.sort((a, b) => {
      const da = dateKeyUtc(a.class_session?.session_date);
      const db = dateKeyUtc(b.class_session?.session_date);
      return da.localeCompare(db);
    });

    for (const att of allAtts) {
      totalMarked++;
      if (att.status === AttendanceStatus.ATTENDED) {
        attendedCount++;
        curConsecAbsent = 0;
      } else if (
        att.status === AttendanceStatus.ABSENT_APPROVED_A ||
        att.status === AttendanceStatus.ABSENT_UNAPPROVED_C
      ) {
        curConsecAbsent++;
        if (curConsecAbsent > maxConsecAbsent) maxConsecAbsent = curConsecAbsent;
      }
    }

    const effAttended =
      overrides.attended_sessions !== undefined && overrides.attended_sessions !== null
        ? Number(overrides.attended_sessions)
        : attendedCount;
    const effTotalMarked =
      overrides.total_marked_sessions !== undefined && overrides.total_marked_sessions !== null
        ? Number(overrides.total_marked_sessions)
        : totalMarked;
    const ratePct =
      effTotalMarked > 0 ? `${Math.round((effAttended / effTotalMarked) * 100)}%` : '—';

    // Điểm KT trung bình từ test_scores
    const testScores = (meta.test_scores && typeof meta.test_scores === 'object' ? meta.test_scores : {}) as Record<string, any>;
    const numericScores = Object.values(testScores)
      .map((v) => Number(String(v).replace(/[^\d.]/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgScore =
      overrides.average_exam_score !== undefined && overrides.average_exam_score !== null
        ? Number(overrides.average_exam_score)
        : numericScores.length > 0
          ? Math.round((numericScores.reduce((a, b) => a + b, 0) / numericScores.length) * 10) / 10
          : '';

    const hwCompleted =
      overrides.homework_completed_sessions !== undefined && overrides.homework_completed_sessions !== null
        ? Number(overrides.homework_completed_sessions)
        : effAttended;
    const effConsecAbsent =
      overrides.max_consecutive_absent !== undefined && overrides.max_consecutive_absent !== null
        ? Number(overrides.max_consecutive_absent)
        : maxConsecAbsent;
    const effConsecNoHw =
      overrides.max_consecutive_no_homework !== undefined && overrides.max_consecutive_no_homework !== null
        ? Number(overrides.max_consecutive_no_homework)
        : 0;

    const absentWarn = effConsecAbsent >= 2 ? `⚠ Vắng liên tiếp ${effConsecAbsent} buổi` : 'Bình thường';
    const noHwWarn = effConsecNoHw >= 2 ? `⚠ Không làm BTVN ${effConsecNoHw} buổi` : 'Bình thường';

    const classCodeClean = cleanJlptClassCode(cls?.class_code || cls?.class_name || meta.latest_class_code);
    const courseTrack = deriveJlptCourseTrack(
      classCodeClean,
      enr.package?.code,
      enr.level,
      meta.course_track
    );

    const scheduleItems = JLPT_EXAM_SCHEDULE_CONFIG.filter(
      (it) => it.course_track === (courseTrack as JlptCourseTrack)
    );
    const pastExams = scheduleItems.filter((it) => it.session <= effTotalMarked);
    const lastExam = pastExams[pastExams.length - 1] || null;
    const nextExam = scheduleItems.find((it) => it.session > effTotalMarked) || null;

    const sinceLast = lastExam ? Math.max(0, effTotalMarked - lastExam.session) : '';
    const untilNext = nextExam ? Math.max(0, nextExam.session - effTotalMarked) : '';

    let examScheduleWarn = '✅ Đầy đủ';
    if (nextExam && typeof untilNext === 'number' && untilNext <= 2) {
      examScheduleWarn = `🔔 Sắp kiểm tra ${nextExam.milestone} (còn ${untilNext}b)`;
    } else if (lastExam && numericScores.length < pastExams.length) {
      examScheduleWarn = `❗ Chưa nhập điểm ${lastExam.milestone}`;
    }

    const values: Array<string | number> = [
      classCodeClean || cls?.class_name || '', // 1 - A
      student.full_name || '', // 2 - B
      effAttended, // 3 - C
      effTotalMarked, // 4 - D
      ratePct, // 5 - E
      avgScore, // 6 - F
      hwCompleted, // 7 - G
      effConsecAbsent, // 8 - H
      absentWarn, // 9 - I
      effConsecNoHw, // 10 - J
      noHwWarn, // 11 - K
      enr.exchange_info || '', // 12 - L
      ENROLLMENT_STATUS_LABELS[String(enr.status || '').toUpperCase()] || 'Đang học', // 13 - M
      csStaffCode, // 14 - N
      courseTrack, // 15 - O
      lastExam ? `${lastExam.milestone} - ${lastExam.title}` : '—', // 16 - P
      lastExam ? lastExam.session : '', // 17 - Q
      sinceLast, // 18 - R
      nextExam ? `${nextExam.milestone} - ${nextExam.title}` : '—', // 19 - S
      nextExam ? nextExam.session : '', // 20 - T
      untilNext, // 21 - U
      examScheduleWarn, // 22 - V
      externalId, // 23 - W (ID Học viên)
      teacher?.code || '', // 24 - X (Mã GV)
    ];

    desiredRows.push({
      key: externalId,
      values,
    });
  }

  return writeRowsAndCollectDelta(
    ws,
    2,
    JLPT_CHUYEN_CAN_HEADERS.length,
    23, // Cột 23 (W) là ID Học viên
    desiredRows,
    batchRanges,
    headerRangesBySheet
  );
}

export function writeJlptDailyReportSheet(
  wb: ExcelJS.Workbook,
  enrollments: any[],
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
  headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>,
  sheetName = 'Nhật ký nhận xét buổi học'
): SpecialSheetStats {
  const ws = ensureSheetWithHeaders(
    wb,
    sheetName,
    JLPT_DAILY_REPORT_HEADERS,
    2,
    undefined,
    'NHẬT KÝ NHẬN XÉT BUỔI HỌC JLPT THEO NGÀY'
  );

  const desiredRows: Array<{ key: string; values: Array<string | number> }> = [];

  for (const enr of enrollments) {
    const student = enr.student || {};
    const externalId = String(student.external_id || enr.external_id || `HV_${student.id || enr.id}`).trim();
    const activeEc =
      (enr.enrollment_classes || []).find((ec: any) => ec.status === 'ACTIVE') ||
      (enr.enrollment_classes || [])[(enr.enrollment_classes || []).length - 1] ||
      null;
    const cls = activeEc?.class || null;
    const mainCt =
      cls?.class_teachers?.find((ct: any) => ct.role === 'MAIN' && ct.active) ||
      cls?.class_teachers?.[0] ||
      null;
    const teacher = mainCt?.teacher || null;
    const csStaffCode = enr.cs?.staff_code || '';

    const meta = (enr.program_metadata && typeof enr.program_metadata === 'object' ? enr.program_metadata : {}) as Record<string, any>;
    const sr = (meta.study_report && typeof meta.study_report === 'object' ? meta.study_report : {}) as Record<string, any>;
    const dailyReports: any[] = Array.isArray(sr.jlpt_daily_reports) ? sr.jlpt_daily_reports : [];

    dailyReports.forEach((item, idx) => {
      const dateStr = String(item?.date || item?.dateLabel || `Buổi ${idx + 1}`).trim();
      const noteStr = String(item?.summary_note || item?.comment || '').trim();
      if (!noteStr) return;
      desiredRows.push({
        key: `${externalId}::${dateStr}::${idx + 1}`,
        values: [
          externalId,
          student.full_name || '',
          cls?.class_code || cls?.class_name || '',
          enr.level || enr.package?.code || 'JLPT',
          teacher?.code || '',
          csStaffCode,
          idx + 1,
          dateStr,
          'O',
          '',
          '',
          noteStr,
        ],
      });
    });
  }

  return writeRowsAndCollectDelta(
    ws,
    2,
    JLPT_DAILY_REPORT_HEADERS.length,
    1,
    desiredRows,
    batchRanges,
    headerRangesBySheet
  );
}

/* ============================================================================
 * 3. SỔ ĐỐI SOÁT ĐIỂM DANH TỔNG HỢP (ADMIN RECONCILIATION - 32 CỘT)
 * ============================================================================ */

export async function writeAdminReconciliationWorkbookSheets(
  wb: ExcelJS.Workbook,
  yearFilter: number | null,
  batchRanges: Array<{ range: string; values: GoogleSafeValue[][] }>,
  headerRangesBySheet: Map<string, Array<{ range: string; values: GoogleSafeValue[][] }>>
): Promise<{
  allStats: SpecialSheetStats;
  conflictStats: SpecialSheetStats;
  totalRecords: number;
}> {
  const attendances = await prisma.attendance.findMany({
    where: { deleted_at: null },
    include: {
      class_session: true,
      resolved_by: { select: { id: true, name: true, email: true } },
      enrollment_class: {
        include: {
          class: {
            include: {
              class_teachers: { include: { teacher: true }, orderBy: { id: 'asc' } },
              class_schedules: { orderBy: { id: 'asc' } },
            },
          },
          enrollment: {
            include: {
              student: true,
              package: true,
              cs: { select: { id: true, name: true, staff_code: true } },
            },
          },
        },
      },
    },
    orderBy: [{ id: 'desc' }],
    take: 10000,
  });

  const allRows: Array<{ key: string; values: Array<string | number> }> = [];
  const conflictRows: Array<{ key: string; values: Array<string | number> }> = [];

  for (const att of attendances) {
    const sessionDateStr = fmtDate(att.class_session?.session_date);
    const y = sessionDateStr ? Number(sessionDateStr.slice(0, 4)) : new Date().getFullYear();
    const m = sessionDateStr ? Number(sessionDateStr.slice(5, 7)) : 1;
    if (yearFilter !== null && y !== yearFilter) continue;

    const ec = att.enrollment_class;
    const enr = ec?.enrollment;
    const student = enr?.student;
    const cls = ec?.class;
    const schedule = cls?.class_schedules?.find((s: any) => s.active) || cls?.class_schedules?.[0] || null;
    const mainCt =
      cls?.class_teachers?.find((ct: any) => ct.role === 'MAIN' && ct.active) ||
      cls?.class_teachers?.[0] ||
      null;
    const teacher = mainCt?.teacher || null;

    const externalId = String(student?.external_id || enr?.external_id || `HV_${student?.id || ''}`).trim();
    const sessionCode = `SS-${y}-${att.class_session_id || att.id}`;
    const consumed = isConsumedAttendance(att);

    const rowValues: Array<string | number> = [
      sessionCode, // 1
      y, // 2
      m, // 3
      sessionDateStr, // 4
      att.class_session?.start_time || schedule?.start_time || '', // 5
      enr?.program_type || 'KAIWA', // 6
      enr?.class_model || String(cls?.model_type || '1-1'), // 7
      cls?.class_code || cls?.class_name || '', // 8
      cls?.class_name || cls?.class_code || '', // 9
      att.class_session?.session_number || '', // 10
      externalId, // 11
      student?.full_name || '', // 12
      enr?.package?.code || '', // 13
      teacher?.code || '', // 14
      teacher?.name || '', // 15
      enr?.cs?.staff_code || '', // 16
      enr?.cs?.name || '', // 17
      statusToVietnameseLabel(att.teacher_status), // 18
      att.teacher_raw_value || att.lesson_topic || '', // 19
      att.teacher_note || '', // 20
      fmtDateTime(att.teacher_submitted_at), // 21
      statusToVietnameseLabel(att.cs_status), // 22
      att.cs_raw_value || statusToCode(att.cs_status), // 23
      att.cs_note || '', // 24
      fmtDateTime(att.cs_submitted_at), // 25
      reconciliationStateLabel(att.reconciliation_state), // 26
      statusToVietnameseLabel(att.status), // 27
      statusToCode(att.status), // 28
      consumed ? 'Có (-1 buổi)' : 'Không', // 29
      att.resolved_by?.name || att.resolved_by?.email || '', // 30
      fmtDateTime(att.resolved_at), // 31
      att.resolution_note || '', // 32
    ];

    const key = `${sessionCode}::${externalId}`;
    allRows.push({ key, values: rowValues });

    if (
      att.reconciliation_state === ReconciliationState.CONFLICT ||
      att.reconciliation_state === ReconciliationState.PENDING_CS ||
      att.reconciliation_state === ReconciliationState.PENDING_TEACHER
    ) {
      conflictRows.push({ key, values: rowValues });
    }
  }

  const wsAll = ensureSheetWithHeaders(
    wb,
    'Tổng hợp Đối soát',
    RECONCILIATION_HEADERS,
    2,
    undefined,
    'SỔ ĐỐI SOÁT ĐIỂM DANH TỔNG HỢP (CSKH vs GIÁO VIÊN)'
  );
  const wsConflict = ensureSheetWithHeaders(
    wb,
    'Thống kê Lệch & Chờ duyệt',
    RECONCILIATION_HEADERS,
    2,
    undefined,
    'DANH SÁCH BUỔI HỌC ĐANG LỆCH (CONFLICT) HOẶC CHỜ CHẤM (PENDING)'
  );

  const allStats = writeRowsAndCollectDelta(
    wsAll,
    2,
    RECONCILIATION_HEADERS.length,
    1,
    allRows,
    batchRanges,
    headerRangesBySheet
  );
  const conflictStats = writeRowsAndCollectDelta(
    wsConflict,
    2,
    RECONCILIATION_HEADERS.length,
    1,
    conflictRows,
    batchRanges,
    headerRangesBySheet
  );

  return {
    allStats,
    conflictStats,
    totalRecords: allRows.length,
  };
}
