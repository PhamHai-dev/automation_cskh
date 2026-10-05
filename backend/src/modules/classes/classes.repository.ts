import { prisma } from '../../prisma/client';
import { CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from './classes.types';
import { ClassModelType, AttendanceSourceType } from '@prisma/client';

export class ClassesRepository {
  async findAll(accessibleClassIds?: number[] | null) {
    return prisma.class.findMany({
      where: accessibleClassIds !== null && accessibleClassIds !== undefined
        ? { id: { in: accessibleClassIds } }
        : undefined,
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
          include: {
            teacher: {
              include: { user: true },
            },
          },
        },
        class_schedules: true,
        enrollment_classes: {
          include: {
            enrollment: {
              include: {
                student: true,
                package: true,
                sale: true,
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
      },
    });
  }

  async findByCode(class_code: string) {
    return prisma.class.findFirst({
      where: { class_code }
    });
  }

  async create(data: {
    class_code?: string;
    class_name: string;
    level?: string;
    model_type: ClassModelType;
    attendance_source?: AttendanceSourceType;
  }) {
    return prisma.class.create({
      data: {
        class_name: data.class_name,
        class_code: data.class_code,
        level: data.level,
        model_type: data.model_type,
        attendance_source: data.attendance_source || AttendanceSourceType.LEARNING_SYSTEM,
      }
    });
  }

  async update(id: number, data: {
    class_code?: string;
    class_name?: string;
    level?: string;
    model_type?: ClassModelType;
    attendance_source?: AttendanceSourceType;
    active?: boolean;
  }) {
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
