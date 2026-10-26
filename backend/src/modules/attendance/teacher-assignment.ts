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
 * The 2026-10-25 implementation additionally required `active === true`,
 * which the owner ruled INSUFFICIENT for "quyền nhập bổ sung xét phân công
 * tại ngày dạy". The `active` filter has been removed from the DB candidate
 * queries (attendance.service.assertWriteScope,
 * reconciliation.service.assertTeacherScope, reconciliation.service
 * getTeacherSessions); this helper is the single decision point.
 *
 * RULE TABLE (a = active, W = [start_date, end_date], null bound = unbounded,
 * d = sessionDate):
 *   a=true,  W covers d        -> effective   (current assignment in window)
 *   a=true,  W missing d       -> NOT         (assignment not yet begun / already expired on d)
 *   a=true,  no window (both null) -> effective (unbounded historical row shape — pinned)
 *   a=false, W covers d        -> effective   (OWNER VERDICT 2026-10-26, case #14:
 *                                              revoked assignment still authorizes its own window)
 *   a=false, W missing d       -> NOT         (date outside every window = missing/expired
 *                                              evidence -> 403; Admin-assisted mark is the path)
 *   a=false, no window (both null) -> NOT     (AMBIGUOUS REMOVAL BOUNDARY, pinned by owner
 *                                              ruling: "thiếu dữ liệu -> Admin xác nhận từng
 *                                              trường hợp". active=false with NO start/end
 *                                              evidence carries no historical signal, so it
 *                                              must NOT authorize; contrast with a=true + no
 *                                              window, the live full-period row shape.)
 *
 * Equivalently: NOT effective iff the session date lies outside the window
 * (null bounds unbounded) OR the row is a window-less removal
 * (active === false && start_date === null && end_date === null).
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
  // Ambiguous-removal boundary (owner 2026-10-26): an inactive row with no
  // window data carries no evidence of WHEN the teacher held the assignment.
  // The owner ruled such cases to the Admin-assisted path, not self-mark.
  if (!assignment.active && assignment.start_date === null && assignment.end_date === null) {
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
 * null when none is effective, i.e. the teacher may not mark this session's
 * attendance themselves — the request then takes the 403 path toward the
 * Admin-assisted mark.
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
 * null window bound = unbounded, same convention as the point rule). The
 * ambiguous-removal boundary is identical: active=false with no window data
 * lists nothing. A class listed this way is only a candidate — every actual
 * mark still passes the point rule (isTeacherAssignmentEffectiveOn) against
 * that session's date, so listing is advisory and the write path authoritative.
 */
export function isTeacherAssignmentEffectiveInRange(
  assignment: TeacherAssignmentWindow,
  rangeStart: Date | null,
  rangeEnd: Date | null,
): boolean {
  if (!assignment.active && assignment.start_date === null && assignment.end_date === null) {
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
