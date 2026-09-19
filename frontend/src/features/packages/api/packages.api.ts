import { apiClient } from '../../../api/client';
import { Package, CreatePackageDTO, UpdatePackageDTO } from '../types/packages.types';

export const packagesApi = {
  list: async (): Promise<Package[]> => {
    const res = await apiClient.get('/packages');
    return res.data.data;
  },

  get: async (id: number): Promise<Package> => {
    const res = await apiClient.get(`/packages/${id}`);
    return res.data.data;
  },

  create: async (data: CreatePackageDTO): Promise<Package> => {
    const res = await apiClient.post('/packages', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdatePackageDTO): Promise<Package> => {
    const res = await apiClient.patch(`/packages/${id}`, data);
    return res.data.data;
  }
};
