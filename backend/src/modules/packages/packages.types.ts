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
  search?: string;
  active?: boolean;
}
