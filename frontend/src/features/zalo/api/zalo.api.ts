import { apiClient } from '../../../api/client';
import type { ZaloAccount, CreateZaloAccountDTO, UpdateZaloAccountDTO, QrLoginResult, ZaloFriend, ZaloGroupInfo } from '../types/zalo.types';

export const zaloApi = {
  listAccounts: async (): Promise<ZaloAccount[]> => {
    const res = await apiClient.get('/zalo/accounts');
    return res.data.data;
  },
  getAccount: async (id: number): Promise<ZaloAccount> => {
    const res = await apiClient.get(`/zalo/accounts/${id}`);
    return res.data.data;
  },
  createAccount: async (data: CreateZaloAccountDTO): Promise<ZaloAccount> => {
    const res = await apiClient.post('/zalo/accounts', data);
    return res.data.data;
  },
  updateAccount: async (id: number, data: UpdateZaloAccountDTO): Promise<ZaloAccount> => {
    const res = await apiClient.patch(`/zalo/accounts/${id}`, data);
    return res.data.data;
  },
  removeAccount: async (id: number): Promise<{ deleted: boolean }> => {
    const res = await apiClient.delete(`/zalo/accounts/${id}`);
    return res.data.data;
  },
  generateQr: async (accountId: number): Promise<QrLoginResult> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/qr-login`);
    return res.data.data;
  },
  completeQrLogin: async (
    accountId: number,
    data: { zalo_uid?: string; display_name?: string; session_data?: string },
  ): Promise<ZaloAccount> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/qr-login/complete`, data);
    return res.data.data;
  },
  getStatus: async (accountId: number): Promise<{ status: string; liveStatus: string | null }> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/status`);
    return res.data.data;
  },
  getFriends: async (accountId: number): Promise<ZaloFriend[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/friends`);
    return res.data.data;
  },
  getGroups: async (accountId: number): Promise<ZaloGroupInfo[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups`);
    return res.data.data;
  },
  refreshGroups: async (accountId: number): Promise<{ synced: number; total: number }> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/refresh`);
    return res.data.data;
  },
  disconnect: async (accountId: number): Promise<{ disconnected: boolean }> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/disconnect`);
    return res.data.data;
  },
};
