export type CareOutcome =
  | 'POSITIVE'
  | 'NEED_SUPPORT_SYSTEM'
  | 'TEMP_PAUSE'
  | 'NEED_CURRICULUM_SUPPORT'
  | 'NEED_STUDENT_WEAKNESS_FIX'
  | 'NEED_TEACHER_SUPPORT'
  | 'NEGATIVE_WANTS_TO_STOP'
  | 'NO_RESPONSE';

export type TaskType = 'CALLBACK' | 'HOT_ISSUE' | 'FOLLOW_UP';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskStatus = 'PENDING' | 'DONE' | 'CANCELLED';

export interface CareLog {
  id: number;
  enrollment_id: number;
  cs_id: number;
  cs?: {
    id: number;
    name: string;
    email: string;
  };
  after_session_number: number;
  outcome: CareOutcome;
  content?: string | null;
  created_at: string;
}

export interface CreateCareLogDTO {
  after_session_number: number;
  outcome: CareOutcome;
  content?: string;
}

export interface CareTask {
  id: number;
  enrollment_id?: number | null;
  enrollment?: {
    id: number;
    student?: {
      id: number;
      full_name: string;
      phone: string;
      external_id: string;
    };
    package?: {
      id: number;
      name: string;
      code: string;
    };
  } | null;
  assigned_to_id: number;
  assigned_to?: {
    id: number;
    name: string;
    email: string;
  };
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  title?: string | null;
  note?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCareTaskDTO {
  enrollment_id: number;
  type: TaskType;
  priority?: TaskPriority;
  title?: string;
  note?: string;
  due_at?: string;
  assigned_to_id?: number;
}

export interface UpdateCareTaskDTO {
  type?: TaskType;
  priority?: TaskPriority;
  title?: string;
  note?: string;
  due_at?: string;
  assigned_to_id?: number;
  status?: TaskStatus;
}

export interface TaskFilterParams {
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  assigned_to_id?: number;
  enrollment_id?: number;
  due_filter?: 'overdue' | 'today' | 'this_week';
  limit?: number;
  offset?: number;
}
