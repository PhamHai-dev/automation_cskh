/**
 * Automation API — Frontend HTTP client for automation CRUD.
 */
import { apiClient } from '../../../api/client';
import type {
  AutomationWorkflow,
  AutomationStep,
  AutomationEnrollment,
  MessageDelivery,
  WorkflowListResult,
  SuggestLinkItem,
} from '../types/automation.types';

export const automationApi = {
  // ─── Workflow CRUD ────────────────────────────────────────────────────

  listWorkflows: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
  }): Promise<WorkflowListResult> => {
    const res = await apiClient.get('/automation/workflows', { params });
    return res.data;
  },

  getWorkflow: async (id: number): Promise<{ workflow: AutomationWorkflow }> => {
    const res = await apiClient.get(`/automation/workflows/${id}`);
    return res.data;
  },

  createWorkflow: async (data: {
    name: string;
    description?: string;
  }): Promise<{ workflow: AutomationWorkflow }> => {
    const res = await apiClient.post('/automation/workflows', data);
    return res.data;
  },

  updateWorkflow: async (
    id: number,
    data: { name?: string; description?: string | null; active?: boolean }
  ): Promise<{ workflow: AutomationWorkflow }> => {
    const res = await apiClient.patch(`/automation/workflows/${id}`, data);
    return res.data;
  },

  deleteWorkflow: async (id: number): Promise<void> => {
    await apiClient.delete(`/automation/workflows/${id}`);
  },

  // ─── Steps ───────────────────────────────────────────────────────────

  addStep: async (
    workflowId: number,
    data: {
      session_number: number;
      trigger_event: string;
      delay_minutes: number;
      channel?: string;
      target_group_id?: number | null;
      message_content: string;
      message_variables?: string[];
    }
  ): Promise<{ step: AutomationStep }> => {
    const res = await apiClient.post(`/automation/workflows/${workflowId}/steps`, data);
    return res.data;
  },

  updateStep: async (
    stepId: number,
    data: Partial<{
      session_number: number;
      trigger_event: string;
      delay_minutes: number;
      channel: string;
      target_group_id: number | null;
      message_content: string;
      message_variables: string[];
      active: boolean;
    }>
  ): Promise<{ step: AutomationStep }> => {
    const res = await apiClient.patch(`/automation/steps/${stepId}`, data);
    return res.data;
  },

  deleteStep: async (stepId: number): Promise<void> => {
    await apiClient.delete(`/automation/steps/${stepId}`);
  },

  // ─── Enrollments ─────────────────────────────────────────────────────

  listEnrollments: async (
    workflowId: number
  ): Promise<{ items: AutomationEnrollment[] }> => {
    const res = await apiClient.get(`/automation/workflows/${workflowId}/enrollments`);
    return res.data;
  },

  addEnrollments: async (
    workflowId: number,
    enrollmentIds: number[]
  ): Promise<{ enrolled: number; results: any[]; errors: any[] }> => {
    const res = await apiClient.post(`/automation/workflows/${workflowId}/enrollments`, {
      enrollment_ids: enrollmentIds,
    });
    return res.data;
  },

  removeEnrollment: async (
    workflowId: number,
    enrollmentId: number
  ): Promise<void> => {
    await apiClient.delete(
      `/automation/workflows/${workflowId}/enrollments/${enrollmentId}`
    );
  },

  // ─── Deliveries ──────────────────────────────────────────────────────

  listDeliveries: async (
    workflowId: number,
    params?: { status?: string; enrollmentId?: number; page?: number; limit?: number }
  ): Promise<{
    items: MessageDelivery[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> => {
    const res = await apiClient.get(`/automation/workflows/${workflowId}/deliveries`, {
      params,
    });
    return res.data;
  },

  // ─── Student-Linking ─────────────────────────────────────────────────

  getUnlinkedStudents: async (params?: {
    q?: string;
    cs_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<{
      id: number;
      full_name: string;
      phone: string | null;
      enrollments: Array<{
        id: number;
        package?: { name: string } | null;
        cs?: { id: number; name: string } | null;
      }>;
    }>;
    total: number;
  }> => {
    const res = await apiClient.get('/zalo/students/unlinked', { params });
    return res.data;
  },

  getStudentsLinked: async (
    accountId: number,
    q?: string
  ): Promise<{ items: any[] }> => {
    const res = await apiClient.get(`/zalo/${accountId}/students-linked`, {
      params: { q },
    });
    return res.data;
  },

  getStudentLinks: async (
    studentId: number
  ): Promise<{ items: any[] }> => {
    const res = await apiClient.get(`/zalo/students/${studentId}/links`);
    return res.data;
  },

  createLink: async (data: {
    student_id: number;
    zalo_account_id: number;
    relation_status?: string;
    display_name?: string;
  }): Promise<{ relation: any }> => {
    const res = await apiClient.post('/zalo/links', data);
    return res.data;
  },

  deleteLink: async (linkId: number): Promise<void> => {
    await apiClient.delete(`/zalo/links/${linkId}`);
  },

  updateLink: async (
    linkId: number,
    data: { display_name?: string; relation_status?: string }
  ): Promise<{ relation: any }> => {
    const res = await apiClient.patch(`/zalo/links/${linkId}`, data);
    return res.data;
  },

  autoSuggestLinks: async (params?: {
    zalo_account_id?: number;
    cs_id?: number;
  }): Promise<{
    items: SuggestLinkItem[];
    total: number;
    note: string;
  }> => {
    const res = await apiClient.post('/zalo/auto-suggest-links', params ?? {});
    return res.data;
  },
};
