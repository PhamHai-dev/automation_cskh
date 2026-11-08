import { apiClient } from '../../../api/client';
import { PaginatedMeta, PaginatedResponse, normalizePaginatedResponse } from '../../../api/pagination.types';
import {
  Student,
  CreateStudentDTO,
  UpdateStudentDTO,
  JlptAttendanceReportParams,
  JlptAttendanceReportResponse,
  JlptAttendanceReportRow,
  UpdateJlptAttendanceReportDTO,
} from '../types/students.types';

export type {
  PaginatedMeta,
  PaginatedResponse,
  JlptAttendanceReportParams,
  JlptAttendanceReportResponse,
  JlptAttendanceReportRow,
  UpdateJlptAttendanceReportDTO,
};

export type StudentsListMeta = PaginatedMeta;

export interface StudentsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  program_type?: string;
  cs_id?: number;
  cvht?: string;
  gender?: string;
  status?: string;
  model?: string;
  payment?: string;
  sale?: string;
}

export const studentsApi = {
  list: async (params?: StudentsListParams, signal?: AbortSignal): Promise<Student[]> => {
    const res = await apiClient.get('/students', { params, signal });
    return res.data.data;
  },

  listPaginated: async (
    params?: StudentsListParams,
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Student>> => {
    const res = await apiClient.get('/students', { params, signal });
    return normalizePaginatedResponse<Student>(res.data, params);
  },

  get: async (id: number, signal?: AbortSignal): Promise<Student> => {
    const res = await apiClient.get(`/students/${id}`, { signal });
    return res.data.data;
  },

  create: async (data: CreateStudentDTO): Promise<Student> => {
    const res = await apiClient.post('/students', data);
    return res.data.data;
  },

  update: async (id: number, data: UpdateStudentDTO): Promise<Student> => {
    const res = await apiClient.patch(`/students/${id}`, data);
    return res.data.data;
  },

  getJlptAttendanceReport: async (
    params?: JlptAttendanceReportParams,
    signal?: AbortSignal
  ): Promise<JlptAttendanceReportResponse> => {
    const res = await apiClient.get('/students/jlpt-attendance-report', { params, signal });
    const rawData: JlptAttendanceReportRow[] = Array.isArray(res.data?.data) ? res.data.data : [];
    const rawMeta = res.data?.meta || {};
    const page = Number(rawMeta.page) || Number(params?.page) || 1;
    const pageSize = Number(rawMeta.pageSize) || Number(params?.pageSize) || 50;
    const total = typeof rawMeta.total === 'number' ? rawMeta.total : rawData.length;
    const totalPages = Number(rawMeta.totalPages) || Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rawData,
      meta: {
        ...rawMeta,
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  },

  updateJlptAttendanceReport: async (
    studentId: number,
    data: UpdateJlptAttendanceReportDTO
  ): Promise<JlptAttendanceReportRow> => {
    const res = await apiClient.patch(`/students/${studentId}/jlpt-attendance-report`, data);
    return res.data.data;
  },
};
