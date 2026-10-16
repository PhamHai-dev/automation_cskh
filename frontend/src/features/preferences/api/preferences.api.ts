import { apiClient } from '../../../api/client';
import { PreferenceScope } from '../columns';

export interface PreferenceData {
  scope: PreferenceScope;
  value: Record<string, boolean>;
  updated_at?: string;
}

export const preferencesApi = {
  get: async (scope: PreferenceScope): Promise<PreferenceData> => {
    const { data } = await apiClient.get<PreferenceData>(`/me/preferences/${scope}`);
    return data;
  },

  save: async (scope: PreferenceScope, value: Record<string, boolean>): Promise<PreferenceData> => {
    const { data } = await apiClient.put<PreferenceData>(`/me/preferences/${scope}`, { value });
    return data;
  },
};
