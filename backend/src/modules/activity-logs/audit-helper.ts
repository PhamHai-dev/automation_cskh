import { prisma } from '../../prisma/client';
import type {
  ActivityModuleCode,
  AuditActorDto,
  ChangedFieldDto,
  EnrichedAuditLogItemDto,
  EnrichmentContext,
} from './activity-logs.types';

export const MODULE_LABELS: Record<ActivityModuleCode, string> = {
  ENROLLMENT: 'Học viên & Ghi danh',
  ATTENDANCE: 'Điểm danh & Đối soát',
  CARE: 'Chăm sóc học viên',
  MESSAGING: 'Tin nhắn & Tự động hóa',
  IMPORT_SYNC: 'Import & Đồng bộ',
  SYSTEM: 'Hệ thống & Cài đặt',
};

export const ACTION_LABELS: Record<string, string> = {
  // Enrollment & Student
  REASSIGN_CS: 'Chuyển giao CSKH',
  REVOKE_CS_VIEWER: 'Thu hồi quyền xem CSKH',
  ENROLLMENT_CREATED: 'Tạo ghi danh mới',
  ENROLLMENT_UPDATED: 'Cập nhật ghi danh',
  TRANSFER_CLASS: 'Chuyển lớp học',
  STUDENT_CREATED: 'Thêm hồ sơ học viên',
  STUDENT_UPDATED: 'Cập nhật hồ sơ học viên',
  STUDENT_ACCESS_DENIED: 'Từ chối truy cập hồ sơ HV',

  // Care
  CARE_LOG_CREATED: 'Ghi nhật ký chăm sóc',
  CARE_LOG_UPSERTED: 'Ghi nhật ký chăm sóc',
  CARE_TASK_CREATED: 'Tạo nhiệm vụ chăm sóc',
  CARE_TASK_UPDATED: 'Cập nhật nhiệm vụ chăm sóc',
  CARE_TASK_COMPLETED: 'Hoàn thành nhiệm vụ chăm sóc',
  CARE_TASK_CANCELLED: 'Hủy nhiệm vụ chăm sóc',
  ENROLLMENT_CARE_UPDATED: 'Cập nhật thông tin chăm sóc',

  // Class & Session & Attendance
  CANCEL: 'Hủy buổi học',
  CANCEL_CLASS_SESSION: 'Hủy buổi học',
  ASSIGN_CLASS_TEACHER: 'Phân công giáo viên',
  CLASS_TEACHER_ASSIGNMENT_ENDED: 'Kết thúc phân công giáo viên',
  ATTENDANCE_TEACHER_MARK: 'Giáo viên chấm điểm danh',
  ATTENDANCE_TEACHER_STATUS_CHANGED: 'Giáo viên đổi trạng thái điểm danh',
  ATTENDANCE_TEACHER_LESSON_UPDATED: 'Giáo viên cập nhật bài học',
  ATTENDANCE_CS_MARK: 'CSKH chấm điểm danh',
  ATTENDANCE_CONFLICT_RESOLVED: 'Admin phân xử xung đột điểm danh',
  ATTENDANCE_BULK_APPROVED: 'Duyệt hàng loạt điểm danh chờ CSKH',
  ATTENDANCE_ADMIN_NOTIFICATION: 'Thông báo chỉnh sửa điểm danh từ Admin',
  ATTENDANCE_IMPORT_SESSION_CREATED: 'Tạo buổi học từ Import điểm danh',
  ATTENDANCE_IMPORT_UPDATED: 'Cập nhật điểm danh từ Import',
  ATTENDANCE_IMPORT_CREATED: 'Tạo điểm danh từ Import',
  BULK_UPSERT: 'Điểm danh hàng loạt',
  RESET_SIDE: 'Đặt lại điểm danh',

  // Import & Sync & Backup
  GOOGLE_SHEET_SYNC: 'Đồng bộ dữ liệu Google Sheet',
  GOOGLE_SHEET_SYNC_ROLLBACK: 'Hoàn tác đồng bộ Google Sheet',
  CS_PROGRAM_BACKUP: 'Chạy Backup sổ Google Sheet',
  IMPORT_REQUEST_APPROVED: 'Duyệt yêu cầu tạo mới từ Import',
  IMPORT_REQUEST_APPROVED_TRANSFER: 'Duyệt yêu cầu chuyển giao từ Import',
  IMPORT_REQUEST_REJECTED: 'Từ chối yêu cầu tạo mới từ Import',

  // Messaging & Automation
  WORKFLOW_CREATED: 'Tạo kịch bản tự động',
  WORKFLOW_UPDATED: 'Cập nhật kịch bản tự động',
  WORKFLOW_DELETED: 'Xóa kịch bản tự động',
  BROADCAST_CREATED: 'Tạo chiến dịch phát tin',
  BROADCAST_CANCELLED: 'Hủy chiến dịch phát tin',

  // Users & System
  USER_CREATED: 'Tạo tài khoản nhân viên',
  USER_UPDATED: 'Cập nhật tài khoản nhân viên',
  USER_ENABLED: 'Mở khóa tài khoản nhân viên',
  USER_DISABLED: 'Vô hiệu hóa tài khoản nhân viên',
};

