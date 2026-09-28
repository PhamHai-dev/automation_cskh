import { prisma } from '../../prisma/client';
import { CreateEnrollmentDTO, UpdateEnrollmentDTO, TransferClassDTO } from './enrollments.types';

const ENROLLMENT_INCLUDES = {
  student: true,
  package: true,
  cs: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  enrollment_classes: {
    include: {
      class: {
        include: {
          class_teachers: {
            include: {
              teacher: {
                include: {
                  teacher_profile: true,
                },
              },
            },
          },
          class_schedules: true,
          class_sessions: {
            include: {
              attendance: {
                where: { deleted_at: null },
              },
            },
          },
        },
      },
      attendance: {
        where: { deleted_at: null },
        include: {
          class_session: true,
        },
      },
    },
  },
};

export class EnrollmentsRepository {
  async findAllByCS(csId: number, saleIdentifier?: string) {
    return prisma.enrollment.findMany({
      where: {
        OR: [
          { cs_id: csId },
          ...(saleIdentifier
            ? [
                { sale_name: { equals: saleIdentifier } },
                { cs: { name: { equals: saleIdentifier } } },
                { cs: { email: { equals: saleIdentifier } } },
              ]
            : []),
        ],
      },
      include: ENROLLMENT_INCLUDES,
      orderBy: { created_at: 'desc' },
    });
  }

  async findAllByCSIds(csIds: number[]) {
    return prisma.enrollment.findMany({
      where: { cs_id: { in: csIds } },
      include: ENROLLMENT_INCLUDES,
      orderBy: { created_at: 'desc' },
    });
  }

  async findAll(saleIdentifier?: string) {
    return prisma.enrollment.findMany({
      where: saleIdentifier
        ? {
            OR: [
              { sale_name: { equals: saleIdentifier } },
              { cs: { name: { equals: saleIdentifier } } },
              { cs: { email: { equals: saleIdentifier } } },
            ],
          }
        : undefined,
      include: ENROLLMENT_INCLUDES,
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: number) {
    return prisma.enrollment.findUnique({
      where: { id },
      include: { student: true, package: true, enrollment_classes: { include: { class: true } } }
    });
  }

  async create(data: CreateEnrollmentDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;
    
    return prisma.enrollment.create({
      data: {
        ...data,
        start_date: startDate,
        end_date: endDate
      }
    });
  }

  async update(id: number, data: UpdateEnrollmentDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;

    return prisma.enrollment.update({
      where: { id },
      data: {
        ...data,
        start_date: startDate,
        end_date: endDate
      }
    });
  }

  async reassignCS(id: number, csId: number) {
    return prisma.enrollment.update({
      where: { id },
      data: { cs_id: csId }
    });
  }

  async transferClass(enrollmentId: number, data: TransferClassDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : new Date();
    
    return prisma.$transaction(async (tx) => {
      // Find current active enrollment_class
      const currentEC = await tx.enrollmentClass.findFirst({
        where: {
          enrollment_id: enrollmentId,
          class_id: data.from_class_id,
          status: 'ACTIVE'
        },
        orderBy: { sequence_no: 'desc' }
      });

      if (currentEC) {
        // End current
        await tx.enrollmentClass.update({
          where: { id: currentEC.id },
          data: { status: 'TRANSFERRED', end_date: startDate }
        });
      }

      // Find max sequence_no for the enrollment
      const maxEC = await tx.enrollmentClass.findFirst({
        where: { enrollment_id: enrollmentId },
        orderBy: { sequence_no: 'desc' }
      });
      const newSequenceNo = maxEC ? maxEC.sequence_no + 1 : 1;

      // Start new
      const newEC = await tx.enrollmentClass.create({
        data: {
          enrollment_id: enrollmentId,
          class_id: data.to_class_id,
          sequence_no: newSequenceNo,
          status: 'ACTIVE',
          start_date: startDate
        }
      });

      return newEC;
    });
  }
}
