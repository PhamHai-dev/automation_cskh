import { StudentsRepository } from './students.repository';
import {
  CreateStudentDTO,
  UpdateStudentDTO,
  StudentListQueryOptions,
  StudentListResult,
} from './students.types';
import { AuthUser } from '../../middlewares/auth.middleware';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client';
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

type DeniedOperation = 'READ' | 'UPDATE';

const isAccessDenied = (error: unknown): boolean =>
  !!error && typeof error === 'object' && (error as { status?: unknown }).status === 403;

/**
 * B.1: "audit ghi lần từ chối" — record every denied student access (403) in
 * AuditLog so out-of-scope attempts are attributable. The row shape follows the
 * proven usage in ClassSessionsService.cancelSession (user_id, action,
 * entity_type, entity_id, before_data, after_data). Audit is strictly
 * best-effort: a logging failure must never mask the original 403.
 */
async function recordAccessDenied(
  actor: AuthUser,
  studentId: number,
  op: DeniedOperation,
  error: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: actor?.id ?? null,
        action: 'STUDENT_ACCESS_DENIED',
        entity_type: 'Student',
        entity_id: String(studentId),
        before_data: Prisma.JsonNull,
        after_data: {
          operation: op,
          reason: (error as { message?: string } | null | undefined)?.message ?? null,
          roles: actor?.roles ?? [],
        } as any,
      },
    });
  } catch {
    // Best-effort only; swallow logging failures.
  }
}

export class StudentsService {
  private repository: StudentsRepository;

  constructor() {
    this.repository = new StudentsRepository();
  }

  async getAllStudents(options: StudentListQueryOptions) {
    // B.5/D9: scope is derived ONLY from the actor via enrollment.cs_id
    // (getStudentCsScope in the repository); sale/handover data never grants access.
    return this.repository.findAll(options);
  }

  async getStudentsWithMeta(options: StudentListQueryOptions): Promise<StudentListResult> {
    const data = await this.repository.findAll(options);
    const meta = await this.repository.computeMeta(options, data);
    return { data, meta };
  }

  async getStudentById(id: number, actor: AuthUser) {
    // The repository scopes enrollment records to the actor's assigned CS ids;
    // a student with no in-scope enrollment is reported as 403 not found.
    // B.1: 403 denials are audited best-effort; 404/other errors are not.
    let student;
    try {
      student = await this.repository.findById(id, actor);
    } catch (error) {
      if (isAccessDenied(error)) {
        await recordAccessDenied(actor, id, 'READ', error);
      }
      throw error;
    }
    if (!student) throw new CustomError('Student not found', 404);
    return student;
  }

  async createStudent(data: CreateStudentDTO, actor: AuthUser) {
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
    // B.5/D9: the repository authorizes cs_id against the actor's scope and the
    // CS role before creating the enrollment; sale_name stays plain data.
    const created = await this.repository.create(normalizedData, actor);
    if (created?.id) {
      await runStudentCareGroupAutoSync({
        triggeredBy: 'manual',
        refreshLiveGroups: false,
        studentIds: [created.id],
      }).catch(() => null);
    }
    return created;
  }

  async updateStudent(id: number, data: UpdateStudentDTO, actor: AuthUser) {
    const normalizedData = this.normalizeScheduleFields(data);
    // B.1: a 403 from either scoped repository call (findById or update) is an
    // out-of-scope write attempt and is audited best-effort; other errors
    // (including the 404 below) are not.
    try {
      const existing = await this.repository.findById(id, actor);
      if (!existing) throw new CustomError('Student not found', 404);

      if (normalizedData.phone && normalizedData.phone.trim().length > 0 && normalizedData.phone.trim() !== existing.phone) {
        const duplicatePhone = await this.repository.findByPhone(normalizedData.phone.trim());
        if (duplicatePhone) throw new CustomError('Student with this phone already exists', 409);
      }
      if (normalizedData.email && normalizedData.email.trim().length > 0 && normalizedData.email.trim() !== existing.email) {
        const duplicateEmail = await this.repository.findByEmail(normalizedData.email.trim());
        if (duplicateEmail) throw new CustomError('Student with this email already exists', 409);
      }

      const updated = await this.repository.update(id, normalizedData, actor);
      await runStudentCareGroupAutoSync({
        triggeredBy: 'manual',
        refreshLiveGroups: false,
        studentIds: [id],
      }).catch(() => null);
      return updated;
    } catch (error) {
      if (isAccessDenied(error)) {
        await recordAccessDenied(actor, id, 'UPDATE', error);
      }
      throw error;
    }
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
