import { AttendanceStatus } from '@prisma/client';

export interface ParsedAttendance {
  status: AttendanceStatus | null;
  sessionCount: number;
  lessonTopic: string | null;
  studentExternalId?: string;
  error?: string;
}

function parseStatusCode(code: string): AttendanceStatus | null {
  switch (code.trim().toUpperCase()) {
    case 'A': return AttendanceStatus.ABSENT_APPROVED_A;
    case 'B': return AttendanceStatus.LEAVE_B;
    case 'C': return AttendanceStatus.ABSENT_UNAPPROVED_C;
    case 'D': return AttendanceStatus.TEACHER_ABSENT_D;
    case 'E': return AttendanceStatus.TECH_ERROR_E;
    case 'X':
    case 'ĐÃ HỌC':
    case 'DA HOC': return AttendanceStatus.ATTENDED;
    default: return null;
  }
}

/** Positive integer N means N actual sessions; X/1 and status codes mean one session. */
export function parseAttendanceValue(value: string | number | null | undefined): ParsedAttendance {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { status: null, sessionCount: 0, lessonTopic: null };
  }

  const str = String(value).trim();
  const match = str.match(/^([A-Za-z0-9_]+)\s*-\s*(.+)$/i);
  const studentExternalId = match?.[1];
  const content = (match?.[2] || str).trim();
  const codeStatus = parseStatusCode(content);
  if (codeStatus) return { status: codeStatus, sessionCount: 1, lessonTopic: null, studentExternalId };

  if (/^[+-]?\d+(?:\.\d+)?$/.test(content)) {
    const numberValue = Number(content);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      return { status: null, sessionCount: 0, lessonTopic: null, studentExternalId, error: 'Giá trị điểm danh phải là số nguyên dương' };
    }
    return { status: AttendanceStatus.ATTENDED, sessionCount: numberValue, lessonTopic: null, studentExternalId };
  }

  if (studentExternalId && content.length >= 2) {
    return { status: AttendanceStatus.ATTENDED, sessionCount: 1, lessonTopic: content, studentExternalId };
  }

  return { status: null, sessionCount: 0, lessonTopic: null, error: 'Giá trị điểm danh không hợp lệ' };
}

/** Parses time slots such as "19:00 - 19:30" or "19h00 - 19h30". */
export function parseTimeSlot(timeSlot?: string | null): { startTime?: string; endTime?: string } {
  if (!timeSlot || !timeSlot.trim()) return {};
  const cleaned = timeSlot.replace(/h/gi, ':').trim();
  const match = cleaned.match(/(\d{1,2}:\d{2})\s*[-~–]\s*(\d{1,2}:\d{2})/);
  if (!match) return {};
  return { startTime: match[1].padStart(5, '0'), endTime: match[2].padStart(5, '0') };
}

export function addMinutes(time: string, minutes: number): string | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
  if (total < 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function normalizeClassModel(value?: string | null): 'ONE_TO_ONE' | 'ONE_TO_TWO' | 'ONE_TO_N' | null {
  const normalized = String(value || '').toLowerCase().replace(/\s+/g, '').replace(':', '-');
  if (normalized === '1-1') return 'ONE_TO_ONE';
  if (normalized === '1-2') return 'ONE_TO_TWO';
  if (normalized === '1-n') return 'ONE_TO_N';
  return null;
}

export function remapDateYear(source: Date, targetYear: number): Date | null {
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(targetYear, month, day));
  return result.getUTCMonth() === month ? result : null;
}

/** Normalizes a date to UTC midnight for MySQL @db.Date comparisons. */
export function normalizeDateOnly(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [y, m, day] = date.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function attendanceStatusLabel(status: AttendanceStatus | null | undefined): string {
  if (!status) return 'Chưa điểm danh';
  const labels: Record<AttendanceStatus, string> = {
    ATTENDED: 'Có mặt', ABSENT_APPROVED_A: 'Nghỉ có phép (A)', LEAVE_B: 'Bảo lưu (B)',
    ABSENT_UNAPPROVED_C: 'Nghỉ không phép (C)', TEACHER_ABSENT_D: 'GV nghỉ (D)', TECH_ERROR_E: 'Lỗi kỹ thuật (E)',
  };
  return labels[status];
}
