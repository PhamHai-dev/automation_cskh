import { AuthUser } from '../../middlewares/auth.middleware';

type AttendanceActor = Pick<AuthUser, 'roles'> | { roles: string[] } | undefined;

/**
 * Pure teacher accounts receive a deliberately allow-listed attendance view.
 * Multi-role staff retain the existing response so their authorized CS/Admin workflows
 * are not changed by the teacher-history privacy boundary.
 */
export function isPureTeacherActor(actor: AttendanceActor): boolean {
  const roles = actor?.roles ?? [];
  return roles.includes('TEACHER') &&
    !roles.includes('ADMIN') &&
    !roles.includes('MANAGE') &&
    !roles.includes('CS');
}

export function presentAttendanceForActor<T>(record: T, actor: AttendanceActor): T {
  if (!record || !isPureTeacherActor(actor)) return record;
  const item = record as any;
  return {
    id: item.id,
    enrollment_class_id: item.enrollment_class_id,
    class_session_id: item.class_session_id,
    source: item.source,
    teacher_status: item.teacher_status ?? null,
    reconciliation_state: item.reconciliation_state ?? null,
    lesson_topic: item.lesson_topic ?? null,
    teacher_note: item.teacher_note ?? null,
    cs_note: item.cs_note ?? null,
    teacher_submitted_at: item.teacher_submitted_at ?? null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    ...(item.class_session !== undefined ? { class_session: item.class_session } : {}),
    ...(item.enrollment_class !== undefined ? { enrollment_class: item.enrollment_class } : {}),
  } as T;
}

export function presentAttendancesForActor<T>(records: T[], actor: AttendanceActor): T[] {
  if (!Array.isArray(records) || !isPureTeacherActor(actor)) return records;
  return records.map((record) => presentAttendanceForActor(record, actor));
}

export function presentSessionForActor<T>(session: T, actor: AttendanceActor): T {
  if (!session || !isPureTeacherActor(actor)) return session;
  const item = session as any;
  if (!Array.isArray(item.attendance)) return session;
  return {
    ...item,
    attendance: presentAttendancesForActor(item.attendance, actor),
  } as T;
}

export function presentClassForActor<T>(cls: T, actor: AttendanceActor): T {
  if (!cls || !isPureTeacherActor(actor)) return cls;
  const item = cls as any;
  return {
    ...item,
    ...(Array.isArray(item.class_sessions)
      ? { class_sessions: item.class_sessions.map((session: any) => presentSessionForActor(session, actor)) }
      : {}),
    ...(Array.isArray(item.enrollment_classes)
      ? {
          enrollment_classes: item.enrollment_classes.map((ec: any) => ({
            ...ec,
            ...(Array.isArray(ec.attendance)
              ? { attendance: presentAttendancesForActor(ec.attendance, actor) }
              : {}),
            ...(ec.attendance_stats
              ? {
                  attendance_stats: {
                    totalAttendedTeacher: ec.attendance_stats.totalAttendedTeacher ?? 0,
                    monthAttendedTeacher: ec.attendance_stats.monthAttendedTeacher ?? 0,
                  },
                }
              : {}),
          })),
        }
      : {}),
  } as T;
}
