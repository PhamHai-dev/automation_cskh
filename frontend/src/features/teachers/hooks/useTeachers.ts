import { useMemo } from 'react';
import { useToast } from '../../../components/ui/Toast';
import { useQuery } from '../../../hooks/useQuery';
import { teachersApi, TeachersListParams } from '../api/teachers.api';
import { PaginatedResponse } from '../../../api/pagination.types';
import { Teacher } from '../types/teachers.types';

/**
 * Fetches the current teacher page from the server.
 * Search and filters are deliberately part of the query key and request params;
 * the page must never fetch the full teacher collection to filter in memory.
 */
export function useTeachers(params: TeachersListParams) {
  const toast = useToast();
  const queryParams = useMemo(
    () => ({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search || undefined,
      teacher_type: params.teacher_type || undefined,
      account_status: params.account_status || undefined,
      active: params.active,
    }),
    [params.page, params.pageSize, params.search, params.teacher_type, params.account_status, params.active]
  );

  return useQuery<PaginatedResponse<Teacher>>({
    queryKey: ['teachers', 'paginated', queryParams],
    queryFn: (signal) => teachersApi.listPaginated(queryParams, signal),
    staleTime: 5 * 60 * 1000,
    keepPreviousData: true,
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Không thể tải danh sách giáo viên');
    },
  });
}
