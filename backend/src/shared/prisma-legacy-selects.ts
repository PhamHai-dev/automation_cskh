/**
 * Explicit projections for endpoints that must remain usable before the JLPT
 * foundation migration is applied to the current database.
 *
 * Do not add program_type, session_type, or session_title here. The gated JLPT
 * endpoints must use their own migrated-environment projections.
 */
export const LEGACY_CLASS_SCALAR_SELECT = {
  id: true,
  class_code: true,
  class_name: true,
  level: true,
  model_type: true,
  attendance_source: true,
  active: true,
  created_at: true,
  updated_at: true,
} as const;

export const LEGACY_CLASS_SESSION_SCALAR_SELECT = {
  id: true,
  class_id: true,
  session_number: true,
  session_date: true,
  start_time: true,
  end_time: true,
  teacher_id: true,
  status: true,
  created_by_id: true,
  created_at: true,
  updated_at: true,
  class_schedule_id: true,
} as const;
