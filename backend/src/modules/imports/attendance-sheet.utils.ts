/**
 * Date helpers for the "Chấm buổi" (attendance) sheet layout.
 *
 * WHY THIS FILE EXISTS (bug class it prevents)
 * --------------------------------------------
 * Two different kinds of Date values flow through the backup pipeline:
 *
 *  1. Excel header dates (the day columns in row 2 of `Chấm buổi`).
 *     ExcelJS converts the Excel serial number into a JS Date. On some
 *     readers/environments that Date carries a LOCAL midnight (e.g. ICT = UTC+7)
 *     instead of UTC midnight. Calling `.toISOString()` on such a value shifts
 *     the calendar day BACK by one (2026-01-01 local -> 2025-12-31T17:00Z),
 *     which silently writes attendance marks into the wrong day column.
 *
 *  2. `ClassSession.session_date` / `Enrollment.start_date` declared `@db.Date`.
 *     MySQL DATE has no time part, Prisma materialises it as UTC midnight, so
 *     `.toISOString().slice(0, 10)` is already correct. Using local components
 *     on these values is equally safe, but we keep the UTC reading explicit.
 *
 * To remove the ambiguity, every calendar-day comparison in the backup pipeline
 * goes through the helpers below:
 *   - header / Excel-origin dates  -> `excelDateKey()` (calendar components)
 *   - DB @db.Date values           -> `dbDateKey()`    (UTC components)
 * Both produce a canonical `YYYY-MM-DD` key that is timezone-independent.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Canonical `YYYY-MM-DD` from explicit calendar parts. */
export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Calendar key for a date that came from an Excel cell / sheet header.
 * Uses the LOCAL calendar components because that is what a human sees in the
 * spreadsheet grid (the value is a "pure" civil date, not an instant).
 */
export function excelDateKey(value: unknown): string | null {
  if (!(value instanceof Date) || isNaN(value.getTime())) return null;
  return formatDateKey(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

/**
 * Calendar key for a `@db.Date` column value (MySQL DATE -> Prisma UTC midnight).
 * Uses UTC components so the key never drifts with the server timezone.
 */
export function dbDateKey(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return formatDateKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

/** `YYYY-MM` key derived from a `YYYY-MM-DD` key. */
export function monthKeyFromDayKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function yearFromDayKey(dayKey: string): number {
  return Number(dayKey.slice(0, 4));
}