export const FIELD_LABELS: Record<string, string> = {
  full_name: 'Họ tên',
  phone: 'Số điện thoại',
  email: 'Email',
  gender: 'Giới tính',
  date_of_birth: 'Ngày sinh',
  occupation: 'Nghề nghiệp',
  external_id: 'Mã học viên',
  status: 'Trạng thái',
  cs_id: 'CSKH phụ trách',
  viewer_cs_id: 'CSKH xem (Read-only)',
  level: 'Trình độ',
  program_type: 'Chương trình học',
  package_id: 'Gói học',
  total_sessions: 'Tổng số buổi',
  total_attended: 'Số buổi đã học',
  external_remaining_sessions: 'Số buổi còn lại (Sheet)',
  class_model: 'Mô hình lớp',
  sales_note: 'Ghi chú Sale',
  study_report_url: 'Link báo cáo học tập',
  callback_note: 'Ghi chú gọi lại',
  hot_issue_note: 'Vấn đề nóng',
  exchange_info: 'Thông tin trao đổi',
  post_course_care: 'Chăm sóc sau khóa',
  payment_status: 'Trạng thái học phí',
  sale_name: 'Nhân viên Sale',
  start_date: 'Ngày bắt đầu',
  end_date: 'Ngày kết thúc',
  teacher_status: 'Trạng thái GV chấm',
  cs_status: 'Trạng thái CSKH chấm',
  reconciliation_state: 'Trạng thái đối soát',
  lesson_topic: 'Nội dung bài học',
  teacher_note: 'Ghi chú giáo viên',
  cs_note: 'Ghi chú CSKH',
  resolution_note: 'Ghi chú phân xử',
  note: 'Ghi chú',
  content: 'Nội dung chăm sóc',
  outcome: 'Kết quả chăm sóc',
  after_session_number: 'Sau buổi số',
  title: 'Tiêu đề',
  type: 'Loại nhiệm vụ',
  priority: 'Độ ưu tiên',
  due_at: 'Hạn xử lý',
  assigned_to_id: 'Người phụ trách',
  active: 'Kích hoạt',
  roles: 'Phân quyền',
  name: 'Tên',
  code: 'Mã nhân viên',
  staff_code: 'Mã CVHT',
  from_class_id: 'Từ lớp',
  to_class_id: 'Sang lớp',
  mode: 'Chế độ bàn giao',
  reason: 'Lý do',
  channel_mode: 'Kênh gửi',
  schedule_type: 'Hình thức gửi',
  total_recipients: 'Tổng người nhận',
  runId: 'Mã phiên đồng bộ',
  flowType: 'Luồng đồng bộ',
  programType: 'Chương trình học',
  triggerType: 'Hình thức kích hoạt',
  totalRows: 'Tổng số dòng quét',
  createdCount: 'Số dòng tạo mới',
  updatedCount: 'Số dòng cập nhật',
  unchangedCount: 'Số dòng giữ nguyên',
  conflictCount: 'Số dòng xung đột',
  failedCount: 'Số dòng lỗi',
  durationMs: 'Thời lượng chạy (ms)',
  skipped: 'Bỏ qua (không đổi file)',
  configId: 'Mã cấu hình',
  configName: 'Tên sổ / Nguồn',
  batchId: 'Mã đợt chạy (Batch)',
  staffCode: 'Mã nhân viên',
  totalStudents: 'Tổng học viên',
  updatedRows: 'Số dòng cập nhật',
  appendedRows: 'Số dòng thêm mới',
  unchangedRows: 'Số dòng giữ nguyên',
  updatedCellsCount: 'Tổng số ô cập nhật',
  attendanceCellsWritten: 'Số ô điểm danh đã ghi',
  syncedToGoogleSheet: 'Đã đẩy lên Google Sheet',
  localFilePath: 'Đường dẫn file Excel',
};

