import { Teacher } from '../../teachers/types/teachers.types';

export type ClassTeacherRole = 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';

export interface ClassTeacherAssignment {
  id: number;
  class_id: number;
  teacher_id: number;
  role: ClassTeacherRole;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at?: string;
  updated_at?: string;
  teacher?: Teacher;
}

export type ClassTeacher = ClassTeacherAssignment;

export type ClassModelType = '1:1' | '1:2' | '1:n' | string;

export interface Class {
  id: number;
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: ClassModelType;
  attendance_source: 'LEARNING_SYSTEM' | 'ZOOM';
  active: boolean;
  class_teachers?: ClassTeacherAssignment[];
  class_sessions?: ClassSession[];
  enrollment_classes?: any[];
  class_schedules?: any[];
  created_at: string;
  updated_at: string;
}

export const cleanClassIdentifier = (raw?: string | null): string => {
  if (!raw) return '';
  const lines = String(raw)
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, ' ').trim())
    .filter(Boolean);
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];
  const classLike = lines.filter(
    (l) => !/^[+(]/.test(l) && !l.toLowerCase().includes('tặng khóa')
  );
  return (classLike.length > 0 ? classLike[classLike.length - 1] : lines[0]).trim();
};

export const formatClassCode = (code?: string | null, id?: number): string => {
  const cleaned = cleanClassIdentifier(code);
  if (cleaned && !/^(CLS_|id\d+$)/i.test(cleaned)) {
    return cleaned;
  }
  if (id && id > 0) {
    return `class_${String(id).padStart(4, '0')}`;
  }
  return cleaned || '—';
};

export const normalizeClassModel = (
  model?: string | null,
  studentCount?: number
): '1:1' | '1:2' | '1:n' => {
  const raw = (model || '').trim();
  const lower = raw.toLowerCase();
  if (
    lower === 'one_to_two' ||
    lower.includes('1:2') ||
    lower.includes('1-2')
  ) {
    return '1:2';
  }
  if (
    lower === 'one_to_n' ||
    lower === 'group' ||
    lower.includes('1:n') ||
    lower.includes('1-n') ||
    lower.includes('1-10') ||
    lower.includes('1:10') ||
    lower.includes('nhóm') ||
    lower.includes('nhom')
  ) {
    return '1:n';
  }
  if (typeof studentCount === 'number') {
    if (studentCount > 2) return '1:n';
    if (studentCount === 2) return '1:2';
  }
  return '1:1';
};

export const CLASS_MODEL_BADGE_STYLES: Record<
  '1:1' | '1:2' | '1:n',
  { label: string; className: string }
> = {
  '1:1': {
    label: '1:1',
    className: 'bg-blue-50 text-blue-700 border-blue-200 font-bold',
  },
  '1:2': {
    label: '1:2',
    className: 'bg-teal-50 text-teal-700 border-teal-200 font-bold',
  },
  '1:n': {
    label: '1:n',
    className: 'bg-purple-50 text-purple-700 border-purple-200 font-bold',
  },
};

export const ENROLLMENT_STATUS_BADGE_MAP: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  STUDYING: { label: 'Đang học', variant: 'success' },
  PAUSED: { label: 'Bảo lưu', variant: 'warning' },
  WAITING_CLASS: { label: 'Chờ lớp', variant: 'warning' },
  FINISHED: { label: 'Kết thúc', variant: 'neutral' },
  UPCOMING: { label: 'Sắp học', variant: 'info' },
  NOT_STARTED: { label: 'Chưa học', variant: 'neutral' },
  CANCELLED: { label: 'Đã hủy', variant: 'danger' },
};

/**
 * Chuẩn hóa trạng thái học viên dựa trên việc đã xếp vào lớp thực tế hay chưa:
 * - Nếu học viên ĐÃ có lớp (hasAssignedClass = true) mà trạng thái gốc đang là WAITING_CLASS / NOT_STARTED -> Đang học (STUDYING)
 * - Nếu học viên CHƯA có lớp (hasAssignedClass = false) mà trạng thái gốc là STUDYING (và không phải khóa Video) -> Chờ lớp (WAITING_CLASS)
 */
