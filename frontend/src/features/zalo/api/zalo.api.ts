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
  reconnect: async (accountId: number): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/reconnect`);
    return res.data?.data ?? res.data;
  },

  // ─── Friends DB (paged, kind, search) ──────────────────────────────────────
  getFriendsDb: async (
    accountId: number,
    opts: { kind?: string; page?: number; limit?: number; search?: string; sortBy?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.kind && opts.kind !== 'all') params.set('kind', opts.kind);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.search) params.set('search', opts.search);
    if (opts.sortBy) params.set('sortBy', opts.sortBy);
    const res = await apiClient.get(`/zalo/accounts/${accountId}/friends-db?${params.toString()}`);
    return res.data;
  },

  // ─── Sync friends manually ─────────────────────────────────────────────────
  syncFriends: async (accountId: number): Promise<{ data: any }> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/friends-db/sync`);
    return res.data;
  },

  // ─── Groups DB (from DB, not SDK) ──────────────────────────────────────────
  getGroupsDb: async (accountId: number): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups`);
    return res.data.data;
  },

  listAllGroups: async (): Promise<any[]> => {
    const res = await apiClient.get('/zalo/groups');
    return res.data?.data ?? res.data?.groups ?? [];
  },

  // ─── Student Linking ────────────────────────────────────────────────────────
  listStudentLinks: async (studentId: number): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/students/${studentId}/links`);
    return res.data?.items ?? res.data?.data ?? [];
  },

  listAccountStudentLinks: async (accountId: number, q?: string): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/${accountId}/students-linked`, {
      params: q ? { q } : undefined,
    });
    return res.data?.items ?? res.data?.data ?? [];
  },

  createStudentLink: async (data: {
    student_id: number;
    zalo_account_id: number;
    zalo_group_id?: number | null;
    target_type?: 'USER' | 'GROUP';
    friend_zalo_uid?: string;
    display_name?: string;
    relation_status?: string;
  }) => {
    const res = await apiClient.post('/zalo/links', data);
    return res.data;
  },

  deleteStudentLink: async (linkId: number) => {
    await apiClient.delete(`/zalo/links/${linkId}`);
  },

  // ─── Group detail (SDK live) ───────────────────────────────────────────────
  getGroupDetail: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups/${groupId}`);
    return res.data.data ?? res.data.group;
  },
  getGroupMembers: async (accountId: number, groupId: string): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups/${groupId}/members`);
    return res.data.members ?? [];
  },
  getGroupBlocked: async (accountId: number, groupId: string): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups/${groupId}/blocked`);
    return res.data.data ?? [];
  },
  getGroupPending: async (accountId: number, groupId: string): Promise<any[]> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups/${groupId}/pending`);
    return res.data.data ?? [];
  },
  renameGroup: async (accountId: number, groupId: string, name: string): Promise<any> => {
    const res = await apiClient.patch(`/zalo/accounts/${accountId}/groups/${groupId}/name`, { name });
    return res.data.result;
  },
  updateGroupSettings: async (accountId: number, groupId: string, settings: any): Promise<any> => {
    const res = await apiClient.patch(`/zalo/accounts/${accountId}/groups/${groupId}/settings`, settings);
    return res.data.result;
  },
  addGroupMembers: async (accountId: number, groupId: string, userIds: string[]): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/members`, { userIds });
    return res.data.result;
  },
  removeGroupMembers: async (accountId: number, groupId: string, userIds: string[]): Promise<any> => {
    const res = await apiClient.delete(`/zalo/accounts/${accountId}/groups/${groupId}/members`, { data: { userIds } });
    return res.data.result;
  },
  addGroupDeputy: async (accountId: number, groupId: string, userId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/deputies`, { userId });
    return res.data.result;
  },
  removeGroupDeputy: async (accountId: number, groupId: string, userId: string): Promise<any> => {
    const res = await apiClient.delete(`/zalo/accounts/${accountId}/groups/${groupId}/deputies/${userId}`);
    return res.data.result;
  },
  blockGroupMember: async (accountId: number, groupId: string, userId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/block`, { userId });
    return res.data.data;
  },
  unblockGroupMember: async (accountId: number, groupId: string, userId: string): Promise<any> => {
    const res = await apiClient.delete(`/zalo/accounts/${accountId}/groups/${groupId}/block/${userId}`);
    return res.data.data;
  },
  transferGroupOwnership: async (accountId: number, groupId: string, newOwnerId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/transfer`, { newOwnerId });
    return res.data.result;
  },
  createGroup: async (accountId: number, data: { name: string; memberIds: string[] }): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups`, data);
    return res.data.group;
  },
  leaveGroup: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/leave`);
    return res.data.data;
  },
  disperseGroup: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/disperse`);
    return res.data.data;
  },
  getGroupLinkDetail: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/groups/${groupId}/link`);
    return res.data.data;
  },
  enableGroupLink: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/link/enable`);
    return res.data.data;
  },
  disableGroupLink: async (accountId: number, groupId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/${groupId}/link/disable`);
    return res.data.data;
  },
  joinGroupByLink: async (accountId: number, linkId: string): Promise<any> => {
    const res = await apiClient.post(`/zalo/accounts/${accountId}/groups/join-link`, { linkId });
    return res.data.data;
  },

  // ─── Ensure conversation from group ────────────────────────────────────────
  ensureGroupConversation: async (
    accountId: number,
    groupId: string,
    meta?: { groupName?: string; groupAvatarUrl?: string | null; memberCount?: number },
  ): Promise<{ conversationId: string }> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/groups/${groupId}/ensure-conversation`,
      meta,
    );
    return res.data.data ?? res.data;
  },

  // ─── Conversations list ─────────────────────────────────────────────────────
  getConversations: async (
    accountId: number,
    opts: { page?: number; limit?: number; search?: string; threadType?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.search) params.set('search', opts.search);
    if (opts.threadType) params.set('threadType', opts.threadType);
    const res = await apiClient.get(`/zalo/accounts/${accountId}/conversations?${params.toString()}`);
    return res.data;
  },

  // ─── Messages history ───────────────────────────────────────────────────────
  getMessages: async (
    accountId: number,
    threadId: string,
    opts: { page?: number; limit?: number; before?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.page) params.set('page', String(opts.page));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.before) params.set('before', opts.before);
    const res = await apiClient.get(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/messages?${params.toString()}`,
    );
    return res.data;
  },

  // ─── Send message ───────────────────────────────────────────────────────────
  sendMessage: async (
    accountId: number,
    threadId: string,
    content: string,
    contentType: string = 'text',
  ): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/messages`,
      { content, contentType },
    );
    return res.data.data;
  },

  // ─── Conversation counts (unread/unreplied) ─────────────────────────────────
  getConversationCounts: async (accountId: number): Promise<any> => {
    const res = await apiClient.get(`/zalo/accounts/${accountId}/conversations/counts`);
    return res.data;
  },

  // ─── Mark conversation as read ──────────────────────────────────────────────
  markConversationRead: async (accountId: number, threadId: string): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/mark-read`,
    );
    return res.data;
  },

  // ─── Soft delete conversation ───────────────────────────────────────────────
  deleteConversation: async (accountId: number, threadId: string): Promise<any> => {
    const res = await apiClient.delete(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}`,
    );
    return res.data;
  },

  // ─── Restore soft-deleted conversation ──────────────────────────────────────
  restoreConversation: async (accountId: number, threadId: string): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/restore`,
    );
    return res.data;
  },

  // ─── Reactions ───────────────────────────────────────────────────────────────
  toggleReaction: async (
    accountId: number,
    msgId: string,
    emoji: string,
  ): Promise<{ emoji: string; added: boolean; reactions: Record<string, string[]> }> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/messages/${encodeURIComponent(msgId)}/reactions`,
      { emoji },
    );
    return res.data.data;
  },

  getReactions: async (
    accountId: number,
    msgId: string,
  ): Promise<{ reactions: Record<string, string[]> }> => {
    const res = await apiClient.get(
      `/zalo/accounts/${accountId}/messages/${encodeURIComponent(msgId)}/reactions`,
    );
    return res.data.data;
  },

  // ─── Polls ──────────────────────────────────────────────────────────────────
  createPoll: async (
    accountId: number,
    threadId: string,
    data: { question: string; options: string[]; allowMulti?: boolean; anonymous?: boolean; expireMs?: number },
  ): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/polls`,
      data,
    );
    return res.data.data;
  },

  votePoll: async (
    accountId: number,
    threadId: string,
    pollId: string,
    optionIds: number[],
  ): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/conversations/${encodeURIComponent(threadId)}/polls/${encodeURIComponent(pollId)}/vote`,
      { optionIds },
    );
    return res.data.data;
  },

  // ─── Mark read ──────────────────────────────────────────────────────────────
  markMessageRead: async (accountId: number, msgId: string): Promise<any> => {
    const res = await apiClient.post(
      `/zalo/accounts/${accountId}/messages/${encodeURIComponent(msgId)}/mark-read`,
    );
    return res.data;
  },
};
