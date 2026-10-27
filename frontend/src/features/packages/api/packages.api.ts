import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import { Package, CreatePackageDTO, UpdatePackageDTO } from '../types/packages.types';

export type { PaginatedMeta, PaginatedResponse };

export interface PackagesListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
}

export const packagesApi = {
  list: async (params?: PackagesListParams, signal?: AbortSignal): Promise<Package[]> => {
    const res = await apiClient.get('/packages', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: PackagesListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Package>> => {
    const res = await apiClient.get('/packages', { params, signal });
    return normalizePaginatedResponse<Package>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Package> => {
    const res = await apiClient.get(`/packages/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreatePackageDTO): Promise<Package> => {
    const res = await apiClient.post('/packages', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdatePackageDTO): Promise<Package> => {
    const res = await apiClient.patch(`/packages/${id}`, data);
    return res.data.data;
  },
};
