export type JlptCourseTrack = 'N5' | 'N4' | 'N3' | 'N2' | 'N4-LuyenDe' | 'N3-LuyenDe';

export interface JlptExamScheduleItem {
  course_track: JlptCourseTrack;
  milestone: string; // e.g., "KT1", "KT2", ..., "KT11"
  session: number;
  title: string;
}

export interface JlptNkhtSessionItem {
  session_number: number;
  session_label?: string;
  attendance?: 'O' | 'X' | '';
  preparation?: string;
  attitude?: string;
  homework_status?: string;
  homework_done?: boolean;
  homework_score?: number | null;
  exam_score?: number | string | null;
  note?: string;
}

export interface JlptChuyenCanOverrides {
  attended_sessions?: number | null;
  total_marked_sessions?: number | null;
  average_exam_score?: number | null;
  homework_completed_sessions?: number | null;
  max_consecutive_absent?: number | null;
  max_consecutive_no_homework?: number | null;
}

export interface JlptAttendanceThresholds {
  beforeExamWarnSessions: number;
  afterExamFollowSessions: number;
  redAttendanceRate: number;
  yellowAttendanceRate: number;
}

export const DEFAULT_JLPT_ATTENDANCE_THRESHOLDS: JlptAttendanceThresholds = {
  beforeExamWarnSessions: 2,
  afterExamFollowSessions: 1,
  redAttendanceRate: 0.7,
  yellowAttendanceRate: 0.85,
};

export const JLPT_EXAM_SCHEDULE_CONFIG: JlptExamScheduleItem[] = [
  // N5
  { course_track: 'N5', milestone: 'KT1', session: 5, title: 'Tổng ôn bảng chữ cái' },
  { course_track: 'N5', milestone: 'KT2', session: 11, title: 'JLPT N5 ôn tập 1' },
  { course_track: 'N5', milestone: 'KT3', session: 17, title: 'JLPTN5 ôn tập 2' },
  { course_track: 'N5', milestone: 'KT4', session: 23, title: 'JLPT N5 ôn tập 3' },
  { course_track: 'N5', milestone: 'KT5', session: 29, title: 'JLPT N5 ôn tập 4' },
  { course_track: 'N5', milestone: 'KT6', session: 35, title: 'JLPT N5 ôn tập 5' },
  { course_track: 'N5', milestone: 'KT7', session: 36, title: 'Mô phỏng thi 1 (模擬試験)' },
  { course_track: 'N5', milestone: 'KT8', session: 37, title: 'Mô phỏng thi 2 (模擬試験)' },
  { course_track: 'N5', milestone: 'KT9', session: 38, title: 'Kỳ thi cuối khoá (期末試験)' },

  // N4
  { course_track: 'N4', milestone: 'KT1', session: 1, title: 'Đề thi N5 Từ vựng - Hán tự' },
  { course_track: 'N4', milestone: 'KT2', session: 8, title: 'N4 Đề ôn tập 1' },
  { course_track: 'N4', milestone: 'KT3', session: 14, title: 'N4 Đề ôn tập 2' },
  { course_track: 'N4', milestone: 'KT4', session: 20, title: 'N4 Đề ôn tập 3' },
  { course_track: 'N4', milestone: 'KT5', session: 26, title: 'N4 Đề ôn tập 4' },
  { course_track: 'N4', milestone: 'KT6', session: 32, title: 'N4 Đề ôn tập 5' },
  { course_track: 'N4', milestone: 'KT7', session: 33, title: 'Mô phỏng thi 1 (模擬テスト)' },
  { course_track: 'N4', milestone: 'KT8', session: 34, title: 'Mô phỏng thi 2 (模擬テスト)' },
  { course_track: 'N4', milestone: 'KT9', session: 35, title: 'Kỳ thi cuối khoá (期末テスト)' },

  // N3
  { course_track: 'N3', milestone: 'KT1', session: 1, title: 'Tổng ôn N4' },
  { course_track: 'N3', milestone: 'KT2', session: 7, title: 'N3 tổng ôn buổi 7' },
  { course_track: 'N3', milestone: 'KT3', session: 12, title: 'N3 tổng ôn buổi 12' },
  { course_track: 'N3', milestone: 'KT4', session: 17, title: 'N3 tổng ôn buổi 17' },
  { course_track: 'N3', milestone: 'KT5', session: 22, title: 'Kiểm tra giữa kỳ / N3 tổng ôn buổi 22' },
  { course_track: 'N3', milestone: 'KT6', session: 27, title: 'Đề ôn tập tổng hợp N3 (4)' },
  { course_track: 'N3', milestone: 'KT7', session: 32, title: 'Đề ôn tập tổng hợp N3 (5)' },
  { course_track: 'N3', milestone: 'KT8', session: 37, title: 'Đề ôn tập tổng hợp N3 (6)' },
  { course_track: 'N3', milestone: 'KT9', session: 40, title: 'Đề thi N3-1' },
  { course_track: 'N3', milestone: 'KT10', session: 41, title: 'Đề thi N3-2' },
  { course_track: 'N3', milestone: 'KT11', session: 41, title: 'Đề thi N3 cuối khoá' },

  // N4-LuyenDe
  { course_track: 'N4-LuyenDe', milestone: 'KT1', session: 6, title: 'Kiểm tra đánh giá chặng 1 (sau buổi 6)' },
  { course_track: 'N4-LuyenDe', milestone: 'KT2', session: 12, title: 'Kiểm tra đánh giá chặng 2 (sau buổi 12)' },
  { course_track: 'N4-LuyenDe', milestone: 'KT3', session: 14, title: 'Luyện đề thực chiến 1' },
  { course_track: 'N4-LuyenDe', milestone: 'KT4', session: 15, title: 'Luyện đề thực chiến 2' },
  { course_track: 'N4-LuyenDe', milestone: 'KT5', session: 16, title: 'Luyện đề thực chiến 3' },
  { course_track: 'N4-LuyenDe', milestone: 'KT6', session: 17, title: 'Luyện đề thực chiến 4' },
  { course_track: 'N4-LuyenDe', milestone: 'KT7', session: 18, title: 'Kiểm tra đánh giá chặng 3 (sau buổi 17)' },

  // N3-LuyenDe
  { course_track: 'N3-LuyenDe', milestone: 'KT1', session: 6, title: 'Kiểm tra đánh giá chặng 1 (sau buổi 6)' },
  { course_track: 'N3-LuyenDe', milestone: 'KT2', session: 12, title: 'Kiểm tra đánh giá chặng 2 (sau buổi 12)' },
  { course_track: 'N3-LuyenDe', milestone: 'KT3', session: 15, title: 'Luyện đề thực chiến 1' },
  { course_track: 'N3-LuyenDe', milestone: 'KT4', session: 16, title: 'Luyện đề thực chiến 2' },
  { course_track: 'N3-LuyenDe', milestone: 'KT5', session: 17, title: 'Luyện đề thực chiến 3' },
  { course_track: 'N3-LuyenDe', milestone: 'KT6', session: 18, title: 'Đề kiểm tra chặng 3' },
];

