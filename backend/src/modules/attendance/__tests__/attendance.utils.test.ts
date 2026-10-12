import { AttendanceStatus } from '@prisma/client';
import { normalizeClassModel, parseAttendanceValue, remapDateYear } from '../attendance.utils';

describe('parseAttendanceValue', () => {
  it.each([
    ['X', AttendanceStatus.ATTENDED, 1], ['1', AttendanceStatus.ATTENDED, 1], ['2', AttendanceStatus.ATTENDED, 2], ['3', AttendanceStatus.ATTENDED, 3], ['A', AttendanceStatus.ABSENT_APPROVED_A, 1], ['420289324-K2 L4', AttendanceStatus.ATTENDED, 1],
  ])('parses %s', (value, status, sessionCount) => expect(parseAttendanceValue(value)).toMatchObject({ status, sessionCount }));
  it.each(['0', '-1', '1.5', 'unknown text'])('rejects invalid value %s', (value) => expect(parseAttendanceValue(value)).toMatchObject({ status: null, sessionCount: 0 }));
});

describe('attendance import helpers', () => {
  it('normalizes teacher class models', () => {
    expect(normalizeClassModel('1-1')).toBe('ONE_TO_ONE'); expect(normalizeClassModel('1:2')).toBe('ONE_TO_TWO'); expect(normalizeClassModel('1-n')).toBe('ONE_TO_N');
  });
  it('remaps target year and rejects impossible leap dates', () => {
    expect(remapDateYear(new Date('2025-09-10T00:00:00.000Z'), 2026)?.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(remapDateYear(new Date('2024-02-29T00:00:00.000Z'), 2025)).toBeNull();
  });
});