const IGNORED_DIFF_KEYS = new Set([
  '_meta',
  'id',
  'created_at',
  'updated_at',
  'password_hash',
  'encrypted_session_data',
  'qr_code',
  'program_metadata',
  'enrollment_classes',
  'cs_viewers',
  'student',
  'package',
  'cs',
  'sale',
  'class',
  'class_session',
  'teacher_user',
  'cs_user',
  'resolved_by',
  'created_by',
  'deleted_by',
  'recipients',
  'steps',
  'enrollments',
  'attendance',
]);

/**
 * Best-effort audit logger that never throws or breaks unit tests when `prisma.auditLog` is unmocked.
 */
export async function recordAuditLogSafe(params: {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId: string | number;
  beforeData?: any;
  afterData?: any;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    if (typeof (prisma as any)?.auditLog?.create !== 'function') return;
    await prisma.auditLog.create({
      data: {
        user_id: params.userId ?? 1,
        action: params.action,
        entity_type: params.entityType,
        entity_id: String(params.entityId),
        before_data: params.beforeData ?? undefined,
        after_data: params.afterData ?? undefined,
        ip_address: params.ipAddress ?? undefined,
      },
    });
  } catch {
    // Best-effort logging: never break business flow or unit tests
  }
}

export function formatActorDisplay(user?: {
  id?: number | null;
  name?: string | null;
  code?: string | null;
  staff_code?: string | null;
  email?: string | null;
  roles?: any;
} | null): AuditActorDto {
  if (!user) {
    return {
      id: null,
      name: 'Hệ thống',
      code: null,
      staff_code: null,
      email: null,
      roles: [],
      displayLabel: 'Hệ thống',
    };
  }

  const roles: string[] = Array.isArray(user.roles)
    ? user.roles.map(String)
    : [];
  const code = user.code || user.staff_code || null;
  const cleanName = (user.name || '').trim();
  const cleanCode = (code || '').trim();

  let displayLabel = cleanName || cleanCode || user.email || `User #${user.id}`;
  if (cleanName && cleanCode && !cleanName.toUpperCase().includes(cleanCode.toUpperCase())) {
    displayLabel = `${cleanName} - ${cleanCode}`;
  }

  return {
    id: user.id ?? null,
    name: user.name ?? null,
    code,
    staff_code: user.staff_code ?? code,
    email: user.email ?? null,
    roles,
    displayLabel,
  };
}

/**
 * Classify module from `action` and `entity_type`.
 */
