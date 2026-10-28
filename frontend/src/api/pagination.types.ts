export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets?: {
    programCounts?: { all: number; kaiwa: number; jlpt: number };
    statusCounts?: Record<string, number>;
  };
  filterOptions?: {
    cvhtList?: string[];
    salesList?: string[];
    packagesList?: string[];
    teachersList?: string[];
    teacherCodesList?: string[];
    classesList?: string[];
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export function normalizePaginatedResponse<T>(
  rawResponse: any,
  params?: { page?: number; pageSize?: number }
): PaginatedResponse<T> {
  const rawData: T[] = Array.isArray(rawResponse?.data) ? rawResponse.data : [];
  const rawMeta = rawResponse?.meta;
  const requestedPage = Math.max(1, Number(params?.page) || 1);
  const requestedPageSize = Math.max(1, Number(params?.pageSize) || 50);

  if (rawMeta && typeof rawMeta.total === 'number') {
    const page = Number(rawMeta.page) || requestedPage;
    const pageSize = Number(rawMeta.pageSize) || requestedPageSize;
    const total = Number(rawMeta.total);
    const totalPages = Number(rawMeta.totalPages) || Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rawData,
      meta: {
        ...rawMeta,
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  // Fallback when backend returns non-paginated array (meta: null)
  const total = rawData.length;
  const totalPages = Math.max(1, Math.ceil(total / requestedPageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const start = (safePage - 1) * requestedPageSize;
  const sliced = params?.page || params?.pageSize ? rawData.slice(start, start + requestedPageSize) : rawData;

  return {
    data: sliced,
    meta: {
      page: safePage,
      pageSize: requestedPageSize,
      total,
      totalPages,
      ...(rawMeta && typeof rawMeta === 'object' ? rawMeta : {}),
    },
  };
}
