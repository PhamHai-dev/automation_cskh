/** Automation feature types — mirror backend Prisma models + DTOs */

export type AutomationTriggerEvent =
  | 'ATTENDED'
  | 'ABSENT_APPROVED_A'
  | 'LEAVE_B'
  | 'ABSENT_UNAPPROVED_C'
  | 'TEACHER_ABSENT_D'
  | 'TECH_ERROR_E';

export type AutomationChannel = 'ZALO_PERSONAL' | 'ZALO_GROUP';

export type MessageDeliveryStatus =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED'
  | 'SKIPPED_NOT_FRIEND'
  | 'SKIPPED_GROUP_INACTIVE'
  | 'SKIPPED_ACCOUNT_INACTIVE'
  | 'SKIPPED_SESSION_EXPIRED'
  | 'SKIPPED_DISABLED';

export const TRIGGER_EVENT_OPTIONS: Array<{ value: AutomationTriggerEvent; label: string }> = [
  { value: 'ATTENDED', label: 'Điểm danh Có mặt' },
  { value: 'ABSENT_APPROVED_A', label: 'Vắng có phép (A)' },
  { value: 'LEAVE_B', label: 'Bảo lưu / Nghỉ (B)' },
  { value: 'ABSENT_UNAPPROVED_C', label: 'Vắng không phép (C)' },
  { value: 'TEACHER_ABSENT_D', label: 'Giáo viên vắng (D)' },
  { value: 'TECH_ERROR_E', label: 'Lỗi kỹ thuật (E)' },
];

export const TRIGGER_EVENT_LABELS: Record<string, string> = Object.fromEntries(
  TRIGGER_EVENT_OPTIONS.map((o) => [o.value, o.label]),
);

export const CHANNEL_LABELS: Record<AutomationChannel, string> = {
  ZALO_PERSONAL: 'Nhắn riêng (Zalo cá nhân)',
  ZALO_GROUP: 'Gửi vào nhóm Zalo',
};

export const DELIVERY_STATUS_LABELS: Record<string, { label: string; variant: string }> = {
  SCHEDULED: { label: 'Chờ gửi', variant: 'info' },
  QUEUED: { label: 'Đang xếp hàng', variant: 'info' },
  SENDING: { label: 'Đang gửi', variant: 'warning' },
  SENT: { label: 'Đã gửi', variant: 'success' },
  FAILED: { label: 'Thất bại', variant: 'danger' },
  CANCELLED: { label: 'Đã hủy', variant: 'neutral' },
  SKIPPED_NOT_FRIEND: { label: 'Bỏ qua (không phải bạn)', variant: 'warning' },
  SKIPPED_GROUP_INACTIVE: { label: 'Bỏ qua (nhóm inactive)', variant: 'warning' },
  SKIPPED_ACCOUNT_INACTIVE: { label: 'Bỏ qua (nick inactive)', variant: 'warning' },
  SKIPPED_SESSION_EXPIRED: { label: 'Bỏ qua (phiên hết hạn)', variant: 'warning' },
  SKIPPED_DISABLED: { label: 'Bỏ qua (đã tắt)', variant: 'neutral' },
};

export const TEMPLATE_VARIABLES = [
  { key: 'student_name', label: 'Tên học viên' },
  { key: 'student_phone', label: 'SĐT học viên' },
  { key: 'enrollment_package', label: 'Tên gói học' },
  { key: 'session_number', label: 'Số buổi (session)' },
  { key: 'class_name', label: 'Tên lớp' },
  { key: 'teacher_name', label: 'Tên giáo viên' },
  { key: 'attendance_status', label: 'Trạng thái điểm danh' },
  { key: 'remaining_sessions', label: 'Số buổi còn lại' },
  { key: 'cs_name', label: 'Tên CSKH phụ trách' },
];

export interface AutomationWorkflow {
  id: number;
  name: string;
  description: string | null;
  owner_cs_id: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  owner?: { id: number; name: string; email: string };
  steps?: AutomationStep[];
  _count?: { enrollments: number; steps: number };
}

export interface AutomationStep {
  id: number;
  workflow_id: number;
  session_number: number;
  trigger_event: AutomationTriggerEvent;
  delay_minutes: number;
  channel: AutomationChannel;
  target_group_id: number | null;
  message_content: string;
  message_variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationEnrollment {
  id: number;
  workflow_id: number;
  enrollment_id: number;
  added_by: number;
  created_at: string;
  enrollment?: {
    id: number;
    student?: { id: number; full_name: string; phone: string | null };
    cs?: { id: number; name: string };
  };
}

export interface MessageDelivery {
  id: number;
  enrollment_id: number;
  attendance_id: number;
  automation_step_id: number;
  zalo_account_id: number;
  zalo_group_id: number | null;
  scheduled_at: string;
  sent_at: string | null;
  status: MessageDeliveryStatus;
  rendered_content: string;
  retry_count: number;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
  enrollment?: { student?: { id: number; full_name: string } };
  automation_step?: { session_number: number; trigger_event: AutomationTriggerEvent };
}

export interface WorkflowListResult {
  items: AutomationWorkflow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SuggestLinkItem {
  student: { id: number; full_name: string; phone: string };
  friend: {
    zalo_uid: string;
    display_name: string | null;
    phone_from_sdk: string | null;
    zalo_account_id: number;
    avatar_url: string | null;
  };
  zaloAccount: { id: number; display_name: string | null };
  alreadyLinked: boolean;
}