export function classifyAuditModule(
  action: string,
  entityType: string,
  afterData?: any,
): ActivityModuleCode {
  if (afterData && typeof afterData === 'object' && afterData._meta?.module) {
    const m = String(afterData._meta.module).toUpperCase();
    if (
      m === 'ENROLLMENT' ||
      m === 'ATTENDANCE' ||
      m === 'CARE' ||
      m === 'MESSAGING' ||
      m === 'IMPORT_SYNC' ||
      m === 'SYSTEM'
    ) {
      return m as ActivityModuleCode;
    }
  }

  const act = (action || '').toUpperCase();
  const ent = (entityType || '').trim();
  const entUpper = ent.toUpperCase();

  // 1. IMPORT_SYNC (check first so IMPORT_REQUEST_APPROVED / ATTENDANCE_IMPORT_* / CS_PROGRAM_BACKUP match accurately)
  if (
    ent === 'ImportBatch' ||
    ent === 'ImportCreateRequest' ||
    ent === 'GoogleSheetSyncConfig' ||
    ent === 'ProgramSheetBackupConfig' ||
    act.includes('IMPORT') ||
    act.includes('SYNC') ||
    act.includes('BACKUP')
  ) {
    return 'IMPORT_SYNC';
  }

  // 2. CARE
  if (
    ent === 'CareLog' ||
    ent === 'CareTask' ||
    ent === 'CareMilestoneConfig' ||
    act.includes('CARE')
  ) {
    return 'CARE';
  }

  // 3. MESSAGING
  if (
    entUpper.includes('ZALO') ||
    entUpper.includes('LINE') ||
    entUpper.includes('AUTOMATION') ||
    entUpper.includes('BROADCAST') ||
    entUpper.includes('WORKFLOW') ||
    act.includes('ZALO') ||
    act.includes('LINE') ||
    act.includes('WORKFLOW') ||
    act.includes('BROADCAST')
  ) {
    return 'MESSAGING';
  }

  // 4. ENROLLMENT
  if (
    ent === 'Student' ||
    ent === 'Enrollment' ||
    ent === 'EnrollmentCsViewer' ||
    act.includes('STUDENT') ||
    act.includes('ENROLLMENT') ||
    act.includes('REASSIGN_CS') ||
    act.includes('REVOKE_CS_VIEWER') ||
    act.includes('TRANSFER_CLASS')
  ) {
    return 'ENROLLMENT';
  }

  // 5. ATTENDANCE
  if (
    ent === 'Attendance' ||
    ent === 'Class' ||
    ent === 'ClassSession' ||
    ent === 'ClassSchedule' ||
    ent === 'ClassTeacher' ||
    ent === 'class_teacher' ||
    ent === 'EnrollmentClass' ||
    ent === 'UserNotification' ||
    entUpper.includes('SESSION') ||
    act.includes('ATTENDANCE') ||
    act.includes('SESSION') ||
    act.includes('RECONCIL') ||
    act.includes('RESOLVE') ||
    act.includes('CLASS') ||
    act.includes('TEACHER') ||
    act === 'BULK_UPSERT' ||
    act === 'RESET_SIDE'
  ) {
    return 'ATTENDANCE';
  }

  // 6. SYSTEM
  return 'SYSTEM';
}

/**
 * Translate action + entity_type into human-friendly Vietnamese label.
 */
export function resolveActionLabel(action: string, entityType: string): string {
  const act = (action || '').toUpperCase().trim();
  const ent = (entityType || '').trim();

  if (ACTION_LABELS[act]) {
    if (act === 'CANCEL' && ent === 'ClassSession') return 'Hủy buổi học';
    return ACTION_LABELS[act];
  }

  if (act === 'CREATE') {
    if (ent === 'Attendance') return 'Tạo điểm danh';
    if (ent === 'ClassSession' || ent.includes('ActualSession')) return 'Tạo buổi học thực tế';
    if (ent === 'Student') return 'Thêm hồ sơ học viên';
    if (ent === 'Enrollment') return 'Tạo ghi danh mới';
    return `Tạo mới ${ent}`;
  }

  if (act === 'UPDATE') {
    if (ent === 'Attendance') return 'Cập nhật điểm danh';
    if (ent === 'ClassSession') return 'Cập nhật buổi học';
    if (ent === 'Student') return 'Cập nhật hồ sơ học viên';
    if (ent === 'Enrollment') return 'Cập nhật ghi danh';
    return `Cập nhật ${ent}`;
  }

  if (act === 'DELETE') {
    if (ent === 'ClassSession') return 'Xóa buổi học';
    if (ent === 'Attendance') return 'Xóa điểm danh';
    return `Xóa ${ent}`;
  }

  if (act.startsWith('ATTENDANCE_')) return 'Thao tác điểm danh';
  if (act.startsWith('RECONCILIATION_') || act.startsWith('RESOLVE_')) return 'Đối soát điểm danh';
  if (act.startsWith('WORKFLOW_')) return 'Quản lý kịch bản tự động';
  if (act.startsWith('BROADCAST_')) return 'Chiến dịch phát tin';
  if (act.startsWith('USER_')) return 'Quản lý tài khoản nhân viên';

  return action;
}

