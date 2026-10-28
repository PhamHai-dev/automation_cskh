export interface CreatePackageDTO {
  code: string;
  name?: string;
  default_total_sessions?: number;
  description?: string;
  active?: boolean;
}

export interface UpdatePackageDTO {
  code?: string;
  name?: string;
  default_total_sessions?: number;
  description?: string;
  active?: boolean;
}

export interface PackageListFilters {
  page?: number;
  pageSize?: number;
  isPaginated?: boolean;
  search?: string;
  active?: boolean;
}

export interface PackageListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PackageListResult<T = any> {
  data: T[];
  meta: PackageListMeta;
}