export const JLPT_COURSE_TRACK_LIST: JlptCourseTrack[] = [
  'N5',
  'N4',
  'N3',
  'N2',
  'N4-LuyenDe',
  'N3-LuyenDe',
];

export interface JlptAttendanceReportRow {
  student_id: number;
  enrollment_id: number;
  external_id: string;
  is_readonly: boolean;
  // A -> V (22 columns)
  class_code: string; // A
  full_name: string; // B
  attended_sessions: number | null; // C
  total_marked_sessions: number | null; // D
  attendance_rate: number | null; // E
  average_exam_score: number | null; // F
  homework_completed_sessions: number | null; // G
  max_consecutive_absent: number | null; // H
  absent_warning: string; // I
  max_consecutive_no_homework: number | null; // J
  no_homework_warning: string; // K
  exchange_info: string; // L
  status: string; // M (raw normalized status code)
  status_label: string; // M (display label)
  cvht_code: string; // N
  cs_id: number | null;
  cs_name: string;
  course_track: string; // O
  last_exam_name: string; // P
  last_exam_session: number | null; // Q
  sessions_since_last_exam: number | null; // R
  next_exam_name: string; // S
  next_exam_session: number | null; // T
  sessions_until_next_exam: number | null; // U
  exam_schedule_warning: string; // V

  test_scores: Record<string, string>;
  overrides: {
    attended_sessions: number | null;
    total_marked_sessions: number | null;
    average_exam_score: number | null;
    homework_completed_sessions: number | null;
    max_consecutive_absent: number | null;
    max_consecutive_no_homework: number | null;
  };
  nkht_sessions: JlptNkhtSessionItem[];
}

/**
 * Clean class code from raw enrollment class or metadata.
 * E.g. "N4VIP16001 (03/08/2021) - 001" -> "N4VIP16001"
 */
export function cleanJlptClassCode(raw?: string | null): string {
  if (!raw) return '';
  const firstLine = String(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!firstLine || firstLine === '-') return '';

  // Strip trailing date "(dd/mm/yyyy)" and sequence "- 001"
  const withoutDateAndSeq = firstLine
    .replace(/\s*\([^)]*\)\s*(?:-\s*\d+)?\s*$/, '')
    .replace(/\s+-\s+\d+\s*$/, '')
    .trim();

  // If the first token looks like a standard JLPT class code (e.g. N4VIP16001, N3A110005), extract it
  const codeMatch = withoutDateAndSeq.match(/^([A-Za-z0-9_-]+)/);
  if (codeMatch && /^N[1-5]/i.test(codeMatch[1])) {
    return codeMatch[1].toUpperCase();
  }
  return withoutDateAndSeq;
}

