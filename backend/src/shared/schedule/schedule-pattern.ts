export type FixedSchedulePattern = {
  kind: 'FIXED';
  canonical: string;
  weekdays: number[];
};

export type ManualOnlySchedulePattern = {
  kind: 'MANUAL_ONLY';
  canonical: 'LKCD';
  weekdays: [];
};

export type ParsedSchedulePattern = FixedSchedulePattern | ManualOnlySchedulePattern;

const WEEKDAY_ORDER = [2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Parses the compact Vietnamese schedule grammar used by the product.
 * Weekdays use 2..7 and Sunday is represented by CN (mapped internally to 8).
 */
export function parseSchedulePattern(input: string): ParsedSchedulePattern {
  const normalized = input.trim().toUpperCase();

  if (normalized === 'LKCD') {
    return { kind: 'MANUAL_ONLY', canonical: 'LKCD', weekdays: [] };
  }

  if (!normalized) {
    throw new Error('Lịch học phải có dạng 246, 35CN hoặc LKCD');
  }

  const tokens: number[] = [];
  for (let index = 0; index < normalized.length;) {
    const character = normalized[index];
    if (character >= '2' && character <= '7') {
      tokens.push(Number(character));
      index += 1;
      continue;
    }

    if (normalized.slice(index, index + 2) === 'CN') {
      tokens.push(8);
      index += 2;
      continue;
    }

    throw new Error('Lịch học phải có dạng 246, 35CN hoặc LKCD');
  }

  if (new Set(tokens).size !== tokens.length) {
    throw new Error('Lịch học không được lặp ngày');
  }

  const weekdays = WEEKDAY_ORDER.filter((weekday) => tokens.includes(weekday));
  const canonical = weekdays.map((weekday) => (weekday === 8 ? 'CN' : String(weekday))).join('');

  return { kind: 'FIXED', canonical, weekdays };
}

export function normalizeSchedulePattern(input: string): string {
  return parseSchedulePattern(input).canonical;
}

/** Normalize supported time inputs to a strict 24-hour HH:mm value. */
export function normalizeScheduleTime(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/h/g, ':');
  const match = /^(\d{1,2}):(\d{2})$/.exec(normalized);

  if (!match) {
    throw new Error('Giờ học phải có dạng HH:mm hoặc HHhmm');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error('Giờ học không hợp lệ');
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** JavaScript getDay(): Sunday=0, Monday=1, ..., Saturday=6. */
export function isDateInSchedule(pattern: ParsedSchedulePattern, date: Date): boolean {
  if (pattern.kind === 'MANUAL_ONLY') {
    return false;
  }

  const jsDay = date.getDay();
  const productWeekday = jsDay === 0 ? 8 : jsDay + 1;
  return pattern.weekdays.includes(productWeekday);
}
