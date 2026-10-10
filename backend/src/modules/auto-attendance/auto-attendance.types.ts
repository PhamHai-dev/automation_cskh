export const AUTO_ATTENDANCE_DELAY_KEY = 'AUTO_ATTENDANCE_DELAY_MINUTES';
export const AUTO_ATTENDANCE_ENABLED_KEY = 'AUTO_ATTENDANCE_ENABLED';
export const DEFAULT_AUTO_ATTENDANCE_DELAY_MINUTES = 15;
export const DEFAULT_AUTO_ATTENDANCE_ENABLED = true;

export interface AutoAttendanceSettings {
  enabled: boolean;
  delay_minutes: number;
  updated_at: Date;
  updated_by_id: number | null;
}

export interface UpdateAutoAttendanceSettingsDTO {
  delay_minutes: number;
  enabled?: boolean;
}

export interface AutoAttendanceCycleResult {
  processed_schedules: number;
  attended_count: number;
  skipped_count: number;
  failed_count: number;
  issues_created: number;
}