/**
 * Derive Column O (`course_track`) following Excel formula:
 * IF(LEFT(A,3)="N3A","N3-LuyenDe", IF(LEFT(A,3)="N4A","N4-LuyenDe", LEFT(A,2)))
 * Falls back to package.code or enrollment.level when class_code is empty.
 */
export function deriveJlptCourseTrack(
  classCode?: string | null,
  packageCode?: string | null,
  level?: string | null,
  overrideTrack?: string | null,
): string {
  if (overrideTrack && overrideTrack.trim()) {
    const trimmed = overrideTrack.trim();
    if (JLPT_COURSE_TRACK_LIST.includes(trimmed as JlptCourseTrack)) {
      return trimmed;
    }
  }

  const candidates = [classCode, packageCode, level]
    .map((c) => (c ? String(c).trim().toUpperCase() : ''))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (
      candidate === 'N3-LUYENDE' ||
      candidate.startsWith('N3A') ||
      candidate.includes('N3 LUYỆN ĐỀ') ||
      candidate.includes('N3-LUYỆN ĐỀ')
    ) {
      return 'N3-LuyenDe';
    }
    if (
      candidate === 'N4-LUYENDE' ||
      candidate.startsWith('N4A') ||
      candidate.includes('N4 LUYỆN ĐỀ') ||
      candidate.includes('N4-LUYỆN ĐỀ')
    ) {
      return 'N4-LuyenDe';
    }
    const prefix2 = candidate.slice(0, 2);
    if (
      prefix2 === 'N5' ||
      prefix2 === 'N4' ||
      prefix2 === 'N3' ||
      prefix2 === 'N2' ||
      prefix2 === 'N1'
    ) {
      return prefix2;
    }
    const embedded = candidate.match(/\b(N[1-5]A?)\b/);
    if (embedded) {
      const token = embedded[1];
      if (token === 'N3A') return 'N3-LuyenDe';
      if (token === 'N4A') return 'N4-LuyenDe';
      return token.slice(0, 2);
    }
  }

  return '';
}

/**
 * Normalize status and Vietnamese label for Column M (`status`, `status_label`).
 */
export function normalizeJlptStatus(
  rawStatus?: string | null,
  hasAssignedClass?: boolean,
): { status: string; status_label: string } {
  const upper = String(rawStatus || 'NOT_STARTED').trim().toUpperCase();
  const normalizedStatus =
    hasAssignedClass && (upper === 'WAITING_CLASS' || upper === 'NOT_STARTED')
      ? 'STUDYING'
      : upper;

  switch (normalizedStatus) {
    case 'STUDYING':
      return { status: 'STUDYING', status_label: 'Đang học' };
    case 'PAUSED':
      return { status: 'PAUSED', status_label: 'Bảo lưu' };
    case 'FINISHED':
      return { status: 'FINISHED', status_label: 'Kết thúc' };
    case 'WAITING_CLASS':
    case 'NOT_STARTED':
      return { status: 'WAITING_CLASS', status_label: 'Chờ lớp' };
    case 'UPCOMING':
      return { status: 'UPCOMING', status_label: 'Sắp học' };
    case 'CANCELLED':
      return { status: 'CANCELLED', status_label: 'Đã hủy' };
    default:
      return { status: normalizedStatus || 'STUDYING', status_label: 'Đang học' };
  }
}

