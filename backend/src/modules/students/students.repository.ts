import { prisma } from '../../prisma/client';
import { CreateStudentDTO, UpdateStudentDTO } from './students.types';

export class StudentsRepository {
  async findAll() {
    return prisma.student.findMany({
      include: {
        enrollments: {
          include: {
            package: true,
            sale: true,
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
                        teacher: true,
                      },
                    },
                    class_schedules: true,
                  },
                },
                attendance: true,
              },
            },
            care_logs: {
              orderBy: { after_session_number: 'asc' },
            },
            care_tasks: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findById(id: number) {
    return prisma.student.findUnique({
      where: { id }
    });
  }

  async findByPhone(phone: string) {
    return prisma.student.findFirst({
      where: { phone }
    });
  }

  async findByEmail(email: string) {
    return prisma.student.findFirst({
      where: { email }
    });
  }

  async create(data: CreateStudentDTO) {
    const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;
    return prisma.student.create({ 
      data: {
        ...data,
        date_of_birth: dob
      }
    });
  }

  async update(id: number, data: UpdateStudentDTO) {
    const dob = data.date_of_birth ? new Date(data.date_of_birth) : undefined;
    
    // Create an object without undefined values manually or just let Prisma ignore undefined
    return prisma.student.update({
      where: { id },
      data: {
        ...data,
        date_of_birth: dob
      }
    });
  }
}
