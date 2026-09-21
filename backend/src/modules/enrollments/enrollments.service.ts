import { EnrollmentsRepository } from './enrollments.repository';
import { CreateEnrollmentDTO, UpdateEnrollmentDTO, TransferClassDTO } from './enrollments.types';
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

  async getEnrollmentsForUser(userId: number, roles: string[], saleIdentifier?: string) {
    if (roles.includes('ADMIN')) {
      return this.repository.findAll(saleIdentifier);
    } else if (roles.includes('MANAGE')) {
      // Find all CS groups this MANAGE user is assigned to
      const assignments = await prisma.manageAssignment.findMany({
        where: { manage_user_id: userId },
        include: {
          cs_group: {
            include: { members: true }
          }
        }
      });
      
      const csIds = new Set<number>();
      csIds.add(userId); // They might also have their own
      
      assignments.forEach(a => {
        a.cs_group.members.forEach(m => csIds.add(m.user_id));
      });
      
      return this.repository.findAllByCSIds(Array.from(csIds));
    } else {
      // CS
      return this.repository.findAllByCS(userId, saleIdentifier);
    }
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
