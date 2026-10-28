import { EnrollmentsRepository } from './enrollments.repository';
import {
  CreateEnrollmentDTO,
  UpdateEnrollmentDTO,
  TransferClassDTO,
  EnrollmentListFilters,
  EnrollmentListResult,
} from './enrollments.types';
import { prisma } from '../../prisma/client';

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

  async getEnrollmentsForUser(
    userId: number,
    roles: string[],
    saleIdentifier?: string,
    filters?: EnrollmentListFilters,
  ) {
    if (roles.includes('ADMIN')) {
      return this.repository.findAll(saleIdentifier, filters);
    } else if (roles.includes('MANAGE')) {
      const allowedIds = (await this.resolveScopeCsIds(userId, roles, filters?.csId)) as number[];
      return this.repository.findAllByCSIds(allowedIds, {
        ...filters,
        sale: saleIdentifier || filters?.sale,
      });
    } else {
      // CS — B.5/D9: cs_id only; the sale identifier is never a scope grant for CS.
      // (ADMIN may still use ?sale= to narrow its own unrestricted view.)
      return this.repository.findAllByCS(userId, filters);
    }
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

    if (roles.includes('MANAGE')) {
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: { cs_group: { include: { members: true } } }
      });
      const csIds = new Set<number>();
      csIds.add(userId);
      assignments.forEach(a => a.cs_group.members.forEach(m => csIds.add(m.user_id)));

      if (!csIds.has(enrollment.cs_id)) {
        throw new CustomError('Forbidden: Outside of your manage scope', 403);
      }
    } else if (enrollment.cs_id !== userId) {
      throw new CustomError('Forbidden: Not assigned to you', 403);
    }

    return enrollment;
  }

  async createEnrollment(data: CreateEnrollmentDTO, userId: number, roles: string[]) {
    if (!roles.includes('ADMIN') && !roles.includes('MANAGE') && data.cs_id !== userId) {
      throw new CustomError('CS can only create enrollments assigned to themselves', 403);
    }

    const student = await prisma.student.findUnique({ where: { id: data.student_id } });
    if (!student) throw new CustomError('Student not found', 404);

    return this.repository.create(data);
  }

  async updateEnrollment(id: number, data: UpdateEnrollmentDTO, userId: number, roles: string[]) {
    await this.getEnrollmentById(id, userId, roles); // Validates scope
    return this.repository.update(id, data);
  }

  async reassignCS(id: number, newCsId: number, userId: number, roles: string[]) {
    if (!roles.includes('ADMIN') && !roles.includes('MANAGE')) {
      throw new CustomError('Forbidden: Only Admin/Manage can reassign', 403);
    }

    await this.getEnrollmentById(id, userId, roles); // Validates scope

    const csUser = await prisma.user.findUnique({ where: { id: newCsId } });
    if (!csUser || !(csUser.roles as string[]).includes('CS')) {
      throw new CustomError('Invalid CS user', 400);
    }

    return this.repository.reassignCS(id, newCsId);
  }

  async transferClass(enrollmentId: number, data: TransferClassDTO, userId: number, roles: string[]) {
    await this.getEnrollmentById(enrollmentId, userId, roles); // Validates scope

    const fromClass = await prisma.class.findUnique({ where: { id: data.from_class_id } });
    const toClass = await prisma.class.findUnique({ where: { id: data.to_class_id } });

    if (!fromClass || !toClass) throw new CustomError('Class not found', 404);

    return this.repository.transferClass(enrollmentId, data);
  }
}
