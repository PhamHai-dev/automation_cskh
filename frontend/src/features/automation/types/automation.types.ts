/** Automation feature types — mirror backend Prisma models + DTOs */

export type AutomationTriggerEvent =
  | 'ATTENDED'
  | 'ABSENT_APPROVED_A'
  | 'LEAVE_B'
  | 'ABSENT_UNAPPROVED_C'
  | 'TEACHER_ABSENT_D'
  | 'TECH_ERROR_E';

export type AutomationChannel =
  | 'ZALO_PERSONAL'
  | 'ZALO_GROUP'
  | 'LINE_PERSONAL'
  | 'LINE_GROUP';

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
  ZALO_PERSONAL: 'Zalo cá nhân',
  ZALO_GROUP: 'Nhóm Zalo',
  LINE_PERSONAL: 'LINE cá nhân / OA (1-1)',
  LINE_GROUP: 'Nhóm LINE',
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
  _count?: { deliveries: number };
}

export interface AutomationEnrollment {
  id: number;
  workflow_id: number;
  enrollment_id: number;
  added_by: number;
  created_at: string;
  enrollment?: {
    id: number;
    student?: { id: number; full_name: string; phone: string | null; email?: string | null };
    cs?: { id: number; name: string };
    package?: { id: number; name: string } | null;
    enrollment_classes?: Array<{
      id: number;
      class?: {
        id: number; class_code: string | null; class_name: string;
        class_teachers: Array<{ teacher: { id: number; name: string | null } }>;
      };
    }>;
  };
}

