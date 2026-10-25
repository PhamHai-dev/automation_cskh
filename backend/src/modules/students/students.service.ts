import { StudentsRepository } from './students.repository';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';
import {
  normalizeSchedulePattern,
  normalizeScheduleTime,
} from '../../shared/schedule/schedule-pattern';
import { runStudentCareGroupAutoSync } from '../zalo/student-care-group.contract';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class StudentsService {
  private repository: StudentsRepository;

  constructor() {
    this.repository = new StudentsRepository();
  }

  async getAllStudents(options?: {
    userId?: number;
    roles?: string[];
    programType?: string;
    csId?: number;
  }) {
    return this.repository.findAll(options);
  }

  async getStudentById(id: number) {
    const student = await this.repository.findById(id);
    if (!student) throw new CustomError('Student not found', 404);
    return student;
  }

  async createStudent(data: CreateStudentDTO, currentUserId?: number) {
    const normalizedData = this.normalizeScheduleFields(data);

    // Basic duplication check
    if (normalizedData.phone && normalizedData.phone.trim().length > 0) {
      const existing = await this.repository.findByPhone(normalizedData.phone.trim());
      if (existing) throw new CustomError('Student with this phone already exists', 409);
    }
    if (normalizedData.email && normalizedData.email.trim().length > 0) {
      const existing = await this.repository.findByEmail(normalizedData.email.trim());
      if (existing) throw new CustomError('Student with this email already exists', 409);
    }
    const created = await this.repository.create(normalizedData, currentUserId);
    if (created?.id) {
      await runStudentCareGroupAutoSync({
        triggeredBy: 'manual',
        refreshLiveGroups: false,
        studentIds: [created.id],
      }).catch(() => null);
    }
    return created;
  }

  async updateStudent(id: number, data: UpdateStudentDTO) {
    const normalizedData = this.normalizeScheduleFields(data);
    const existing = await this.repository.findById(id);
    if (!existing) throw new CustomError('Student not found', 404);

    if (normalizedData.phone && normalizedData.phone.trim().length > 0 && normalizedData.phone.trim() !== existing.phone) {
      const duplicatePhone = await this.repository.findByPhone(normalizedData.phone.trim());
      if (duplicatePhone) throw new CustomError('Student with this phone already exists', 409);
    }
    if (normalizedData.email && normalizedData.email.trim().length > 0 && normalizedData.email.trim() !== existing.email) {
      const duplicateEmail = await this.repository.findByEmail(normalizedData.email.trim());
      if (duplicateEmail) throw new CustomError('Student with this email already exists', 409);
    }

    const updated = await this.repository.update(id, normalizedData);
    await runStudentCareGroupAutoSync({
      triggeredBy: 'manual',
      refreshLiveGroups: false,
      studentIds: [id],
    }).catch(() => null);
    return updated;
  }

  private normalizeScheduleFields<T extends CreateStudentDTO | UpdateStudentDTO>(data: T): T {
    try {
      return {
        ...data,
        ...(data.schedule_pattern !== undefined
          ? { schedule_pattern: normalizeSchedulePattern(data.schedule_pattern) }
          : {}),
        ...(data.start_time !== undefined && data.start_time !== ''
          ? { start_time: normalizeScheduleTime(data.start_time) }
          : {}),
      };
    } catch (error) {
      throw new CustomError(error instanceof Error ? error.message : 'Lịch học không hợp lệ', 400);
    }
  }
}
