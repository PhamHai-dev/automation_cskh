import { prisma } from '../../prisma/client';
import { CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from './classes.types';

export class ClassesRepository {
  async findAll() {
    return prisma.class.findMany({
      include: {
        class_teachers: {
          include: { teacher: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findById(id: number) {
    return prisma.class.findUnique({
      where: { id },
      include: {
        class_teachers: {
          include: { teacher: true }
        },
        enrollment_classes: {
          include: { enrollment: true }
        }
      }
    });
  }

  async create(data: CreateClassDTO) {
    return prisma.class.create({ data });
  }

  async update(id: number, data: UpdateClassDTO) {
    return prisma.class.update({
      where: { id },
      data
    });
  }

  async assignTeacher(classId: number, data: AssignTeacherDTO) {
    const startDate = data.start_date ? new Date(data.start_date) : undefined;
    const endDate = data.end_date ? new Date(data.end_date) : undefined;

    return prisma.classTeacher.create({
      data: {
        class_id: classId,
        teacher_id: data.teacher_id,
        role: data.role,
        start_date: startDate,
        end_date: endDate
      }
    });
  }
}
