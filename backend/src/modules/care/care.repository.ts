import { Prisma, PrismaClient, CareLog, CareTask, CareLogOutcome, CareTaskType, CareTaskPriority, CareTaskStatus } from '@prisma/client';
import { prisma } from '../../prisma/client';

export class CareRepository {
  private db: PrismaClient;

  constructor(dbClient?: PrismaClient) {
    this.db = dbClient || prisma;
  }

  // --- CareLog Methods ---

  async findCareLogsByEnrollmentId(enrollment_id: number) {
    return this.db.careLog.findMany({
      where: {
        enrollment_id,
        enrollment: { student: { deleted_at: null } },
      },
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
    return this.db.careTask.findFirst({
      where: { id, enrollment: { student: { deleted_at: null } } },
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

  private buildCareTaskWhere(filter: {
    enrollmentIds?: number[];
    assignedToIds?: number[];
    search?: string;
    programType?: 'KAIWA' | 'JLPT';
    status?: CareTaskStatus;
    priority?: CareTaskPriority;
    type?: CareTaskType;
    dueBefore?: Date;
    dueAfter?: Date;
    createdBefore?: Date;
    createdAfter?: Date;
  }): Prisma.CareTaskWhereInput {
    const and: Prisma.CareTaskWhereInput[] = [
      { enrollment: { student: { deleted_at: null } } },
    ];

    if (filter.enrollmentIds) {
      and.push({ enrollment_id: { in: filter.enrollmentIds } });
    }
    if (filter.assignedToIds) {
      and.push({ assigned_to_id: { in: filter.assignedToIds } });
    }
    if (filter.search) {
      and.push({
        OR: [
          { title: { contains: filter.search } },
          { note: { contains: filter.search } },
          { assigned_to: { name: { contains: filter.search } } },
          { assigned_to: { email: { contains: filter.search } } },
          { enrollment: { student: { full_name: { contains: filter.search } } } },
          { enrollment: { student: { external_id: { contains: filter.search } } } },
          { enrollment: { student: { phone: { contains: filter.search } } } },
          { enrollment: { student: { email: { contains: filter.search } } } },
          { enrollment: { package: { name: { contains: filter.search } } } },
          { enrollment: { package: { code: { contains: filter.search } } } },
          {
            enrollment: {
              enrollment_classes: {
                some: {
                  class: {
                    OR: [
                      { class_name: { contains: filter.search } },
                      { class_code: { contains: filter.search } },
                    ],
                  },
                },
              },
            },
          },
        ],
      });
    }
    if (filter.programType) {
      and.push({ enrollment: { program_type: filter.programType } });
    }
    if (filter.status) and.push({ status: filter.status });
    if (filter.priority) and.push({ priority: filter.priority });
    if (filter.type) and.push({ type: filter.type });
    if (filter.dueBefore || filter.dueAfter) {
      and.push({
        due_at: {
          ...(filter.dueBefore ? { lte: filter.dueBefore } : {}),
          ...(filter.dueAfter ? { gte: filter.dueAfter } : {}),
        },
      });
    }
    if (filter.createdBefore || filter.createdAfter) {
      and.push({
        created_at: {
          ...(filter.createdBefore ? { lte: filter.createdBefore } : {}),
          ...(filter.createdAfter ? { gte: filter.createdAfter } : {}),
        },
      });
    }

    return { AND: and };
  }

  async findCareTasks(filter: {
    enrollmentIds?: number[];
    assignedToIds?: number[];
    search?: string;
    programType?: 'KAIWA' | 'JLPT';
    status?: CareTaskStatus;
    priority?: CareTaskPriority;
    type?: CareTaskType;
    dueBefore?: Date;
    dueAfter?: Date;
    createdBefore?: Date;
    createdAfter?: Date;
    limit?: number;
    offset?: number;
  }) {
    const where = this.buildCareTaskWhere(filter);

    return this.db.careTask.findMany({
      where,
      take: filter.limit || 25,
      skip: filter.offset || 0,
      orderBy: [
        { priority: 'desc' },
        { due_at: 'asc' },
        { created_at: 'desc' },
        { id: 'asc' },
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
    search?: string;
    programType?: 'KAIWA' | 'JLPT';
    status?: CareTaskStatus;
    priority?: CareTaskPriority;
    type?: CareTaskType;
    dueBefore?: Date;
    dueAfter?: Date;
    createdBefore?: Date;
    createdAfter?: Date;
  }): Promise<number> {
    return this.db.careTask.count({ where: this.buildCareTaskWhere(filter) });
  }

  async createCareTask(data: {
    enrollment_id: number;
    assigned_to_id: number;
    type: CareTaskType;
    title?: string;
    note?: string;
    due_at?: Date;
    priority: CareTaskPriority;
    /** Optional request-level dedupe key (CareTask.idempotency_key is @unique). */
    idempotency_key?: string;
  }): Promise<CareTask> {
    const include = {
      enrollment: {
        include: {
          student: true,
          package: true,
        },
      },
      assigned_to: {
        select: { id: true, name: true, email: true },
      },
    };

    // Idempotent lane: the model has a UNIQUE idempotency_key. When the caller
    // supplies one, upsert so a repeated save for the SAME source event yields a
    // single task instead of a duplicate. A distinct event passes a distinct key
    // and still creates its own task. Update only refreshes the mutable fields,
    // never the enrollment/type identity, so a replay cannot re-point the task.
    if (data.idempotency_key) {
      return this.db.careTask.upsert({
        where: { idempotency_key: data.idempotency_key },
        update: {
          title: data.title,
          note: data.note,
          due_at: data.due_at,
          priority: data.priority,
        },
        create: {
          enrollment_id: data.enrollment_id,
          assigned_to_id: data.assigned_to_id,
          type: data.type,
          title: data.title,
          note: data.note,
          due_at: data.due_at,
          priority: data.priority,
          status: CareTaskStatus.PENDING,
          idempotency_key: data.idempotency_key,
        },
        include,
      });
    }

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
      include,
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
    return this.db.enrollment.findFirst({
      where: { id, student: { deleted_at: null } },
      include: {
        cs: true,
        cs_viewers: true,
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
    const include = {
      cs: { select: { id: true, name: true, email: true } },
    };

    // CareLog has NO @@unique([enrollment_id, after_session_number]) in the
    // schema, so prisma.upsert cannot key on it (adding one is a schema
    // migration — deliberately NOT done here). This findFirst→update/create is
    // therefore only atomic against concurrent runs by wrapping it in a
    // Serializable transaction; a true DB-level guarantee still needs the
    // unique constraint (reported as a limitation).
    return this.db.$transaction(
      async (tx) => {
        const existing = await tx.careLog.findFirst({
          where: {
            enrollment_id: data.enrollment_id,
            after_session_number: data.after_session_number,
          },
        });

        if (existing) {
          return tx.careLog.update({
            where: { id: existing.id },
            data: {
              content: data.content,
              ...(data.outcome ? { outcome: data.outcome } : {}),
            },
            include,
          });
        }

        return tx.careLog.create({
          data: {
            enrollment_id: data.enrollment_id,
            cs_id: data.csId,
            after_session_number: data.after_session_number,
            content: data.content,
            outcome: data.outcome || CareLogOutcome.POSITIVE,
            created_by_id: data.userId,
          },
          include,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // --- Update Enrollment Care Fields ---

  async updateEnrollmentCareFields(enrollmentId: number, data: any) {
    return this.db.enrollment.update({
      where: { id: enrollmentId },
      data,
    });
  }

  // --- Attendance Notification Methods ---

  async findNotificationLogs(recipientUserId?: number) {
    const where: any = {
      action: 'ATTENDANCE_ADMIN_NOTIFICATION',
      entity_type: 'UserNotification',
    };
    if (recipientUserId !== undefined) {
      where.entity_id = String(recipientUserId);
    }
    return this.db.auditLog.findMany({
      where,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    });
  }

  async findNotificationLogById(id: number) {
    return this.db.auditLog.findFirst({
      where: {
        id,
        action: 'ATTENDANCE_ADMIN_NOTIFICATION',
      },
    });
  }

  async updateNotificationLogAfterData(id: number, afterData: any) {
    return this.db.auditLog.update({
      where: { id },
      data: { after_data: afterData },
    });
  }
}
