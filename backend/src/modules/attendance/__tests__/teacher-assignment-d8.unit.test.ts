// D8 (approved 2026-10-25): teacher write authority = assignment effective at
// the SESSION DATE (null window bounds = unbounded), not "active today".
// Pure predicate tests — no DB.

import { findEffectiveAssignment, isTeacherAssignmentEffectiveOn } from '../teacher-assignment';

const DAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const SESSION = DAY('2026-06-15');

describe('isTeacherAssignmentEffectiveOn (D8)', () => {
  it('active with no window bounds is effective on any date', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: null, end_date: null }, SESSION)).toBe(true);
  });

  it('inactive is never effective even if the date is inside the window', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: false, start_date: null, end_date: null }, SESSION)).toBe(false);
    expect(isTeacherAssignmentEffectiveOn({ active: false, start_date: DAY('2026-01-01'), end_date: DAY('2026-12-31') }, SESSION)).toBe(false);
  });

  it('session on the exact start_date is effective', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: SESSION, end_date: null }, SESSION)).toBe(true);
  });

  it('session on the exact end_date is effective', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: null, end_date: SESSION }, SESSION)).toBe(true);
  });

  it('session before start_date is NOT effective (assignment not yet begun)', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: DAY('2026-07-01'), end_date: null }, SESSION)).toBe(false);
  });

  it('session after end_date is NOT effective (assignment expired at that date)', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: null, end_date: DAY('2026-05-01') }, SESSION)).toBe(false);
  });

  it('half-open start (only start_date set) is unbounded at the end', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: DAY('2026-01-01'), end_date: null }, SESSION)).toBe(true);
  });

  it('half-open end (only end_date set) is unbounded at the start', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: null, end_date: DAY('2026-12-31') }, SESSION)).toBe(true);
  });

  it('fully contained session date is effective', () => {
    expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: DAY('2026-01-01'), end_date: DAY('2026-12-31') }, SESSION)).toBe(true);
  });
});

describe('findEffectiveAssignment (D8)', () => {
  it('returns the first assignment effective on the session date', () => {
    const a = { active: false, start_date: null, end_date: null };
    const b = { active: true, start_date: DAY('2026-06-01'), end_date: DAY('2026-06-30') };
    expect(findEffectiveAssignment([a, b], SESSION)).toBe(b);
  });

  it('returns null when no assignment is effective at that date', () => {
    const expired = { active: true, start_date: null, end_date: DAY('2026-01-01') };
    const future = { active: true, start_date: DAY('2026-12-01'), end_date: null };
    expect(findEffectiveAssignment([expired, future], SESSION)).toBeNull();
  });

  it('empty candidate list yields null', () => {
    expect(findEffectiveAssignment([], SESSION)).toBeNull();
  });
});
