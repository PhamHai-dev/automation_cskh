/**
 * Automation Workflow — Types & DTOs
 */

// ─── Workflow ─────────────────────────────────────────────────────────

export interface CreateWorkflowDTO {
  name: string;
  description?: string;
}

export interface UpdateWorkflowDTO {
  name?: string;
  description?: string;
  active?: boolean;
}

// ─── Step (cụm trigger) ──────────────────────────────────────────────

export type TriggerEvent =
  | 'ATTENDED'
  | 'ABSENT_APPROVED_A'
  | 'LEAVE_B'
  | 'ABSENT_UNAPPROVED_C'
  | 'TEACHER_ABSENT_D'
  | 'TECH_ERROR_E';

export type AutomationChannel = 'ZALO_PERSONAL' | 'ZALO_GROUP' | 'LINE_PERSONAL' | 'LINE_GROUP';

export interface CreateStepDTO {
  session_number: number;
  trigger_event: TriggerEvent;
  delay_minutes: number;
  channel: AutomationChannel;
  target_group_id?: number | null;
  message_content: string;
  message_variables: string[]; // list of variable names used in template
  active?: boolean;
}

export interface UpdateStepDTO {
  session_number?: number;
  trigger_event?: TriggerEvent;
  delay_minutes?: number;
  channel?: AutomationChannel;
  target_group_id?: number | null;
  message_content?: string;
  message_variables?: string[];
  active?: boolean;
}

// ─── Enrollment (add học viên vào workflow) ───────────────────────────

export interface AddEnrollmentDTO {
  enrollment_id: number;
}

export interface BulkAddEnrollmentDTO {
  enrollment_ids: number[];
}

// ─── Delivery status labels ──────────────────────────────────────────

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Đã lên lịch',
  QUEUED: 'Đang xếp hàng',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
  SKIPPED_NOT_FRIEND: 'Bỏ qua — chưa kết bạn',
  SKIPPED_GROUP_INACTIVE: 'Bỏ qua — nhóm không hoạt động',
  SKIPPED_ACCOUNT_INACTIVE: 'Bỏ qua — tài khoản không hoạt động',
  SKIPPED_SESSION_EXPIRED: 'Bỏ qua — phiên hết hạn',
  SKIPPED_DISABLED: 'Bỏ qua — đã tắt',
};

export const TRIGGER_EVENT_LABELS: Record<TriggerEvent, string> = {
  ATTENDED: 'Có mặt',
  ABSENT_APPROVED_A: 'Vắng phép (A)',
  LEAVE_B: 'Nghỉ có phép (B)',
  ABSENT_UNAPPROVED_C: 'Vắng không phép (C)',
  TEACHER_ABSENT_D: 'Giáo viên vắng (D)',
  TECH_ERROR_E: 'Lỗi kỹ thuật (E)',
};

// ─── Template variables ──────────────────────────────────────────────

export const TEMPLATE_VARIABLES = [
  { name: 'student_name', label: 'Tên học viên' },
  { name: 'student_phone', label: 'SĐT học viên' },
  { name: 'enrollment_package', label: 'Gói học' },
  { name: 'session_number', label: 'Số buổi học' },
  { name: 'class_name', label: 'Tên lớp' },
  { name: 'teacher_name', label: 'Tên giáo viên' },
  { name: 'attendance_status', label: 'Trạng thái điểm danh' },
  { name: 'remaining_sessions', label: 'Số buổi còn lại' },
  { name: 'cs_name', label: 'Tên CS phụ trách' },
] as const;

// ─── Query params ────────────────────────────────────────────────────

export interface ListWorkflowsQuery {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
}

export interface ListDeliveriesQuery {
  page?: number;
  limit?: number;
  status?: string;
  enrollment_id?: number;
}
