/**
 * D8 (approved by the project owner 2026-10-25; re-ruled 2026-10-26 — OWNER
 * VERDICT on the acceptance case #14 of docs/khao-sat/AI_REVIEW/06:
 * "GV đã thôi assignment vẫn mark được ca mình đã dạy trong thời gian hiệu lực").
 *
 * Write-opinion authority is evaluated against the teacher assignment
 * EFFECTIVE ON THE SESSION DATE — i.e. the assignment WINDOW contained the
 * session date — REGARDLESS of the row's CURRENT `active` flag. `active`
 * records today's state ("still assigned?"), not history ("was this the
 * teacher's class on that date?"), so deactivating an assignment after the
 * fact must NOT retroactively revoke the teacher's right to mark sessions
 * they actually taught inside the recorded window.
 *
 * The `active` filter has been removed from the DB candidate queries
 * (attendance.service.assertWriteScope,
 * reconciliation.service.assertTeacherScope, reconciliation.service
 * markByTeacher privileged assist-mark branch, reconciliation.service
 * getTeacherSessions); this helper is the single decision point for whether a
 * teacher held a valid assignment on the session date. Note: D8 evaluates
 * target-teacher assignment validity on `sessionDate` only — it grants no
 * assist-mark operator authority by itself.
 *
 * RULE TABLE (a = active, W = [start_date, end_date], null bound = unbounded
 * for active=true only, d = sessionDate):
 *   a=true,  W covers d        -> effective   (current assignment in window)
 *   a=true,  W missing d       -> NOT         (assignment not yet begun / already expired on d)
 *   a=true,  no window (both null) -> effective (unbounded historical row shape — pinned)
 *   a=false, end_date != null, W covers d -> effective (OWNER VERDICT 2026-10-26, case #14:
 *                                              revoked assignment with an explicit end_date
 *                                              still authorizes its bounded window)
 *   a=false, end_date != null, W missing d -> NOT (date outside window -> 403)
 *   a=false, end_date == null (start_date null OR non-null) -> NOT
 *                                             (AMBIGUOUS REMOVAL BOUNDARY, pinned by owner
 *                                              ruling 2026-10-26: "thiếu dữ liệu -> Admin xác
 *                                              nhận từng trường hợp" & "`active=false`, có
 *                                              `start_date`, thiếu `end_date` chưa chứng minh
 *                                              quyền kéo dài vô hạn sau khi GV rời lớp...
 *                                              Không tự suy ngày kết thúc từ ngày chạy script
 *                                              hoặc tự cấp quyền vô hạn". Without an explicit
 *                                              `end_date`, an inactive row does not prove when
 *                                              the teacher left the class, so it must NOT
 *                                              authorize; contrast with a=true + end_date=null,
 *                                              the live ongoing row shape.)
 *
 * Equivalently: NOT effective iff the row is an inactive assignment missing
 * an explicit `end_date` (`!active && end_date === null`) OR the session date
 * lies outside `[start_date, end_date]`.
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
  // Ambiguous-removal boundary (owner 2026-10-26): an inactive row without an
  // explicit end_date (whether start_date is null or non-null) does not prove
  // when the teacher stopped teaching the class and must never grant an
  // unbounded post-departure right.
  if (!assignment.active && assignment.end_date === null) {
    return false;
  }
  // Window containment, regardless of the current active flag (D8 + 2026-10-26 verdict).
  if (assignment.start_date && assignment.start_date > sessionDate) return false;
  if (assignment.end_date && assignment.end_date < sessionDate) return false;
  return true;
}

/**
 * Candidate rows should already be filtered by class + teacher user; this
 * picks the first effective-on-date row (see the rule table above). Returns
 * null when none is effective on `sessionDate` (403).
 */
export function findEffectiveAssignment<T extends TeacherAssignmentWindow>(
  assignments: readonly T[],
  sessionDate: Date,
): T | null {
  return assignments.find((a) => isTeacherAssignmentEffectiveOn(a, sessionDate)) ?? null;
}

/**
 * Range variant used by the teacher-sessions LISTING
 * (reconciliation.service.getTeacherSessions): a class is listed if the row's
 * window INTERSECTS the requested date range (null range bound = open-ended;
 * null window bound = unbounded for active=true). The ambiguous-removal
 * boundary is identical: active=false with end_date=null (regardless of
 * start_date) lists nothing. A class listed this way is only a candidate —
 * every actual mark still passes the point rule
 * (isTeacherAssignmentEffectiveOn) against that session's date, so listing is
 * advisory and the write path authoritative.
 */
export function isTeacherAssignmentEffectiveInRange(
  assignment: TeacherAssignmentWindow,
  rangeStart: Date | null,
  rangeEnd: Date | null,
): boolean {
  if (!assignment.active && assignment.end_date === null) {
    return false;
  }
  if (rangeEnd !== null && assignment.start_date !== null && assignment.start_date > rangeEnd) {
    return false;
  }
  if (rangeStart !== null && assignment.end_date !== null && assignment.end_date < rangeStart) {
    return false;
  }
  return true;
}