export const resolveEffectiveEnrollmentStatus = (
  rawStatus?: string | null,
  hasAssignedClass?: boolean,
  classModelOrLevel?: string | null
): string => {
  const st = (rawStatus || '').trim().toUpperCase();
  if (st === 'FINISHED' || st === 'PAUSED' || st === 'CANCELLED' || st === 'UPCOMING') {
    return st;
  }
  const isVideo = (classModelOrLevel || '').toLowerCase().includes('video');
  if (hasAssignedClass) {
    return 'STUDYING';
  }
  if (hasAssignedClass === false && !isVideo) {
    return 'WAITING_CLASS';
  }
  return st || 'STUDYING';
};

/**
 * Chuẩn hóa trạng thái hiển thị của Lớp học đồng bộ với bộ từ vựng Trạng thái học viên
 * (Đang học | Bảo lưu | Chờ lớp | Kết thúc)
 */
export const resolveClassDisplayStatus = (
  cls: { active?: boolean },
  students: Array<{ status?: string | null }>
): { statusKey: string; label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } => {
  if (cls.active === false) {
    return { statusKey: 'FINISHED', ...ENROLLMENT_STATUS_BADGE_MAP.FINISHED };
  }
  if (!students || students.length === 0) {
    return { statusKey: 'WAITING_CLASS', ...ENROLLMENT_STATUS_BADGE_MAP.WAITING_CLASS };
  }
  const statuses = students.map((s) => (s.status || '').toUpperCase());
  if (statuses.some((s) => s === 'STUDYING' || s === 'UPCOMING')) {
    return { statusKey: 'STUDYING', ...ENROLLMENT_STATUS_BADGE_MAP.STUDYING };
  }
  if (statuses.some((s) => s === 'PAUSED')) {
    return { statusKey: 'PAUSED', ...ENROLLMENT_STATUS_BADGE_MAP.PAUSED };
  }
  if (statuses.every((s) => s === 'FINISHED' || s === 'CANCELLED')) {
    return { statusKey: 'FINISHED', ...ENROLLMENT_STATUS_BADGE_MAP.FINISHED };
  }
  return { statusKey: 'STUDYING', ...ENROLLMENT_STATUS_BADGE_MAP.STUDYING };
};

export const cleanNoteText = (raw?: string | null): string => {
  if (!raw) return '';
  return String(raw).replace(/^"+|"+$/g, '').trim();
};

export const formatCourseContentDisplay = (
  courseContent?: string | null,
  programType?: string | null,
  packageName?: string | null,
  level?: string | null
): string => {
  const raw = cleanNoteText(courseContent);
  if (!raw || raw === '-' || raw === '—') {
    return packageName && packageName !== '—' ? packageName : level && level !== '—' ? level : '—';
  }
  // Nếu course_content là con số học phí thuần túy (VD: "6500000" ở sheet JLPT)
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isNaN(num) && num >= 10000) {
      const formattedFee = `${num.toLocaleString('vi-VN')}đ`;
      const prefix =
        level && level !== '—'
          ? level
          : packageName && packageName !== '—'
          ? packageName
          : programType || '';
      return prefix ? `${prefix} · ${formattedFee}` : formattedFee;
    }
  }
  return raw;
};

export const formatScheduleTimeDisplay = (rawTime?: string | null): string => {
  if (!rawTime) return '';
  const str = String(rawTime).trim();
  if (!str || str === '-' || str === '—') return '';
  const m = str.match(/^(\d{1,2})\s*[hH:]\s*(\d{2})?$/);
  if (m) {
    return `${m[1].padStart(2, '0')}:${(m[2] || '00').padStart(2, '0')}`;
  }
  return str;
};

