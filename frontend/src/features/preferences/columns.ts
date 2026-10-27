// Column registry for user-configurable visibility per scope/tab
// Each column has a stable `key` matching the data field, a Vietnamese `label`, and `defaultVisible`
// `locked: true` means the column is always shown (cannot be hidden by user)

export type PreferenceScope =
  | 'enrollments.quick'
  | 'enrollments.detailed'
  | 'enrollments.stats'
  | 'students.tab1'
  | 'students.tab2'
  | 'home.quick_links';

export interface ColumnMeta {
  key: string;
  label: string;
  defaultVisible: boolean;
  locked?: boolean; // cannot be toggled by user
}

// ─── Enrollments — Tab Nhanh (Quick) ─────────────────────────────────────────
// Matches the <th> columns rendered in AttendanceMatrix quick tab (non-date columns)
export const ENROLLMENT_QUICK_COLUMNS: ColumnMeta[] = [
  { key: 'external_id',    label: 'ID (Mã HV)',         defaultVisible: true },
  { key: 'full_name',      label: 'Họ tên HV',          defaultVisible: true },
  { key: 'package_name',   label: 'Gói học',            defaultVisible: true },
  { key: 'course_content', label: 'Nội dung khoá',      defaultVisible: true },
  { key: 'total_sessions', label: 'Tổng số buổi',       defaultVisible: true },
  { key: 'level',          label: 'Khoá học / Trình độ',defaultVisible: true },
  { key: 'email',          label: 'Email',              defaultVisible: true },
  { key: 'model_type',     label: 'Mô hình',            defaultVisible: true },
  { key: 'status',         label: 'Trạng thái',         defaultVisible: true },
];

// ─── Enrollments — Tab Chi tiết (Detailed) ───────────────────────────────────
// Matches the <th> columns in AttendanceMatrix detailed tab (non-date columns)
export const ENROLLMENT_DETAILED_COLUMNS: ColumnMeta[] = [
  { key: 'external_id',         label: 'ID (Mã HV)',              defaultVisible: true },
  { key: 'full_name',           label: 'Họ tên HV',               defaultVisible: true },
  { key: 'package_name',        label: 'Gói học',                 defaultVisible: true },
  { key: 'course_content',      label: 'Nội dung khoá',           defaultVisible: true },
  { key: 'total_sessions',      label: 'Tổng số buổi',            defaultVisible: true },
  { key: 'level',               label: 'Khoá học / Trình độ',     defaultVisible: true },
  { key: 'email',               label: 'Email',                   defaultVisible: true },
  { key: 'model_type',          label: 'Mô hình',                 defaultVisible: true },
  { key: 'remaining_sessions',  label: 'Số buổi còn lại',         defaultVisible: true },
  { key: 'start_date',          label: 'Ngày bắt đầu học',        defaultVisible: true },
  { key: 'status',              label: 'Trạng thái',              defaultVisible: true },
  { key: 'end_date',            label: 'Ngày kết thúc / Bảo lưu', defaultVisible: true },
  { key: 'start_time',          label: 'Giờ học',                 defaultVisible: true },
  { key: 'schedule_pattern',    label: 'Lịch học',                defaultVisible: true },
  { key: 'duration_minutes',    label: 'Thời lượng',              defaultVisible: true },
  { key: 'teacher_name',        label: 'Giáo viên',               defaultVisible: true },
  { key: 'teacher_code',        label: 'Mã GV',                   defaultVisible: true },
  { key: 'class_name',          label: 'Tên lớp',                 defaultVisible: true },
  { key: 'sale_name',           label: 'Sale phụ trách',          defaultVisible: false },
];

// ─── Enrollments — Tab Thống kê (Stats) ──────────────────────────────────────
// Stats tab shows summary stats — same info columns as detailed
export const ENROLLMENT_STATS_COLUMNS: ColumnMeta[] = [
  { key: 'external_id',        label: 'ID (Mã HV)',          defaultVisible: true },
  { key: 'full_name',          label: 'Họ tên HV',           defaultVisible: true },
  { key: 'package_name',       label: 'Gói học',             defaultVisible: true },
  { key: 'course_content',     label: 'Nội dung khoá',       defaultVisible: true },
  { key: 'total_sessions',     label: 'Tổng số buổi',        defaultVisible: true },
  { key: 'level',              label: 'Khoá học / Trình độ', defaultVisible: true },
  { key: 'email',              label: 'Email',               defaultVisible: false },
  { key: 'model_type',         label: 'Mô hình',             defaultVisible: true },
  { key: 'remaining_sessions', label: 'Số buổi còn lại',     defaultVisible: true },
  { key: 'teacher_name',       label: 'Giáo viên',           defaultVisible: true },
  { key: 'teacher_code',       label: 'Mã GV',               defaultVisible: false },
  { key: 'class_name',         label: 'Tên lớp',             defaultVisible: true },
  { key: 'sale_name',          label: 'Sale phụ trách',      defaultVisible: false },
];

