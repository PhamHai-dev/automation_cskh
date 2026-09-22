import { CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus } from '@prisma/client';

export interface CreateCareLogDTO {
  after_session_number: number;
  outcome: CareLogOutcome;
  content?: string;
}

export interface CreateCareTaskDTO {
  enrollment_id: number;
  assigned_to_id?: number;
  type: CareTaskType;
  title?: string;
  note?: string;
  due_at?: string | Date;
  priority?: CareTaskPriority;
}

export interface UpdateCareTaskDTO {
  assigned_to_id?: number;
  type?: CareTaskType;
  title?: string;
  note?: string;
  due_at?: string | Date;
  priority?: CareTaskPriority;
  status?: CareTaskStatus;
}

export interface CareTaskFilterParams {
  status?: CareTaskStatus;
  priority?: CareTaskPriority;
  type?: CareTaskType;
  assigned_to_id?: number;
  enrollment_id?: number;
  due_filter?: 'overdue' | 'today' | 'this_week' | 'all';
  limit?: number;
  offset?: number;
}

export interface CareMilestoneItem {
  id: number;
  session_number: number;
  display_order: number;
  created_at: Date;
}

export interface UpdateEnrollmentCareDTO {
  study_report_url?: string | null;
  exchange_info?: string | null;
  callback_note?: string | null;
  hot_issue_note?: string | null;
  post_course_care?: string | null;
}

export interface SaveSessionCareLogDTO {
  content: string;
  outcome?: CareLogOutcome;
}