function parseNumericScore(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const str = String(val).trim().replace(',', '.');
  if (!str || str === '-') return null;
  // Support "85/100" or plain numeric "82.5"
  const slashMatch = str.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*\d+/);
  if (slashMatch) {
    const num = Number(slashMatch[1]);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

function toNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function isHomeworkDoneSession(s: JlptNkhtSessionItem): boolean {
  if (s.homework_done === true) return true;
  if (typeof s.homework_score === 'number' && s.homework_score > 0) return true;
  const hwStatus = String(s.homework_status ?? '').trim().toLowerCase();
  if (!hwStatus) return false;
  if (
    hwStatus === 'có' ||
    hwStatus === 'co' ||
    hwStatus === 'o' ||
    hwStatus === 'đã làm' ||
    hwStatus === 'hoàn thành' ||
    hwStatus === 'xong' ||
    hwStatus === 'true' ||
    hwStatus === '1'
  ) {
    return true;
  }
  const numericHw = Number(hwStatus);
  if (Number.isFinite(numericHw) && numericHw > 0) return true;
  return false;
}

function isHomeworkMissedSession(s: JlptNkhtSessionItem): boolean {
  if (s.homework_done === false) return true;
  const hwStatus = String(s.homework_status ?? '').trim().toLowerCase();
  if (
    hwStatus === 'không' ||
    hwStatus === 'khong' ||
    hwStatus === 'x' ||
    hwStatus === 'chưa' ||
    hwStatus === 'chưa làm' ||
    hwStatus === 'không làm' ||
    hwStatus === 'false' ||
    hwStatus === '0'
  ) {
    return true;
  }
  // If session was marked (attendance O or X) and homework is not done
  const att = String(s.attendance ?? '').trim().toUpperCase();
  if ((att === 'O' || att === 'X') && !isHomeworkDoneSession(s)) {
    return true;
  }
  return false;
}

/**
 * Check if a milestone (e.g. "KT1", "KT10") has a valid score recorded in test_scores or nkht_sessions.
 */
export function hasMilestoneExamScore(
  milestone: string,
  sessionNumber: number,
  testScores: Record<string, any>,
  nkhtSessions: JlptNkhtSessionItem[],
): boolean {
  const mUpper = milestone.trim().toUpperCase();
  const idxMatch = mUpper.match(/^KT(\d+)$/);
  const idx = idxMatch ? idxMatch[1] : '';

  const candidateKeys = [
    mUpper,
    mUpper.toLowerCase(),
    ...(idx ? [`l${idx}`, `L${idx}`, `kt${idx}`, `KT${idx}`, idx] : []),
  ];

  for (const key of candidateKeys) {
    if (testScores && Object.prototype.hasOwnProperty.call(testScores, key)) {
      const score = parseNumericScore(testScores[key]);
      if (score !== null) return true;
    }
  }

  // Also check nkht_sessions at that session number (if only 1 milestone at that session, or matching label)
  if (Array.isArray(nkhtSessions) && nkhtSessions.length > 0) {
    for (const s of nkhtSessions) {
      const score = parseNumericScore(s.exam_score);
      if (score === null) continue;
      const labelUpper = String(s.session_label || s.note || '').toUpperCase();
      if (labelUpper.includes(mUpper)) return true;
      if (Number(s.session_number) === sessionNumber && mUpper !== 'KT11') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Compute exam schedule columns P, Q, R, S, T, U, V for a student row.
 */
export function computeJlptExamScheduleColumns(params: {
  statusLabel: string;
  courseTrack: string;
  totalMarkedSessions: number | null;
  testScores: Record<string, any>;
  nkhtSessions: JlptNkhtSessionItem[];
  scheduleConfig?: JlptExamScheduleItem[];
  thresholds?: JlptAttendanceThresholds;
}): {
  last_exam_name: string;
  last_exam_session: number | null;
  sessions_since_last_exam: number | null;
  next_exam_name: string;
  next_exam_session: number | null;
  sessions_until_next_exam: number | null;
  exam_schedule_warning: string;
} {
  const {
    statusLabel,
    courseTrack,
    totalMarkedSessions: D,
    testScores,
    nkhtSessions,
    scheduleConfig = JLPT_EXAM_SCHEDULE_CONFIG,
    thresholds = DEFAULT_JLPT_ATTENDANCE_THRESHOLDS,
  } = params;

  const emptyResult = {
    last_exam_name: '',
    last_exam_session: null,
    sessions_since_last_exam: null,
    next_exam_name: '',
    next_exam_session: null,
    sessions_until_next_exam: null,
    exam_schedule_warning: '',
  };

  if (statusLabel !== 'Đang học' || !courseTrack || D === null || D === undefined) {
    return emptyResult;
  }

  const trackMilestones = scheduleConfig.filter((item) => item.course_track === courseTrack);
  if (trackMilestones.length === 0) {
    return emptyResult;
  }

  // Q (last_exam_session): MAX session in Lich_Kiem_Tra where session <= D (if D === 0 or none, null)
  const pastItems = D > 0 ? trackMilestones.filter((m) => m.session <= D) : [];
  const Q =
    pastItems.length > 0 ? Math.max(...pastItems.map((m) => m.session)) : null;

  // P (last_exam_name): TEXTJOIN(" + ") all milestones at session Q
  const milestonesAtQ = Q !== null ? trackMilestones.filter((m) => m.session === Q) : [];
  const P = milestonesAtQ.map((m) => m.milestone).join(' + ');

  // R (sessions_since_last_exam): Q !== null ? D - Q : null
  const R = Q !== null ? D - Q : null;

  // T (next_exam_session): MIN session in Lich_Kiem_Tra where session > D
  const futureItems = trackMilestones.filter((m) => m.session > D);
  const T =
    futureItems.length > 0 ? Math.min(...futureItems.map((m) => m.session)) : null;

  // S (next_exam_name): TEXTJOIN(" + ") all milestones at session T
  const milestonesAtT = T !== null ? trackMilestones.filter((m) => m.session === T) : [];
  const S = milestonesAtT.map((m) => m.milestone).join(' + ');

  // U (sessions_until_next_exam): T !== null ? T - D : null
  const U = T !== null ? T - D : null;

  // V (exam_schedule_warning)
  let V = '';
  const scoredCountAtQ =
    Q !== null
      ? milestonesAtQ.filter((m) =>
          hasMilestoneExamScore(m.milestone, m.session, testScores, nkhtSessions),
        ).length
      : 0;

  if (Q !== null && scoredCountAtQ < milestonesAtQ.length) {
    V = `❗ Chưa có đủ điểm ${P} — kiểm tra/nhắc HV`;
  } else if (U !== null && U >= 1 && U <= thresholds.beforeExamWarnSessions) {
    V = `🔔 Còn ${U} buổi tới ${S} — nhắc HV chuẩn bị`;
  } else if (Q !== null && R !== null && R >= 0 && R <= thresholds.afterExamFollowSessions) {
    V = `✅ Đã hoàn thành ${P} — vào hệ thống xem điểm`;
  } else {
    V = '⏳ Chưa tới thời điểm nhắc';
  }

  return {
    last_exam_name: P,
    last_exam_session: Q,
    sessions_since_last_exam: R,
    next_exam_name: S,
    next_exam_session: T,
    sessions_until_next_exam: U,
    exam_schedule_warning: V,
  };
}

/**
 * Compute full 22-column (A -> V) JLPT Attendance Report Row for a student + enrollment.
 */
export function buildJlptAttendanceReportRow(params: {
  student: any;
  enrollment: any;
  isReadonly?: boolean;
  thresholds?: JlptAttendanceThresholds;
}): JlptAttendanceReportRow {
  const {
    student,
    enrollment,
    isReadonly = false,
    thresholds = DEFAULT_JLPT_ATTENDANCE_THRESHOLDS,
  } = params;

  const meta =
    enrollment?.program_metadata && typeof enrollment.program_metadata === 'object'
      ? (enrollment.program_metadata as Record<string, any>)
      : {};

  const rawOverrides: JlptChuyenCanOverrides =
    meta.jlpt_chuyen_can_overrides && typeof meta.jlpt_chuyen_can_overrides === 'object'
      ? meta.jlpt_chuyen_can_overrides
      : {};

  const syncedChuyenCan =
    meta.jlpt_chuyen_can && typeof meta.jlpt_chuyen_can === 'object'
      ? (meta.jlpt_chuyen_can as Record<string, any>)
      : null;

  const overrides = {
    attended_sessions: toNullableNumber(rawOverrides.attended_sessions ?? syncedChuyenCan?.attendedSessions ?? syncedChuyenCan?.attended_sessions),
    total_marked_sessions: toNullableNumber(rawOverrides.total_marked_sessions ?? syncedChuyenCan?.totalMarkedSessions ?? syncedChuyenCan?.total_marked_sessions),
    average_exam_score: toNullableNumber(rawOverrides.average_exam_score ?? syncedChuyenCan?.averageExamScore ?? syncedChuyenCan?.average_exam_score),
    homework_completed_sessions: toNullableNumber(rawOverrides.homework_completed_sessions ?? syncedChuyenCan?.homeworkCompletedSessions ?? syncedChuyenCan?.homework_completed_sessions),
    max_consecutive_absent: toNullableNumber(rawOverrides.max_consecutive_absent ?? syncedChuyenCan?.maxConsecutiveAbsent ?? syncedChuyenCan?.max_consecutive_absent),
    max_consecutive_no_homework: toNullableNumber(rawOverrides.max_consecutive_no_homework ?? syncedChuyenCan?.maxConsecutiveNoHomework ?? syncedChuyenCan?.max_consecutive_no_homework),
  };

  const nkhtSessions: JlptNkhtSessionItem[] = Array.isArray(meta.jlpt_nkht_sessions)
    ? [...meta.jlpt_nkht_sessions]
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any, idx: number) => ({
          session_number: Number.isFinite(Number(s.session_number))
            ? Number(s.session_number)
            : idx + 1,
          session_label: s.session_label ? String(s.session_label) : undefined,
          attendance:
            s.attendance === 'O' || s.attendance === 'X' || s.attendance === ''
              ? s.attendance
              : undefined,
          preparation: s.preparation ? String(s.preparation) : undefined,
          attitude: s.attitude ? String(s.attitude) : undefined,
          homework_status: s.homework_status !== undefined ? String(s.homework_status) : undefined,
          homework_done: typeof s.homework_done === 'boolean' ? s.homework_done : undefined,
          homework_score: toNullableNumber(s.homework_score),
          exam_score: s.exam_score !== undefined ? s.exam_score : null,
          note: s.note ? String(s.note) : undefined,
        }))
        .sort((a, b) => a.session_number - b.session_number)
    : [];

  const rawTestScores =
    meta.test_scores && typeof meta.test_scores === 'object' ? meta.test_scores : {};
  const testScores: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawTestScores)) {
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      testScores[k] = String(v).trim();
    }
  }

  // Column A: class_code
  const ec0 = Array.isArray(enrollment?.enrollment_classes)
    ? enrollment.enrollment_classes[0]
    : undefined;
  const rawClassCandidate =
    ec0?.class?.class_code ||
    meta.latest_class_code ||
    ec0?.class?.class_name ||
    '';
  const classCode = cleanJlptClassCode(rawClassCandidate);

  // Column B: full_name
  const fullName = String(student?.full_name || '').trim();

  // Gather web Attendance records across enrollment_classes
  const webAttendances: Array<{
    session_number: number;
    session_date: number;
    status: string;
  }> = [];
  if (Array.isArray(enrollment?.enrollment_classes)) {
    for (const ec of enrollment.enrollment_classes) {
      if (!Array.isArray(ec?.attendance)) continue;
      for (const att of ec.attendance) {
        if (!att || att.deleted_at) continue;
        const st = String(att.status || '').toUpperCase();
        if (!st) continue;
        const sessNum = Number(att.class_session?.session_number ?? att.id ?? 0);
        const sessDate = att.class_session?.session_date
          ? new Date(att.class_session.session_date).getTime()
          : 0;
        webAttendances.push({
          session_number: sessNum,
          session_date: sessDate,
          status: st,
        });
      }
    }
  }
  webAttendances.sort((a, b) => {
    if (a.session_number !== b.session_number) return a.session_number - b.session_number;
    return a.session_date - b.session_date;
  });

  // Determine marked attendance sequence ('O' for attended, 'X' for absent)
  const ABSENT_STATUSES = new Set([
    'ABSENT_APPROVED_A',
    'ABSENT_UNAPPROVED_C',
    'LEAVE_B',
  ]);

  const markedSequence: Array<'O' | 'X'> = [];
  if (webAttendances.length > 0) {
    for (const att of webAttendances) {
      if (att.status === 'ATTENDED') {
        markedSequence.push('O');
      } else if (ABSENT_STATUSES.has(att.status)) {
        markedSequence.push('X');
      }
    }
  } else if (nkhtSessions.length > 0) {
    for (const s of nkhtSessions) {
      const a = String(s.attendance || '').trim().toUpperCase();
      if (a === 'O') markedSequence.push('O');
      else if (a === 'X') markedSequence.push('X');
    }
  }

  const countedAttended = markedSequence.filter((x) => x === 'O').length;
  const countedTotalMarked = markedSequence.length;

  const fallbackAttended =
    toNullableNumber(enrollment?.total_attended) ??
    (typeof enrollment?.attended_previous_years === 'number' &&
    enrollment.attended_previous_years > 0
      ? enrollment.attended_previous_years
      : null);

  // Column C: attended_sessions
  let attendedSessions: number | null = null;
  if (overrides.attended_sessions !== null) {
    attendedSessions = overrides.attended_sessions;
  } else if (markedSequence.length > 0) {
    attendedSessions = countedAttended;
  } else if (fallbackAttended !== null) {
    attendedSessions = fallbackAttended;
  }

  // Column D: total_marked_sessions
  let totalMarkedSessions: number | null = null;
  if (overrides.total_marked_sessions !== null) {
    totalMarkedSessions = overrides.total_marked_sessions;
  } else if (markedSequence.length > 0) {
    totalMarkedSessions = countedTotalMarked;
  } else if (attendedSessions !== null) {
    totalMarkedSessions = attendedSessions;
  }

  // Ensure D >= C when D came from fallback
  if (
    overrides.total_marked_sessions === null &&
    totalMarkedSessions !== null &&
    attendedSessions !== null &&
    totalMarkedSessions < attendedSessions
  ) {
    totalMarkedSessions = attendedSessions;
  }

  // Column E: attendance_rate (= IF(D > 0, C / D, null))
  const syncedAttendanceRate = toNullableNumber(
    syncedChuyenCan?.attendanceRate ?? syncedChuyenCan?.attendance_rate
  );
  const attendanceRate =
    totalMarkedSessions !== null &&
    totalMarkedSessions > 0 &&
    attendedSessions !== null
      ? Number((attendedSessions / totalMarkedSessions).toFixed(10))
      : syncedAttendanceRate;

  // Column F: average_exam_score
  let averageExamScore: number | null = null;
  if (overrides.average_exam_score !== null) {
    averageExamScore = overrides.average_exam_score;
  } else {
    const scoreValues: number[] = [];
    for (const val of Object.values(testScores)) {
      const parsed = parseNumericScore(val);
      if (parsed !== null) scoreValues.push(parsed);
    }
    for (const s of nkhtSessions) {
      const parsed = parseNumericScore(s.exam_score);
      if (parsed !== null) scoreValues.push(parsed);
    }
    if (scoreValues.length > 0) {
      const sum = scoreValues.reduce((acc, v) => acc + v, 0);
      averageExamScore = Number((sum / scoreValues.length).toFixed(2));
    }
  }

  // Column G: homework_completed_sessions
  let homeworkCompletedSessions: number | null = null;
  if (overrides.homework_completed_sessions !== null) {
    homeworkCompletedSessions = overrides.homework_completed_sessions;
  } else if (nkhtSessions.length > 0) {
    homeworkCompletedSessions = nkhtSessions.filter((s) => isHomeworkDoneSession(s)).length;
  }

  // Column H: max_consecutive_absent
  let maxConsecutiveAbsent: number | null = null;
  if (overrides.max_consecutive_absent !== null) {
    maxConsecutiveAbsent = overrides.max_consecutive_absent;
  } else if (markedSequence.length > 0) {
    let currentStreak = 0;
    let maxStreak = 0;
    for (const mark of markedSequence) {
      if (mark === 'X') {
        currentStreak += 1;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (mark === 'O') {
        currentStreak = 0;
      }
    }
    maxConsecutiveAbsent = maxStreak;
  }

  // Column I: absent_warning
  const syncedAbsentWarn = String(
    syncedChuyenCan?.absentWarning ?? syncedChuyenCan?.absent_warning ?? ''
  ).trim();
  const absentWarning =
    syncedAbsentWarn ||
    (maxConsecutiveAbsent !== null && maxConsecutiveAbsent >= 2
      ? '⚠ Vắng liên tiếp ≥2 buổi'
      : '');

  // Column J: max_consecutive_no_homework
  let maxConsecutiveNoHomework: number | null = null;
  if (overrides.max_consecutive_no_homework !== null) {
    maxConsecutiveNoHomework = overrides.max_consecutive_no_homework;
  } else if (nkhtSessions.length > 0) {
    let currentStreak = 0;
    let maxStreak = 0;
    for (const s of nkhtSessions) {
      if (isHomeworkDoneSession(s)) {
        currentStreak = 0;
      } else if (isHomeworkMissedSession(s)) {
        currentStreak += 1;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      }
    }
    maxConsecutiveNoHomework = maxStreak;
  }

  // Column K: no_homework_warning
  const syncedNoHwWarn = String(
    syncedChuyenCan?.noHomeworkWarning ?? syncedChuyenCan?.no_homework_warning ?? ''
  ).trim();
  const noHomeworkWarning =
    syncedNoHwWarn ||
    (maxConsecutiveNoHomework !== null && maxConsecutiveNoHomework >= 2
      ? '⚠ Không làm bài ≥2 buổi'
      : '');

  // Column L: exchange_info
  const exchangeInfo = String(
    enrollment?.exchange_info ||
      syncedChuyenCan?.exchangeInfo ||
      syncedChuyenCan?.exchange_info ||
      ''
  ).trim();

  // Column M: status, status_label
  const hasAssignedClass = Boolean(
    classCode || (Array.isArray(enrollment?.enrollment_classes) && enrollment.enrollment_classes.length > 0),
  );
  const { status, status_label } = normalizeJlptStatus(enrollment?.status, hasAssignedClass);

  // Column N: cvht_code, cs_id, cs_name
  const cvhtCode = String(
    enrollment?.cs?.staff_code ||
      enrollment?.cs?.code ||
      enrollment?.cs?.name ||
      syncedChuyenCan?.cvhtCode ||
      syncedChuyenCan?.cvht_code ||
      '',
  ).trim();
  const csId = typeof enrollment?.cs_id === 'number' ? enrollment.cs_id : enrollment?.cs?.id ?? null;
  const csName = String(enrollment?.cs?.name || cvhtCode || '').trim();

  // Column O: course_track
  const courseTrack = deriveJlptCourseTrack(
    classCode,
    enrollment?.package?.code,
    enrollment?.level,
    meta.course_track || syncedChuyenCan?.courseTrack || syncedChuyenCan?.course_track,
  );

  // Columns P -> V
  const computedExamCols = computeJlptExamScheduleColumns({
    statusLabel: status_label,
    courseTrack,
    totalMarkedSessions,
    testScores,
    nkhtSessions,
    thresholds,
  });

  const syncedLastExamName = String(
    syncedChuyenCan?.lastExamName ?? syncedChuyenCan?.last_exam_name ?? ''
  ).trim();
  const syncedLastExamSession = toNullableNumber(
    syncedChuyenCan?.lastExamSession ?? syncedChuyenCan?.last_exam_session
  );
  const syncedSessionsSinceLastExam = toNullableNumber(
    syncedChuyenCan?.sessionsSinceLastExam ?? syncedChuyenCan?.sessions_since_last_exam
  );
  const syncedNextExamName = String(
    syncedChuyenCan?.nextExamName ?? syncedChuyenCan?.next_exam_name ?? ''
  ).trim();
  const syncedNextExamSession = toNullableNumber(
    syncedChuyenCan?.nextExamSession ?? syncedChuyenCan?.next_exam_session
  );
  const syncedSessionsUntilNextExam = toNullableNumber(
    syncedChuyenCan?.sessionsUntilNextExam ?? syncedChuyenCan?.sessions_until_next_exam
  );
  const syncedExamScheduleWarning = String(
    syncedChuyenCan?.examScheduleWarning ?? syncedChuyenCan?.exam_schedule_warning ?? ''
  ).trim();

  const examCols = {
    last_exam_name: syncedLastExamName || computedExamCols.last_exam_name,
    last_exam_session: syncedLastExamSession ?? computedExamCols.last_exam_session,
    sessions_since_last_exam:
      syncedSessionsSinceLastExam ?? computedExamCols.sessions_since_last_exam,
    next_exam_name: syncedNextExamName || computedExamCols.next_exam_name,
    next_exam_session: syncedNextExamSession ?? computedExamCols.next_exam_session,
    sessions_until_next_exam:
      syncedSessionsUntilNextExam ?? computedExamCols.sessions_until_next_exam,
    exam_schedule_warning:
      syncedExamScheduleWarning || computedExamCols.exam_schedule_warning,
  };

  return {
    student_id: Number(student?.id ?? enrollment?.student_id ?? 0),
    enrollment_id: Number(enrollment?.id ?? 0),
    external_id: String(student?.external_id || enrollment?.external_id || ''),
    is_readonly: Boolean(isReadonly),
    class_code: classCode,
    full_name: fullName,
    attended_sessions: attendedSessions,
    total_marked_sessions: totalMarkedSessions,
    attendance_rate: attendanceRate,
    average_exam_score: averageExamScore,
    homework_completed_sessions: homeworkCompletedSessions,
    max_consecutive_absent: maxConsecutiveAbsent,
    absent_warning: absentWarning,
    max_consecutive_no_homework: maxConsecutiveNoHomework,
    no_homework_warning: noHomeworkWarning,
    exchange_info: exchangeInfo,
    status,
    status_label,
    cvht_code: cvhtCode,
    cs_id: csId,
    cs_name: csName,
    course_track: courseTrack,
    ...examCols,
    test_scores: testScores,
    overrides,
    nkht_sessions: nkhtSessions,
  };
}

