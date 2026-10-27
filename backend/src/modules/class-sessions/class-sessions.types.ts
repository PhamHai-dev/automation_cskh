export interface CreateClassSessionDTO {
  session_number?: number;
  session_date: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  /**
   * Teacher actual-session route only. The generic create schema strips both of these, so
   * they can never be supplied by generic (scheduled) create callers.
   * `idempotency_key` is a client intent key, not a date-based uniqueness constraint.
   */
  idempotency_key?: string;
  enrollment_class_id?: number;
}

export interface UpdateClassSessionDTO {
  session_number?: number;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  teacher_id?: number;
  status?: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

export interface ActualSessionResult {
  session: any;
  replayed: boolean;
}