// ─── Students — Tab 1: Danh sách Học viên ────────────────────────────────────
// Matches tab1Columns headers in StudentsPage (commonColumnsAtoI + extra)
export const STUDENT_TAB1_COLUMNS: ColumnMeta[] = [
  // locked=true → always visible (action column)
  { key: 'action',              label: 'Thao tác',              defaultVisible: true, locked: true },
  // common A-I
  { key: 'stt',                 label: 'STT (#)',                defaultVisible: true },
  { key: 'external_id',         label: 'Mã học viên',           defaultVisible: true },
  { key: 'full_name',           label: 'Họ và tên',             defaultVisible: true },
  { key: 'program_type',        label: 'Khóa (JLPT / Kaiwa)',   defaultVisible: true },
  { key: 'cs_staff_code',       label: 'CVHT phụ trách',        defaultVisible: true },
  { key: 'paid_at',             label: 'Ngày nộp học phí',      defaultVisible: false },
  { key: 'sale_name',           label: 'Sale phụ trách',        defaultVisible: true },
  { key: 'student_source_status', label: 'Trạng thái HV',       defaultVisible: true },
  { key: 'gender',              label: 'Giới tính',             defaultVisible: false },
  { key: 'phone',               label: 'Số điện thoại',         defaultVisible: true },
  { key: 'email',               label: 'Email',                 defaultVisible: true },
  { key: 'course_content',      label: 'Nội dung khóa học',     defaultVisible: true },
  // tab1 extras
  { key: 'payment_status',      label: 'Trạng thái thanh toán', defaultVisible: true },
  { key: 'package_name',        label: 'Gói học / Mã khóa',     defaultVisible: true },
  { key: 'khoa_hoc',            label: 'Khóa học',              defaultVisible: false },
  { key: 'level',               label: 'Trình độ / Gói SP',     defaultVisible: true },
  { key: 'total_sessions',      label: 'Tổng số buổi',          defaultVisible: true },
  { key: 'class_model',         label: 'Mô hình lớp / Mã gói',  defaultVisible: false },
  { key: 'class_code',          label: 'Mã lớp',                defaultVisible: true },
  { key: 'sales_note',          label: 'Ghi chú sale',          defaultVisible: false },
  { key: 'date_of_birth',       label: 'Ngày sinh',             defaultVisible: false },
  { key: 'occupation',          label: 'Nghề nghiệp',           defaultVisible: false },
  { key: 'model_type',          label: 'Mô hình',               defaultVisible: false },
  { key: 'remaining_sessions',  label: 'Số buổi còn lại',       defaultVisible: true },
  { key: 'start_date',          label: 'Ngày bắt đầu học',      defaultVisible: true },
  { key: 'status',              label: 'Trạng thái',            defaultVisible: true },
  { key: 'end_date',            label: 'Ngày kết thúc / bảo lưu', defaultVisible: false },
  { key: 'start_time',          label: 'Giờ học',               defaultVisible: true },
  { key: 'schedule_pattern',    label: 'Lịch học',              defaultVisible: true },
  { key: 'duration_minutes',    label: 'Thời lượng',            defaultVisible: false },
  { key: 'recurring',           label: 'Vòng lặp',              defaultVisible: false },
  { key: 'ngay_hoc',            label: 'Ngày học',              defaultVisible: false },
  { key: 'teacher_name',        label: 'Giáo viên',             defaultVisible: true },
  { key: 'teacher_code',        label: 'Mã giáo viên',          defaultVisible: false },
  { key: 'class_name',          label: 'Tên lớp',               defaultVisible: true },
  { key: 'attended_prev',       label: 'Đã học năm trước',      defaultVisible: false },
  { key: 'attended_this_year',  label: 'Đã học 2026',           defaultVisible: true },
];

