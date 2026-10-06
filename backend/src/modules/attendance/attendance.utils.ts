import { AttendanceStatus } from '@prisma/client';

export interface ParsedAttendance {
  status: AttendanceStatus | null;
  sessionCount: number;
  lessonTopic: string | null;
  studentExternalId?: string;
}

/**
 * Parses raw cell value from Teacher or CSKH attendance sheet.
 * Supports:
 * - [Mã HV]-[Tên bài / Mã A,B,C,D,E] (e.g. "420289324-K2 L4", "420289324-A")
 * - Single codes: A, B, C, D, E, X, ĐÃ HỌC
 * - Numeric session counts: 1.0, 2.0, 0.5
 * - Direct lesson topic string fallback: "K2 L4"
 */
export function parseAttendanceValue(value: string | number | null | undefined): ParsedAttendance {
  if (value === null || value === undefined) {
    return { status: null, sessionCount: 1, lessonTopic: null };
  }

  const str = String(value).trim();
  if (!str) {
    return { status: null, sessionCount: 1, lessonTopic: null };
  }

  // 1. Check if format is [Mã HV]-[Tên bài / Mã A,B,C,D,E] (e.g. 420289324-K2 L4, HV_001-A)
  const match = str.match(/^([A-Za-z0-9_]+)\s*[-]\s*(.+)$/i);
  if (match) {
    const studentExternalId = match[1];
    const remainder = match[2].trim();
    const codeUpper = remainder.toUpperCase();

    if (codeUpper === 'A') {
      return { status: AttendanceStatus.ABSENT_APPROVED_A, sessionCount: 1, lessonTopic: null, studentExternalId };
    }
    if (codeUpper === 'B') {
      return { status: AttendanceStatus.LEAVE_B, sessionCount: 1, lessonTopic: null, studentExternalId };
    }
    if (codeUpper === 'C') {
      return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, sessionCount: 1, lessonTopic: null, studentExternalId };
    }
    if (codeUpper === 'D') {
      return { status: AttendanceStatus.TEACHER_ABSENT_D, sessionCount: 1, lessonTopic: null, studentExternalId };
    }
    if (codeUpper === 'E') {
      return { status: AttendanceStatus.TECH_ERROR_E, sessionCount: 1, lessonTopic: null, studentExternalId };
    }

    // Remainder is lesson topic (e.g. "K2 L4", "k1-l1")
    return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: remainder, studentExternalId };
  }

  // 2. Direct single letter / code
  const codeUpper = str.toUpperCase();
  if (codeUpper === 'A') return { status: AttendanceStatus.ABSENT_APPROVED_A, sessionCount: 1, lessonTopic: null };
  if (codeUpper === 'B') return { status: AttendanceStatus.LEAVE_B, sessionCount: 1, lessonTopic: null };
  if (codeUpper === 'C') return { status: AttendanceStatus.ABSENT_UNAPPROVED_C, sessionCount: 1, lessonTopic: null };
  if (codeUpper === 'D') return { status: AttendanceStatus.TEACHER_ABSENT_D, sessionCount: 1, lessonTopic: null };
  if (codeUpper === 'E') return { status: AttendanceStatus.TECH_ERROR_E, sessionCount: 1, lessonTopic: null };
  if (['X', 'ĐÃ HỌC'].includes(codeUpper)) return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: null };

  // 3. Numeric values: 1, 1.0, 2, 2.0, 0.5...
  const num = Number(str);
  if (!isNaN(num) && num > 0) {
    return { status: AttendanceStatus.ATTENDED, sessionCount: num, lessonTopic: null };
  }

  // 4. Tolerant fallback for lesson topic without ID prefix (e.g. "K2 L4", "k1-l1")
  if (str.length >= 2 && isNaN(Number(str))) {
    return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: str };
  }

  return { status: null, sessionCount: 1, lessonTopic: null };
}

/**
 * Parses time slot strings like "19:00 - 19:30" or "19h00 - 19h30" into startTime and endTime.
 */
export function parseTimeSlot(timeSlot?: string | null): { startTime?: string; endTime?: string } {
  if (!timeSlot || !timeSlot.trim()) return {};
  const cleaned = timeSlot.replace(/h/gi, ':').trim();
  const match = cleaned.match(/(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})/);
  if (match) {
    return { startTime: match[1], endTime: match[2] };
  }
  return {};
}
