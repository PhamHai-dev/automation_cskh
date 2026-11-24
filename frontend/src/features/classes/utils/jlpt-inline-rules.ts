import type { AttendanceStatus, JlptLearningRecordField, JlptLearningRecordPatch, JlptRating } from '../types/classes.types';

export const isJlptTeacherAbsent = (status?: AttendanceStatus | null): boolean =>
  Boolean(status && ['ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E'].includes(status));

export function jlptInlinePatch(field: JlptLearningRecordField, raw: string): JlptLearningRecordPatch {
  if (field === 'test_correct_answers') {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Nhập số nguyên không âm');
    return { field, value };
  }
  if (field === 'homework_completed') {
    if (!['', 'true', 'false'].includes(raw)) throw new Error('Giá trị bài tập không hợp lệ');
    return { field, value: raw === '' ? null : raw === 'true' };
  }
  if (!['', 'A', 'B', 'C'].includes(raw)) throw new Error('Đánh giá phải là A, B hoặc C');
  return { field, value: (raw || null) as JlptRating | null };
}
