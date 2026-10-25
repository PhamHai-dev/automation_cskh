/**
 * D8 (approved by the project owner 2026-10-25): write-opinion authority is
 * evaluated against the teacher assignment EFFECTIVE AT THE SESSION DATE, not
 * only "active today".
 *
 * A ClassTeacher row is effective on a date iff:
 *   - active is true (removed assignments are not retro-authorized; a past
 *     session whose evidence is missing goes through the Admin-assisted mark,
 *     which is the approved "Admin xác nhận từng trường hợp" path), AND
 *   - start_date is null (unbounded start) or <= sessionDate, AND
 *   - end_date   is null (unbounded end)   or >= sessionDate.
 * Null window bounds are treated as unbounded — the absence of a window is not
 * proof of expiry; it is the historical shape of these rows.
 */
export interface TeacherAssignmentWindow {
  active: boolean;
  start_date: Date | null;
  end_date: Date | null;
}

export function isTeacherAssignmentEffectiveOn(
  assignment: TeacherAssignmentWindow,
  sessionDate: Date,
): boolean {
  if (!assignment.active) return false;
  if (assignment.start_date && assignment.start_date > sessionDate) return false;
  if (assignment.end_date && assignment.end_date < sessionDate) return false;
  return true;
}

/**
 * Candidate rows should already be filtered by class + teacher user; this
 * picks the first effective-on-date row. Returns null when none is effective,
 * i.e. the teacher may not mark this session's attendance themselves.
 */
export function findEffectiveAssignment<T extends TeacherAssignmentWindow>(
  assignments: readonly T[],
  sessionDate: Date,
): T | null {
  return assignments.find((a) => isTeacherAssignmentEffectiveOn(a, sessionDate)) ?? null;
}
