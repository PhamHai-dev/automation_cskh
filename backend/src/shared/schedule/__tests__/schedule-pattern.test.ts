import {
  isDateInSchedule,
  normalizeSchedulePattern,
  normalizeScheduleTime,
  parseSchedulePattern,
} from '../schedule-pattern';

describe('schedule pattern', () => {
  it.each([
    ['246', '246'],
    ['257', '257'],
    ['35CN', '35CN'],
    ['35Cn', '35CN'],
    ['35cn', '35CN'],
    ['CN53', '35CN'],
    ['2,4,6', '246'],
    ['2 4 6', '246'],
    ['3-CN-5', '35CN'],
    ['lkcd', 'LKCD'],
    ['Lkcd', 'LKCD'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSchedulePattern(input)).toBe(expected);
  });

  it('marks LKCD as manual-only and never matches a date', () => {
    const pattern = parseSchedulePattern('LKCD');

    expect(pattern).toEqual({ kind: 'MANUAL_ONLY', canonical: 'LKCD', weekdays: [] });
    expect(isDateInSchedule(pattern, new Date(2026, 8, 25))).toBe(false);
  });

  it('matches fixed schedule weekdays including Sunday', () => {
    const pattern = parseSchedulePattern('35CN');

    expect(isDateInSchedule(pattern, new Date(2026, 8, 22))).toBe(true); // Tuesday / Thứ 3
    expect(isDateInSchedule(pattern, new Date(2026, 8, 24))).toBe(true); // Thursday / Thứ 5
    expect(isDateInSchedule(pattern, new Date(2026, 8, 27))).toBe(true); // Sunday / CN
    expect(isDateInSchedule(pattern, new Date(2026, 8, 25))).toBe(false);
  });

  it.each(['', '2LKCD', 'LKCD35', '2246', '35CNCN', '18', 'ABC'])(
    'rejects invalid pattern %s',
    (input) => {
      expect(() => parseSchedulePattern(input)).toThrow();
    },
  );
});

describe('schedule time', () => {
  it.each([
    ['20h00', '20:00'],
    ['20H00', '20:00'],
    ['8:30', '08:30'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeScheduleTime(input)).toBe(expected);
  });

  it.each(['', '8h tối', 'tối', 'ca 1', '24:00', '12:60', '8:3'])(
    'rejects invalid time %s',
    (input) => {
      expect(() => normalizeScheduleTime(input)).toThrow();
    },
  );
});
