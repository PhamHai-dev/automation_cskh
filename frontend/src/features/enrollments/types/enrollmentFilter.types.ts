export type CourseCategory = 'ALL' | 'KAIWA' | 'JNPT';

export type FilterOperator = 'RANGE' | 'EXACT';

export interface EnrollmentFilterState {
  // Tìm kiếm chung
  searchQuery: string;

  // 1. Gói học & Khóa học
  packageName: string;
  courseCategory: CourseCategory;
  courseLevel: string; // Kaiwa 1..6, JNPT 1..6, etc.

  // 2. Tiến độ buổi học
  totalSessionsOp: FilterOperator;
  totalSessionsExact: string;
  totalSessionsMin: string;
  totalSessionsMax: string;

  attendedSessionsOp: FilterOperator;
  attendedSessionsExact: string;
  attendedSessionsMin: string;
  attendedSessionsMax: string;

  remainingSessionsOp: FilterOperator;
  remainingSessionsExact: string;
  remainingSessionsMin: string;
  remainingSessionsMax: string;

  // 3. Giáo viên & Lớp học
  teacherName: string;
  teacherCode: string;
  className: string;
  modelFilter: string; // 1:1, 1:2, 1:n

  // 4. Thời gian & Lịch học
  startDateOp: FilterOperator;
  startDateExact: string; // YYYY-MM-DD
  startDateFrom: string;
  startDateTo: string;

  endDateOp: FilterOperator;
  endDateExact: string;
  endDateFrom: string;
  endDateTo: string;

  schedulePattern: string; // 246, 357, LKCD...
  startTime: string; // 19:00, 20h00...

  // 5. Trạng thái & Sale
  statusFilter: string; // WAITING_CLASS, STUDYING...
  selectedSale: string;
}

export const INITIAL_ENROLLMENT_FILTERS: EnrollmentFilterState = {
  searchQuery: '',
  packageName: '',
  courseCategory: 'ALL',
  courseLevel: '',

  totalSessionsOp: 'RANGE',
  totalSessionsExact: '',
  totalSessionsMin: '',
  totalSessionsMax: '',

  attendedSessionsOp: 'RANGE',
  attendedSessionsExact: '',
  attendedSessionsMin: '',
  attendedSessionsMax: '',

  remainingSessionsOp: 'RANGE',
  remainingSessionsExact: '',
  remainingSessionsMin: '',
  remainingSessionsMax: '',

  teacherName: '',
  teacherCode: '',
  className: '',
  modelFilter: '',

  startDateOp: 'RANGE',
  startDateExact: '',
  startDateFrom: '',
  startDateTo: '',

  endDateOp: 'RANGE',
  endDateExact: '',
  endDateFrom: '',
  endDateTo: '',

  schedulePattern: '',
  startTime: '',
  statusFilter: '',
  selectedSale: '',
};

export const KAIWA_LEVEL_OPTIONS = [
  'Kaiwa 1',
  'Kaiwa 2',
  'Kaiwa 3',
  'Kaiwa 4',
  'Kaiwa 5',
  'Kaiwa 6',
];

export const JNPT_LEVEL_OPTIONS = [
  'JNPT 1',
  'JNPT 2',
  'JNPT 3',
  'JNPT 4',
  'JNPT 5',
  'JNPT 6',
  'N1',
  'N2',
  'N3',
  'N4',
  'N5',
];
