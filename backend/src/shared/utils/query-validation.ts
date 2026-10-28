import { AppError } from '../../middlewares/error.middleware';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PaginationParams {
  isPaginated: boolean;
  page: number;
  pageSize: number;
  skip?: number;
  take?: number;
}

/**
 * Parse and validate pagination query params (`page`, `pageSize` / `limit`, `paginated`).
 * - When neither `page` nor `pageSize` nor `limit` nor `paginated=true` is passed:
 *   returns `{ isPaginated: false, page: 1, pageSize: defaultPageSize }`.
 * - When pagination is requested:
 *   `page` must be a positive integer >= 1 (throws 400 otherwise).
 *   `pageSize` must be a positive integer >= 1, clamped to max 100 (throws 400 if <= 0 or NaN).
 */
export function parsePaginationQuery(
  query: Record<string, any>,
  defaultPageSize = 25,
): PaginationParams {
  const rawPage = query.page !== undefined && query.page !== '' ? String(query.page).trim() : undefined;
  const rawPageSize =
    query.pageSize !== undefined && query.pageSize !== ''
      ? String(query.pageSize).trim()
      : query.limit !== undefined && query.limit !== ''
      ? String(query.limit).trim()
      : undefined;
  const rawPaginated =
    query.paginated === 'true' || query.paginated === '1' || query.paginated === true;

  const isPaginated = rawPage !== undefined || rawPageSize !== undefined || rawPaginated;

  let page = 1;
  if (rawPage !== undefined) {
    if (!/^-?\d+$/.test(rawPage)) {
      throw new AppError(400, 'Tham số page phải là số nguyên dương (>= 1)');
    }
    page = parseInt(rawPage, 10);
    if (!Number.isInteger(page) || page < 1) {
      throw new AppError(400, 'Tham số page phải là số nguyên dương (>= 1)');
    }
  }

  let pageSize = defaultPageSize;
  if (rawPageSize !== undefined) {
    if (!/^-?\d+$/.test(rawPageSize)) {
      throw new AppError(400, 'Tham số pageSize phải là số nguyên dương (1 - 200)');
    }
    const parsedSize = parseInt(rawPageSize, 10);
    if (!Number.isInteger(parsedSize) || parsedSize < 1) {
      throw new AppError(400, 'Tham số pageSize phải là số nguyên dương (1 - 200)');
    }
    pageSize = Math.min(parsedSize, 200);
  }

  if (!isPaginated) {
    return {
      isPaginated: false,
      page: 1,
      pageSize,
    };
  }

  return {
    isPaginated: true,
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

/**
 * Normalize and cap search string to max 100 characters.
 */
export function parseSearchQuery(raw: unknown, maxLength = 100): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate a YYYY-MM-DD date string parameter and return both the normalized
 * YYYY-MM-DD string and a UTC Date (`YYYY-MM-DDT00:00:00.000Z`).
 * Throws 400 AppError if malformed or invalid calendar date.
 */
export function parseIsoDateParam(
  raw: unknown,
  paramName: string,
): { dateStr: string; date: Date } | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;

  if (!ISO_DATE_RE.test(str)) {
    throw new AppError(400, `Tham số ${paramName} không hợp lệ (định dạng chuẩn YYYY-MM-DD)`);
  }

  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new AppError(400, `Tham số ${paramName} không phải ngày hợp lệ (YYYY-MM-DD)`);
  }

  return { dateStr: str, date: dt };
}

/**
 * Validate an optional integer query param.
 */
export function parseOptionalIntParam(raw: unknown, paramName: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;
  if (!/^-?\d+$/.test(str)) {
    throw new AppError(400, `Tham số ${paramName} phải là số nguyên`);
  }
  const val = parseInt(str, 10);
  if (Number.isNaN(val)) {
    throw new AppError(400, `Tham số ${paramName} phải là số nguyên`);
  }
  return val;
}
