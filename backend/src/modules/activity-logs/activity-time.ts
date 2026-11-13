export const ACTIVITY_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const ACTIVITY_RETENTION_DAYS = 30;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export interface ActivityDateRange {
  from: Date;
  to: Date;
  fromDate: string;
  toDate: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function vietnamDateKey(date = new Date()): string {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function vietnamDateTime(date: Date | string): string {
  const raw = date instanceof Date ? date : new Date(date);
  const shifted = new Date(raw.getTime() + VIETNAM_OFFSET_MS);
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} UTC+7`;
}

export function startOfVietnamDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000+07:00`);
}

export function endOfVietnamDate(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+07:00`);
}

export function subtractVietnamDays(dateKey: string, days: number): string {
  const start = startOfVietnamDate(dateKey);
  return vietnamDateKey(new Date(start.getTime() - days * DAY_MS));
}

export function resolveActivityDateRange(
  fromDate?: string,
  toDate?: string,
  now = new Date(),
): ActivityDateRange {
  const today = vietnamDateKey(now);
  const retentionStart = subtractVietnamDays(today, ACTIVITY_RETENTION_DAYS - 1);
  const resolvedTo = toDate && toDate < today ? toDate : today;
  const requestedFrom = fromDate || subtractVietnamDays(resolvedTo, 6);
  const resolvedFrom = requestedFrom < retentionStart ? retentionStart : requestedFrom;

  return {
    from: startOfVietnamDate(resolvedFrom),
    to: endOfVietnamDate(resolvedTo),
    fromDate: resolvedFrom,
    toDate: resolvedTo,
  };
}

export function vietnamTodayBounds(now = new Date()): { from: Date; to: Date } {
  const today = vietnamDateKey(now);
  return { from: startOfVietnamDate(today), to: endOfVietnamDate(today) };
}

export function activityRetentionCutoff(now = new Date()): Date {
  const today = vietnamDateKey(now);
  return startOfVietnamDate(subtractVietnamDays(today, ACTIVITY_RETENTION_DAYS));
}