export interface MessageDelivery {
  id: number;
  enrollment_id: number;
  attendance_id: number;
  automation_step_id: number;
  zalo_account_id: number | null;
  zalo_group_id: number | null;
  line_account_id?: number | null;
  line_group_id?: number | null;
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

// ─── Multi-Channel Broadcast & Scheduled Campaigns ────────────────────────────

export type BroadcastChannelMode = 'AUTO' | 'ZALO_ONLY' | 'LINE_ONLY' | 'BOTH';

export type BroadcastScheduleType = 'IMMEDIATE' | 'SCHEDULED';

export type BroadcastCampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'SENDING'
  | 'COMPLETED'
  | 'PARTIAL_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export type BroadcastTargetType =
  | 'STUDENT'
  | 'ZALO_GROUP'
  | 'LINE_GROUP'
  | 'ZALO_USER'
  | 'LINE_USER';

export const BROADCAST_CHANNEL_MODE_LABELS: Record<BroadcastChannelMode, string> = {
  AUTO: 'Tự động Zalo/LINE',
  ZALO_ONLY: 'Chỉ Zalo',
  LINE_ONLY: 'Chỉ LINE',
  BOTH: 'Cả 2 kênh',
};

export const BROADCAST_STATUS_LABELS: Record<
  BroadcastCampaignStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' }
> = {
  DRAFT: { label: 'Nháp', variant: 'neutral' },
  SCHEDULED: { label: 'Đang hẹn giờ', variant: 'info' },
  SENDING: { label: 'Đang gửi...', variant: 'warning' },
  COMPLETED: { label: 'Hoàn thành', variant: 'success' },
  PARTIAL_FAILED: { label: 'Hoàn thành một phần', variant: 'warning' },
  FAILED: { label: 'Thất bại', variant: 'danger' },
  CANCELLED: { label: 'Đã hủy', variant: 'neutral' },
};

export const BROADCAST_TEMPLATE_VARIABLES = [
  { key: 'student_name', label: 'Tên học viên', sample: 'Nguyễn Minh Anh' },
  { key: 'student_phone', label: 'SĐT học viên', sample: '0912345678' },
  { key: 'class_name', label: 'Tên lớp', sample: 'IELTS Intensive K18' },
  { key: 'enrollment_package', label: 'Tên gói học', sample: 'IELTS 6.5 Cam Kết' },
  { key: 'remaining_sessions', label: 'Số buổi còn lại', sample: '12' },
  { key: 'cs_name', label: 'Tên CSKH phụ trách', sample: 'Trần Thu Hà' },
  { key: 'teacher_name', label: 'Tên giáo viên', sample: 'Ms. Lan Hương' },
];

export interface RichAttachmentItem {
  url: string;
  filePath?: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface RichLinkItem {
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  buttonLabel?: string;
}

export interface RichTextStyleSpan {
  start: number;
  len: number;
  st: string;
}

export interface RichMessageMetadata {
  urgency?: 0 | 1 | 2; // 0 = Bình thường, 1 = Quan trọng (!), 2 = Khẩn cấp (!!)
  styles?: RichTextStyleSpan[];
  attachments?: RichAttachmentItem[];
  links?: RichLinkItem[];
}

export interface BroadcastRecipient {
  id: number;
  campaign_id: number;
  target_type: BroadcastTargetType;
  platform: 'ZALO' | 'LINE' | string;
  student_id: number | null;
  zalo_account_id: number | null;
  zalo_group_id: number | null;
  line_account_id: number | null;
  line_group_id: number | null;
  external_target_id: string | null;
  target_display_name: string | null;
  rendered_content: string;
  rendered_metadata?: RichMessageMetadata | null;
  status: MessageDeliveryStatus;
  sent_at: string | null;
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at?: string;
}

export interface BroadcastCampaign {
  id: number;
  name: string;
  description: string | null;
  message_content: string;
  message_metadata?: RichMessageMetadata | null;
  channel_mode: BroadcastChannelMode;
  schedule_type: BroadcastScheduleType;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: BroadcastCampaignStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  queue_job_id?: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
  created_by?: { id: number; name: string; email?: string } | null;
  recipients?: BroadcastRecipient[];
}

export interface BroadcastTargetStudentItem {
  id: number;
  external_id?: string | null;
  full_name: string;
  phone?: string | null;
  email?: string | null;
  cs_id?: number | null;
  cs_name?: string | null;
  cs_code?: string | null;
  class_name?: string | null;
  class_code?: string | null;
  package_name?: string | null;
  teacher_name?: string | null;
  remaining_sessions?: number | null;
  zalo_linked?: boolean;
  zaloLinked?: boolean;
  zalo_group_name?: string | null;
  zaloGroupName?: string | null;
  zalo_target_name?: string | null;
  zalo_account_name?: string | null;
  line_linked?: boolean;
  lineLinked?: boolean;
  line_group_name?: string | null;
  lineGroupName?: string | null;
  line_target_name?: string | null;
  line_account_name?: string | null;
  zalo_contact_relations?: Array<{
    id?: number;
    zalo_account_id?: number;
    target_type?: string;
    display_name?: string | null;
    friend_zalo_uid?: string | null;
    zalo_group?: { id: number; name?: string | null; zalo_group_id?: string } | null;
    zalo_account?: { id: number; display_name?: string | null } | null;
  }>;
  line_contact_relations?: Array<{
    id?: number;
    line_account_id?: number;
    target_type?: string;
    display_name?: string | null;
    friend_line_uid?: string | null;
    line_group?: { id: number; name?: string | null; line_group_id?: string } | null;
    line_account?: { id: number; display_name?: string | null } | null;
  }>;
  enrollments?: Array<{
    id: number;
    cs?: { id: number; name: string; code?: string | null } | null;
    package?: { id: number; name: string } | null;
    enrollment_classes?: Array<{
      id: number;
      class?: {
        id: number;
        class_code?: string | null;
        class_name: string;
        class_teachers?: Array<{ teacher?: { id: number; name?: string | null } | null }>;
      } | null;
    }>;
  }>;
}

export interface BroadcastTargetZaloGroupItem {
  id: number;
  zalo_group_id: string;
  name: string | null;
  avatar_url?: string | null;
  member_count?: number | null;
  zalo_account_id: number;
  account_name?: string | null;
  zalo_account?: { id: number; display_name: string | null; status?: string } | null;
}

export interface BroadcastTargetLineGroupItem {
  id: number;
  line_group_id: string;
  name: string | null;
  avatar_url?: string | null;
  member_count?: number | null;
  line_account_id: number;
  account_name?: string | null;
  line_account?: { id: number; display_name: string | null; account_type?: string; status?: string } | null;
}

export interface BroadcastTargetsCatalog {
  students: BroadcastTargetStudentItem[];
  zaloGroups: BroadcastTargetZaloGroupItem[];
  lineGroups: BroadcastTargetLineGroupItem[];
  zaloAccounts: Array<{ id: number; display_name: string | null; status?: string }>;
  lineAccounts: Array<{ id: number; display_name: string | null; account_type?: string; status?: string }>;
}

export interface CreateBroadcastCampaignDTO {
  name: string;
  description?: string;
  message_content: string;
  message_metadata?: RichMessageMetadata | null;
  channel_mode: BroadcastChannelMode;
  schedule_type: BroadcastScheduleType;
  scheduled_at?: string | null;
  student_ids?: number[];
  zalo_group_ids?: number[];
  line_group_ids?: number[];
  direct_targets?: Array<{
    platform: 'ZALO' | 'LINE';
    account_id: number;
    external_target_id: string;
    target_type?: 'GROUP' | 'USER';
    display_name?: string;
  }>;
}