export interface CreateClassDTO {
  class_code?: string;
  class_name: string;
  level?: string;
  model_type: '1:1' | '1:2' | '1:n';
  attendance_source?: 'LEARNING_SYSTEM' | 'ZOOM';
}

export interface UpdateClassDTO {
  class_code?: string;
  class_name?: string;
  level?: string;
  model_type?: '1:1' | '1:2' | '1:n';
  attendance_source?: 'LEARNING_SYSTEM' | 'ZOOM';
  active?: boolean;
}

export interface AssignTeacherDTO {
  teacher_id: number;
  role: 'MAIN' | 'ASSISTANT' | 'SUBSTITUTE';
  start_date?: string;
  end_date?: string;
}

// ---- ClassSession ----

export type ClassSessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface ClassSession {
  id: number;
  class_id: number;
  session_number: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status: ClassSessionStatus;
  attendance?: Attendance[];
  created_by_id: number;
  created_by?: { id: number; name: string; email: string };
  created_at: string;
  updated_at: string;
}

export interface CreateClassSessionDTO {
  session_number?: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
}

export interface UpdateClassSessionDTO extends Partial<CreateClassSessionDTO> {
  status?: ClassSessionStatus;
}

// ---- Attendance ----

export type AttendanceStatus = 'ATTENDED' | 'ABSENT_APPROVED_A' | 'LEAVE_B' | 'ABSENT_UNAPPROVED_C' | 'TEACHER_ABSENT_D' | 'TECH_ERROR_E';

export type AttendanceSource = 'MANUAL' | 'EXCEL_IMPORT' | 'TEACHER_UPLOAD';

export type AttendanceSide = 'TEACHER' | 'CS' | 'ADMIN';
export type ReconciliationState = 'PENDING_TEACHER' | 'PENDING_CS' | 'MATCHED' | 'CONFLICT' | 'RESOLVED';

export interface Attendance {
  id: number;
  enrollment_class_id: number;
  class_session_id: number;
  status: AttendanceStatus;
  source: AttendanceSource;
  teacher_status?: AttendanceStatus | null;
  cs_status?: AttendanceStatus | null;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
  teacher_submitted_at?: string | null;
  cs_submitted_at?: string | null;
  reconciliation_state?: ReconciliationState;
  resolved_by_id?: number | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  created_by_id: number;
  created_by?: { id: number; name: string; email: string };
  enrollment_class?: {
    id: number;
    enrollment?: {
      id: number;
      student?: { id: number; full_name: string; phone: string; email?: string | null; external_id?: string | null };
      package?: { id: number; name: string; code: string };
      cs?: { id: number; name: string; email: string };
    };
  };
  class_session?: ClassSession;
  created_at: string;
  updated_at: string;
}

export interface MarkAttendanceDTO {
  enrollment_class_id: number;
  status: AttendanceStatus;
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}

export interface BulkMarkAttendanceDTO {
  items: Array<{
    enrollment_class_id: number;
    status: AttendanceStatus;
    lesson_topic?: string | null;
    teacher_note?: string | null;
    cs_note?: string | null;
  }>;
  side?: AttendanceSide;
}

export interface UpdateAttendanceDTO {
  status?: AttendanceStatus;
  side?: AttendanceSide;
  lesson_topic?: string | null;
  teacher_note?: string | null;
  cs_note?: string | null;
}

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  ATTENDED: 'Có mặt',
  ABSENT_APPROVED_A: 'Nghỉ phép (A)',
  LEAVE_B: 'Bảo lưu (B)',
  ABSENT_UNAPPROVED_C: 'Nghỉ sai (C)',
  TEACHER_ABSENT_D: 'GV nghỉ (D)',
  TECH_ERROR_E: 'Lỗi kỹ thuật (E)',
};

export const SESSION_STATUS_LABELS: Record<ClassSessionStatus, string> = {
  SCHEDULED: 'Chưa diễn ra',
  COMPLETED: 'Đã hoàn thành',
  CANCELLED: 'Đã hủy',
};
