import { EnrollmentsRepository } from './enrollments.repository';
import {
  CreateEnrollmentDTO,
  UpdateEnrollmentDTO,
  TransferClassDTO,
  EnrollmentListFilters,
  EnrollmentListResult,
  ReassignCSOptions,
  BulkReassignCSDTO,
} from './enrollments.types';
import { prisma } from '../../prisma/client';
import { recordAuditLogSafe } from '../activity-logs/audit-helper';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class EnrollmentsService {
  private repository: EnrollmentsRepository;

  constructor() {
    this.repository = new EnrollmentsRepository();
  }

  private async resolveScopeCsIds(
    userId: number,
    roles: string[],
    requestedCsId?: number,
  ): Promise<number[] | number | undefined> {
    if (roles.includes('ADMIN')) {
      return undefined;
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

      let allowedIds = Array.from(csIds);
      if (requestedCsId !== undefined) {
        allowedIds = allowedIds.filter((id) => id === requestedCsId);
      }
      return allowedIds;
    }
    return userId;
  }

  private normalizeEnrollmentStatus<T extends Record<string, any>>(enr: T): T {
    if (!enr || !Array.isArray(enr.enrollment_classes)) return enr;
    const hasAssignedClass = enr.enrollment_classes.length > 0;
    if (hasAssignedClass && (enr.status === 'WAITING_CLASS' || enr.status === 'NOT_STARTED')) {
      return { ...enr, status: 'STUDYING' };
    }
    return enr;
  }

  async getEnrollmentsForUser(
    userId: number,
    roles: string[],
    saleIdentifier?: string,
    filters?: EnrollmentListFilters,
  ) {
    let rows: any[];
    if (roles.includes('ADMIN')) {
      rows = await this.repository.findAll(saleIdentifier, filters);
    } else if (roles.includes('MANAGE')) {
      const allowedIds = (await this.resolveScopeCsIds(userId, roles, filters?.csId)) as number[];
      rows = await this.repository.findAllByCSIds(allowedIds, {
        ...filters,
        sale: saleIdentifier || filters?.sale,
      });
    } else {
      // CS — B.5/D9: cs_id (or cs_viewers) only; the sale identifier is never a scope grant for CS.
      // (ADMIN may still use ?sale= to narrow its own unrestricted view.)
      rows = await this.repository.findAllByCS(userId, filters);
    }
    return Array.isArray(rows) ? rows.map((r) => this.normalizeEnrollmentStatus(r)) : rows;
  }

  async getEnrollmentsWithMeta(
    userId: number,
    roles: string[],
    saleIdentifier?: string,
    filters?: EnrollmentListFilters,
  ): Promise<EnrollmentListResult> {
    const scopeCsIds = await this.resolveScopeCsIds(userId, roles, filters?.csId);
    const effectiveSale = roles.includes('ADMIN') || roles.includes('MANAGE')
      ? saleIdentifier || filters?.sale
      : undefined;

    const data = await this.getEnrollmentsForUser(userId, roles, effectiveSale, filters);
    const meta = await this.repository.computeMeta(scopeCsIds, effectiveSale, filters, data);
    return { data, meta };
  }

  async getEnrollmentById(id: number, userId: number, roles: string[]) {
    const enrollment = await this.repository.findById(id);
    if (!enrollment) throw new CustomError('Enrollment not found', 404);

    if (roles.includes('ADMIN')) return enrollment;

    const viewerIds: number[] = Array.isArray((enrollment as any).cs_viewers)
      ? (enrollment as any).cs_viewers.map((v: any) => Number(v.cs_id))
      : [];

    if (roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: { cs_group: { include: { members: true } } }
      });
      const csIds = new Set<number>();
      csIds.add(userId);
      assignments.forEach(a => a.cs_group.members.forEach(m => csIds.add(m.user_id)));

      const hasOwnerInScope = csIds.has(enrollment.cs_id);
      const hasViewerInScope = viewerIds.some(vid => csIds.has(vid));

      if (!hasOwnerInScope && !hasViewerInScope) {
        throw new CustomError('Forbidden: Outside of your manage scope', 403);
      }
    } else if (enrollment.cs_id !== userId && !viewerIds.includes(userId)) {
      throw new CustomError('Forbidden: Not assigned to you', 403);
    }

    return enrollment;
  }

  private async assertWriteOwnershipForEnrollment(enrollment: any, userId: number, roles: string[]) {
    if (roles.includes('ADMIN')) return;

    if (roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: { cs_group: { include: { members: true } } },
      });
      const csIds = new Set<number>();
      csIds.add(userId);
      assignments.forEach((a) => a.cs_group.members.forEach((m) => csIds.add(m.user_id)));

      if (!csIds.has(enrollment.cs_id)) {
        throw new CustomError('Học viên đã được bàn giao sang CSKH khác ngoài phạm vi quản lý, bạn chỉ có quyền xem', 403);
      }
      return;
    }

    if (enrollment.cs_id !== userId) {
      throw new CustomError('Học viên đã được bàn giao sang CSKH khác, bạn chỉ có quyền xem', 403);
    }
  }

  async createEnrollment(data: CreateEnrollmentDTO, userId: number, roles: string[]) {
    if (!roles.includes('ADMIN') && !roles.includes('MANAGE') && data.cs_id !== userId) {
      throw new CustomError('CS can only create enrollments assigned to themselves', 403);
    }

    const student = await prisma.student.findUnique({ where: { id: data.student_id } });
    if (!student) throw new CustomError('Student not found', 404);

    const created = await this.repository.create(data);
    if (created?.id && userId) {
      await recordAuditLogSafe({
        userId,
        action: 'ENROLLMENT_CREATED',
        entityType: 'Enrollment',
        entityId: created.id,
        afterData: {
          student_id: created.student_id,
          cs_id: created.cs_id,
          program_type: created.program_type,
          status: created.status,
          total_sessions: created.total_sessions,
          level: created.level ?? null,
        },
      });
    }
    return created;
  }

  async updateEnrollment(id: number, data: UpdateEnrollmentDTO, userId: number, roles: string[]) {
    const enrollment = await this.getEnrollmentById(id, userId, roles); // Validates read scope
    await this.assertWriteOwnershipForEnrollment(enrollment, userId, roles);
    const updated = await this.repository.update(id, data);
    if (updated && userId) {
      await recordAuditLogSafe({
        userId,
        action: 'ENROLLMENT_UPDATED',
        entityType: 'Enrollment',
        entityId: id,
        beforeData: enrollment,
        afterData: updated,
      });
    }
    return updated;
  }

  async reassignCS(
    id: number,
    newCsId: number,
    userId: number,
    roles: string[],
    options?: ReassignCSOptions,
  ) {
    const results = await this.bulkReassignCS(
      {
        enrollment_ids: [id],
        target_cs_id: newCsId,
        mode: options?.mode ?? 'FULL_TRANSFER',
        transfer_pending_tasks: options?.transfer_pending_tasks ?? true,
        note: options?.note,
      },
      userId,
      roles,
    );
    return results.items[0];
  }

  async bulkReassignCS(dto: BulkReassignCSDTO, userId: number, roles: string[]) {
    if (!roles.includes('ADMIN') && !roles.includes('MANAGE')) {
      throw new CustomError('Forbidden: Only Admin/Manage can reassign', 403);
    }

    const uniqueIds = Array.from(new Set(dto.enrollment_ids.map(Number).filter((n) => n > 0)));
    if (uniqueIds.length === 0) {
      throw new CustomError('Danh sách ghi danh cần chuyển không hợp lệ', 400);
    }

    const targetCsUser = await prisma.user.findUnique({ where: { id: dto.target_cs_id } });
    const targetRoles =
      targetCsUser && Array.isArray(targetCsUser.roles) ? (targetCsUser.roles as string[]) : [];
    if (!targetCsUser || !targetCsUser.active || !targetRoles.includes('CS')) {
      throw new CustomError('Tài khoản CSKH đích không hợp lệ hoặc đã ngừng hoạt động', 400);
    }

    const enrollments = await this.repository.findManyByIds(uniqueIds);
    if (enrollments.length !== uniqueIds.length) {
      throw new CustomError('Enrollment not found', 404);
    }

    if (!roles.includes('ADMIN') && roles.includes('MANAGE')) {
      const allowedCsIds = (await this.resolveScopeCsIds(userId, roles)) as number[];
      const allowedSet = new Set(allowedCsIds);

      if (!allowedSet.has(dto.target_cs_id)) {
        throw new CustomError('Forbidden: Target CS is outside of your manage scope', 403);
      }

      for (const enr of enrollments) {
        if (!allowedSet.has(enr.cs_id)) {
          throw new CustomError('Forbidden: Outside of your manage scope', 403);
        }
      }
    }

    const mode = dto.mode ?? 'FULL_TRANSFER';
    const transferPendingTasks = dto.transfer_pending_tasks ?? true;

    const updatedItems = await this.repository.reassignCSBatch({
      enrollments,
      targetCsId: dto.target_cs_id,
      actorUserId: userId,
      mode,
      transferPendingTasks,
      note: dto.note,
    });

    return {
      updated_count: updatedItems.length,
      target_cs_id: dto.target_cs_id,
      mode,
      items: updatedItems,
    };
  }

  async revokeCsViewer(enrollmentId: number, viewerCsId: number, userId: number, roles: string[]) {
    if (!roles.includes('ADMIN') && !roles.includes('MANAGE')) {
      throw new CustomError('Forbidden: Only Admin/Manage can revoke viewer access', 403);
    }

    const enrollment = await this.getEnrollmentById(enrollmentId, userId, roles);
    if (!roles.includes('ADMIN') && roles.includes('MANAGE')) {
      const allowedCsIds = (await this.resolveScopeCsIds(userId, roles)) as number[];
      const allowedSet = new Set(allowedCsIds);
      if (!allowedSet.has(enrollment.cs_id) && !allowedSet.has(viewerCsId)) {
        throw new CustomError('Forbidden: Outside of your manage scope', 403);
      }
    }

    return this.repository.revokeCsViewer(enrollmentId, viewerCsId, userId);
  }

  async transferClass(enrollmentId: number, data: TransferClassDTO, userId: number, roles: string[]) {
    const enrollment = await this.getEnrollmentById(enrollmentId, userId, roles); // Validates read scope
    await this.assertWriteOwnershipForEnrollment(enrollment, userId, roles);

    const fromClass = await prisma.class.findUnique({ where: { id: data.from_class_id } });
    const toClass = await prisma.class.findUnique({ where: { id: data.to_class_id } });

    if (!fromClass || !toClass) throw new CustomError('Class not found', 404);

    const transferred = await this.repository.transferClass(enrollmentId, data);
    if (transferred && userId) {
      await recordAuditLogSafe({
        userId,
        action: 'TRANSFER_CLASS',
        entityType: 'Enrollment',
        entityId: enrollmentId,
        beforeData: { from_class_id: data.from_class_id },
        afterData: { to_class_id: data.to_class_id, start_date: data.start_date ?? null },
      });
    }
    return transferred;
  }
}