function formatFieldValue(
  field: string,
  val: any,
  ctx?: EnrichmentContext,
): any {
  if (val === undefined || val === null) return null;

  if ((field === 'cs_id' || field === 'viewer_cs_id' || field === 'assigned_to_id') && ctx) {
    const numId = Number(val);
    if (Number.isInteger(numId) && ctx.usersMap.has(numId)) {
      const u = ctx.usersMap.get(numId)!;
      return u.code && u.name
        ? `${u.code} - ${u.name}`
        : u.code || u.displayLabel;
    }
  }

  if ((field === 'from_class_id' || field === 'to_class_id' || field === 'class_id') && ctx) {
    const numId = Number(val);
    if (Number.isInteger(numId) && ctx.classesMap.has(numId)) {
      const cls = ctx.classesMap.get(numId)!;
      return cls.class_code || cls.class_name || `#${numId}`;
    }
  }

  if (Array.isArray(val)) {
    return val.join(', ');
  }

  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  return val;
}

function isSameValue(a: any, b: any): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) {
    return true;
  }
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a) === String(b);
}

/**
 * Compute changed fields between `before_data` and `after_data`.
 */
export function computeChangedFields(
  beforeData: any,
  afterData: any,
  ctx?: EnrichmentContext,
): ChangedFieldDto[] {
  const beforeObj =
    beforeData && typeof beforeData === 'object' && !Array.isArray(beforeData)
      ? (beforeData as Record<string, any>)
      : null;
  const afterObj =
    afterData && typeof afterData === 'object' && !Array.isArray(afterData)
      ? (afterData as Record<string, any>)
      : null;

  if (!beforeObj && !afterObj) return [];

  const changes: ChangedFieldDto[] = [];

  if (beforeObj && afterObj) {
    const allKeys = new Set<string>([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    for (const key of allKeys) {
      if (IGNORED_DIFF_KEYS.has(key)) continue;
      const bVal = beforeObj[key];
      const aVal = afterObj[key];
      if (bVal === undefined && aVal === undefined) continue;
      // If beforeObj only captured a subset of keys (e.g. { cs_id: 10 }) and afterObj has extra metadata keys (mode, note),
      // still include meaningful changes.
      if (!isSameValue(bVal, aVal)) {
        changes.push({
          field: key,
          label: FIELD_LABELS[key] || key,
          before: formatFieldValue(key, bVal, ctx),
          after: formatFieldValue(key, aVal, ctx),
        });
      }
    }
    return changes.slice(0, 15);
  }

  // Only afterObj exists (e.g., creation)
  if (!beforeObj && afterObj) {
    for (const [key, aVal] of Object.entries(afterObj)) {
      if (IGNORED_DIFF_KEYS.has(key)) continue;
      if (aVal === null || aVal === undefined || aVal === '') continue;
      if (typeof aVal === 'object' && !Array.isArray(aVal)) continue;
      changes.push({
        field: key,
        label: FIELD_LABELS[key] || key,
        before: null,
        after: formatFieldValue(key, aVal, ctx),
      });
    }
    return changes.slice(0, 10);
  }

  return changes;
}

/**
 * Build human-readable entityLabel and summary for an AuditLog row.
 */
export function enrichAuditLogItem(
  row: {
    id: number;
    user_id: number;
    action: string;
    entity_type: string;
    entity_id: string;
    before_data: any;
    after_data: any;
    ip_address: string | null;
    created_at: Date | string;
    user?: any;
  },
  ctx: EnrichmentContext,
): EnrichedAuditLogItemDto {
  const actor =
    ctx.usersMap.get(row.user_id) ||
    formatActorDisplay(row.user || { id: row.user_id, name: `User #${row.user_id}` });

  const module = classifyAuditModule(row.action, row.entity_type, row.after_data);
  const moduleLabel = MODULE_LABELS[module];
  const actionLabel = resolveActionLabel(row.action, row.entity_type);
  const changedFields = computeChangedFields(row.before_data, row.after_data, ctx);

  const entityIdNum = Number(row.entity_id);
  const ent = (row.entity_type || '').trim();
  const afterObj =
    row.after_data && typeof row.after_data === 'object' ? row.after_data : {};
  const beforeObj =
    row.before_data && typeof row.before_data === 'object' ? row.before_data : {};

  let entityLabel = `${ent} #${row.entity_id}`;

  if (afterObj._meta?.entity_label) {
    entityLabel = String(afterObj._meta.entity_label);
  } else if (ent === 'Enrollment') {
    const enr = Number.isInteger(entityIdNum) ? ctx.enrollmentsMap.get(entityIdNum) : undefined;
    if (enr?.student) {
      const extPart = enr.student.external_id ? `${enr.student.external_id} · ` : '';
      entityLabel = `Ghi danh #${enr.id} - ${enr.student.full_name} (${extPart}${enr.program_type || 'KAIWA'})`;
    } else {
      entityLabel = `Ghi danh #${row.entity_id}`;
    }
  } else if (ent === 'Student') {
    const st = Number.isInteger(entityIdNum) ? ctx.studentsMap.get(entityIdNum) : undefined;
    const name = st?.full_name || afterObj.full_name || beforeObj.full_name;
    const ext = st?.external_id || afterObj.external_id || beforeObj.external_id;
    if (name) {
      entityLabel = ext ? `HV: ${name} (${ext})` : `HV: ${name}`;
    } else {
      entityLabel = `Học viên #${row.entity_id}`;
    }
  } else if (ent === 'Class') {
    const cls = Number.isInteger(entityIdNum) ? ctx.classesMap.get(entityIdNum) : undefined;
    const label = cls?.class_code || cls?.class_name || afterObj.class_code || afterObj.class_name;
    entityLabel = label ? `Lớp: ${label}` : `Lớp #${row.entity_id}`;
  } else if (ent === 'ClassSession') {
    const classId = Number(afterObj.class_id || beforeObj.class_id);
    const cls = Number.isInteger(classId) ? ctx.classesMap.get(classId) : undefined;
    const clsName = cls?.class_code || cls?.class_name;
    entityLabel = clsName
      ? `Buổi học #${row.entity_id} (${clsName})`
      : `Buổi học #${row.entity_id}`;
  } else if (ent === 'Attendance') {
    if (afterObj.student_name) {
      entityLabel = `Điểm danh #${row.entity_id} - ${afterObj.student_name}`;
    } else {
      entityLabel = `Điểm danh #${row.entity_id}`;
    }
  } else if (ent === 'CareLog' || ent === 'CareTask') {
    const enrId = Number(afterObj.enrollment_id || beforeObj.enrollment_id);
    const enr = Number.isInteger(enrId) ? ctx.enrollmentsMap.get(enrId) : undefined;
    if (enr?.student) {
      entityLabel = `${ent === 'CareLog' ? 'Nhật ký CS' : 'Nhiệm vụ CS'} #${row.entity_id} - ${enr.student.full_name}`;
    } else {
      entityLabel = `${ent === 'CareLog' ? 'Nhật ký CS' : 'Nhiệm vụ CS'} #${row.entity_id}`;
    }
  } else if (ent === 'AutomationWorkflow') {
    const wfName = afterObj.name || beforeObj.name;
    entityLabel = wfName ? `Kịch bản: ${wfName}` : `Kịch bản #${row.entity_id}`;
  } else if (ent === 'BroadcastCampaign') {
    const bName = afterObj.name || beforeObj.name;
    entityLabel = bName ? `Chiến dịch: ${bName}` : `Chiến dịch #${row.entity_id}`;
  } else if (ent === 'User') {
    const u = Number.isInteger(entityIdNum) ? ctx.usersMap.get(entityIdNum) : undefined;
    const uName = u?.displayLabel || afterObj.name || beforeObj.name || afterObj.email;
    entityLabel = uName ? `Tài khoản: ${uName}` : `Tài khoản #${row.entity_id}`;
  } else if (ent === 'ProgramSheetBackupConfig') {
    const pType = afterObj.program_type || afterObj.programType || beforeObj.program_type || '';
    const cfgName = afterObj.configName || afterObj.name || '';
    entityLabel = cfgName
      ? `Sổ Backup: ${cfgName}`
      : pType
        ? `Backup Sheet ${pType} (#${row.entity_id})`
        : `Backup Sheet #${row.entity_id}`;
  } else if (ent === 'GoogleSheetSyncConfig') {
    const cfgName = afterObj.name || beforeObj.name || '';
    entityLabel = cfgName
      ? `Nguồn đồng bộ: ${cfgName} (${row.entity_id})`
      : `Nguồn đồng bộ #${row.entity_id}`;
  } else if (ent === 'ImportCreateRequest') {
    const ext = afterObj.external_id || beforeObj.external_id;
    const pkg = afterObj.package_code || beforeObj.package_code;
    entityLabel = ext ? `Yêu cầu Import: ${ext}${pkg ? ` (${pkg})` : ''}` : `Yêu cầu Import #${row.entity_id}`;
  }

  // Build summary
  let summary = '';
  if (afterObj._meta?.summary) {
    summary = String(afterObj._meta.summary);
  } else if (row.action === 'REASSIGN_CS') {
    const fromCs = formatFieldValue('cs_id', beforeObj.cs_id, ctx) || `#${beforeObj.cs_id ?? '?'}`;
    const toCs = formatFieldValue('cs_id', afterObj.cs_id, ctx) || `#${afterObj.cs_id ?? '?'}`;
    summary = `Chuyển CSKH phụ trách từ ${fromCs} sang ${toCs}`;
  } else if (row.action === 'REVOKE_CS_VIEWER') {
    const viewerCs = formatFieldValue('viewer_cs_id', beforeObj.viewer_cs_id, ctx) || `#${beforeObj.viewer_cs_id ?? '?'}`;
    summary = `Thu hồi quyền xem của ${viewerCs}`;
  } else if (row.action === 'TRANSFER_CLASS') {
    const fromCls = formatFieldValue('from_class_id', beforeObj.from_class_id, ctx) || `#${beforeObj.from_class_id ?? '?'}`;
    const toCls = formatFieldValue('to_class_id', afterObj.to_class_id, ctx) || `#${afterObj.to_class_id ?? '?'}`;
    summary = `Chuyển lớp từ ${fromCls} sang ${toCls}`;
  } else if (row.action === 'STUDENT_ACCESS_DENIED') {
    summary = `Từ chối thao tác ${afterObj.operation || 'READ'}: ${afterObj.reason || 'Không có quyền'}`;
  } else if (row.action === 'CANCEL' && ent === 'ClassSession') {
    summary = afterObj.reason ? `Hủy buổi học (Lý do: ${afterObj.reason})` : 'Hủy buổi học';
  } else if (row.action === 'CS_PROGRAM_BACKUP') {
    const pType = afterObj.program_type || afterObj.programType || '';
    const status = afterObj.status || 'SUCCESS';
    const cells = afterObj.updatedCellsCount ?? 0;
    summary = `Chạy backup sổ ${afterObj.configName || pType} (${status} · ${cells} ô cập nhật)`;
  } else if (row.action === 'GOOGLE_SHEET_SYNC') {
    const srcName = afterObj.name || row.entity_id;
    const created = afterObj.createdCount ?? 0;
    const updated = afterObj.updatedCount ?? 0;
    const failed = afterObj.failedCount ?? 0;
    summary = `Đồng bộ nguồn "${srcName}": +${created} tạo mới, ${updated} cập nhật, ${failed} lỗi`;
  } else if (changedFields.length > 0) {
    const parts = changedFields.slice(0, 3).map((cf) => {
      if (cf.before !== null && cf.before !== undefined && cf.before !== '') {
        return `${cf.label}: ${cf.before} → ${cf.after ?? 'trống'}`;
      }
      return `${cf.label}: ${cf.after}`;
    });
    summary = `${actionLabel} (${parts.join('; ')}${changedFields.length > 3 ? '...' : ''})`;
  } else {
    summary = `${actionLabel} trên ${entityLabel}`;
  }

  return {
    id: row.id,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    actor,
    module,
    moduleLabel,
    action: row.action,
    actionLabel,
    entityType: row.entity_type,
    entityId: String(row.entity_id),
    entityLabel,
    summary,
    changedFields,
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    ipAddress: row.ip_address ?? null,
  };
}
