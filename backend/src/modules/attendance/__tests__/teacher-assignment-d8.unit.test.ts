// D8 (approved 2026-10-25; re-ruled 2026-10-26 per owner verdict on acceptance
// case #14 of docs/khao-sat/AI_REVIEW/06: "GV đã thôi assignment vẫn mark được
// ca mình đã dạy trong thời gian hiệu lực theo D8"):
//   - Write authority is evaluated against the assignment window EFFECTIVE ON
//     THE SESSION DATE, REGARDLESS of the row's current `active` flag.
//   - Ambiguous removal boundary (owner: "thiếu dữ liệu → Admin xác nhận từng
//     trường hợp"): `active: false` with NO window evidence (`start_date: null`
//     AND `end_date: null`) is NOT authorized; `active: false` with a window
//     covering the session date IS authorized.
// Pure predicate tests — no DB.

import {
  findEffectiveAssignment,
  isTeacherAssignmentEffectiveInRange,
  isTeacherAssignmentEffectiveOn,
} from '../teacher-assignment';

const DAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const SESSION = DAY('2026-06-15');

describe('isTeacherAssignmentEffectiveOn (D8 + 2026-10-26 owner verdict)', () => {
  describe('active = true', () => {
    it('active with no window bounds (both null) is effective on any date', () => {
      expect(isTeacherAssignmentEffectiveOn({ active: true, start_date: null, end_date: null }, SESSION)).toBe(true);
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
      expect(
        isTeacherAssignmentEffectiveOn({ active: true, start_date: DAY('2026-01-01'), end_date: DAY('2026-12-31') }, SESSION)
      ).toBe(true);
    });
  });

  describe('active = false (2026-10-26 owner verdict — acceptance case #14)', () => {
    it('inactive with closed window [start_date, end_date] covering session date IS effective', () => {
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: DAY('2026-01-01'), end_date: DAY('2026-12-31') }, SESSION)
      ).toBe(true);
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: SESSION, end_date: SESSION }, SESSION)
      ).toBe(true);
    });

    it('inactive with half-open start_date (start_date=2026-01-01, end_date=null) is NOT effective (missing end_date does not grant infinite authority)', () => {
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: DAY('2026-01-01'), end_date: null }, SESSION)
      ).toBe(false);
    });

    it('inactive with half-open end_date >= session date IS effective', () => {
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: null, end_date: DAY('2026-12-31') }, SESSION)
      ).toBe(true);
    });

    it('inactive with session date outside window (before start_date or after end_date) is NOT effective', () => {
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: DAY('2026-07-01'), end_date: DAY('2026-12-31') }, SESSION)
      ).toBe(false);
      expect(
        isTeacherAssignmentEffectiveOn({ active: false, start_date: DAY('2026-01-01'), end_date: DAY('2026-05-31') }, SESSION)
      ).toBe(false);
    });

    it('AMBIGUOUS REMOVAL BOUNDARY: inactive with NO window data (both null) is NOT effective (Admin-assisted path)', () => {
      expect(isTeacherAssignmentEffectiveOn({ active: false, start_date: null, end_date: null }, SESSION)).toBe(false);
    });
  });
});

describe('findEffectiveAssignment (D8 + 2026-10-26 owner verdict)', () => {
  it('returns an inactive assignment when its window has an explicit end_date covering the session date', () => {
    const windowlessRemoved = { active: false, start_date: null, end_date: null };
    const halfOpenMissingEnd = { active: false, start_date: DAY('2026-01-01'), end_date: null };
    const historicalMatch = { active: false, start_date: DAY('2026-06-01'), end_date: DAY('2026-06-30') };
    expect(findEffectiveAssignment([windowlessRemoved, halfOpenMissingEnd, historicalMatch], SESSION)).toBe(historicalMatch);
  });

  it('returns the first assignment effective on the session date across multiple rows', () => {
    const expiredInactive = { active: false, start_date: DAY('2026-01-01'), end_date: DAY('2026-05-31') };
    const currentMatch = { active: true, start_date: DAY('2026-06-01'), end_date: DAY('2026-06-30') };
    expect(findEffectiveAssignment([expiredInactive, currentMatch], SESSION)).toBe(currentMatch);
  });

  it('returns null when no assignment is effective at that date (expired, future, or inactive missing end_date)', () => {
    const expired = { active: false, start_date: DAY('2026-01-01'), end_date: DAY('2026-05-01') };
    const future = { active: true, start_date: DAY('2026-12-01'), end_date: null };
    const windowlessRemoved = { active: false, start_date: null, end_date: null };
    const halfOpenMissingEnd = { active: false, start_date: DAY('2026-01-01'), end_date: null };
    expect(findEffectiveAssignment([expired, future, windowlessRemoved, halfOpenMissingEnd], SESSION)).toBeNull();
  });

  it('empty candidate list yields null', () => {
    expect(findEffectiveAssignment([], SESSION)).toBeNull();
  });
});

describe('isTeacherAssignmentEffectiveInRange (getTeacherSessions range filter)', () => {
  it('rejects active=false with end_date=null (whether start_date is null or non-null) even when range is open', () => {
    expect(
      isTeacherAssignmentEffectiveInRange({ active: false, start_date: null, end_date: null }, null, null)
    ).toBe(false);
    expect(
      isTeacherAssignmentEffectiveInRange({ active: false, start_date: DAY('2026-01-01'), end_date: null }, null, null)
    ).toBe(false);
    expect(
      isTeacherAssignmentEffectiveInRange(
        { active: false, start_date: DAY('2026-01-01'), end_date: null },
        DAY('2026-06-01'),
        DAY('2026-06-30'),
      )
    ).toBe(false);
  });

  it('accepts active=false whose window intersects the query range and rejects disjoint windows', () => {
    const assignment = { active: false, start_date: DAY('2026-06-01'), end_date: DAY('2026-06-30') };
    expect(isTeacherAssignmentEffectiveInRange(assignment, DAY('2026-06-15'), DAY('2026-07-15'))).toBe(true);
    expect(isTeacherAssignmentEffectiveInRange(assignment, DAY('2026-07-01'), DAY('2026-07-31'))).toBe(false);
    expect(isTeacherAssignmentEffectiveInRange(assignment, DAY('2026-05-01'), DAY('2026-05-31'))).toBe(false);
  });
});
