import { CareRepository } from './care.repository';
import {
  CreateCareLogDTO,
  CreateCareTaskDTO,
  UpdateCareTaskDTO,
  CareTaskFilterParams,
  UpdateEnrollmentCareDTO,
  SaveSessionCareLogDTO,
} from './care.types';
import { CareTaskPriority, CareTaskStatus, CareLogOutcome, CareTaskType } from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { prisma } from '../../prisma/client';

export class CareService {
  private repo: CareRepository;

  constructor(repo?: CareRepository) {
    this.repo = repo || new CareRepository();
  }

  // Helper to determine accessible CS IDs for the current user
  async getAccessibleCSIds(userId: number, roles: string[]): Promise<number[] | null> {
    if (roles.includes('ADMIN')) {
      return null; // Full scope
    }

    if (roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: {
          cs_group: {
            include: { members: true },
          },
        },
      });

      const csIds = new Set<number>();
      csIds.add(userId);
      assignments.forEach((a) => {
        a.cs_group.members.forEach((m) => csIds.add(m.user_id));
      });
      return Array.from(csIds);
    }

    if (roles.includes('CS')) {
      return [userId];
    }

    throw new AppError(403, 'Bạn không có quyền truy cập dữ liệu chăm sóc học viên');
  }

  private async assertEnrollmentAccess(enrollmentId: number, userId: number, roles: string[]) {
    const enrollment = await this.repo.findEnrollmentById(enrollmentId);
    if (!enrollment) {
      throw new AppError(404, 'Không tìm thấy thông tin gói học');
    }

    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    if (accessibleCSIds !== null && !accessibleCSIds.includes(enrollment.cs_id)) {
      throw new AppError(403, 'Bạn không có quyền truy cập gói học này');
    }

    return enrollment;
  }

  // --- CareLog Methods ---

  async getCareLogs(enrollmentId: number, userId: number, roles: string[]) {
    await this.assertEnrollmentAccess(enrollmentId, userId, roles);
    return this.repo.findCareLogsByEnrollmentId(enrollmentId);
  }

  async createCareLog(enrollmentId: number, dto: CreateCareLogDTO, userId: number, roles: string[]) {
    const enrollment = await this.assertEnrollmentAccess(enrollmentId, userId, roles);

    return this.repo.createCareLog({
      enrollment_id: enrollmentId,
      cs_id: enrollment.cs_id,
      after_session_number: dto.after_session_number,
      outcome: dto.outcome,
      content: dto.content,
      created_by_id: userId,
    });
  }

  // --- CareTask Methods ---

  async getCareTasks(filter: CareTaskFilterParams, userId: number, roles: string[]) {
    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);

    let assignedToIds: number[] | undefined;
    if (accessibleCSIds !== null) {
      assignedToIds = accessibleCSIds;
      if (filter.assigned_to_id) {
        if (!accessibleCSIds.includes(filter.assigned_to_id)) {
          throw new AppError(403, 'Không có quyền xem nhiệm vụ của nhân viên này');
        }
        assignedToIds = [filter.assigned_to_id];
      }
    } else if (filter.assigned_to_id) {
      assignedToIds = [filter.assigned_to_id];
    }

    let dueBefore: Date | undefined;
    let dueAfter: Date | undefined;
    const now = new Date();

    if (filter.due_filter === 'overdue') {
      dueBefore = now;
    } else if (filter.due_filter === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      dueAfter = startOfDay;
      dueBefore = endOfDay;
    } else if (filter.due_filter === 'this_week') {
      const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      dueBefore = endOfWeek;
    }

    const [items, total] = await Promise.all([
      this.repo.findCareTasks({
        assignedToIds,
        enrollmentIds: filter.enrollment_id ? [filter.enrollment_id] : undefined,
        status: filter.status,
        priority: filter.priority,
        type: filter.type,
        dueBefore,
        dueAfter,
        limit: filter.limit || 20,
        offset: filter.offset || 0,
      }),
      this.repo.countCareTasks({
        assignedToIds,
        enrollmentIds: filter.enrollment_id ? [filter.enrollment_id] : undefined,
        status: filter.status,
        priority: filter.priority,
        type: filter.type,
        dueBefore,
        dueAfter,
      }),
    ]);

    return { items, total };
  }

  async getCareTaskById(id: number, userId: number, roles: string[]) {
    const task = await this.repo.findCareTaskById(id);
    if (!task) {
      throw new AppError(404, 'Không tìm thấy nhiệm vụ chăm sóc');
    }

    const accessibleCSIds = await this.getAccessibleCSIds(userId, roles);
    if (accessibleCSIds !== null && !accessibleCSIds.includes(task.assigned_to_id)) {
      throw new AppError(403, 'Bạn không có quyền xem nhiệm vụ này');
    }

    return task;
  }

  async createCareTask(dto: CreateCareTaskDTO, userId: number, roles: string[]) {
    const enrollment = await this.assertEnrollmentAccess(dto.enrollment_id, userId, roles);

    const assignedToId = dto.assigned_to_id || enrollment.cs_id || userId;
    const dueAt = dto.due_at ? new Date(dto.due_at) : undefined;

    return this.repo.createCareTask({
      enrollment_id: dto.enrollment_id,
      assigned_to_id: assignedToId,
      type: dto.type,
      title: dto.title,
      note: dto.note,
      due_at: dueAt,
      priority: dto.priority || CareTaskPriority.NORMAL,
    });
  }

  async updateCareTask(id: number, dto: UpdateCareTaskDTO, userId: number, roles: string[]) {
    await this.getCareTaskById(id, userId, roles);

    const updateData: any = {};
    if (dto.assigned_to_id !== undefined) updateData.assigned_to_id = dto.assigned_to_id;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.note !== undefined) updateData.note = dto.note;
    if (dto.due_at !== undefined) updateData.due_at = dto.due_at ? new Date(dto.due_at) : null;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.status !== undefined) updateData.status = dto.status;

    return this.repo.updateCareTask(id, updateData);
  }

  async completeCareTask(id: number, userId: number, roles: string[]) {
    await this.getCareTaskById(id, userId, roles);
    return this.repo.updateCareTask(id, {
      status: CareTaskStatus.DONE,
      completed_at: new Date(),
    });
  }

  async cancelCareTask(id: number, userId: number, roles: string[]) {
    await this.getCareTaskById(id, userId, roles);
    return this.repo.updateCareTask(id, {
      status: CareTaskStatus.CANCELLED,
    });
  }

  // --- CareMilestoneConfig Methods ---

  async getMilestones() {
    return this.repo.findMilestones();
  }

  async addMilestone(sessionNumber: number, userId: number) {
    if (sessionNumber <= 0) {
      throw new AppError(400, 'Số buổi phải là số nguyên dương');
    }
    return this.repo.createMilestone(sessionNumber, userId);
  }

  // --- Session CareLog Upsert ---

  async saveSessionCareLog(
    enrollmentId: number,
    sessionNumber: number,
    dto: SaveSessionCareLogDTO,
    userId: number,
    roles: string[]
  ) {
    const enrollment = await this.assertEnrollmentAccess(enrollmentId, userId, roles);
    return this.repo.upsertCareLogBySession({
      enrollment_id: enrollmentId,
      after_session_number: sessionNumber,
      content: dto.content,
      outcome: dto.outcome,
      userId,
      csId: enrollment.cs_id,
    });
  }

  // --- Update Enrollment Care Fields ---

  async updateEnrollmentCare(
    enrollmentId: number,
    dto: UpdateEnrollmentCareDTO,
    userId: number,
    roles: string[]
  ) {
    const enrollment = await this.assertEnrollmentAccess(enrollmentId, userId, roles);

    const updateData: any = {};
    if (dto.study_report_url !== undefined) updateData.study_report_url = dto.study_report_url;
    if (dto.exchange_info !== undefined) updateData.exchange_info = dto.exchange_info;
    if (dto.callback_note !== undefined) updateData.callback_note = dto.callback_note;
    if (dto.hot_issue_note !== undefined) updateData.hot_issue_note = dto.hot_issue_note;
    if (dto.post_course_care !== undefined) updateData.post_course_care = dto.post_course_care;

    // Auto-create/sync CareTask if callback_note has content
    if (dto.callback_note && dto.callback_note.trim().length > 0) {
      try {
        await this.repo.createCareTask({
          enrollment_id: enrollmentId,
          assigned_to_id: enrollment.cs_id,
          type: CareTaskType.CALLBACK,
          title: 'Lịch hẹn gọi: ' + dto.callback_note.trim().substring(0, 50),
          note: dto.callback_note.trim(),
          priority: CareTaskPriority.NORMAL,
        });
      } catch (err) {
        console.error('Failed to auto-create CALLBACK task:', err);
      }
    }

    // Auto-create/sync CareTask if hot_issue_note has content
    if (dto.hot_issue_note && dto.hot_issue_note.trim().length > 0) {
      try {
        await this.repo.createCareTask({
          enrollment_id: enrollmentId,
          assigned_to_id: enrollment.cs_id,
          type: CareTaskType.HOT_ISSUE,
          title: 'Điểm nóng: ' + dto.hot_issue_note.trim().substring(0, 50),
          note: dto.hot_issue_note.trim(),
          priority: CareTaskPriority.HIGH,
        });
      } catch (err) {
        console.error('Failed to auto-create HOT_ISSUE task:', err);
      }
    }

    return this.repo.updateEnrollmentCareFields(enrollmentId, updateData);
  }
}