// ─── Students — Tab 2: Báo cáo học tập & Chăm sóc ───────────────────────────
// Matches tab2Columns headers in StudentsPage (commonColumnsAtoI + care extras)
export const STUDENT_TAB2_COLUMNS: ColumnMeta[] = [
  { key: 'action',                label: 'Thao tác',              defaultVisible: true, locked: true },
  // common A-I (same as tab1)
  { key: 'stt',                   label: 'STT (#)',                defaultVisible: true },
  { key: 'external_id',           label: 'Mã học viên',           defaultVisible: true },
  { key: 'full_name',             label: 'Họ và tên',             defaultVisible: true },
  { key: 'program_type',          label: 'Khóa (JLPT / Kaiwa)',   defaultVisible: true },
  { key: 'cs_staff_code',         label: 'CVHT phụ trách',        defaultVisible: true },
  { key: 'paid_at',               label: 'Ngày nộp học phí',      defaultVisible: false },
  { key: 'sale_name',             label: 'Sale phụ trách',        defaultVisible: true },
  { key: 'student_source_status', label: 'Trạng thái HV',         defaultVisible: true },
  { key: 'gender',                label: 'Giới tính',             defaultVisible: false },
  { key: 'phone',                 label: 'Số điện thoại',         defaultVisible: true },
  { key: 'email',                 label: 'Email',                 defaultVisible: true },
  { key: 'course_content',        label: 'Nội dung khóa học',     defaultVisible: false },
  // tab2 extras
  { key: 'study_report_url',      label: 'Báo cáo học tập',       defaultVisible: true },
  { key: 'exchange_info',         label: 'Trao đổi với học viên', defaultVisible: true },
  { key: 'callback_note',         label: 'Lịch hẹn gọi',         defaultVisible: true },
  { key: 'hot_issue_note',        label: 'Điểm nóng',            defaultVisible: true },
  // JLPT specialized columns
  { key: 'satisfaction_score_b18',label: 'Điểm hài lòng (B18)',   defaultVisible: true },
  { key: 'exam_registration',     label: 'ĐK Thi',                defaultVisible: true },
  { key: 'exam_score',            label: 'Điểm thi thật',         defaultVisible: true },
  { key: 'exam_result',           label: 'Tình trạng thi',        defaultVisible: true },
  { key: 'test_scores_summary',   label: 'Kiểm tra (L1–L7)',      defaultVisible: true },
  { key: 'special_support',       label: 'HT Đặc biệt (L1–L3)',   defaultVisible: true },
  { key: 'renewal_note',          label: 'Tái tục',               defaultVisible: true },
  // Dynamic care session columns are not configurable (milestone-driven)
  { key: 'post_course_care',      label: 'Chăm sóc sau kết thúc',defaultVisible: true },
  { key: 'end_date',              label: 'Ngày kết thúc',         defaultVisible: true },
  { key: 'handed_over_at',        label: 'Ngày bàn giao',         defaultVisible: false },
  { key: 'paid_month',            label: 'Tháng nộp học phí',     defaultVisible: false },
  { key: 'account_created_at',    label: 'Ngày tạo tài khoản',   defaultVisible: false },
];

export const HOME_QUICK_LINKS_COLUMNS: ColumnMeta[] = [
  { key: 'students',         label: 'Danh sách học viên',    defaultVisible: true },
  { key: 'classes',          label: 'Lớp học & điểm danh',   defaultVisible: true },
  { key: 'care',             label: 'Chăm sóc học viên',     defaultVisible: true },
  { key: 'enrollments',      label: 'Quản lý ghi danh',      defaultVisible: true },
  { key: 'reconciliation',   label: 'Đối soát điểm danh',    defaultVisible: true },
  { key: 'dashboard',        label: 'Báo cáo & thống kê',    defaultVisible: true },
  { key: 'omnichannel_chat', label: 'Hộp thư Đa kênh',       defaultVisible: false },
  { key: 'automation',       label: 'Kịch bản Tự động',      defaultVisible: false },
  { key: 'imports',          label: 'Nhập & Xuất Excel',     defaultVisible: false },
  { key: 'packages',         label: 'Gói học & Khóa học',    defaultVisible: false },
  { key: 'teachers',         label: 'Quản lý Giáo viên',     defaultVisible: false },
];

// ─── Registry map by scope ────────────────────────────────────────────────────
export const COLUMNS_BY_SCOPE: Record<PreferenceScope, ColumnMeta[]> = {
  'enrollments.quick':    ENROLLMENT_QUICK_COLUMNS,
  'enrollments.detailed': ENROLLMENT_DETAILED_COLUMNS,
  'enrollments.stats':    ENROLLMENT_STATS_COLUMNS,
  'students.tab1':        STUDENT_TAB1_COLUMNS,
  'students.tab2':        STUDENT_TAB2_COLUMNS,
  'home.quick_links':     HOME_QUICK_LINKS_COLUMNS,
};

/**
 * Merge saved delta (only changed keys) with column defaults.
 * A column is visible if:
 *   - It has `locked: true` → always true
 *   - It is explicitly set in `saved` → use saved value
 *   - Otherwise → use `defaultVisible`
 */
export function mergeVisibility(
  columns: ColumnMeta[],
  saved: Record<string, boolean>
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const col of columns) {
    if (col.locked) {
      result[col.key] = true;
    } else if (col.key in saved) {
      result[col.key] = saved[col.key];
    } else {
      result[col.key] = col.defaultVisible;
    }
  }
  return result;
}

/**
 * Compute the delta: only keys that differ from defaultVisible.
 * This is what we store on the backend (keeps JSON minimal).
 */
export function computeDelta(
  columns: ColumnMeta[],
  current: Record<string, boolean>
): Record<string, boolean> {
  const delta: Record<string, boolean> = {};
  for (const col of columns) {
    if (col.locked) continue;
    if (col.key in current && current[col.key] !== col.defaultVisible) {
      delta[col.key] = current[col.key];
    }
  }
  return delta;
}
