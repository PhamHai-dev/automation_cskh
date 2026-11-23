import {
  isPureTeacherActor,
  presentAttendanceForActor,
  presentClassForActor,
} from '../attendance.presenter';

const attendance = {
  id: 9,
  enrollment_class_id: 10,
  class_session_id: 11,
  status: 'ABSENT_UNAPPROVED_C',
  teacher_status: 'ATTENDED',
  cs_status: 'ABSENT_UNAPPROVED_C',
  cs_user_id: 88,
  reconciliation_state: 'CONFLICT',
  resolved_by_id: 7,
  resolution_note: 'Admin resolution',
  lesson_topic: 'Bài 1',
  teacher_note: 'Tốt',
  cs_note: 'Phụ huynh đã xác nhận',
  source: 'MANUAL',
  created_at: new Date(),
  updated_at: new Date(),
};

const teacher = { roles: ['TEACHER'] };

describe('attendance presenter privacy', () => {
  it('recognizes only a pure teacher account', () => {
    expect(isPureTeacherActor(teacher)).toBe(true);
    expect(isPureTeacherActor({ roles: ['TEACHER', 'CS'] })).toBe(false);
    expect(isPureTeacherActor({ roles: ['TEACHER', 'MANAGE'] })).toBe(false);
  });

  it('allows teacher status and notes but removes CS/final/reconciliation data', () => {
    const result = presentAttendanceForActor(attendance, teacher) as any;
    expect(result).toMatchObject({
      id: 9,
      teacher_status: 'ATTENDED',
      lesson_topic: 'Bài 1',
      teacher_note: 'Tốt',
      cs_note: 'Phụ huynh đã xác nhận',
    });
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('cs_status');
    expect(result).not.toHaveProperty('cs_user_id');
    expect(result).not.toHaveProperty('reconciliation_state');
    expect(result).not.toHaveProperty('resolved_by_id');
    expect(result).not.toHaveProperty('resolution_note');
  });

  it('keeps privileged and multi-role response unchanged', () => {
    expect(presentAttendanceForActor(attendance, { roles: ['ADMIN'] })).toBe(attendance);
    expect(presentAttendanceForActor(attendance, { roles: ['TEACHER', 'CS'] })).toBe(attendance);
  });

  it('sanitizes nested class attendance and finalized statistics', () => {
    const result = presentClassForActor({
      enrollment_classes: [{
        attendance: [attendance],
        attendance_stats: {
          totalAttendedAdmin: 9,
          monthAttendedAdmin: 4,
          totalAttendedTeacher: 7,
          monthAttendedTeacher: 2,
        },
      }],
      class_sessions: [{ attendance: [attendance] }],
    }, teacher) as any;

    expect(result.enrollment_classes[0].attendance_stats).toEqual({
      totalAttendedTeacher: 7,
      monthAttendedTeacher: 2,
    });
    expect(result.enrollment_classes[0].attendance[0]).not.toHaveProperty('cs_status');
    expect(result.class_sessions[0].attendance[0]).not.toHaveProperty('status');
  });
});
