import { PrismaClient, CareLog, CareTask, CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus } from '@prisma/client';
import { prisma } from '../../prisma/client';

export class CareRepository {
  private db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient || prisma;
  }

  // --- CareLog Methods ---

  async findCareLogsByEnrollmentId(enrollment_id: number) {
    return this.db.careLog.findMany({
      where: { enrollment_id },
      orderBy: [
        { after_session_number: 'desc' },
        { created_at: 'desc' },
      ],
      include: {
        cs: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async createCareLog(data: {
    enrollment_id: number;
    cs_id: number;
    after_session_number: number;
    outcome: CareLogOutcome;
    content?: string;
    created_by_id: number;
  }): Promise<CareLog> {
    return this.db.careLog.create({
      data: {
        enrollment_id: data.enrollment_id,
        cs_id: data.cs_id,
        after_session_number: data.after_session_number,
        outcome: data.outcome,
        content: data.content,
        created_by_id: data.created_by_id,
      },
      include: {
        cs: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  // --- CareTask Methods ---

  async findCareTaskById(id: number) {
    return this.db.careTask.findUnique({
      where: { id },
      include: {
        enrollment: {
          include: {
            student: true,
            package: true,
          },
        },
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findCareTasks(filter: {
    enrollmentIds?: number[];
    assignedToIds?: number[];
    status?: CareTaskStatus;
    priority?: CareTaskPriority;
    type?: CareTaskType;
    dueBefore?: Date;
    dueAfter?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (filter.enrollmentIds && filter.enrollmentIds.length > 0) {
      where.enrollment_id = { in: filter.enrollmentIds };
    }
    if (filter.assignedToIds && filter.assignedToIds.length > 0) {
      where.assigned_to_id = { in: filter.assignedToIds };
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.priority) {
      where.priority = filter.priority;
    }
    if (filter.type) {
      where.type = filter.type;
    }
    if (filter.dueBefore || filter.dueAfter) {
      where.due_at = {};
      if (filter.dueBefore) where.due_at.lte = filter.dueBefore;
      if (filter.dueAfter) where.due_at.gte = filter.dueAfter;
    }

    return this.db.careTask.findMany({
      where,
      take: filter.limit || 20,
      skip: filter.offset || 0,
      orderBy: [
        { priority: 'desc' },
        { due_at: 'asc' },
        { created_at: 'desc' },
      ],
      include: {
        enrollment: {
          include: {
            student: true,
            package: true,
          },
        },
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async countCareTasks(filter: {
    enrollmentIds?: number[];
    assignedToIds?: number[];
    status?: CareTaskStatus;
    priority?: CareTaskPriority;
    type?: CareTaskType;
    dueBefore?: Date;
    dueAfter?: Date;
  }): Promise<number> {
    const where: any = {};

    if (filter.enrollmentIds && filter.enrollmentIds.length > 0) {
      where.enrollment_id = { in: filter.enrollmentIds };
    }
    if (filter.assignedToIds && filter.assignedToIds.length > 0) {
      where.assigned_to_id = { in: filter.assignedToIds };
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.priority) {
      where.priority = filter.priority;
    }
    if (filter.type) {
      where.type = filter.type;
    }
    if (filter.dueBefore || filter.dueAfter) {
      where.due_at = {};
      if (filter.dueBefore) where.due_at.lte = filter.dueBefore;
      if (filter.dueAfter) where.due_at.gte = filter.dueAfter;
    }

    return this.db.careTask.count({ where });
  }

  async createCareTask(data: {
    enrollment_id: number;
    assigned_to_id: number;
    type: CareTaskType;
    title?: string;
    note?: string;
    due_at?: Date;
    priority: CareTaskPriority;
  }): Promise<CareTask> {
    return this.db.careTask.create({
      data: {
        enrollment_id: data.enrollment_id,
        assigned_to_id: data.assigned_to_id,
        type: data.type,
        title: data.title,
        note: data.note,
        due_at: data.due_at,
        priority: data.priority,
        status: CareTaskStatus.PENDING,
      },
      include: {
        enrollment: {
          include: {
            student: true,
            package: true,
          },
        },
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async updateCareTask(id: number, data: Partial<CareTask>): Promise<CareTask> {
    return this.db.careTask.update({
      where: { id },
      data,
      include: {
        enrollment: {
          include: {
            student: true,
            package: true,
          },
        },
        assigned_to: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async findEnrollmentById(id: number) {
    return this.db.enrollment.findUnique({
      where: { id },
      include: {
        cs: true,
        student: true,
      },
    });
  }

  // --- CareMilestoneConfig Methods ---

  async findMilestones() {
    const list = await this.db.careMilestoneConfig.findMany({
      orderBy: { session_number: 'asc' },
    });
    if (list.length === 0) {
      const defaultOne = await this.db.careMilestoneConfig.create({
        data: { session_number: 1, display_order: 1 },
      });
      return [defaultOne];
    }
    return list;
  }

  async createMilestone(sessionNumber: number, userId?: number) {
    return this.db.careMilestoneConfig.upsert({
      where: { session_number: sessionNumber },
      update: {},
      create: {
        session_number: sessionNumber,
        display_order: sessionNumber,
        created_by_id: userId,
      },
    });
  }

  // --- Session CareLog Upsert ---

  async upsertCareLogBySession(data: {
    enrollment_id: number;
    after_session_number: number;
    content: string;
    outcome?: CareLogOutcome;
    userId: number;
    csId: number;
  }): Promise<CareLog> {
    const existing = await this.db.careLog.findFirst({
      where: {
        enrollment_id: data.enrollment_id,
        after_session_number: data.after_session_number,
      },
    });

    if (existing) {
      return this.db.careLog.update({
        where: { id: existing.id },
        data: {
          content: data.content,
          ...(data.outcome ? { outcome: data.outcome } : {}),
        },
        include: {
          cs: { select: { id: true, name: true, email: true } },
        },
      });
    }

    return this.db.careLog.create({
      data: {
        enrollment_id: data.enrollment_id,
        cs_id: data.csId,
        after_session_number: data.after_session_number,
        content: data.content,
        outcome: data.outcome || CareLogOutcome.POSITIVE,
        created_by_id: data.userId,
      },
      include: {
        cs: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // --- Update Enrollment Care Fields ---

  async updateEnrollmentCareFields(enrollmentId: number, data: any) {
    return this.db.enrollment.update({
      where: { id: enrollmentId },
      data,
    });
  }
}
