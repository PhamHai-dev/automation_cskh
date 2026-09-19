export interface Package {
  id: number;
  code: string;
  name?: string;
  default_total_sessions?: number;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageDTO {
  code: string;
  name?: string;
  default_total_sessions?: number;
  description?: string;
}

export interface UpdatePackageDTO {
  code?: string;
  name?: string;
  default_total_sessions?: number;
  description?: string;
  active?: boolean;
}
