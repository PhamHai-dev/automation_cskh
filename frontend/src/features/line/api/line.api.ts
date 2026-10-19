import { apiClient } from '../../../api/client';
import type {
  LineAccount,
  CreateLineAccountDTO,
  UpdateOaCredentialsDTO,
  LineQrLoginResult,
  LineFriend,
  LineGroupInfo,
  LineConversation,
  LineMessage,
  LineStudentLink,
  LineSuggestLinkItem,
  LineDeepLinkResult,
} from '../types/line.types';

/** Helper to unwrap `{ data: ... }` or direct response payloads seamlessly */
function unwrap<T>(resData: any, fallbackKey?: string): T {
  if (resData == null) return resData;
  if (fallbackKey && resData[fallbackKey] !== undefined) return resData[fallbackKey];
  if (resData.data !== undefined) {
    if (fallbackKey && resData.data?.[fallbackKey] !== undefined) {
      return resData.data[fallbackKey];
    }
    return resData.data;
  }
  return resData;
}

export const lineApi = {
  // ─── Accounts CRUD ──────────────────────────────────────────────────────────
  listAccounts: async (): Promise<LineAccount[]> => {
    const res = await apiClient.get('/line/accounts');
    const data = unwrap<any>(res.data, 'accounts');
    return Array.isArray(data) ? data : data?.items ?? [];
  },

  getAccount: async (accountId: number): Promise<LineAccount> => {
    const res = await apiClient.get(`/line/accounts/${accountId}`);
    return unwrap<LineAccount>(res.data, 'account');
  },

  createAccount: async (dto: CreateLineAccountDTO): Promise<LineAccount> => {
    const res = await apiClient.post('/line/accounts', dto);
    return unwrap<LineAccount>(res.data, 'account');
  },

  deleteAccount: async (accountId: number): Promise<{ deleted: boolean }> => {
    const res = await apiClient.delete(`/line/accounts/${accountId}`);
    return unwrap<{ deleted: boolean }>(res.data);
  },

  disconnectAccount: async (accountId: number): Promise<{ disconnected: boolean }> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/disconnect`);
    return unwrap<{ disconnected: boolean }>(res.data);
  },

  reconnectAccount: async (accountId: number): Promise<any> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/reconnect`);
    return unwrap<any>(res.data);
  },

  startQrLogin: async (accountId: number): Promise<LineQrLoginResult> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/qr-login`);
    return unwrap<LineQrLoginResult>(res.data);
  },

  updateOaCredentials: async (
    accountId: number,
    dto: UpdateOaCredentialsDTO,
  ): Promise<LineAccount> => {
    const res = await apiClient.patch(`/line/accounts/${accountId}/oa-credentials`, dto);
    return unwrap<LineAccount>(res.data, 'account');
  },

  // ─── Friends & Followers ────────────────────────────────────────────────────
  listFriends: async (
    accountId: number,
    params?: { search?: string; kind?: string; page?: number; limit?: number },
  ): Promise<{ items: LineFriend[]; total: number; page: number; pages: number }> => {
    const res = await apiClient.get(`/line/accounts/${accountId}/friends`, { params });
    const raw = res.data?.data ?? res.data;
    const items: LineFriend[] = Array.isArray(raw)
      ? raw
      : raw?.friends ?? raw?.items ?? [];
    return {
      items,
      total: raw?.total ?? items.length,
      page: raw?.page ?? 1,
      pages: raw?.pages ?? raw?.totalPages ?? 1,
    };
  },

  syncFriends: async (accountId: number): Promise<{ synced?: number; upserted?: number; data?: any }> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/friends/sync`);
    return unwrap<any>(res.data);
  },

  lookupByPhone: async (
    accountId: number,
    phone: string,
  ): Promise<{ found: boolean; mid?: string; displayName?: string; avatarUrl?: string; friend?: any }> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/friends/lookup-phone`, { phone });
    return unwrap<any>(res.data);
  },

  sendFriendRequest: async (
    accountId: number,
    targetMid: string,
  ): Promise<{ sent: boolean; friend?: any }> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/friends/add`, {
      targetMid,
      line_uid: targetMid,
    });
    return unwrap<any>(res.data);
  },

  // ─── Groups ─────────────────────────────────────────────────────────────────
  listAccountGroups: async (accountId: number): Promise<LineGroupInfo[]> => {
    const res = await apiClient.get(`/line/accounts/${accountId}/groups`);
    const raw = unwrap<any>(res.data, 'groups');
    return Array.isArray(raw) ? raw : raw?.items ?? [];
  },

  listAllGroups: async (): Promise<LineGroupInfo[]> => {
    const res = await apiClient.get('/line/groups');
    const raw = unwrap<any>(res.data, 'groups');
    return Array.isArray(raw) ? raw : raw?.items ?? [];
  },

  syncGroups: async (accountId: number): Promise<{ synced: number; total?: number }> => {
    const res = await apiClient.post(`/line/accounts/${accountId}/groups/sync`);
    return unwrap<any>(res.data);
  },

  // ─── Conversations & Messages ───────────────────────────────────────────────
  listConversations: async (
    accountId: number,
    params?: { search?: string; threadType?: string; tab?: string; page?: number; limit?: number },
  ): Promise<{ items: LineConversation[]; total: number }> => {
    const res = await apiClient.get(`/line/accounts/${accountId}/conversations`, { params });
    const raw = res.data?.data ?? res.data;
    const items: LineConversation[] = Array.isArray(raw)
      ? raw
      : raw?.conversations ?? raw?.items ?? [];
    return {
      items,
      total: raw?.total ?? items.length,
    };
  },

  listMessages: async (
    accountId: number,
    threadId: string,
    params?: { page?: number; limit?: number; before?: string },
  ): Promise<{ items: LineMessage[]; conversation?: LineConversation | null }> => {
    const res = await apiClient.get(
      `/line/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/messages`,
      { params },
    );
    const raw = res.data?.data ?? res.data;
    const items: LineMessage[] = Array.isArray(raw)
      ? raw
      : raw?.messages ?? raw?.items ?? [];
    return {
      items,
      conversation: raw?.conversation ?? null,
    };
  },

  sendMessage: async (
    accountId: number,
    threadId: string,
    content: string,
    contentType: string = 'text',
  ): Promise<any> => {
    const res = await apiClient.post(
      `/line/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/messages`,
      { content, contentType },
    );
    return unwrap<any>(res.data);
  },

  markRead: async (accountId: number, threadId: string): Promise<any> => {
    const res = await apiClient.post(
      `/line/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/mark-read`,
    );
    return unwrap<any>(res.data);
  },

  // ─── Student Linking ────────────────────────────────────────────────────────
  listUnlinkedStudents: async (params?: {
    q?: string;
    cs_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; total: number }> => {
    const res = await apiClient.get('/line/students/unlinked', { params });
    const raw = res.data?.data ?? res.data;
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.students ?? [];
    return { items, total: raw?.total ?? items.length };
  },

  listLinksByAccount: async (
    accountId: number,
    q?: string,
  ): Promise<{ items: LineStudentLink[] }> => {
    const res = await apiClient.get(`/line/${accountId}/students-linked`, {
      params: { q },
    });
    const raw = res.data?.data ?? res.data;
    const items = Array.isArray(raw) ? raw : raw?.items ?? raw?.relations ?? [];
    return { items };
  },

  listLinksByStudent: async (studentId: number): Promise<{ items: LineStudentLink[] }> => {
    const res = await apiClient.get(`/line/students/${studentId}/links`);
    const raw = res.data?.data ?? res.data;
    const items = Array.isArray(raw) ? raw : raw?.items ?? [];
    return { items };
  },

  createLink: async (data: {
    student_id: number;
    line_account_id: number;
    line_group_id?: number | null;
    target_type?: 'USER' | 'GROUP';
    relation_status?: string;
    display_name?: string;
    friend_line_uid?: string;
  }): Promise<{ relation: LineStudentLink }> => {
    const res = await apiClient.post('/line/links', data);
    const raw = res.data?.data ?? res.data;
    return { relation: raw?.relation ?? raw };
  },

  updateLink: async (
    linkId: number,
    data: {
      display_name?: string;
      relation_status?: string;
      new_line_account_id?: number;
      friend_line_uid?: string;
    },
  ): Promise<{ relation: LineStudentLink }> => {
    const res = await apiClient.patch(`/line/links/${linkId}`, data);
    const raw = res.data?.data ?? res.data;
    return { relation: raw?.relation ?? raw };
  },

  deleteLink: async (linkId: number): Promise<void> => {
    await apiClient.delete(`/line/links/${linkId}`);
  },

  generateDeepLink: async (data: {
    student_id: number;
    line_account_id: number;
  }): Promise<LineDeepLinkResult> => {
    const res = await apiClient.post('/line/links/deep-link', data);
    const raw = res.data?.data ?? res.data;
    return {
      linkCode: raw?.linkCode ?? raw?.link_code ?? '',
      deepLinkUrl: raw?.deepLinkUrl ?? raw?.deep_link_url ?? '',
      basicId: raw?.basicId ?? raw?.basic_id ?? null,
      relation: raw?.relation,
    };
  },

  autoSuggestLinks: async (params?: {
    line_account_id?: number;
    cs_id?: number;
  }): Promise<{ items: LineSuggestLinkItem[]; total: number }> => {
    const res = await apiClient.post('/line/auto-suggest-links', params ?? {});
    const raw = res.data?.data ?? res.data;
    const items = Array.isArray(raw) ? raw : raw?.items ?? [];
    return { items, total: raw?.total ?? items.length };
  },
};