export type JlptWarningFilter =
  | 'ALL'
  | 'ABSENT_WARN'
  | 'NO_HW_WARN'
  | 'MISSING_SCORE'
  | 'UPCOMING_EXAM'
  | 'LOW_ATTENDANCE';

export function matchesJlptWarningFilter(
  row: JlptAttendanceReportRow,
  warningFilter?: string,
  thresholds: JlptAttendanceThresholds = DEFAULT_JLPT_ATTENDANCE_THRESHOLDS,
): boolean {
  if (!warningFilter || warningFilter.toUpperCase() === 'ALL') return true;
  const wf = warningFilter.trim().toUpperCase();
  switch (wf) {
    case 'ABSENT_WARN':
      return Boolean(row.absent_warning);
    case 'NO_HW_WARN':
      return Boolean(row.no_homework_warning);
    case 'MISSING_SCORE':
      return row.exam_schedule_warning.startsWith('❗');
    case 'UPCOMING_EXAM':
      return row.exam_schedule_warning.startsWith('🔔');
    case 'LOW_ATTENDANCE':
      return row.attendance_rate !== null && row.attendance_rate < thresholds.redAttendanceRate;
    default:
      return true;
  }
}

export function computeJlptReportSummary(
  rows: JlptAttendanceReportRow[],
  thresholds: JlptAttendanceThresholds = DEFAULT_JLPT_ATTENDANCE_THRESHOLDS,
) {
  let studyingCount = 0;
  let absentWarningCount = 0;
  let noHomeworkWarningCount = 0;
  let missingExamScoreCount = 0;
  let upcomingExamCount = 0;
  let lowAttendanceRedCount = 0;

  for (const r of rows) {
    if (r.status_label === 'Đang học') studyingCount++;
    if (r.absent_warning) absentWarningCount++;
    if (r.no_homework_warning) noHomeworkWarningCount++;
    if (r.exam_schedule_warning.startsWith('❗')) missingExamScoreCount++;
    if (r.exam_schedule_warning.startsWith('🔔')) upcomingExamCount++;
    if (r.attendance_rate !== null && r.attendance_rate < thresholds.redAttendanceRate) {
      lowAttendanceRedCount++;
    }
  }

  return {
    totalStudents: rows.length,
    studyingCount,
    absentWarningCount,
    noHomeworkWarningCount,
    missingExamScoreCount,
    upcomingExamCount,
    lowAttendanceRedCount,
  };
}
