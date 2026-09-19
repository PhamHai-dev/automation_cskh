import { ClassesRepository } from './classes.repository';
import { CreateClassDTO, UpdateClassDTO, AssignTeacherDTO } from './classes.types';
import { prisma } from '../../prisma/client';

class CustomError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class ClassesService {
  private repository: ClassesRepository;

  constructor() {
    this.repository = new ClassesRepository();
  }

  async getAllClasses() {
    return this.repository.findAll();
  }

  async getClassById(id: number) {
    const cls = await this.repository.findById(id);
    if (!cls) throw new CustomError('Class not found', 404);
    return cls;
  }

  async createClass(data: CreateClassDTO) {
    return this.repository.create(data);
  }

  async updateClass(id: number, data: UpdateClassDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new CustomError('Class not found', 404);
    return this.repository.update(id, data);
  }

  async assignTeacher(classId: number, data: AssignTeacherDTO) {
    const existing = await this.repository.findById(classId);
    if (!existing) throw new CustomError('Class not found', 404);

    const teacher = await prisma.user.findUnique({ where: { id: data.teacher_id } });
    if (!teacher || !(teacher.roles as string[]).includes('TEACHER')) {
      throw new CustomError('Teacher not found or user is not a teacher', 404);
    }

    return this.repository.assignTeacher(classId, data);
  }
}
