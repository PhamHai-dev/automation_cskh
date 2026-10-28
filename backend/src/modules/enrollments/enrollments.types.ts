export interface CreateEnrollmentDTO {
  external_id?: string;
  student_id: number;
  package_id?: number;
  cs_id: number;
  total_sessions: number;
  start_date?: string | Date;
  end_date?: string | Date;
}

export interface UpdateEnrollmentDTO {
  external_id?: string;
  program_type?: 'JLPT' | 'KAIWA';
  program_metadata?: Record<string, any> | null;
  package_id?: number;
  total_sessions?: number;
  start_date?: string | Date;
  end_date?: string | Date;
  status?: 'WAITING_CLASS' | 'STUDYING' | 'PAUSED' | 'FINISHED' | 'UPCOMING' | 'NOT_STARTED' | 'CANCELLED';
}

export interface ReassignCSDTO {
  cs_id: number;
}

export interface TransferClassDTO {
  from_class_id: number;
  to_class_id: number;
  start_date?: string | Date;
}

export interface SideAttendanceCounts {
  totalAttended: number;
  totalAbsentA: number;
  totalAbsentC: number;
  totalTeacherD: number;
}

export interface EnrollmentClassAttendanceStats {
  ADMIN: SideAttendanceCounts;
  TEACHER: SideAttendanceCounts;
  CS: SideAttendanceCounts;
}

export interface EnrollmentListFilters {
  page?: number;
  pageSize?: number;
  isPaginated?: boolean;
  search?: string;
  programType?: string;
  csId?: number;
  sale?: string;
  status?: string;
  packageName?: string;
  courseCategory?: 'KAIWA' | 'JNPT' | string;
  courseLevel?: string;
  teacherName?: string;
  teacherCode?: string;
  className?: string;
  modelFilter?: string;
  schedulePattern?: string;
  startTime?: string;
  startDateOp?: 'EXACT' | 'RANGE';
  startDateExact?: string;
  startDateFrom?: string;
  startDateTo?: string;
  endDateOp?: 'EXACT' | 'RANGE';
  endDateExact?: string;
  endDateFrom?: string;
  endDateTo?: string;
  totalSessionsOp?: 'EXACT' | 'RANGE';
  totalSessionsExact?: number;
  totalSessionsMin?: number;
  totalSessionsMax?: number;
  attendedSessionsOp?: 'EXACT' | 'RANGE';
  attendedSessionsExact?: number;
  attendedSessionsMin?: number;
  attendedSessionsMax?: number;
  remainingSessionsOp?: 'EXACT' | 'RANGE';
  remainingSessionsExact?: number;
  remainingSessionsMin?: number;
  remainingSessionsMax?: number;
  sessionFrom?: string;
  sessionTo?: string;
}

export interface EnrollmentListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    programCounts: { all: number; kaiwa: number; jlpt: number };
    statusCounts: Record<string, number>;
  };
  filterOptions: {
    salesList: string[];
    packagesList: string[];
    teachersList: string[];
    teacherCodesList: string[];
    classesList: string[];
  };
}

export interface EnrollmentListResult<T = any> {
  data: T[];
  meta: EnrollmentListMeta;
}
