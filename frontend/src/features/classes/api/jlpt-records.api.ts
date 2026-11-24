import { apiClient } from '../../../api/client';
import {
  JlptLearningRecord,
  JlptLearningRecordPatch,
  JlptLearningRecordRow,
} from '../types/classes.types';

export const jlptLearningRecordsApi = {
  list: async (classId: number, sessionId: number): Promise<JlptLearningRecordRow[]> => {
    const res = await apiClient.get(`/classes/${classId}/sessions/${sessionId}/jlpt-records`);
    return res.data.data;
  },

  update: async (
    classId: number,
    sessionId: number,
    enrollmentClassId: number,
    patch: JlptLearningRecordPatch,
  ): Promise<JlptLearningRecord> => {
    const res = await apiClient.patch(
      `/classes/${classId}/sessions/${sessionId}/jlpt-records/${enrollmentClassId}`,
      patch,
    );
    return res.data.data;
  },

  bulkUpdate: async (
    classId: number,
    sessionId: number,
    enrollmentClassIds: number[],
    patch: JlptLearningRecordPatch,
  ): Promise<JlptLearningRecord[]> => {
    const res = await apiClient.post(
      `/classes/${classId}/sessions/${sessionId}/jlpt-records/bulk`,
      { ...patch, enrollment_class_ids: enrollmentClassIds },
    );
    return res.data.data;
  },
};
